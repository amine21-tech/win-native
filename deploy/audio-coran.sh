#!/usr/bin/env bash
#
# Depose sur le serveur les extraits du Coran que WIN sert elle-meme.
#
# POURQUOI chez nous plutot qu'ailleurs : le verset du Trone (ayat al-Kursi) est le verset 255
# d'Al-Baqara. Aucun fichier de sourate ne le contient seul, et lancer Al-Baqara pour l'entendre
# voudrait dire traverser deux heures de recitation. Il n'existe decoupe que chez un service
# tiers ; nous en gardons donc notre propre copie, 400 ko, du meme recitateur que le reste.
#
# OU : dans le dossier deja servi par l'API (`/uploads/`), qui est un volume Docker — les
# fichiers survivent donc aux reconstructions de l'image. Ils sont ensuite accessibles a
# l'adresse https://<api>/v2/uploads/audio/<fichier>.
#
# Usage, sur le VPS :
#   bash audio-coran.sh installer   # telecharge et depose les fichiers
#   bash audio-coran.sh verifier    # controle qu'ils repondent bien par l'API
set -euo pipefail

API=https://51.77.194.25.nip.io/v2
CONTENEUR=win_api
DOSSIER=/app/apps/api/data/uploads/audio

# Nom du fichier chez nous  ->  adresse d'origine (recitateur Ali Jaber, decoupe par verset).
FICHIERS=(
  "ayat-al-kursi.mp3|https://everyayah.com/data/Ali_Jaber_64kbps/002255.mp3"
)

case "${1:-}" in
  installer)
    docker exec "$CONTENEUR" mkdir -p "$DOSSIER"
    tmp=$(mktemp -d)
    for entree in "${FICHIERS[@]}"; do
      nom="${entree%%|*}"
      url="${entree##*|}"
      echo "== $nom"
      # Telecharge d'abord SUR L'HOTE, pour pouvoir verifier le fichier avant de le poser :
      # une archive tronquee deposee directement dans le conteneur ne se verrait pas.
      curl -fL --retry 3 -o "$tmp/$nom" "$url"
      taille=$(stat -c%s "$tmp/$nom")
      if [ "$taille" -lt 50000 ]; then
        echo "   REFUSE : $taille octets, le telechargement est incomplet."
        exit 1
      fi
      # Un mp3 commence par ID3 ou par une trame MPEG (0xFF). Un fichier d'erreur HTML, non.
      if ! head -c 3 "$tmp/$nom" | grep -qaE '^(ID3|\xff)'; then
        echo "   REFUSE : ce n'est pas un fichier audio (page d'erreur ?)."
        exit 1
      fi
      docker cp "$tmp/$nom" "$CONTENEUR:$DOSSIER/$nom"
      echo "   depose : $taille octets"
    done
    rm -rf "$tmp"
    echo
    echo "Fait. Verifiez avec : bash $0 verifier"
    ;;

  verifier)
    for entree in "${FICHIERS[@]}"; do
      nom="${entree%%|*}"
      echo -n "$nom : "
      curl -s -o /dev/null -w "%{http_code}  %{size_download} octets  %{content_type}\n" \
        "$API/uploads/audio/$nom"
    done
    echo
    echo "Attendu : 200, plus de 300 000 octets, audio/mpeg."
    ;;

  *)
    sed -n '2,16p' "$0"
    ;;
esac
