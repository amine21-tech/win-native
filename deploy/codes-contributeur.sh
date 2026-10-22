#!/usr/bin/env bash
#
# Met en service les codes de contributeur sur le serveur.
#
# CE QUE CELA CHANGE. Il n'existait qu'UN code, ecrit dans
# ~/win-native/apps/api/.env : tout le monde partageait le meme, on ne savait pas qui s'en
# etait servi, et le changer le retirait a tous d'un coup. Desormais l'administrateur cree un
# code par personne depuis l'espace admin. Chaque code ne sert qu'une fois et se lie au
# premier telephone qui le presente.
#
# L'ANCIEN CODE RESTE ACCEPTE, en second recours : les contributeurs actuels ne perdent rien.
# Rien n'est donc a retirer du fichier .env, et ce script n'y touche pas.
#
# POURQUOI curl ET NON scp. Les copies depuis le poste Windows echouent regulierement
# (chemins, guillemets, session SSH deja ouverte). Le depot etant public, le serveur va
# chercher les fichiers lui-meme : une seule commande, et le meme resultat a tous les coups.
#
# L'horodatage dans l'URL est la : raw.githubusercontent.com garde ses reponses en cache
# plusieurs minutes, et un fichier servi depuis ce cache a deja fait relancer deux fois un
# script perime.
#
# Usage, sur le VPS :
#   bash codes-contributeur.sh
set -euo pipefail

DEPOT=https://raw.githubusercontent.com/amine21-tech/win-native/main
RACINE="$HOME/win-native"

bleu()  { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
bien()  { printf '   \033[0;32mOK\033[0m   %s\n' "$1"; }
stop()  { printf '   \033[0;31mNON\033[0m  %s\n' "$1"; exit 1; }

[ -d "$RACINE" ] || stop "$RACINE introuvable — a lancer sur le VPS."
cd "$RACINE"

bleu "Recuperation des fichiers"
for f in \
  apps/api/db/migrations/0005_contributor_codes.sql \
  apps/api/src/routes/contributorCodes.ts \
  apps/api/src/app.ts \
  apps/api/src/routes/places.ts
do
  mkdir -p "$(dirname "$f")"
  curl -fsSL "$DEPOT/$f?v=$(date +%s)" -o "$f" || stop "echec du telechargement de $f"
  bien "$f ($(wc -c < "$f") octets)"
done

# CONTROLE AVANT DE CONSTRUIRE. Un fichier servi depuis le cache serait du vieux code, et la
# construction reussirait sans la fonctionnalite. On verifie donc que ce qu'on vient d'ecrire
# contient bien ce qu'on attend.
bleu "Verification du contenu"
grep -q 'contributor-codes' apps/api/src/routes/contributorCodes.ts \
  || stop "contributorCodes.ts ne contient pas les routes attendues (cache ?)"
grep -q 'contributorCodes' apps/api/src/app.ts \
  || stop "app.ts n'enregistre pas les nouvelles routes (cache ?)"
grep -q 'consommerCode' apps/api/src/routes/places.ts \
  || stop "places.ts n'appelle pas consommerCode (cache ?)"
bien "les trois fichiers portent bien la nouvelle version"

bleu "Construction de l'API"
docker compose up -d --build api
bien "conteneur reconstruit et relance"

bleu "Migration de la base"
# Rejouable sans risque : migrate.ts tient la liste des migrations deja appliquees dans la
# table _migrations et ignore celles qui y figurent.
#
# `< /dev/null` N'EST PAS DECORATIF. Ce script s'execute par `curl | bash` : son texte arrive
# donc par l'entree standard. `docker compose exec` lit lui aussi l'entree standard, et sans
# cette redirection il AVALE les lignes du script qui le suivent. Essaye sur le serveur du
# client : la migration a reussi, puis le controle final n'a jamais eu lieu et l'invite est
# revenue sans un mot, comme si le script s'etait arrete de lui-meme.
docker compose exec -T api npm run db:push:prod < /dev/null
bien "0005_contributor_codes applique"

bleu "Controle"
code=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' https://51.77.194.25.nip.io/v2/status || echo 000)
printf '   /v2/status -> %s\n' "$code"
# Sans jeton d'administrateur la route DOIT refuser : 401 est la bonne reponse, et prouve en
# meme temps qu'elle existe. Un 404 signifierait que l'enregistrement n'a pas pris.
auth=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' \
  https://51.77.194.25.nip.io/v2/admin/contributor-codes || echo 000)
printf '   /v2/admin/contributor-codes -> %s\n' "$auth"
echo
echo "   Attendu : 200 pour status, et 401 pour contributor-codes (refus = la route existe)."
echo "   Un 404 sur la seconde voudrait dire que les routes ne sont pas enregistrees."
