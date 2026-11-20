#!/usr/bin/env bash
#
# Met a jour les fichiers de l'API sur le serveur, reconstruit, et applique les migrations.
#
# POURQUOI UN SCRIPT GENERIQUE. Il y en avait un par fonctionnalite, qui enumerait ses propres
# fichiers. Au bout de trois, c'etait trois scripts a maintenir pour une seule operation :
# recuperer ce qui a change, reconstruire, migrer, verifier. Celui-ci prend la liste en
# argument, ou la deduit du depot.
#
# POURQUOI curl ET NON scp. Les copies depuis le poste Windows echouent regulierement
# (chemins, guillemets, session SSH deja ouverte). Le depot etant public, le serveur va
# chercher les fichiers lui-meme : une seule commande, le meme resultat a tous les coups.
#
# L'horodatage dans l'URL n'est pas un ornement : raw.githubusercontent.com garde ses reponses
# en cache plusieurs minutes, et un fichier servi depuis ce cache a deja fait relancer deux fois
# un script perime.
#
# Usage, sur le VPS :
#   bash maj-api.sh                                   # le dernier commit touchant l'API
#   bash maj-api.sh apps/api/src/routes/admin.ts …    # une liste explicite
#
# Et par curl, le tiret double faisant passer les arguments a bash plutot qu'a curl :
#   curl -fsSL "<url>" | bash -s -- apps/api/src/routes/admin.ts
set -euo pipefail

DEPOT_BRUT=https://raw.githubusercontent.com/amine21-tech/win-native/main
DEPOT_API=https://api.github.com/repos/amine21-tech/win-native
RACINE="$HOME/win-native"

bleu()  { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
bien()  { printf '   \033[0;32mOK\033[0m   %s\n' "$1"; }
stop()  { printf '   \033[0;31mNON\033[0m  %s\n' "$1"; exit 1; }

[ -d "$RACINE" ] || stop "$RACINE introuvable — a lancer sur le VPS."
cd "$RACINE"

# ------------------------------------------------------------------ quels fichiers
#
# TOUT apps/api ET TOUT packages/shared, A CHAQUE PASSAGE.
#
# POURQUOI, ET CE QUE L'ANCIENNE REGLE A COUTE. Ce script ne copiait que les fichiers DU DERNIER
# COMMIT touchant l'API. Un correctif ecrit dans un commit, puis suivi d'un autre commit touchant
# l'API, n'etait donc PLUS JAMAIS copie : le second effaçait le premier de la liste. Rien ne le
# signalait. Le serveur restait en arriere sur des fichiers entiers, et l'application recevait
# des reponses d'une version ancienne.
#
# Releve le 20 novembre, en interrogeant le serveur reel :
#
#   - GET /v2/config -> << route inconnue >>. Le rayon VIP ne pouvait donc PAS etre ajuste
#     depuis le serveur, alors que c'etait la demande meme du point A (<< modifiable depuis le
#     serveur sans mise a jour de l'app >>). routes/health.ts n'avait jamais ete copie.
#
#   - GET /v2/jobs?radiusKm=2000 depuis Constantine -> zero offre, alors que quatre existent a
#     320 km. Le serveur ignorait le parametre et retombait sur ses cinquante kilometres : le
#     CURSEUR EMPLOI, valide de 0 a 2000 km au point E.3, ne servait a rien. routes/jobs.ts
#     n'avait jamais ete copie.
#
# Les deux correctifs etaient dans le depot depuis le 18 novembre, verificateurs au vert. Le code
# etait juste ; il n'etait pas sur la machine. C'est la pire categorie de panne : tout le monde
# la croit reglee.
#
# Le raisonnement est celui que ce script appliquait DEJA a packages/shared, et pour la meme
# raison. Il manquait seulement de l'appliquer a l'API : cinquante fichiers, deux cent soixante-
# dix kilo-octets, qui n'ont aucune raison de differer entre le depot et le serveur. On les remet
# a l'identique a chaque passage, ce qui rend ce retard impossible.
#
# Une liste explicite reste acceptee en argument pour les cas particuliers ; elle declenche alors
# la recopie du code partage, comme avant.
if [ "$#" -gt 0 ]; then
  FICHIERS=("$@")
  bleu "Fichiers demandes explicitement"
  printf '   %s\n' "${FICHIERS[@]}"

  # Le code partage suit toujours : voir le 2 novembre, ou deux fichiers manquaient depuis des
  # semaines et quatre autres etaient perimes sans qu'aucune livraison ne s'en plaigne.
  bleu "Code partage (recopie integrale)"
  PARTAGES=$(curl -fsSL "$DEPOT_API/contents/packages/shared/src" \
             | grep -oE '"path": *"[^"]+\.ts"' | sed 's/.*": *"//; s/"$//')
  [ -n "$PARTAGES" ] || stop "impossible de lister packages/shared/src."
  for f in $PARTAGES; do
    case " ${FICHIERS[*]} " in *" $f "*) ;; *) FICHIERS+=("$f") ;; esac
  done
  printf '   %s\n' $PARTAGES
else
  bleu "Tout l'API et tout le code partage"
  # UNE SEULE REQUETE donne l'arbre complet du depot ; on n'en garde que les fichiers (type
  # << blob >>) des deux dossiers. Les dossiers eux-memes sont ecartes : un curl sur un dossier
  # echouerait et arreterait le deploiement.
  mapfile -t FICHIERS < <(
    curl -fsSL "$DEPOT_API/git/trees/main?recursive=1" \
      | tr -d ' \n' \
      | grep -oE '"path":"(apps/api|packages/shared)/[^"]+","mode":"[0-9]+","type":"blob"' \
      | sed 's/.*"path":"//; s/","mode.*//'
  )
  [ "${#FICHIERS[@]}" -gt 0 ] || stop "impossible de lister les fichiers du depot."
  echo "   ${#FICHIERS[@]} fichiers"
fi

bleu "Recuperation"
for f in "${FICHIERS[@]}"; do
  mkdir -p "$(dirname "$f")"
  curl -fsSL "$DEPOT_BRUT/$f?v=$(date +%s)" -o "$f" || stop "echec du telechargement de $f"
  bien "$f ($(wc -c < "$f") octets)"
done

bleu "Construction de l'API"
docker compose up -d --build api < /dev/null
bien "conteneur reconstruit et relance"

bleu "Migrations"
# Rejouable sans risque : migrate.ts tient la liste des migrations deja appliquees dans la table
# _migrations et ignore celles qui y figurent.
#
# `< /dev/null` N'EST PAS DECORATIF. Ce script s'execute par `curl | bash` : son texte arrive
# donc par l'entree standard. `docker compose exec` lit lui aussi l'entree standard, et sans
# cette redirection il AVALE les lignes du script qui le suivent. Essaye sur le serveur du
# client : la migration a reussi, puis le controle final n'a jamais eu lieu et l'invite est
# revenue sans un mot, comme si le script s'etait arrete de lui-meme.
docker compose exec -T api npm run db:push:prod < /dev/null
bien "schema a jour"

bleu "Controle"
for chemin in /v2/status /v2/admin/corrections; do
  code=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' "https://51.77.194.25.nip.io$chemin" || echo 000)
  printf '   %-34s -> %s\n' "$chemin" "$code"
done
echo
echo "   Attendu : 200 pour /v2/status, et 401 pour une route d'administration."
echo "   Le refus PROUVE que la route existe ; un 404 voudrait dire le contraire."
