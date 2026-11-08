"""
Genere les pictogrammes blancs des marqueurs de signalisation (assets/map/sig-*.png).

POURQUOI DES IMAGES, ET NON DU TEXTE. La couche de la carte demandait jusqu'ici
`text-field: emoji`. Ce champ n'a JAMAIS rien dessine : la police servie avec les tuiles ne
contient aucun emoji. Il ne restait du signalement qu'un point de sept pixels sans
signification — c'est ce que le client decrit comme « marqueurs absents de la carte », et il a
raison de le dire ainsi, puisque rien d'identifiable n'apparaissait.

Le meme defaut avait deja ete corrige pour l'epingle de destination, par une image. On fait
pareil ici, et pour la meme raison : une image n'a pas de police.

POURQUOI SEULEMENT LE PICTOGRAMME, ET NON LE MARQUEUR ENTIER. On pourrait generer un marqueur
complet par type et par theme — disque colore, anneau dore, pictogramme — soit vingt-six
images en trois resolutions. Ce serait soixante-dix-huit fichiers a regenerer au moindre
changement de teinte, et une bascule jour/nuit qui recharge des images.

Le disque et l'anneau sont donc dessines par la CARTE elle-meme, avec des couches de cercles
dont la couleur vient de la donnee : changer de theme ne coute alors plus rien, et la table des
couleurs reste au meme endroit que le reste du code. Seul le pictogramme, que MapLibre ne sait
pas tracer, devient une image — et il est BLANC, donc le meme pour les deux themes.

Relancer apres toute modification :  python -I scripts/make-report-glyphs.py
"""
import os

from PIL import Image, ImageDraw

SORTIE = os.path.join(os.path.dirname(__file__), '..', 'assets', 'map')

# Sur-echantillonnage : on dessine en grand et on reduit, ce qui lisse les bords sans avoir a
# gerer l'anticrenelage a la main.
SS = 4
# Cote du pictogramme en points. 18 sur un disque de 24 de diametre laisse la marge qu'on voit
# sur la maquette.
COTE_DP = 18

BLANC = (255, 255, 255, 255)


def trace(d, points, largeur):
    """Une polyligne blanche aux extremites arrondies."""
    d.line(points, fill=BLANC, width=largeur, joint='curve')
    r = largeur / 2.0
    for x, y in points:
        d.ellipse([x - r, y - r, x + r, y + r], fill=BLANC)


def vagues(d, S, n):
    """`n` vagues horizontales empilees — le bouchon, le dos d'ane, l'inondation.

    Trois vagues disent le ralentissement, deux le ressaut, et c'est la seule difference entre
    le bouchon et le dos d'ane sur la maquette : la forme est la meme, le nombre change.

    UNE SEULE PERIODE PAR VAGUE, et c'est tout l'enjeu. La premiere version en dessinait trois,
    ce qui est joli a l'ecran d'un ordinateur et devient un gribouillis sur un disque de vingt
    points vu depuis un pare-brise. Une seule ondulation, large et epaisse, se reconnait ;
    trois petites ne se distinguent plus les unes des autres.
    """
    import math

    w = max(3, int(S * 0.11))
    marge = S * 0.18
    largeur = S - 2 * marge
    amplitude = S * 0.075
    haut = S * (0.5 - 0.11 * (n - 1) / 2.0)
    for i in range(n):
        y = haut + i * S * 0.22
        pts = []
        for k in range(17):
            x = marge + largeur * k / 16.0
            pts.append((x, y + amplitude * math.sin(2 * math.pi * k / 16.0)))
        trace(d, pts, w)


def ressaut(d, S):
    """Un dos d'ane VU DE PROFIL : une bosse posee sur le sol.

    POURQUOI PAS DEUX VAGUES. Il en portait deux, le bouchon trois — la seule difference entre
    deux signalements etait donc le NOMBRE d'ondulations, sur un disque de vingt points. Le
    controle des couleurs a montre qu'au surplus leurs teintes de nuit ne different que de
    trente-trois : dessins voisins ET couleurs voisines, pour un bouchon et un ralentisseur,
    qui n'appellent pas du tout la meme reaction.

    Une bosse sur une ligne de sol est ce qu'on voit en arrivant dessus. Elle ne ressemble a
    rien d'autre dans le jeu.
    """
    w = max(3, int(S * 0.11))
    sol = S * 0.70
    # La chaussee, puis la bosse qui s'y eleve.
    trace(d, [(S * 0.15, sol), (S * 0.85, sol)], w)
    pts = []
    for k in range(13):
        x = S * 0.28 + (S * 0.44) * k / 12.0
        # Une demi-ellipse : haute au milieu, retombant sur le sol aux deux bouts.
        dx = (k / 12.0) * 2 - 1
        pts.append((x, sol - S * 0.3 * max(0.0, 1 - dx * dx) ** 0.5))
    trace(d, pts, w)


def croix(d, S):
    """La croix de l'accident et de la voie fermee."""
    w = max(2, int(S * 0.11))
    m = S * 0.27
    trace(d, [(m, m), (S - m, S - m)], w)
    trace(d, [(S - m, m), (m, S - m)], w)


