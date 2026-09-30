"""
Genere l'epingle de destination (assets/map/destination-pin.png), en 1x, 2x et 3x.

Pourquoi une image plutot qu'un emoji : le pictogramme de destination etait un `text-field`
portant un emoji. Or le serveur de tuiles ne sert que Noto Sans, qui ne contient aucun emoji —
le symbole n'etait donc JAMAIS dessine, et il ne restait qu'une pastille verte. Le client
demande « une epingle, comme Google Maps / Waze » : une image de style, elle, ne depend
d'aucune police et s'affiche a coup sur.

Le dessin reprend les couleurs du site : goutte verte WIN cerclee de blanc, point blanc au
centre, ombre portee douce pour la detacher du fond de carte.

Relancer apres toute modification :  python scripts/make-destination-pin.py
"""
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'map')
SS = 4  # sur-echantillonnage, pour des bords lisses apres reduction

GREEN = (13, 110, 79)
WHITE = (255, 255, 255)

# Largeur de l'epingle en points ; la hauteur suit le rapport d'une goutte classique.
PIN_W_DP = 30
PIN_H_DP = 42


def save(img, name, scale):
    suffix = '' if scale == 1 else '@%dx' % scale
    img.save(os.path.join(OUT, '%s%s.png' % (name, suffix)))


def make_pin(scale):
    W = PIN_W_DP * scale * SS
    H = PIN_H_DP * scale * SS
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    cx = W / 2
    r = W * 0.5 * 0.92          # rayon de la tete
    cy = r + W * 0.04           # centre de la tete
    tip_y = H - W * 0.06        # pointe basse

    # 1) ombre portee : une ellipse floue posee sous la pointe, comme sur une carte papier.
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [cx - r * 0.55, tip_y - r * 0.30, cx + r * 0.55, tip_y + r * 0.18],
        fill=(0, 0, 0, 90),
    )
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(W * 0.035)))

    draw = ImageDraw.Draw(img)

    # 2) la goutte : un disque pour la tete, un triangle pour la pointe. Les deux se recouvrent,
    #    le triangle partant de l'interieur du disque pour que la jonction reste franche.
    edge = W * 0.055  # epaisseur du liseré blanc
    draw.polygon([(cx - r * 0.72, cy + r * 0.45), (cx + r * 0.72, cy + r * 0.45), (cx, tip_y)], fill=WHITE)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)

    ri = r - edge
    draw.polygon(
        [(cx - ri * 0.70, cy + ri * 0.45), (cx + ri * 0.70, cy + ri * 0.45), (cx, tip_y - edge * 1.7)],
        fill=GREEN,
    )
    draw.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=GREEN)

    # 3) le point blanc du centre, qui donne l'oeil de l'epingle.
    hole = r * 0.34
    draw.ellipse([cx - hole, cy - hole, cx + hole, cy + hole], fill=WHITE)

    return img.resize((PIN_W_DP * scale, PIN_H_DP * scale), Image.LANCZOS)


for s in (1, 2, 3):
    save(make_pin(s), 'destination-pin', s)
    print('destination-pin', '%dx' % s, 'ok')
