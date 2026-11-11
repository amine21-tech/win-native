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

DEUX IMAGES parce qu'une image ne se teinte pas. Depuis le 11 novembre (C9), les deux portent le
MEME degrade — blanc a la pointe, or a la base ; ce qui les separe est le contour, blanc de jour
et legerement dore de nuit, qui donne la << lueur >> demandee sans filtre de rendu.

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

# LA FLECHE OPTION D (correction C9 du 11 novembre) : un degrade vertical de la pointe BLANCHE
# vers la base DOREE, cerne de blanc.
#
# POURQUOI LA POINTE EST CLAIRE. Une fleche d'une seule couleur ne dit pas de quel cote elle
# pointe tant qu'on ne distingue pas sa forme ; a la taille d'un ongle sur une carte chargee,
# c'est la partie la plus LUMINEUSE que l'oeil trouve en premier. Le degrade fait donc designer
# la direction par la clarte, et non par la geometrie.
#
# Memes valeurs que DEGRADE_FLECHE dans src/components/NavArrow.tsx : les deux fleches ne
# s'affichent jamais en meme temps, mais elles doivent etre la meme fleche.
DEGRADE = [
    (0.00, (255, 255, 255)),   # pointe, blanc
    (0.45, (255, 229, 102)),   # milieu, jaune
    (1.00, (212, 160, 23)),    # base, or WIN
]

# Contour blanc : il se lit sur TOUTE carte. Le lisere vert fonce d'avant disparaissait sur un
# parc ou une foret.
CONTOUR = (255, 255, 255)
# De nuit, le contour s'epaissit et se teinte d'or : c'est la << lueur doree supplementaire >>
# du document, obtenue sans filtre de rendu.
CONTOUR_NUIT = (255, 244, 204)

# LE POINT GPS ROUGE, sous la pointe. La fleche dit le CAP ; le point dit la POSITION EXACTE.
# La distinction compte a l'arret devant un carrefour, ou cinq metres decident de la rue.
POINT_GPS = (229, 57, 53)

FLECHES = {
    'day': {'contour': CONTOUR, 'epaisseur': 1.0},
    'night': {'contour': CONTOUR_NUIT, 'epaisseur': 1.4},
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
#
# LES OPACITES ONT BAISSE DE 30 % le 11 novembre (correction C1) : chacune multipliee par 0,70.
# Les RAYONS ne bougent pas — le document le repete trois fois, parce que la facon evidente de
# << reduire le halo >> serait de le retrecir, et ce n'est pas ce qui est demande.
ANNEAUX = [
    (56, (255, 220, 100), 0.11),
    (40, (212, 160, 23), 0.20),
    (26, (212, 160, 23), 0.32),
]

# Le triangle, repris trait pour trait de NavArrow.tsx (repere 0-128) : pointe haute, base
# large, et un creux a l'arriere — c'est ce creux qui donne la direction au premier coup d'oeil
# la ou un triangle plat parait pose au hasard.
BOX = 128.0
TIP_Y, BASE_Y, NOTCH_Y, HALF_WIDTH = 16.0, 108.0, 88.0, 40.0

EPAISSEUR_LISERE = 3.5


def couleur_degrade(t):
    """La couleur du degrade a la fraction `t` de la hauteur, de la pointe (0) a la base (1)."""
    t = min(1.0, max(0.0, t))
    for i in range(len(DEGRADE) - 1):
        d0, c0 = DEGRADE[i]
        d1, c1 = DEGRADE[i + 1]
        if t <= d1:
            # Interpolation lineaire entre les deux arrets qui encadrent t.
            part = 0.0 if d1 == d0 else (t - d0) / (d1 - d0)
            return tuple(int(round(c0[j] + (c1[j] - c0[j]) * part)) for j in range(3))
    return DEGRADE[-1][1]


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

    # 2) LA FLECHE, EN DEGRADE, CERNEE DE BLANC.
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

    # LE DEGRADE SE FABRIQUE PAR UN MASQUE, parce que PIL ne sait pas remplir une forme avec un
    # degrade. On peint une bande verticale de couleurs sur toute la hauteur de la fleche, puis
    # on la decoupe a la forme du triangle. C'est exact au pixel pres et cela tient en dix
    # lignes — une boucle de remplissage par scanline serait plus longue et moins lisible.
    haut = oy + TIP_Y * k
    bas = oy + BASE_Y * k
    bande = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    peintre = ImageDraw.Draw(bande)
    hauteur = max(1.0, bas - haut)
    for y in range(int(haut), int(bas) + 1):
        peintre.line([(0, y), (S, y)], fill=couleur_degrade((y - haut) / hauteur) + (255,))

    masque = Image.new('L', (S, S), 0)
    ImageDraw.Draw(masque).polygon(triangle, fill=255)
    img.paste(bande, (0, 0), masque)

    # Le contour, par-dessus le degrade.
    ImageDraw.Draw(img).polygon(
        triangle,
        outline=couleurs['contour'] + (255,),
        width=max(1, int(EPAISSEUR_LISERE * couleurs['epaisseur'] * k)),
    )

    # 3) LE POINT GPS ROUGE, sous la pointe.
    rayon = 4.5 * k
    cy = oy + (TIP_Y + 4.5 * 2.4) * k
    cx = ox + (BOX / 2.0) * k
    point = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dp = ImageDraw.Draw(point)
    dp.ellipse([cx - rayon, cy - rayon, cx + rayon, cy + rayon],
               fill=POINT_GPS + (255,), outline=(255, 255, 255, 255),
               width=max(1, int(1.6 * k)))
    img.alpha_composite(point)

    suffix = '' if scale == 1 else '@%dx' % scale
    petit = img.resize((S // SS, S // SS), Image.LANCZOS)
    petit.save(os.path.join(OUT, 'nav-arrow-%s%s.png' % (nom, suffix)))


for nom, couleurs in FLECHES.items():
    for scale in (1, 2, 3):
        make_arrow(nom, couleurs, scale)
print('nav-arrow-{day,night}.png ecrits en 1x/2x/3x dans assets/map')
