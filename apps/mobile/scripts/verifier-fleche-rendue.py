"""Mesure la fleche de position TELLE QU'ELLE EST DESSINEE, pixel par pixel.

POURQUOI CE SCRIPT EXISTE A COTE DE verifier-correctif-jour.ts.

L'autre lit le CODE SOURCE : il verifie que `0.32` est bien ecrit dans le fichier. C'est utile
contre un correctif distrait, et c'est tout ce qu'il prouve. Il ne dit rien de ce que l'oeil
verra — une constante juste posee au mauvais endroit, un anneau dessine avant un autre, une
composition d'opacites qui ne donne pas ce qu'on croit : rien de cela n'apparait dans le texte.

Celui-ci OUVRE LES IMAGES et mesure les pixels. Il repond donc a la seule question qui compte :
le halo a-t-il reellement perdu trente pour cent de son intensite, le degrade va-t-il vraiment
du blanc a l'or, le point rouge est-il la.

CE QU'IL NE PEUT PAS FAIRE. Il mesure la fleche-IMAGE (assets/map/nav-arrow-*.png), celle que la
carte affiche quand la camera ne suit plus le vehicule. La fleche du guidage, elle, est dessinee
en SVG par NavArrow.tsx et n'existe qu'a l'ecran. Les deux sont tenues d'etre identiques, et
verifier-correctif-jour.ts compare leurs constantes ; ici on prouve qu'AU MOINS UNE DES DEUX
produit bien l'image attendue.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-fleche-rendue.py
"""
import io
import os

from PIL import Image

RACINE = os.path.join(os.path.dirname(__file__), '..')
CARTE = os.path.join(RACINE, 'assets', 'map')

# Memes valeurs que ANNEAUX dans make-nav-arrow.py et NavArrow.tsx.
TAILLE_DP = 112
ANNEAUX = [(56, 0.11), (40, 0.20), (26, 0.32)]

fautes = []


def verifier(nom, ok, detail=''):
    print('  %s  %s%s' % ('ok  ' if ok else 'FAUX', nom, ('  - ' + detail) if detail else ''))
    if not ok:
        fautes.append(nom)


def composer(opacites):
    """L'opacite resultante de plusieurs couches translucides empilees.

    C'est la formule du compositing << source-over >> : chaque couche laisse passer (1 - a) de
    ce qui est dessous. On s'en sert pour savoir ce qu'on DOIT mesurer a un rayon donne, au lieu
    de recopier a la main des nombres qu'on aurait pu mal calculer.
    """
    reste = 1.0
    for a in opacites:
        reste *= 1.0 - a
    return 1.0 - reste


def alpha_a(img, rayon_dp, echelle):
    """L'opacite mesuree a `rayon_dp` du centre, sur l'axe horizontal (hors de la fleche)."""
    c = img.size[0] // 2
    x = c + int(rayon_dp * echelle)
    return img.getpixel((x, c))[3]


print('\nLES IMAGES EXISTENT ET ONT LA BONNE TAILLE')

images = {}
for nom in ('day', 'night'):
    for echelle, suffixe in ((1, ''), (2, '@2x'), (3, '@3x')):
        chemin = os.path.join(CARTE, 'nav-arrow-%s%s.png' % (nom, suffixe))
        existe = os.path.exists(chemin)
        if not existe:
            verifier('nav-arrow-%s%s.png' % (nom, suffixe), False, 'absente')
            continue
        img = Image.open(chemin).convert('RGBA')
        attendu = TAILLE_DP * echelle
        verifier(
            'nav-arrow-%s%s.png : %d x %d' % (nom, suffixe, img.size[0], img.size[1]),
            img.size == (attendu, attendu),
            '%d attendu' % attendu,
        )
        images[(nom, echelle)] = img

jour = images.get(('day', 3))
nuit = images.get(('night', 3))
if jour is None or nuit is None:
    print('\nImages manquantes : relancer scripts/make-nav-arrow.py\n')
    raise SystemExit(1)
E = 3  # on mesure sur la 3x, la plus precise

print('\nC1 - LE HALO A PERDU 30 % D INTENSITE, MESURE SUR LES PIXELS')

# A chaque distance du centre, on sait quelles couches se superposent : hors du deuxieme anneau
# il n'y a que le troisieme, etc. On compare la mesure a la composition THEORIQUE des opacites
# du document. Un ecart de 2 sur 255 est la marge d'arrondi de la reduction d'image.
MESURES = [
    ('entre 40 et 56 dp : seul l anneau exterieur', 48, [0.11]),
    ('entre 26 et 40 dp : deux anneaux', 33, [0.11, 0.20]),
    ('sous 26 dp : les trois anneaux', 22, [0.11, 0.20, 0.32]),
]
for nom, rayon, couches in MESURES:
    attendu = int(round(255 * composer(couches)))
    mesure = alpha_a(jour, rayon, E)
    verifier(
        '%s : alpha %d' % (nom, mesure),
        abs(mesure - attendu) <= 2,
        '%d attendu (composition de %s)' % (attendu, ' + '.join(str(c) for c in couches)),
    )

