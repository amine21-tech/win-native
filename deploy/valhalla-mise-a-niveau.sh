#!/usr/bin/env bash
#
# Passe le moteur d'itineraire Algerie + Tunisie de Valhalla 3.5.1 a 3.6.1, SANS couper le
# service.
#
# POURQUOI : les voies a prendre aux bifurcations (« guidage de voies », point 4 du client)
# n'existent dans la reponse qu'a partir de la 3.6. La 3.5.1 accepte l'option `turn_lanes` sans
# broncher et ne renvoie simplement aucune voie. Tout le reste de l'application fonctionne sans
# cette mise a niveau — seule la rangee de fleches reste absente.
#
# CE QUI LE CONFIRME, mesure le 15 novembre 2026 :
#   - le journal des versions de Valhalla porte « ADDED: Turn lane information for valhalla
#     serializer (#5078) » sous la 3.6.0, publiee le 23 octobre 2025 ;
#   - deux trajets demandes a notre serveur renvoient ZERO manoeuvre avec voies : Alger ->
#     Blida (14 manoeuvres) et Lyon -> Marseille par l'A7 (20 manoeuvres). L'A7 est densement
#     marquee dans OpenStreetMap : que le trajet FRANCAIS n'en renvoie aucune non plus ecarte
#     l'hypothese d'un manque de donnees et designe le moteur.
#
# ET LA DONNEE ALGERIENNE EXISTE, ce qui rend la mise a niveau utile : 112 tronçons portent
# `turn:lanes` ou `turn:lanes:forward` dans la region d'Alger (requete Overpass du 15 novembre,
# cadre 36.5/2.6 a 36.95/3.6). Ce n'est pas la densite francaise, mais les echangeurs
# principaux y sont — et ce sont eux qui comptent, puisque les fleches ne s'affichent que sur
# autoroute, voie rapide et nationale.
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

# LA VERSION VISEE EST LA PLUS PETITE QUI APPORTE LA FONCTION, et c'est deliberement.
#
# La 3.9.2 existe (12 novembre 2026) et apporterait des corrections. Mais passer de 3.5.1 a
# 3.9.2 change aussi les couts de routage : les durees et les trajets choisis bougeraient, sur
# une application qui guide des conducteurs aujourd'hui. La 3.6.1 apporte exactement ce qui
# manque et rien d'autre. L'etape `tester` compare justement duree et distance avant toute
# bascule — c'est la qu'une derive se verrait.
#
# Pour viser une autre version :  VERSION=3.9.2 bash valhalla-mise-a-niveau.sh construire
# Le dossier et le conteneur portent la version : deux essais ne se marchent pas dessus.
VERSION="${VERSION:-3.6.1}"
SUFFIXE="${VERSION//./}"

IMAGE="ghcr.io/valhalla/valhalla-scripted:$VERSION"
OLD_DIR=/home/ubuntu/valhalla/custom_files
NEW_DIR="/home/ubuntu/valhalla/custom_files_$SUFFIXE"
NEUF="valhalla_win_$SUFFIXE"
PORT_NEUF=8004

