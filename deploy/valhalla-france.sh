#!/usr/bin/env bash
#
# Moteur d'itineraire dedie a la FRANCE, a cote du moteur existant.
#
# Pourquoi un second moteur plutot qu'un seul graphe pour les trois pays :
# la construction commune Algerie + Tunisie + France echoue, deux fois sur deux, sur quatre
# tuiles du sud tunisien (709243, 709244, 709245, 710682) — « vector::_M_range_check », puis
# abandon. C'est le melange des extraits qui pose probleme, pas la France. Construite seule,
# elle n'a aucune tuile en commun avec la Tunisie.
#
# Avantage d'exploitation : le moteur Algerie + Tunisie n'est JAMAIS touche. Il continue de
# servir l'application sur le port 8002 pendant toute la construction, et meme apres.
# L'API interroge le moteur francais (port 8003) uniquement pour les trajets en Europe.
#
# Usage, sur le VPS :
#   bash valhalla-france.sh construire   # telechargement + construction (une a deux heures)
#   bash valhalla-france.sh tester       # un trajet Paris
#   bash valhalla-france.sh etat         # le conteneur tourne-t-il encore ?
#   bash valhalla-france.sh supprimer    # tout effacer et repartir de zero
set -euo pipefail

IMAGE=ghcr.io/gis-ops/docker-valhalla/valhalla:latest
FR_DIR=/home/ubuntu/valhalla/custom_files_fr
FRANCE_URL=https://download.geofabrik.de/europe/france-latest.osm.pbf
# Dossier de la tentative a trois pays, dont on reprend le fichier France deja telecharge.
OLD_TRY=/home/ubuntu/valhalla/custom_files_dz_tn_fr

case "${1:-}" in
  construire)
    mkdir -p "$FR_DIR"

    # Le fichier France de la tentative precedente est reutilise s'il est la : inutile de
    # retelecharger 5 Go. Son empreinte n'est PAS reverifiee contre celle du jour : Geofabrik
    # reconstruit ses extraits quotidiennement, une empreinte differente ne signifie donc pas
    # que le fichier est abime. C'est la construction qui dira s'il est lisible.
    if [ ! -s "$FR_DIR/france-latest.osm.pbf" ]; then
      if [ -s "$OLD_TRY/france-latest.osm.pbf" ]; then
        echo "== Reprise du fichier France deja telecharge"
        cp "$OLD_TRY/france-latest.osm.pbf" "$FR_DIR/"
      else
        echo "== Telechargement de la France (environ 5 Go)"
        wget -O "$FR_DIR/france-latest.osm.pbf" "$FRANCE_URL"
      fi
    else
      echo "== Fichier France deja present"
    fi

    # `sudo` : les tuiles d'une construction precedente appartiennent a root (le conteneur
    # tourne sous cet utilisateur), le compte ubuntu ne peut pas les effacer lui-meme.
    sudo rm -rf "$FR_DIR/valhalla_tiles" "$FR_DIR/valhalla_tiles.tar" "$FR_DIR/file_hashes.txt"
    docker rm -f valhalla_fr 2>/dev/null || true

    # `--restart no` : si la construction echoue, le conteneur RESTE arrete. Avec un
    # redemarrage automatique, il repartait sur les tuiles a moitie construites et les servait
    # comme si tout allait bien — c'est ce qui avait masque les deux premieres pannes.
    docker run -d --name valhalla_fr --restart no \
      -p 127.0.0.1:8003:8002 \
      -v "$FR_DIR":/custom_files \
      -e build_elevation=False -e build_admins=True -e build_time_zones=True \
      -e server_threads=4 \
      "$IMAGE"

    echo
    echo "Construction lancee (une a deux heures). Suivre :"
    echo "  docker logs -f --tail 50 valhalla_fr"
    echo "Puis : bash $0 tester"
    ;;

  etat)
    docker ps -a --filter name=valhalla --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    echo
    echo "valhalla_win doit etre 'Up' (Algerie + Tunisie, port 8002)."
    echo "valhalla_fr 'Up' = construction en cours ou service pret ; 'Exited' = construction echouee."
    ;;

  tester)
    # `|| true` : sans lui, un moteur qui ne repond pas encore (curl sort en erreur) arretait
    # le script au premier test a cause de `set -e`, et le second n'etait jamais affiche.
    echo "== Paris (moteur francais, port 8003)"
    curl -s -m 30 -X POST http://127.0.0.1:8003/route -H 'content-type: application/json' \
      -d '{"locations":[{"lat":48.8566,"lon":2.3522},{"lat":48.8738,"lon":2.2950}],"costing":"auto"}' \
      | head -c 200 || echo "(pas de reponse : construction en cours, ou conteneur arrete)"; echo
    echo "== Alger (moteur historique, port 8002 — doit continuer de marcher)"
    curl -s -m 30 -X POST http://127.0.0.1:8002/route -H 'content-type: application/json' \
      -d '{"locations":[{"lat":36.7538,"lon":3.0588},{"lat":36.7650,"lon":3.0450}],"costing":"auto"}' \
      | head -c 200 || echo "(pas de reponse)"; echo
    echo
    echo 'Les deux lignes doivent commencer par {"trip".'
    ;;

  supprimer)
    docker rm -f valhalla_fr 2>/dev/null || true
    sudo rm -rf "$FR_DIR"
    echo "Moteur francais supprime. Le moteur historique n'a pas ete touche."
    ;;

  *)
    sed -n '2,20p' "$0"
    ;;
esac
