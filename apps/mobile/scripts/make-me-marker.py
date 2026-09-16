"""
Genere les images du point « Vous etes ici » (assets/map/me-*.png), en 1x, 2x et 3x.

Pourquoi des images et pas une vue React Native : une vue posee sur la carte est repositionnee
APRES chaque image de la carte, donc toujours avec un temps de retard — pendant un glissement du
doigt, le point semblait se deplacer par rapport aux rues. Une image de style est dessinee par le
moteur de la carte dans la meme image que les rues : elle ne peut pas decrocher.

Le dessin reprend le `meDot` de win-v83 (halo vert, fleche doree, rond vert cercle de blanc) et
l'etiquette `.you-here-label` (fond #0a5840, texte blanc gras, coins de 10, pointe vers le bas).

Relancer apres toute modification :  python scripts/make-me-marker.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'map')
SS = 4  # sur-echantillonnage, pour des bords lisses apres reduction
FONT = r'C:\Windows\Fonts\arialbd.ttf'

GREEN = (13, 110, 79)
GREEN_DEEP = (10, 88, 64)
GOLD = (232, 193, 74)
GOLD_EDGE = (122, 90, 18)

DOT_DP = 56


def save(img, name, scale):
    suffix = '' if scale == 1 else '@%dx' % scale
    img.save(os.path.join(OUT, '%s%s.png' % (name, suffix)))


def make_dot(scale):
    S = DOT_DP * scale * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c = S / 2

    # 1) halo : degrade radial 40 % -> 18 % -> 0 d'opacite sur 40 % du cote
    halo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = halo.load()
    R = S * 0.40
    for y in range(S):
        for x in range(S):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5 / R
            if d >= 1:
                continue
            a = 0.40 + (0.18 - 0.40) * (d / 0.65) if d < 0.65 else 0.18 * (1 - (d - 0.65) / 0.35)
            px[x, y] = GREEN + (int(255 * a),)
    img.alpha_composite(halo)

    # 2) fleche doree vers le haut, au bord du halo
    draw = ImageDraw.Draw(img)
    aw, base, tip = S * 0.15, S * 0.40 * 0.94, S * 0.50
    tri = [(c, c - tip + S * 0.01), (c - aw / 2, c - base), (c + aw / 2, c - base)]
    draw.polygon(tri, fill=GOLD + (255,), outline=GOLD_EDGE + (255,), width=max(1, int(S * 0.02)))

    # 3) ombre legere puis rond vert cercle de blanc
    r = S * 0.165
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([c - r, c - r + S * 0.03, c + r, c + r + S * 0.03], fill=(0, 0, 0, 90))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(S * 0.03)))
    draw = ImageDraw.Draw(img)
    ring = S * 0.045
    draw.ellipse([c - r - ring / 2, c - r - ring / 2, c + r + ring / 2, c + r + ring / 2], fill=(255, 255, 255, 255))
    draw.ellipse([c - r + ring / 2, c - r + ring / 2, c + r - ring / 2, c + r - ring / 2], fill=GREEN + (255,))

    save(img.resize((S // SS, S // SS), Image.LANCZOS), 'me-dot', scale)


# Arabe : Pillow sans moteur de mise en forme ne lie pas les lettres. On ecrit donc directement
# les formes contextuelles (bloc Unicode « Arabic Presentation Forms-B »), dans l'ordre visuel.
# « أنت هنا » = [ا final][ن medial][ه initial] espace [ت final][ن initial][أ isole]
AR_VISUAL = '\ufe8e\ufee8\ufeeb \ufe96\ufee7\ufe83'

LABELS = {'fr': 'Vous êtes ici', 'en': 'You are here', 'ar': AR_VISUAL}


def make_label(lang, text, scale):
    k = scale * SS
    font = ImageFont.truetype(FONT, int(12.5 * k))
    left, top, right, bottom = font.getbbox(text)
    tw, th = right - left, bottom - top
    pad_x, body_h, tip = 11 * k, 26 * k, 6 * k
    W = int(tw + 2 * pad_x)
    H = int(body_h + tip + 4 * k)  # 4 dp de marge basse pour l'ombre
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([2 * k, 3 * k, W - 2 * k, body_h + 1 * k], radius=10 * k, fill=(0, 0, 0, 70))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(2 * k)))

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, W - 1, body_h], radius=10 * k, fill=GREEN_DEEP + (255,))
    draw.polygon([(W / 2 - tip, body_h - 1), (W / 2 + tip, body_h - 1), (W / 2, body_h + tip)], fill=GREEN_DEEP + (255,))
    draw.text(((W - tw) / 2 - left, (body_h - th) / 2 - top), text, font=font, fill=(255, 255, 255, 255))

    save(img.resize((W // SS, H // SS), Image.LANCZOS), 'me-label-' + lang, scale)


os.makedirs(OUT, exist_ok=True)
for s in (1, 2, 3):
    make_dot(s)
    for lang, text in LABELS.items():
        make_label(lang, text, s)
print('images generees dans', os.path.abspath(OUT))
