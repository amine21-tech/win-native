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
if [ "$#" -gt 0 ]; then
  FICHIERS=("$@")
else
  bleu "Fichiers du dernier commit touchant l'API"
  # LE DERNIER COMMIT TOUT COURT NE CONVIENT PAS : chaque livraison se termine par un commit
  # << Version NN >> qui ne modifie que app.json, cote mobile. Interroger l'historique FILTRE
  # par chemin donne le dernier commit qui concerne reellement le serveur.
  SHA=$(curl -fsSL "$DEPOT_API/commits?path=apps/api&per_page=1" \
        | grep -oE '"sha": *"[0-9a-f]{40}"' | head -n 1 | sed 's/.*": *"//; s/"$//')
  [ -n "$SHA" ] || stop "impossible de lire l'historique du depot."
  echo "   commit $SHA"
  # On ne garde que les chemins sous apps/api et packages/shared : le reste (application
  # mobile, scripts, documentation) n'a rien a faire dans le conteneur.
  mapfile -t FICHIERS < <(
    curl -fsSL "$DEPOT_API/commits/$SHA" \
      | grep -oE '"filename": *"[^"]+"' \
      | sed 's/.*": *"//; s/"$//' \
      | grep -E '^(apps/api|packages/shared)/' || true
  )
  [ "${#FICHIERS[@]}" -gt 0 ] || stop "ce commit ne touche aucun fichier de l'API — rien a faire."
  printf '   %s\n' "${FICHIERS[@]}"
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