# TROIS TRAJETS DE CONTROLE, et non un seul.
#
# Un trajet unique ne distingue pas « le moteur ne sait pas rendre les voies » de « ce
# trajet-la n'en traverse aucune ». Les trois couvrent la rocade d'Alger, l'autoroute Est-Ouest
# et un trajet long — si AUCUN ne renvoie de voies apres la bascule, c'est le moteur ; si l'un
# d'eux en renvoie, il fonctionne et les autres manquent simplement de marquage au sol.
TRAJET='{"locations":[{"lat":36.7538,"lon":3.0588},{"lat":36.7169,"lon":3.4203}],"costing":"auto","turn_lanes":true}'
TRAJET2='{"locations":[{"lat":36.7538,"lon":3.0588},{"lat":36.4703,"lon":2.8277}],"costing":"auto","turn_lanes":true}'
TRAJET3='{"locations":[{"lat":36.7538,"lon":3.0588},{"lat":36.7169,"lon":4.0458}],"costing":"auto","turn_lanes":true}'

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
    echo "== Version visee";                    echo "$VERSION  (image : $IMAGE)"
    echo "== Version actuellement en service";  curl -s -m 10 http://127.0.0.1:8002/status | head -c 200; echo
    echo "== Voies rendues aujourd'hui (doit etre 0 avant la mise a niveau)"
    printf '   '; curl -s -m 30 -X POST http://127.0.0.1:8002/route -H 'content-type: application/json' -d "$TRAJET" | resume
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
    n=0
    for t in "$TRAJET" "$TRAJET2" "$TRAJET3"; do
      n=$((n + 1))
      echo "-- Trajet $n"
      printf '   ancien (8002) : '
      curl -s -m 30 -X POST http://127.0.0.1:8002/route -H 'content-type: application/json' -d "$t" | resume
      printf '   nouveau (%s)  : ' "$PORT_NEUF"
      curl -s -m 30 -X POST "http://127.0.0.1:$PORT_NEUF/route" -H 'content-type: application/json' -d "$t" | resume
    done
    echo
    echo "NE BASCULER QUE SI, sur les trois trajets :"
    echo "  - la duree et la distance du nouveau sont proches de l'ancien (quelques % d'ecart) ;"
    echo "  - au moins UN trajet passe de 0 manoeuvre avec voies a une ou plusieurs."
    echo
    echo "Si les durees s'ecartent nettement, ne basculez pas et envoyez ces chiffres : le"
    echo "changement de version aurait alors change les couts de routage, ce qui se verrait sur"
    echo "les trajets des conducteurs." 
    ;;

  basculer)
    # Les reseaux de l'ancien conteneur sont releves AVANT de le toucher : l'API l'appelle par
    # son nom sur le reseau Docker de la pile (VALHALLA_URL=http://valhalla_win:8002). Un
    # nouveau conteneur lance sans ce rattachement serait injoignable depuis l'API, et toute
    # l'application perdrait le calcul d'itineraire alors que le moteur, lui, tourne.
    RESEAUX=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' valhalla_win)
    echo "Reseaux a reprendre : $RESEAUX"

    # ON REFUSE DE BASCULER SI UN REPLI EXISTE DEJA, au lieu de l'ecraser.
    #
    # La version precedente faisait `docker rm -f valhalla_win_avant` juste avant de renommer.
    # Basculer une seconde fois — apres un `revenir`, ou simplement en relancant la commande —
    # detruisait donc le conteneur 3.5.1 mis de cote, c'est-a-dire le SEUL retour en arriere
    # immediat, et sans rien dire. On s'en apercevrait au pire moment : celui ou l'on veut
    # revenir.
    if docker ps -a --format '{{.Names}}' | grep -qx valhalla_win_avant; then
      echo "ARRET : un moteur de repli existe deja (valhalla_win_avant)."
      echo "C'est le retour en arriere de la bascule precedente. Deux choix :"
      echo "  - revenir a l'ancien  : bash $0 revenir"
      echo "  - abandonner le repli : bash $0 nettoyer   (irreversible)"
      exit 1
    fi

    docker stop valhalla_win
    docker rename valhalla_win valhalla_win_avant
    # Le conteneur de construction cede sa place : c'est le MEME volume qui sera monte, mais
    # sous le nom et le port que l'API attend. On ne perd rien — les tuiles sont sur le disque.
    docker rm -f "$NEUF" 2>/dev/null || true
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
    echo "L'ancien est garde, a l'arret, sous le nom valhalla_win_avant."
    ;;

  revenir)
    # LE NOUVEAU MOTEUR EST MIS DE COTE, PAS DETRUIT.
    #
    # La version precedente faisait `docker rm -f valhalla_win`. Ses tuiles survivaient dans
    # leur dossier, mais plus aucun conteneur ne les servait : rebasculer imposait de tout
    # reconstruire, soit une heure, pour un moteur qui etait pret cinq minutes plus tot. Il est
    # desormais renomme et arrete — `basculer` le retrouvera.
    docker stop valhalla_win
    docker rm -f "$NEUF" 2>/dev/null || true
    docker rename valhalla_win "$NEUF"
    docker rename valhalla_win_avant valhalla_win
    docker start valhalla_win
    sleep 3
    curl -s -m 10 http://127.0.0.1:8002/status | head -c 200; echo
    printf 'Voies rendues : '
    curl -s -m 30 -X POST http://127.0.0.1:8002/route -H 'content-type: application/json' -d "$TRAJET" | resume
    echo "Retour a l'ancien moteur. Le nouveau est garde, a l'arret, sous le nom $NEUF."
    ;;

  nettoyer)
    docker rm -f valhalla_win_avant 2>/dev/null || true
    sudo rm -rf "$OLD_DIR/valhalla_tiles" "$OLD_DIR/valhalla_tiles.tar"
    echo "Ancien conteneur et anciennes tuiles supprimes. Les fichiers OSM sont conserves."
    ;;

  *)
    sed -n '2,30p' "$0"
    ;;
esac
