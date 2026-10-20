#!/usr/bin/env bash
#
# Installe un moteur de recherche d'adresses CHEZ NOUS, pour l'Algerie.
#
# POURQUOI. L'application interroge photon.komoot.io, un service public gratuit partage par le
# monde entier. Releve le 20 octobre 2026, cinq appels consecutifs depuis une connexion
# ordinaire : 7,2 s — 3,2 s — 3,8 s — 14,8 s — aucune reponse. Le client exige << au moins
# aussi rapide et precis que Waze et Google Maps >>. Aucun reglage ne tient cette promesse tant
# que la reponse vient de chez quelqu'un d'autre.
#
# Le passe-plat avec cache (apps/api/src/routes/geocode.ts) a deja regle les recherches
# REPETEES : 0,39 s au lieu de 4 s. Reste la premiere fois. C'est ce que corrige ce moteur
# local : toutes les recherches deviennent locales, en dizaines de millisecondes.
#
# CE QU'IL FAUT SAVOIR AVANT DE L'INSTALLER, et qui n'est pas un detail.
#
# L'index tout fait publie pour l'Algerie date du 21 juillet 2025, et il N'EST PAS MIS A JOUR :
# c'est un instantane, pas un flux. Verifie le 20 octobre 2026 — l'Algerie, la Tunisie, le Maroc
# et la France portent tous cette meme date de 2025. Une adresse cartographiee depuis n'y sera
# donc jamais, et aucune mise a jour ne viendra la chercher.
#
# Le compromis se tient quand meme, pour trois raisons :
#   1. les rues et les communes algeriennes ne changent pas tous les mois ;
#   2. les adresses recentes qui comptent pour WIN sont celles que les utilisateurs ajoutent
#      eux-memes, et elles vivent dans NOTRE base, interrogee en parallele ;
#   3. le service public reste branche en SECOND : quand l'index local ne trouve rien, l'API
#      lui passe la main (voir apps/api/src/routes/geocode.ts).
#
# Si cette fraicheur devient genante un jour, la sortie existe : importer soi-meme l'extrait
# algerien d'OpenStreetMap dans Nominatim, puis en exporter un index Photon. C'est un chantier
# a part entiere — plusieurs heures de machine et beaucoup de disque — pas une option de ce
# script.
#
# Usage, sur le VPS :
#   bash photon-local.sh verifier    # la machine peut-elle le faire tourner ?
#   bash photon-local.sh installer   # telecharge l'index et demarre le moteur
#   bash photon-local.sh tester      # compare les reponses locales et publiques
#   bash photon-local.sh basculer    # dit a l'API de s'en servir
#   bash photon-local.sh retour      # revient au service public
set -euo pipefail

CONTENEUR=photon_dz
PORT=2322
DOSSIER="$HOME/photon"
RESEAU=win-native_default
ENV_API="$HOME/win-native/.env"
BASE="https://download1.graphhopper.com/public/extracts/by-country-code/dz"

# Memoire laissee a la machine virtuelle Java. Un index d'un seul pays tient largement dans
# deux gigaoctets ; au-dela on prendrait de la memoire a PostGIS pour rien.
HEAP=2g

# VERSION DE PHOTON, et pourquoi ce n'est pas la derniere.
#
# L'index publie a ete construit en juillet 2025, du temps de la serie 0.7. Photon est passe en
# 1.x depuis, et une version majeure ne lit pas forcement l'index d'une autre. 0.7.4 est la
# derniere de la serie qui a produit cet index : c'est celle qui le lira a coup sur.
PHOTON_VERSION=0.7.4
PHOTON_JAR="https://github.com/komoot/photon/releases/download/$PHOTON_VERSION/photon-$PHOTON_VERSION.jar"

# L'image n'est qu'une machine virtuelle Java officielle : on y depose nous-memes le programme
# publie par le projet Photon. Aucune image tierce n'est installee sur ce serveur — ni la
# chaine de fabrication de quelqu'un d'autre, ni ce qu'il a pu y ajouter.
IMAGE_JAVA=eclipse-temurin:21-jre

