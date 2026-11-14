"""
Genere les PICTOGRAMMES DE LIEU de la carte (assets/map/lieu-*.png), en 1x, 2x et 3x.

POURQUOI CE SCRIPT EXISTE. Les lieux WIN — pharmacie, station-service, mosquee — etaient poses
sur la carte par `'text-field': ['get', 'emoji']`. Or la police servie avec nos tuiles ne
contient AUCUN emoji, et la couche ne declarait meme pas de police : elle ne dessinait donc
rien du tout. Les lieux VIP montraient leur halo dore, vide au milieu ; les autres
n'apparaissaient pas. C'est la meme panne que celle du 31 octobre sur les signalements, et la
meme reponse : un emoji sur une carte MapLibre doit etre une IMAGE.

POURQUOI PILLOW SAIT LE FAIRE. Segoe UI Emoji est une police COULEUR (table CBDT), et Pillow la
rend telle quelle avec `embedded_color=True`. Sans ce drapeau on obtient une silhouette noire —
vingt et une pastilles sombres impossibles a distinguer les unes des autres.

PAS DE PASTILLE AUTOUR, contrairement aux marqueurs de signalement. Un signalement est une
alerte : il doit se detacher du fond, d'ou son anneau de categorie. Un lieu est un repere de
decor, et vingt et un disques colores sur une carte de ville la rendraient illisible. L'emoji
seul, pose sur la carte, est ce que montrait deja la v83.

Relancer apres toute modification :  python -I scripts/make-place-glyphs.py
"""
import io
import os
import re

from PIL import Image, ImageDraw, ImageFont

RACINE = os.path.join(os.path.dirname(__file__), '..')
SORTIE = os.path.join(RACINE, 'assets', 'map')
POLICE_EMOJI = r'C:\Windows\Fonts\seguiemj.ttf'

# Taille du pictogramme en points. Quinze : c'est la valeur que la couche `poi-icon` demandait
# deja en `text-size`, et elle a ete reglee a l'oeil sur une carte reelle. On ne la change pas
# en passant du texte a l'image — seul le MOYEN change, pas le rendu voulu.
COTE_DP = 15

# UN LEGER HALO BLANC, et c'est la seule chose qu'on ajoute. Un emoji pose nu sur une route
# grise ou un parc vert perd ses contours ; deux points de blanc derriere lui le detachent sans
# ajouter de forme. C'est le meme role que le `text-halo-width` qu'un texte aurait eu.
HALO_DP = 2
HALO = (255, 255, 255, 215)

# LA TABLE EST LUE DANS LE CODE, pas recopiee. Si une categorie change d'emoji dans
# placeIcons.ts, c'est l'image qui doit suivre — et relancer ce script suffit.
source = io.open(os.path.join(RACINE, 'src', 'map', 'placeIcons.ts'), encoding='utf-8').read()
bloc = source[source.index('const CATEGORY_EMOJI'):]
bloc = bloc[:bloc.index('\n};')]
CATEGORIES = re.findall(r"(\w+):\s*'([^']+)'", bloc)
assert len(CATEGORIES) >= 20, 'table des categories introuvable : %d entrees' % len(CATEGORIES)


def picto(categorie, emoji, echelle):
    taille = COTE_DP * echelle
    marge = HALO_DP * echelle
    police = ImageFont.truetype(POLICE_EMOJI, taille)

    # LA BOITE SUIT L'EMOJI, elle n'est pas supposee carree.
    #
    # Un premier essai posait une boite de COTE_DP + marges, et quatre pictogrammes sortaient
    # ROGNES : l'assiette et les couverts, le P du parking, le bus. Un emoji n'est pas un carre
    # de la taille du corps de la police — son avance peut largement la depasser, et chaque
    # glyphe a la sienne. On mesure donc le glyphe reellement dessine, et on taille la boite
    # dessus. C'est le genre de defaut qu'on ne voit pas en relisant : la table est juste, le
    # rendu est juste, seule la BOITE est trop petite, et le resultat est un demi-dessin.
    mesure = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    gauche, haut, droite, bas = mesure.textbbox((0, 0), emoji, font=police, embedded_color=True)
    boite_l = (droite - gauche) + 2 * marge
    boite_h = (bas - haut) + 2 * marge

    img = Image.new('RGBA', (boite_l, boite_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Le centre du GLYPHE, et non celui de la boite : textbbox est mesure depuis l'origine du
    # trace, qui n'est pas son coin superieur gauche.
    cx = marge - gauche + (droite - gauche) / 2
    cy = marge - haut + (bas - haut) / 2

    # LE HALO EST L'EMOJI LUI-MEME, redessine en blanc opaque et decale dans les huit
    # directions. Un flou gaussien serait plus propre, mais il faudrait le recalculer a chaque
    # taille et il delaverait les bords ; huit copies donnent un contour net et suffisent.
    for dx in (-marge, 0, marge):
        for dy in (-marge, 0, marge):
            if dx == 0 and dy == 0:
                continue
            d.text((cx + dx, cy + dy), emoji, font=police, anchor='mm', fill=HALO)

    # LE BLANC EST APLATI AVANT L'EMOJI : dessine par-dessus, il mangerait ses couleurs.
    fond = Image.new('RGBA', (boite_l, boite_h), (0, 0, 0, 0))
    fond.alpha_composite(img)
    d = ImageDraw.Draw(fond)
    d.text((cx, cy), emoji, font=police, anchor='mm', embedded_color=True)

    fond.save(os.path.join(SORTIE, 'lieu-%s%s.png' % (categorie, {1: '', 2: '@2x', 3: '@3x'}[echelle])))


for categorie, emoji in CATEGORIES:
    for echelle in (1, 2, 3):
        picto(categorie, emoji, echelle)

print('%d pictogrammes de lieu ecrits en 1x/2x/3x dans assets/map' % len(CATEGORIES))
print('   ' + ', '.join(c for c, _ in CATEGORIES))
