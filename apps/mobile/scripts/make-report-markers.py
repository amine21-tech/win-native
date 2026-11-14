"""
Genere les MARQUEURS DE SIGNALEMENT de la carte (assets/map/marker-*.png), en 1x, 2x et 3x.

LA MAQUETTE DU 13 NOVEMBRE CHANGE LEUR NATURE. Jusqu'ici un marqueur etait un disque de la
couleur du type, cerne d'un anneau, avec un pictogramme BLANC dessine a la main (voir
make-report-glyphs.py). La maquette << 12 symboles signalement sur la carte >> en demande un
autre : une pastille PALE, un anneau de la couleur de la CATEGORIE, et l'EMOJI en couleur au
milieu — exactement celui que le menu de signalement affiche deja.

POURQUOI C'EST MIEUX, ET PAS SEULEMENT DIFFERENT. Le conducteur voit l'emoji dans le menu au
moment ou il signale ; il revoit le MEME sur la carte quand quelqu'un d'autre a signale. Un
pictogramme blanc dessine a la main, si soigne soit-il, obligeait a apprendre une seconde
langue de symboles pour la meme chose.

POURQUOI DES IMAGES ET NON DU TEXTE. C'est la lecon du 31 octobre, et elle n'a pas change : la
couche de la carte demandait `text-field` avec un emoji, et la police servie avec les tuiles
n'en contient AUCUN. Rien ne s'affichait. Un emoji sur une carte MapLibre doit etre une image.

POURQUOI PILLOW SAIT LE FAIRE. Segoe UI Emoji est une police COULEUR (table CBDT), et Pillow la
rend telle quelle avec `embedded_color=True`. Sans ce drapeau on obtient une silhouette noire.

Relancer apres toute modification :  python -I scripts/make-report-markers.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

SORTIE = os.path.join(os.path.dirname(__file__), '..', 'assets', 'map')
POLICE_EMOJI = r'C:\Windows\Fonts\seguiemj.ttf'

# Sur-echantillonnage : on dessine en grand et on reduit, ce qui lisse les bords sans avoir a
# gerer l'anticrenelage a la main. L'emoji, lui, est rendu a sa taille finale — une police
# couleur ne gagne rien a etre agrandie puis reduite, et y perd en nettete.
SS = 4

# Diametre du marqueur en points. Valeur du document : << Taille : 34dp sur la carte >>.
COTE_DP = 34
# Epaisseur de l'anneau. Trois points : en dessous il disparait sur un fond charge, au-dessus il
# mange la place de l'emoji.
ANNEAU_DP = 3

# LES QUATRE COULEURS DE CATEGORIE, telles que la maquette les ecrit en toutes lettres.
# Memes valeurs que COULEUR_CATEGORIE dans src/map/signalisation.ts.
ANNEAU = {
    'blocage': (211, 47, 47),    # #D32F2F
    'danger': (230, 92, 0),      # #E65C00
    'info': (21, 101, 192),      # #1565C0
    'standard': (13, 110, 79),   # #0D6E4F
}

# Le fond, une teinte tres pale de la categorie — relevee au pixel sur la maquette.
FOND = {
    'blocage': (255, 243, 243),
    'danger': (255, 248, 240),
    'info': (240, 244, 255),
    'standard': (242, 250, 246),
}

# L'emoji de chaque type, et sa categorie. Les emoji sont ceux de la maquette, et ce sont les
# memes que ceux du menu de signalement (src/reports/kinds.ts) : le conducteur doit revoir sur
# la carte le symbole qu'il a touche pour signaler.
#
# LES TROIS FORCES PARTAGENT LA VOITURE DE POLICE. Elles ne sont plus creables depuis le menu
# depuis le 9 novembre, mais des signalements existants les portent et doivent s'afficher.
SYMBOLES = {
    'jam': ('\U0001F697', 'standard'),        # voiture
    'crash': ('\U0001F4A5', 'blocage'),       # collision
    'police': ('\U0001F693', 'blocage'),      # voiture de police
    'gendarmerie': ('\U0001F693', 'blocage'),
    'armee': ('\U0001F693', 'blocage'),
    'block': ('\U0001F6A7', 'blocage'),       # barriere de chantier
    'works': ('\U0001F3D7', 'danger'),        # grue
    'bump': ('\u3030', 'danger'),             # ondulation
    'radar': ('\U0001F4F8', 'info'),          # appareil photo avec flash
    'object': ('\u26A0', 'danger'),           # triangle de danger
    'pothole': ('\U0001F573', 'danger'),      # trou
    'flood': ('\U0001F30A', 'info'),          # vague
    'fire': ('\U0001F525', 'blocage'),        # flamme
    'waste': ('\U0001F5D1', 'standard'),      # corbeille
}

# LE BOUCHON PORTE DEUX EMOJI, comme sur la maquette : une voiture et un nuage de gaz. Une
# voiture seule se lit << vehicule >>, pas << circulation ralentie >>. Le second est dessine
# derriere et a gauche, plus petit.
SECOND_EMOJI = {'jam': ('\U0001F4A8', -0.17, 0.10, 0.62)}


def marqueur(kind, echelle):
    S = COTE_DP * echelle * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    _, categorie = SYMBOLES[kind]

    # La pastille pale, puis l'anneau de categorie par-dessus son bord.
    bord = ANNEAU_DP * echelle * SS
    d.ellipse([0, 0, S - 1, S - 1], fill=FOND[categorie] + (255,))
    d.ellipse([bord / 2, bord / 2, S - 1 - bord / 2, S - 1 - bord / 2],
              outline=ANNEAU[categorie] + (255,), width=int(bord))

    petit = img.resize((COTE_DP * echelle, COTE_DP * echelle), Image.LANCZOS)

    # L'EMOJI EST RENDU A LA TAILLE FINALE, pas en sur-echantillonne : une police couleur est
    # une image bitmap, et l'agrandir puis la reduire ne fait que la brouiller.
    taille = COTE_DP * echelle
    emoji, _ = SYMBOLES[kind]
    corps = int(taille * 0.52)
    police = ImageFont.truetype(POLICE_EMOJI, corps)
    de = ImageDraw.Draw(petit)

    second = SECOND_EMOJI.get(kind)
    if second:
        car, dx, dy, ratio = second
        p2 = ImageFont.truetype(POLICE_EMOJI, max(8, int(corps * ratio)))
        de.text((taille / 2 + dx * taille, taille / 2 + dy * taille), car,
                font=p2, anchor='mm', embedded_color=True)
        de.text((taille / 2 + 0.07 * taille, taille / 2 - 0.02 * taille), emoji,
                font=police, anchor='mm', embedded_color=True)
    else:
        de.text((taille / 2, taille / 2), emoji, font=police, anchor='mm', embedded_color=True)

    suffixe = '' if echelle == 1 else '@%dx' % echelle
    petit.save(os.path.join(SORTIE, 'marker-%s%s.png' % (kind, suffixe)))


if not os.path.exists(POLICE_EMOJI):
    raise SystemExit('Police emoji introuvable : %s' % POLICE_EMOJI)

for kind in SYMBOLES:
    for echelle in (1, 2, 3):
        marqueur(kind, echelle)

print('%d marqueurs ecrits en 1x/2x/3x dans assets/map' % len(SYMBOLES))
