#!/usr/bin/env bash
#
# Passe le moteur d'itineraire Algerie + Tunisie de Valhalla 3.5.1 a 3.6.1, SANS couper le
# service.
#
# POURQUOI : les voies a prendre aux bifurcations (« guidage de voies », point 4 du client)
# n'existent dans la reponse qu'a partir de la 3.6. Verifie sur le serveur : la 3.5.1 accepte
# l'option `turn_lanes` sans broncher et ne renvoie simplement aucune voie. Tout le reste de
# l'application fonctionne sans cette mise a niveau — seule la rangee de fleches reste absente.
#
# PRINCIPE, le meme que valhalla-ajouter-france.sh : un NOUVEAU conteneur reconstruit ses tuiles
# dans un dossier separe et ecoute sur 8004. L'ancien continue de servir l'application sur 8002
# pendant toute la construction. On ne bascule qu'une fois le nouveau verifie, et l'ancien est
# conserve, a l'arret, pour revenir en arriere en une commande.
#
# Les tuiles sont RECONSTRUITES et non reprises : leur format change d'une version majeure a
# l'autre. Elles sont reconstruites a partir des MEMES fichiers OSM que ceux deja sur le disque,
# pour que le nouveau moteur connaisse exactement les memes routes que l'ancien — une mise a
# niveau a la fois.
#
# Usage, sur le VPS :
#   bash valhalla-mise-a-niveau.sh verifier     # place disque, memoire, fichiers OSM
#   bash valhalla-mise-a-niveau.sh construire   # construction en fond (compter 30 a 60 min)
#   bash valhalla-mise-a-niveau.sh suivre       # avancement de la construction
#   bash valhalla-mise-a-niveau.sh tester       # trajets compares + presence des voies
#   bash valhalla-mise-a-niveau.sh basculer     # le nouveau prend le port 8002
#   bash valhalla-mise-a-niveau.sh revenir      # retour a l'ancien, immediat
#   bash valhalla-mise-a-niveau.sh nettoyer     # supprime l'ancien, une fois rassure
set -euo pipefail

IMAGE=ghcr.io/valhalla/valhalla-scripted:3.6.1
OLD_DIR=/home/ubuntu/valhalla/custom_files
NEW_DIR=/home/ubuntu/valhalla/custom_files_361
NEUF=valhalla_win_361
PORT_NEUF=8004

# Trajet de controle : Alger -> Boudouaou. Il emprunte la rocade puis l'autoroute, ou
# OpenStreetMap porte les marquages au sol — c'est sur ce trajet que les voies ont ete
# verifiees avant d'ecrire le code de l'application.
TRAJET='{"locations":[{"lat":36.7538,"lon":3.0588},{"lat":36.7169,"lon":3.4203}],"costing":"auto","turn_lanes":true}'

resume() {
  # Duree, distance et nombre de manoeuvres portant des voies, en une ligne.
  python3 -c '
import json,sys
d=json.load(sys.stdin)
if "error" in d:
    print("ECHEC :", d.get("error")); raise SystemExit
t=d["trip"]; m=t["legs"][0]["maneuvers"]
print("%d min, %.1f km, %d manoeuvres, %d avec voies" % (
    round(t["summary"]["time"]/60), t["summary"]["length"], len(m),
    sum(1 for x in m if x.get("lanes"))))
'
}