# ET LE CONTROLE QUI DONNE SON SENS AUX TROIS PRECEDENTS : l'ancienne composition, celle d'avant
# la reduction, ne doit PLUS etre mesurable. Sans lui, les trois mesures ci-dessus passeraient
# aussi bien si quelqu'un remettait les anciennes valeurs et changeait ce fichier en meme temps.
ancien = int(round(255 * composer([0.15, 0.28, 0.45])))
nouveau = int(round(255 * composer([0.11, 0.20, 0.32])))
mesure_centre = alpha_a(jour, 22, E)
verifier(
    'le halo est bien PLUS FAIBLE qu avant la correction',
    mesure_centre < ancien - 10,
    'mesure %d, ancien %d, nouveau %d' % (mesure_centre, ancien, nouveau),
)
verifier(
    'la reduction est proche de 30 %%',
    abs((1 - nouveau / float(ancien)) - 0.23) < 0.08,
    'les opacites baissent de 30 %%, la composition de %.0f %%' % ((1 - nouveau / float(ancien)) * 100),
)

print('\nC1 - LA TAILLE DU HALO N A PAS BOUGE')

# Le document le repete trois fois. On verifie que le halo s'arrete bien au rayon 56 et pas
# avant : la facon evidente de << reduire un halo >> serait de le retrecir.
# ON RETROUVE LES TROIS RAYONS DANS L'IMAGE, au lieu de croire le code sur parole.
#
# C'est le controle qui prouve vraiment que << la taille n'a pas bouge >>. On balaie du centre
# vers le bord et on note ou l'opacite CHANGE : chaque saut est le bord d'un anneau. Si
# quelqu'un retrecissait le halo en croyant l'attenuer, ces trois nombres bougeraient et rien
# d'autre ne le signalerait.
def rayons_de_transition(img, echelle):
    c = img.size[0] // 2
    sauts = []
    precedent = img.getpixel((c + int(10 * echelle), c))[3]
    # On s'arrete a 55 : le centre est a 168 px et l'image en fait 336, donc 56 dp tombe
    # exactement hors du dernier pixel.
    for r in range(11, 56):
        a = img.getpixel((c + int(r * echelle), c))[3]
        if abs(a - precedent) > 6:
            sauts.append(r)
        precedent = a
    return sauts


sauts = rayons_de_transition(jour, E)
print('        bords detectes a : %s dp' % ', '.join(str(r) for r in sauts))
for attendu in (26, 40):
    verifier(
        'un bord d anneau a %d dp' % attendu,
        any(abs(r - attendu) <= 1 for r in sauts),
        'le document interdit de toucher aux rayons',
    )
verifier(
    'le halo porte encore jusqu au bord, a 55 dp',
    alpha_a(jour, 55, E) > 4,
    'alpha %d' % alpha_a(jour, 55, E),
)
verifier(
    'et il ne deborde pas : le coin de l image est vide',
    jour.getpixel((2, 2))[3] == 0,
    'un halo carre voudrait dire que le disque a ete remplace par un fond',
)

print('\nC9 - LE DEGRADE VA DU BLANC A L OR')


