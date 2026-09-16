#!/usr/bin/env bash
#
# Ajoute la France au moteur d'itineraire Valhalla, SANS couper le service actuel.
#
# Principe : un NOUVEAU conteneur construit ses tuiles (Algerie + Tunisie + France) dans un
# dossier separe et ecoute sur le port 8003. L'ancien `valhalla_win` continue de servir
# l'application sur 8002 pendant toute la construction. On ne bascule qu'une fois le nouveau
# verifie, et l'ancien est conserve pour revenir en arriere.
#
# Usage, sur le VPS :
#   bash valhalla-ajouter-france.sh verifier     # ressources disponibles
#   bash valhalla-ajouter-france.sh construire   # telechargement + construction (plusieurs heures)
#   bash valhalla-ajouter-france.sh tester       # un trajet Paris et un trajet Alger sur 8003
#   bash valhalla-ajouter-france.sh basculer     # le nouveau prend le port 8002
#   bash valhalla-ajouter-france.sh revenir      # retour a l'ancien en cas de probleme
set -euo pipefail

IMAGE=ghcr.io/gis-ops/docker-valhalla/valhalla:latest
OLD_DIR=/home/ubuntu/valhalla/custom_files
NEW_DIR=/home/ubuntu/valhalla/custom_files_dz_tn_fr
FRANCE_URL=https://download.geofabrik.de/europe/france-latest.osm.pbf

case "${1:-}" in
  verifier)
    echo "== Memoire";            free -h
    echo "== Disque (home)";      df -h /home/ubuntu
    echo "== Processeurs";        nproc
    echo "== Fichiers OSM actuels"; ls -lh "$OLD_DIR"/*.osm.pbf
    echo
    echo "La France pese plusieurs Go en fichier OSM, et ses tuiles bien davantage."
    echo "Envoyez ces chiffres avant de lancer la construction."
    ;;

  construire)
    mkdir -p "$NEW_DIR"
    cp -n "$OLD_DIR"/*.osm.pbf "$NEW_DIR"/
    # Telechargement SANS reprise (-c), puis empreinte officielle verifiee.
    #
    # La premiere tentative avait ete reprise apres une coupure : le fichier obtenu etait
    # abime, et `valhalla_build_tiles` s'est arrete dessus sur un `std::exception` (core
    # dumped). Rien ne le disait clairement — le conteneur repartait ensuite sur des tuiles
    # partielles et les servait comme si tout allait bien. On verifie donc AVANT de construire.
    if [ ! -s "$NEW_DIR/france-latest.osm.pbf" ] || ! (cd "$NEW_DIR" && md5sum -c france.md5 >/dev/null 2>&1); then
      echo "== Telechargement de la France (environ 5 Go)"
      wget -O "$NEW_DIR/france-latest.osm.pbf" "$FRANCE_URL"
      wget -q -O "$NEW_DIR/france.md5" "$FRANCE_URL.md5"
      (cd "$NEW_DIR" && md5sum -c france.md5) || {
        echo "Fichier France encore abime : relancez la commande, rien n'a ete construit."
        exit 1
      }
    else
      echo "== Fichier France deja present et conforme a son empreinte"
    fi

    # Toute tuile issue d'une construction interrompue est effacee : sans cela l'image les
    # retrouve et saute la construction (« use_tiles_ignore_pbf »).
    #
    # `sudo` indispensable : ces fichiers sont ecrits par le conteneur, qui tourne en root.
    # Le compte ubuntu ne peut pas les supprimer lui-meme (« Permission denied »).
    sudo rm -rf "$NEW_DIR/valhalla_tiles" "$NEW_DIR/valhalla_tiles.tar" "$NEW_DIR/file_hashes.txt"
    docker rm -f valhalla_win_fr 2>/dev/null || true
    docker run -d --name valhalla_win_fr --restart no \
      -p 127.0.0.1:8003:8002 \
      -v "$NEW_DIR":/custom_files \
      -e build_elevation=False -e build_admins=True -e build_time_zones=True \
      -e server_threads=4 \
      "$IMAGE"
    # server_threads=4 : moins de processus en parallele pendant la construction. Plus lent, mais
    # la memoire (11 Go, partages avec l'API, la base et l'ancien moteur) risque moins de saturer.
    echo
    echo "Construction lancee. Suivre l'avancement :"
    echo "  docker logs -f --tail 50 valhalla_win_fr"
    echo "Elle est terminee quand les journaux indiquent que le service ecoute."
    echo "Si le conteneur s'arrete (docker ps -a), c'est que la construction a echoue :"
    echo "  docker logs valhalla_win_fr 2>&1 | tail -40"
    ;;

  tester)
    for trajet in \
      '{"locations":[{"lat":48.8566,"lon":2.3522},{"lat":48.8738,"lon":2.2950}],"costing":"auto"}' \
      '{"locations":[{"lat":36.7538,"lon":3.0588},{"lat":36.7650,"lon":3.0450}],"costing":"auto"}'; do
      curl -s -m 30 -X POST http://127.0.0.1:8003/route -H 'content-type: application/json' -d "$trajet" \
        | head -c 160; echo
    done
    echo "Les deux lignes doivent commencer par {\"trip\" — sinon, ne pas basculer."
    ;;

  basculer)
    docker stop valhalla_win
    docker rename valhalla_win valhalla_win_ancien
    docker stop valhalla_win_fr && docker rm valhalla_win_fr
    docker run -d --name valhalla_win --restart unless-stopped \
      -p 127.0.0.1:8002:8002 \
      -v "$NEW_DIR":/custom_files \
      -e build_elevation=False -e build_admins=True -e build_time_zones=True \
      -e server_threads=4 \
      "$IMAGE"
    echo "Bascule faite. L'ancien est garde sous le nom valhalla_win_ancien (arrete)."
    ;;

  revenir)
    docker rm -f valhalla_win
    docker rename valhalla_win_ancien valhalla_win
    docker start valhalla_win
    echo "Retour a l'ancien moteur (Algerie + Tunisie)."
    ;;

  *)
    sed -n '2,20p' "$0"
    ;;
esac