case "${1:-}" in
  verifier)
    echo "== Version actuellement en service";  curl -s -m 10 http://127.0.0.1:8002/status | head -c 120; echo
    echo "== Memoire";                          free -h
    echo "== Disque (home)";                    df -h /home/ubuntu
    echo "== Processeurs";                      nproc
    echo "== Fichiers OSM utilises";            ls -lh "$OLD_DIR"/*.osm.pbf
    echo "== Taille des tuiles actuelles";      sudo du -sh "$OLD_DIR"/valhalla_tiles 2>/dev/null || true
    echo
    echo "Les nouvelles tuiles occuperont a peu pres autant que les actuelles, EN PLUS"
    echo "d'elles, le temps de la bascule. Envoyez ces chiffres avant de construire."
    ;;

  construire)
    mkdir -p "$NEW_DIR"
    # Seuls les fichiers OSM sont repris. Ni les tuiles, ni les fichiers d'empreintes : une
    # tuile heritee de la 3.5 ferait sauter la construction (« use_tiles_ignore_pbf ») et le
    # conteneur servirait l'ancien format en silence.
    cp -n "$OLD_DIR"/*.osm.pbf "$NEW_DIR"/
    sudo rm -rf "$NEW_DIR/valhalla_tiles" "$NEW_DIR/valhalla_tiles.tar" "$NEW_DIR/file_hashes.txt"
    ls -lh "$NEW_DIR"/*.osm.pbf

    docker rm -f "$NEUF" 2>/dev/null || true
    docker run -d --name "$NEUF" --restart no \
      -p 127.0.0.1:$PORT_NEUF:8002 \
      -v "$NEW_DIR":/custom_files \
      -e build_elevation=False -e build_admins=True -e build_time_zones=True \
      -e force_rebuild=True \
      -e server_threads=4 \
      "$IMAGE"
    echo
    echo "Construction lancee. Suivre : bash $0 suivre"
    echo "Elle est finie quand les journaux disent que le service ecoute."
    ;;

  suivre)
    echo "== Etat du conteneur"; docker ps -a --filter "name=$NEUF" --format '{{.Names}}  {{.Status}}'
    echo "== Dernieres lignes";  docker logs --tail 30 "$NEUF" 2>&1 | tail -30
    echo
    echo "Si le conteneur est 'Exited', la construction a echoue :"
    echo "  docker logs $NEUF 2>&1 | tail -60"
    ;;

  tester)
    echo "== Version du nouveau moteur"
    curl -s -m 10 http://127.0.0.1:$PORT_NEUF/status | head -c 120; echo
    echo "== Ancien (8002, en service)"
    curl -s -m 30 -X POST http://127.0.0.1:8002/route -H 'content-type: application/json' -d "$TRAJET" | resume
    echo "== Nouveau (8004)"
    curl -s -m 30 -X POST http://127.0.0.1:$PORT_NEUF/route -H 'content-type: application/json' -d "$TRAJET" | resume
    echo
    echo "Ne basculer que si la duree et la distance du nouveau sont proches de l'ancien,"
    echo "ET que le nombre de manoeuvres avec voies est passe de 0 a trois environ."
    ;;

  basculer)
    # Les reseaux de l'ancien conteneur sont releves AVANT de le toucher : l'API l'appelle par
    # son nom sur le reseau Docker de la pile (VALHALLA_URL=http://valhalla_win:8002). Un
    # nouveau conteneur lance sans ce rattachement serait injoignable depuis l'API, et toute
    # l'application perdrait le calcul d'itineraire alors que le moteur, lui, tourne.
    RESEAUX=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' valhalla_win)
    echo "Reseaux a reprendre : $RESEAUX"

    docker stop valhalla_win
    docker rename valhalla_win valhalla_win_35
    docker stop "$NEUF" && docker rm "$NEUF"
    docker run -d --name valhalla_win --restart unless-stopped \
      -p 127.0.0.1:8002:8002 \
      -v "$NEW_DIR":/custom_files \
      -e build_elevation=False -e build_admins=True -e build_time_zones=True \
      -e server_threads=4 \
      "$IMAGE"
    for reseau in $RESEAUX; do
      [ "$reseau" = "bridge" ] && continue
      docker network connect "$reseau" valhalla_win && echo "rattache a $reseau"
    done
    sleep 5
    echo "== Controle apres bascule"
    curl -s -m 10 http://127.0.0.1:8002/status | head -c 120; echo
    curl -s -m 30 -X POST http://127.0.0.1:8002/route -H 'content-type: application/json' -d "$TRAJET" | resume
    echo "L'ancien est garde, a l'arret, sous le nom valhalla_win_35."
    ;;

  revenir)
    docker rm -f valhalla_win
    docker rename valhalla_win_35 valhalla_win
    docker start valhalla_win
    sleep 3
    curl -s -m 10 http://127.0.0.1:8002/status | head -c 120; echo
    echo "Retour a l'ancien moteur."
    ;;

  nettoyer)
    docker rm -f valhalla_win_35 2>/dev/null || true
    sudo rm -rf "$OLD_DIR/valhalla_tiles" "$OLD_DIR/valhalla_tiles.tar"
    echo "Ancien conteneur et anciennes tuiles supprimes. Les fichiers OSM sont conserves."
    ;;

  *)
    sed -n '2,30p' "$0"
    ;;
esac