# ---------------------------------------------------------------- affichage
bleu()  { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
bien()  { printf '   \033[0;32mOK\033[0m   %s\n' "$1"; }
souci() { printf '   \033[0;33m!!\033[0m   %s\n' "$1"; }
stop()  { printf '   \033[0;31mNON\033[0m  %s\n' "$1"; exit 1; }

# Le nom du dernier index publie, lu dans la liste du serveur. On ne devine pas la date : une
# date ecrite en dur vieillirait mal, et le lien << latest >> refuse les requetes partielles.
dernier_index() {
  curl -s "$BASE/" \
    | grep -o 'photon-db-dz-[0-9]\{6\}\.tar\.bz2' \
    | sort -u | tail -1
}

# ---------------------------------------------------------------- verifications
verifier() {
  bleu "Ce que la machine a sous le capot"

  local ram_mb dispo_mb disque_gb
  ram_mb=$(free -m | awk '/^Mem:/{print $2}')
  dispo_mb=$(free -m | awk '/^Mem:/{print $7}')
  disque_gb=$(df -BG --output=avail "$HOME" | tail -1 | tr -dc '0-9')

  printf '   memoire totale      : %s Mo\n' "$ram_mb"
  printf '   memoire disponible  : %s Mo\n' "$dispo_mb"
  printf '   disque libre        : %s Go\n' "$disque_gb"

  # L'index compresse fait 117 Mo ; decompresse il approche le gigaoctet, et il faut la place
  # des deux en meme temps pendant l'extraction. Cinq gigaoctets laissent de la marge.
  if [ "$disque_gb" -lt 5 ]; then
    stop "il faut au moins 5 Go libres, il en reste $disque_gb."
  fi
  bien "disque suffisant"

  if [ "$dispo_mb" -lt 2200 ]; then
    souci "seulement $dispo_mb Mo de memoire libre — le moteur en demande environ 2 000."
    souci "Il demarrera quand meme, mais surveillez PostGIS. Au besoin, baissez HEAP a 1g."
  else
    bien "memoire suffisante"
  fi

  if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    stop "le port $PORT est deja pris."
  fi
  bien "port $PORT libre"

  docker info >/dev/null 2>&1 || stop "docker ne repond pas."
  bien "docker en marche"

  bleu "Index publie pour l'Algerie"
  local fichier entetes taille date_pub
  fichier=$(dernier_index)
  [ -n "$fichier" ] || stop "impossible de lire la liste des index publies."
  entetes=$(curl -s -r 0-0 -D - -o /dev/null "$BASE/$fichier")
  taille=$(echo "$entetes" | awk -F/ '/[Cc]ontent-[Rr]ange/{print $2}' | tr -dc '0-9')
  date_pub=$(echo "$entetes" | grep -i '^last-modified' | cut -d' ' -f2- | tr -d '\r')
  printf '   fichier : %s\n' "$fichier"
  printf '   taille  : %s Mo\n' "$((taille / 1024 / 1024))"
  printf '   publie  : %s\n' "$date_pub"
  bien "index disponible"
  souci "cet index n'est PAS mis a jour : ce qui a ete cartographie depuis n'y sera jamais."
  souci "Le service public reste interroge en second pour combler ce manque."

  bleu "Conclusion"
  echo "   Lancez :  bash $0 installer"
}

# ---------------------------------------------------------------- installation
installer() {
  local fichier
  fichier=$(dernier_index)
  [ -n "$fichier" ] || stop "impossible de lire la liste des index publies."

  bleu "Telechargement de l'index ($fichier)"
  mkdir -p "$DOSSIER"
  cd "$DOSSIER"

  # `-C -` reprend un telechargement interrompu : sur une liaison algerienne, cela evite de
  # recommencer cent dix-sept megaoctets depuis le debut.
  curl -L -C - --retry 5 --retry-delay 5 -o "$fichier" "$BASE/$fichier"
  curl -sL -o "$fichier.md5" "$BASE/$fichier.md5" || true

  if [ -s "$fichier.md5" ]; then
    bleu "Verification de l'empreinte"
    local attendu obtenu
    attendu=$(awk '{print $1}' "$fichier.md5")
    obtenu=$(md5sum "$fichier" | awk '{print $1}')
    if [ "$attendu" != "$obtenu" ]; then
      stop "empreinte differente — le telechargement est abime. Relancez l'installation."
    fi
    bien "empreinte conforme"
  else
    souci "empreinte non publiee pour ce fichier, on continue sans."
  fi

  bleu "Extraction (plusieurs minutes, c'est normal)"
  rm -rf "$DOSSIER/photon_data"
  tar -xjf "$fichier"
  [ -d "$DOSSIER/photon_data" ] || stop "l'archive ne contient pas photon_data."
  bien "index en place : $(du -sh "$DOSSIER/photon_data" | cut -f1)"

  bleu "Programme Photon $PHOTON_VERSION"
  if [ ! -s "$DOSSIER/photon.jar" ]; then
    curl -L --retry 5 --retry-delay 5 -o "$DOSSIER/photon.jar" "$PHOTON_JAR"
  fi
  [ -s "$DOSSIER/photon.jar" ] || stop "le programme n'a pas pu etre telecharge."
  bien "programme en place ($(du -h "$DOSSIER/photon.jar" | cut -f1))"

  bleu "Demarrage du moteur"
  docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
  docker run -d \
    --name "$CONTENEUR" \
    --restart unless-stopped \
    -p "127.0.0.1:$PORT:2322" \
    -v "$DOSSIER:/photon" \
    -w /photon \
    "$IMAGE_JAVA" \
    java "-Xmx$HEAP" -jar /photon/photon.jar \
      -data-dir /photon -listen-ip 0.0.0.0 -listen-port 2322

  # Le conteneur doit joindre l'API par son NOM : les ports ne sont publies que sur 127.0.0.1,
  # et `host.docker.internal` ne repond pas ici (meme piege que pour Valhalla).
  docker network connect "$RESEAU" "$CONTENEUR" 2>/dev/null || true
  bien "conteneur lance et rattache au reseau de l'API"

  bleu "Mise en route"
  echo "   Le moteur charge son index en memoire : comptez une a deux minutes."
  local i
  for i in $(seq 1 60); do
    if curl -sf --max-time 3 "http://127.0.0.1:$PORT/api?q=alger&limit=1" >/dev/null 2>&1; then
      bien "le moteur repond (apres $((i * 3)) s)"
      echo
      echo "   Verifiez :  bash $0 tester"
      return 0
    fi
    sleep 3
  done
  souci "le moteur n'a pas repondu en trois minutes. Journal :"
  docker logs --tail 40 "$CONTENEUR"
  exit 1
}

# ---------------------------------------------------------------- comparaison
tester() {
  bleu "Local contre public, sur les memes recherches"
  printf '   %-28s %-22s %-22s\n' "recherche" "LOCAL" "public"
  local q tl nl tp np
  for q in "alger" "tizi+ouzou" "bureau+de+poste+boumerdes" "gare+agha" "bab+ezzouar"; do
    # Le temps est mesure par curl lui-meme : /usr/bin/time n'est pas installe partout.
    tl=$(curl -sf --max-time 20 -o /tmp/pl.json -w '%{time_total}' \
         "http://127.0.0.1:$PORT/api?q=$q&limit=10&lang=fr&lat=36.75&lon=3.06") || tl="echec"
    nl=$(python3 -c "import json;print(len(json.load(open('/tmp/pl.json')).get('features',[])))" 2>/dev/null || echo 0)
    tp=$(curl -sf --max-time 20 -o /tmp/pp.json -w '%{time_total}' \
         "https://photon.komoot.io/api/?q=$q&limit=10&lang=fr&lat=36.75&lon=3.06") || tp="echec"
    np=$(python3 -c "import json;print(len(json.load(open('/tmp/pp.json')).get('features',[])))" 2>/dev/null || echo 0)
    printf '   %-28s %-22s %-22s\n' "$(echo "$q" | tr '+' ' ')" "$nl trouves / ${tl}s" "$np trouves / ${tp}s"
  done
  rm -f /tmp/pl.json /tmp/pp.json
  echo
  echo "   Si le local trouve autant et repond plus vite :  bash $0 basculer"
}

# ---------------------------------------------------------------- bascule
basculer() {
  bleu "L'API va interroger le moteur local"
  [ -f "$ENV_API" ] || stop "$ENV_API introuvable."
  cp "$ENV_API" "$ENV_API.avant-photon"

  # Par NOM de conteneur, et non par adresse : les deux sont sur le meme reseau Docker.
  if grep -q '^PHOTON_URL=' "$ENV_API"; then
    sed -i "s|^PHOTON_URL=.*|PHOTON_URL=http://$CONTENEUR:2322|" "$ENV_API"
  else
    printf '\n# Moteur de recherche d adresses local (voir deploy/photon-local.sh)\nPHOTON_URL=http://%s:2322\n' "$CONTENEUR" >> "$ENV_API"
  fi
  bien "PHOTON_URL ecrit (sauvegarde : $ENV_API.avant-photon)"

  cd "$HOME/win-native"
  docker compose up -d api
  sleep 4
  bleu "Controle depuis l'API"
  curl -s "http://127.0.0.1:3002/geocode/search?q=tizi%20ouzou&lat=36.71&lon=4.05&lang=fr" | head -c 200
  echo
  echo
  echo '   Le champ "source" doit indiquer "photon-local".'
}

retour() {
  bleu "Retour au service public"
  [ -f "$ENV_API" ] || stop "$ENV_API introuvable."
  sed -i '/^PHOTON_URL=/d' "$ENV_API"
  cd "$HOME/win-native"
  docker compose up -d api
  bien "PHOTON_URL retire, API redemarree. Le conteneur local reste en place."
}

case "${1:-}" in
  verifier)  verifier ;;
  installer) installer ;;
  tester)    tester ;;
  basculer)  basculer ;;
  retour)    retour ;;
  *)         sed -n '2,38p' "$0" ;;
esac