def carre_plein(d, S):
    """Le carre du barrage : un bloc, c'est-a-dire ce qui barre."""
    m = S * 0.3
    d.rectangle([m, m, S - m, S - m], fill=BLANC)


def outils(d, S):
    """Un marteau — le chantier.

    La premiere version croisait deux outils, comme la maquette. A dix-huit points, les deux
    diagonales se lisaient comme la CROIX de l'accident, a deux points pres : deux signalements
    de nature opposee devenaient le meme dessin. Un seul outil, avec une tete franche, ne se
    confond avec rien.
    """
    w = max(3, int(S * 0.1))
    # Le manche, en diagonale.
    trace(d, [(S * 0.3, S * 0.76), (S * 0.62, S * 0.36)], w)
    # La tete, un rectangle pose en travers du haut du manche.
    d.polygon(
        [
            (S * 0.46, S * 0.2),
            (S * 0.82, S * 0.36),
            (S * 0.72, S * 0.52),
            (S * 0.36, S * 0.36),
        ],
        fill=BLANC,
    )


def oeil(d, S, plein):
    """Un anneau, avec ou sans pupille — le radar et le nid-de-poule."""
    w = max(2, int(S * 0.09))
    r = S * 0.3
    c = S / 2.0
    d.ellipse([c - r, c - r, c + r, c + r], outline=BLANC, width=w)
    if plein:
        rp = S * 0.11
        d.ellipse([c - rp, c - rp, c + rp, c + rp], fill=BLANC)


def triangle(d, S):
    """Le triangle de danger — l'objet sur la chaussee."""
    w = max(2, int(S * 0.1))
    m = S * 0.22
    trace(d, [(S / 2, m), (S - m, S - m), (m, S - m), (S / 2, m)], w)


def flamme(d, S):
    """Une flamme — l'incendie.

    PLEINE ET DISSYMETRIQUE. En contour et symetrique, elle se lisait comme une goutte d'eau —
    ce qui, a cote d'un signalement d'INONDATION dessine en vagues, est exactement le
    contresens a eviter. Une flamme penche, et sa pointe part de cote : c'est ce qui la
    distingue d'une goutte, bien avant la couleur.
    """
    d.polygon(
        [
            (S * 0.54, S * 0.16),   # la pointe, decalee a droite
            (S * 0.70, S * 0.40),
            (S * 0.72, S * 0.58),
            (S * 0.60, S * 0.78),
            (S * 0.40, S * 0.80),
            (S * 0.29, S * 0.62),
            (S * 0.33, S * 0.44),
            (S * 0.42, S * 0.52),   # le creux qui donne la langue de feu
            (S * 0.40, S * 0.33),
        ],
        fill=BLANC,
    )


def poubelle(d, S):
    """Un bac a ordures — les dechets sauvages.

    POURQUOI UN BAC ET NON UN TAS. Un monticule informe, a dix-huit points, ne se distingue pas
    d'une flaque ni d'un nid-de-poule : trois dessins arrondis et pleins. Le bac a un couvercle
    et des parois droites, c'est-a-dire des angles — et les angles sont ce qui se reconnait
    encore a cette taille, depuis un pare-brise.
    """
    # Le couvercle, une barre franche en haut, avec sa petite poignee.
    d.rectangle([S * 0.18, S * 0.24, S * 0.82, S * 0.34], fill=BLANC)
    d.rectangle([S * 0.42, S * 0.16, S * 0.58, S * 0.24], fill=BLANC)
    # Le bac, legerement trapezoidal : plus etroit en bas, comme tous les bacs.
    d.polygon(
        [
            (S * 0.24, S * 0.40),
            (S * 0.76, S * 0.40),
            (S * 0.68, S * 0.84),
            (S * 0.32, S * 0.84),
        ],
        fill=BLANC,
    )


# Un pictogramme par TYPE de signalement. Les trois forces (police, gendarmerie, armee)
# partagent le carre du barrage : la maquette ne les distingue pas, et sur la carte c'est la
# couleur institutionnelle qui le fait deja.
PICTOS = {
    'jam': lambda d, S: vagues(d, S, 3),
    'crash': croix,
    'police': carre_plein,
    'gendarmerie': carre_plein,
    'armee': carre_plein,
    'block': croix,
    'works': outils,
    'bump': ressaut,
    'radar': lambda d, S: oeil(d, S, True),
    'object': triangle,
    'pothole': lambda d, S: oeil(d, S, False),
    'flood': lambda d, S: vagues(d, S, 3),
    'fire': flamme,
    'waste': poubelle,
}


def fabriquer(nom, dessin, echelle):
    S = int(COTE_DP * echelle * SS)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dessin(ImageDraw.Draw(img), S)
    suffixe = '' if echelle == 1 else '@%dx' % echelle
    img.resize((S // SS, S // SS), Image.LANCZOS).save(
        os.path.join(SORTIE, 'sig-%s%s.png' % (nom, suffixe))
    )


for nom, dessin in PICTOS.items():
    for echelle in (1, 2, 3):
        fabriquer(nom, dessin, echelle)

print('%d pictogrammes ecrits en 1x/2x/3x dans assets/map' % len(PICTOS))
