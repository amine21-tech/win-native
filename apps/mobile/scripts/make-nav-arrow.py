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

DEUX COULEURS parce qu'une image ne se teinte pas : le vert WIN de jour, le turquoise de nuit.
Ce sont exactement les deux couleurs de l'itineraire (ROUTE_COLORS dans app/index.tsx) — la
fleche et le trace qu'elle suit doivent etre de la meme couleur.

Le halo est DESSINE DANS L'IMAGE, et il ne respire pas. Celui du composant pulse pour signaler
que le guidage est vivant ; ici la fleche se deplace sur la carte, ce qui le dit deja.

Relancer apres toute modification :  python scripts/make-nav-arrow.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'map')
SS = 4  # sur-echantillonnage, pour des bords lisses apres reduction

# Memes valeurs que ROUTE_COLORS.day.main / ROUTE_COLORS.night.main.
COULEURS = {
    'day': (13, 110, 79),
    'night': (46, 230, 166),
}

# Cote de l'image en points : la MEME que NAV_PUCK_SIZE dans app/index.tsx, pour que la fleche
# garde exactement la meme corpulence que le suivi s'interrompe ou non.
#
# Les deux avaient derive — 46 ici contre 40 la-bas — et le commentaire affirmait pourtant
# qu'elles etaient egales. Personne ne pouvait le voir : les deux fleches ne s'affichent jamais
# en meme temps, et un ecart de six points ne saute aux yeux que si on les compare cote a cote.
TAILLE_DP = 40

# Le triangle, repris trait pour trait de NavArrow.tsx (repere 0-128) : pointe haute, base
# large, et un creux a l'arriere — c'est ce creux qui donne la direction au premier coup d'oeil
# la ou un triangle plat parait pose au hasard.
BOX = 128.0
TIP_Y, BASE_Y, NOTCH_Y, HALF_WIDTH = 30.0, 100.0, 84.0, 30.0
RAYON_DISQUE = 52.0
EPAISSEUR_ANNEAU = 3.0


def make_arrow(nom, couleur, scale):
    S = int(TAILLE_DP * scale * SS)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c = S / 2.0

    # 1) le halo : un disque de la couleur du trace, tres transparent, qui detache la fleche du
    #    fond de carte. Degrade en anneaux concentriques — assez pour l'oeil, et sans la boucle
    #    pixel par pixel qui rendrait le script lent a 3x.
    halo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dessin_halo = ImageDraw.Draw(halo)
    R = S * 0.47
    anneaux = 36
    for i in range(anneaux, 0, -1):
        d = i / float(anneaux)
        r = R * d
        a = int(255 * 0.30 * (1.0 - d) ** 1.6)
        dessin_halo.ellipse([c - r, c - r, c + r, c + r], fill=couleur + (a,))
    img.alpha_composite(halo)

    # 2) LE DISQUE BLANC, puis la fleche par-dessus.
    #
    #    La fleche etait remplie de la couleur de l'itineraire et posee SUR cet itineraire :
    #    deux surfaces de la meme teinte l'une sur l'autre ne font qu'une seule forme, et il ne
    #    restait d'elle que son liseré blanc de deux pixels. Un disque blanc OPAQUE regle cela a
    #    la source — ce n'est plus le fond de carte qui porte la fleche mais un fond a nous.
    #    L'anneau sombre sert au cas inverse : sur le beige clair du fond, un disque blanc sans
    #    contour se dissout a son tour.
    k = (S * 0.70) / BOX
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
    dessin = ImageDraw.Draw(img)
    r = RAYON_DISQUE * k
    dessin.ellipse(
        [c - r, c - r, c + r, c + r],
        fill=(255, 255, 255, 255),
        outline=(0, 0, 0, 56),
        width=max(1, int(EPAISSEUR_ANNEAU * k)),
    )
    dessin.polygon(triangle, fill=couleur + (255,))

    suffix = '' if scale == 1 else '@%dx' % scale
    petit = img.resize((S // SS, S // SS), Image.LANCZOS)
    petit.save(os.path.join(OUT, 'nav-arrow-%s%s.png' % (nom, suffix)))


for nom, couleur in COULEURS.items():
    for scale in (1, 2, 3):
        make_arrow(nom, couleur, scale)
print('nav-arrow-{day,night}.png ecrits en 1x/2x/3x dans assets/map')
