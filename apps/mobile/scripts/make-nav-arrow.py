"""
Genere la fleche de position du guidage (assets/map/nav-arrow-*.png), en 1x, 2x et 3x.

POURQUOI UNE IMAGE ALORS QU'IL EXISTE DEJA UN COMPOSANT NavArrow.

Le composant React Native convient quand la camera suit le conducteur : la fleche est alors
posee a un point FIXE de l'ecran, et la carte pivote dessous. Rien ne bouge, rien ne decroche.

Des que le suivi s'interrompt — il suffit de deplacer la carte du doigt pour choisir une
deviation —, la fleche doit retourner sur sa position reelle, au milieu de la carte. Et la,
une vue React Native ne va plus : elle est repositionnee APRES chaque image de la carte (donc
avec un temps de retard, visible au moindre glissement), et surtout il faudrait lui retrancher
a la main l'orientation courante de la carte, que seul le moteur connait vraiment.

Une image de style n'a aucun de ces deux problemes. `icon-rotation-alignment: 'map'` dit au
moteur que la rotation est exprimee par rapport au NORD : il compose lui-meme avec l'orientation
de la carte, a chaque image, et la fleche montre toujours la bonne direction — carte tournee,
inclinee ou non.

DEUX IMAGES parce qu'une image ne se teinte pas : la fleche OR du jour, la fleche VERTE de nuit.
Ce sont les deux couleurs du correctif du 8 novembre, et elles ne suivent plus celles du trace —
voir la note de NavArrow.tsx : une fleche de la couleur de l'itineraire, posee SUR cet
itineraire, ne se distingue plus de lui.

Le halo est DESSINE DANS L'IMAGE, et il ne respire pas. Celui du composant pulse pour signaler
que le guidage est vivant ; ici la fleche se deplace sur la carte, ce qui le dit deja. Ses trois
anneaux ont en revanche exactement les rayons et les opacites du document, pour que les deux
fleches aient la meme corpulence selon que la camera suit ou non.

Relancer apres toute modification :  python scripts/make-nav-arrow.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'map')
SS = 4  # sur-echantillonnage, pour des bords lisses apres reduction

# L'OR DES MARQUEURS WIN (#D4A017) et le VERT de nuit (#0D6E4F). Memes valeurs que OR_FLECHE et
# VERT_FLECHE_NUIT dans src/components/NavArrow.tsx.
OR = (212, 160, 23)
VERT = (13, 110, 79)

# Le lisere prend la couleur OPPOSEE au remplissage : une fleche or au centre d'un halo or ne
# ferait qu'une seule tache. Voir la note de NavArrow.tsx, qui explique pourquoi ce detail
# n'est pas une liberte prise avec le document mais la condition pour que sa consigne marche.
FLECHES = {
    'day': {'remplissage': OR, 'lisere': VERT},
    'night': {'remplissage': VERT, 'lisere': OR},
}

# Cote de l'image en points : le plus grand anneau de bout en bout, soit 2 x 56. La MEME que
# TAILLE_HALO dans NavArrow.tsx.
#
# Elle etait a 40 — la taille de la fleche seule — tant que le halo n'etait qu'un degrade serre
# autour d'elle. Les trois anneaux du 8 novembre montent a 56 points de rayon : dans une image
# de 40, ils seraient simplement coupes.
TAILLE_DP = 112

# Cote de la fleche elle-meme, en points : la MEME que NAV_PUCK_SIZE dans app/index.tsx, pour
# que la fleche garde exactement la meme corpulence que le suivi s'interrompe ou non.
#
# Les deux avaient derive — 46 ici contre 40 la-bas — et le commentaire affirmait pourtant
# qu'elles etaient egales. Personne ne pouvait le voir : les deux fleches ne s'affichent jamais
# en meme temps, et un ecart de six points ne saute aux yeux que si on les compare cote a cote.
FLECHE_DP = 40

# Les trois anneaux du document : rayon en points, couleur, opacite. Du plus large au plus
# etroit, pour que les opacites se composent vers le centre.
ANNEAUX = [
    (56, (255, 220, 100), 0.15),
    (40, (212, 160, 23), 0.28),
    (26, (212, 160, 23), 0.45),
]

# Le triangle, repris trait pour trait de NavArrow.tsx (repere 0-128) : pointe haute, base
# large, et un creux a l'arriere — c'est ce creux qui donne la direction au premier coup d'oeil
# la ou un triangle plat parait pose au hasard.
BOX = 128.0
TIP_Y, BASE_Y, NOTCH_Y, HALF_WIDTH = 16.0, 108.0, 88.0, 40.0

EPAISSEUR_LISERE = 3.5


def make_arrow(nom, couleurs, scale):
    S = int(TAILLE_DP * scale * SS)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c = S / 2.0
    pts_par_px = S / float(TAILLE_DP)

    # 1) LES TROIS ANNEAUX. Chacun est compose separement puis fondu, et non dessine
    #    directement : un `ellipse` translucide pose sur un autre remplace la couleur au lieu de
    #    s'y ajouter, si bien que le centre serait moins dense que le bord.
    for rayon, couleur, opacite in ANNEAUX:
        anneau = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        r = rayon * pts_par_px
        ImageDraw.Draw(anneau).ellipse(
            [c - r, c - r, c + r, c + r],
            fill=couleur + (int(round(255 * opacite)),),
        )
        img.alpha_composite(anneau)

    # 2) LA FLECHE, CERNEE DE LA COULEUR OPPOSEE.
    k = (FLECHE_DP * pts_par_px) / BOX
    ox = c - (BOX / 2.0) * k
    oy = c - (BOX / 2.0) * k

    def pt(x, y):
        return (ox + x * k, oy + y * k)

    triangle = [
        pt(BOX / 2, TIP_Y),
        pt(BOX / 2 + HALF_WIDTH, BASE_Y),
        pt(BOX / 2, NOTCH_Y),
        pt(BOX / 2 - HALF_WIDTH, BASE_Y),
    ]
    ImageDraw.Draw(img).polygon(
        triangle,
        fill=couleurs['remplissage'] + (255,),
        outline=couleurs['lisere'] + (255,),
        width=max(1, int(EPAISSEUR_LISERE * k)),
    )

    suffix = '' if scale == 1 else '@%dx' % scale
    petit = img.resize((S // SS, S // SS), Image.LANCZOS)
    petit.save(os.path.join(OUT, 'nav-arrow-%s%s.png' % (nom, suffix)))


for nom, couleurs in FLECHES.items():
    for scale in (1, 2, 3):
        make_arrow(nom, couleurs, scale)
print('nav-arrow-{day,night}.png ecrits en 1x/2x/3x dans assets/map')