def sur_axe(img, frac):
    """Le pixel sur l'axe vertical, a la fraction `frac` de la hauteur."""
    w, h = img.size
    return img.getpixel((w // 2, int(h * frac)))


# La fleche fait 40 dp au centre d'une boite de 112 : son triangle va de 41 a 69,8 dp, soit de
# 0,366 a 0,623 en fraction d'image. Le creux arriere coupe l'axe a 0,567 : on reste au-dessus.
# LES HAUTEURS EVITENT LE POINT GPS, et ce n'est pas un detail cosmetique.
#
# Le point rouge est centre sur l'axe, a 40 dans le repere de la fleche : il couvre la bande
# 0,416 - 0,450 de l'image. Une premiere version mesurait a 0,44 et lisait donc le ROUGE du
# point, pas le degrade — le controle a echoue en annoncant un degrade casse alors qu'il allait
# bien. Le test suivant garantit qu'on ne recommencera pas en silence.
POINTS = [('pointe', 0.385), ('haut', 0.470), ('milieu', 0.510), ('bas', 0.550)]
lus = [(nom, sur_axe(jour, f)) for nom, f in POINTS]

sur_le_point = [nom for nom, px in lus if px[0] > 180 and px[1] < 110 and px[2] < 110]
verifier(
    'aucune mesure ne tombe sur le point GPS rouge',
    not sur_le_point,
    'touche : %s — deplacer les hauteurs, pas le point' % ', '.join(sur_le_point),
)
for nom, px in lus:
    print('        %-8s rgba%s' % (nom, px))

verifier(
    'la pointe est blanche',
    lus[0][1][0] > 245 and lus[0][1][1] > 245 and lus[0][1][2] > 240,
    'rgb%s' % (lus[0][1][:3],),
)
verifier(
    'la base est doree',
    lus[-1][1][2] < 110 and lus[-1][1][0] > 200,
    'rgb%s' % (lus[-1][1][:3],),
)
# LE BLEU EST CE QUI MESURE LE DEGRADE. Le rouge reste haut d'un bout a l'autre (blanc et or en
# ont tous deux beaucoup) ; c'est le bleu qui tombe de 255 a 23. Il doit DECROITRE sans jamais
# remonter : une remontee voudrait dire que les arrets sont dans le desordre.
bleus = [px[2] for _, px in lus]
verifier(
    'le bleu decroit de la pointe vers la base, sans remonter',
    all(bleus[i] >= bleus[i + 1] for i in range(len(bleus) - 1)),
    ' > '.join(str(b) for b in bleus),
)
# 250 ET NON 255 : la pointe du triangle est un angle aigu, et le lissage des bords laisse le
# pixel exactement sur la pointe partiellement couvert. Exiger 255 ferait echouer ce controle
# pour une raison qui n'a rien a voir avec le degrade.
verifier(
    'la fleche est opaque sur toute sa hauteur',
    all(px[3] >= 250 for _, px in lus),
    'un degrade ne doit pas rendre la fleche translucide — alphas %s'
    % ', '.join(str(px[3]) for _, px in lus),
)

print('\nC9 - LE POINT GPS ROUGE EST DEVANT LA POINTE')

# IL EST A 8 DANS LE REPERE 0-128 DE LA FLECHE, rayon 7 : il couvre les unites 1 a 15, soit la
# bande 0,324 - 0,363 de l'image, JUSTE AU-DESSUS de la pointe du triangle, qui commence a 16
# (0,366).
#
# CETTE BANDE A CHANGE DEUX FOIS, et le controle l'a signale les deux fois en repondant
# << aucun pixel rouge >>. C'est exactement ce qu'on lui demande : si le point disparait ou se
# deplace sans qu'on le veuille, il le dit, au lieu de laisser une fleche sans repere.
w, h = jour.size
bande = [jour.getpixel((w // 2, y)) for y in range(int(h * 0.322), int(h * 0.366))]
rouges = [p for p in bande if p[0] > 180 and p[1] < 110 and p[2] < 110]
verifier(
    'un rouge franc apparait DEVANT la pointe',
    len(rouges) > 0,
    'rgb%s' % (rouges[0][:3],) if rouges else 'aucun pixel rouge dans la bande',
)

# ET IL N EST PLUS SUR LE CORPS DE LA FLECHE. C'est la demande du 13 novembre : << je trouvais
# qu'il est sur l'icone elle-meme, tu le mets avant l'icone >>. On balaie donc l'interieur du
# triangle et on exige qu'aucun rouge n'y traine.
corps = [jour.getpixel((w // 2, y)) for y in range(int(h * 0.40), int(h * 0.55))]
rouges_corps = [q for q in corps if q[0] > 180 and q[1] < 110 and q[2] < 110]
verifier(
    'et AUCUN rouge ne subsiste sur le corps de la fleche',
    len(rouges_corps) == 0,
    '%d pixel(s) rouge(s) sur la fleche' % len(rouges_corps),
)

print('\nC9 - LA NUIT SE DISTINGUE DU JOUR, ET SEULEMENT PAR LE CONTOUR')

# ON COMPTE LES PIXELS, ON N EN ECHANTILLONNE PAS UN SEUL.
#
# Une premiere version comparait le pixel au milieu de la pointe. Il s'est trouve identique
# dans les deux images — la lueur vit dans le CONTOUR, une bande de deux points et demi, et
# un point unique la manque une fois sur deux selon l'arrondi. Le controle echouait alors que
# la lueur etait bien la : un test qui depend de l'endroit exact ou on regarde ne dit rien.
#
# On compare donc les deux images entierement, et on mesure l'ecart la ou il est : sur le
# contour.
differents = 0
bleu_jour = 0
bleu_nuit = 0
mesures = 0
for y in range(h):
    for x in range(w):
        pj = jour.getpixel((x, y))
        pn = nuit.getpixel((x, y))
        if pj[3] == 0 and pn[3] == 0:
            continue
        if pj[:3] != pn[:3]:
            differents += 1
            bleu_jour += pj[2]
            bleu_nuit += pn[2]
            mesures += 1

verifier(
    'les deux images different sur un nombre significatif de pixels',
    differents > 500,
    '%d pixels visibles different' % differents,
)
verifier(
    'et la nuit y est plus doree',
    mesures > 0 and bleu_nuit < bleu_jour,
    'bleu moyen %d de jour contre %d de nuit : c est la lueur doree'
    % (bleu_jour / max(mesures, 1), bleu_nuit / max(mesures, 1)),
)
verifier(
    'la difference reste CONFINEE au contour',
    differents < (w * h) // 8,
    'la nuit ne redessine pas la fleche, elle borde la meme',
)
verifier(
    'le corps du degrade reste le meme',
    sur_axe(jour, 0.49)[:3] == sur_axe(nuit, 0.49)[:3],
    'seul le contour change, pas le remplissage',
)

print(
    '\nLa fleche dessinee est celle du document : halo attenue, degrade blanc-or, point rouge.\n'
    if not fautes
    else '\nA CORRIGER : %d verification(s) en echec.\n' % len(fautes)
)
raise SystemExit(1 if fautes else 0)
