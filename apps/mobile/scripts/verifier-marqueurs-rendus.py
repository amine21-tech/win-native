"""Mesure les MARQUEURS DE SIGNALEMENT tels qu'ils sont dessines, pixel par pixel.

POURQUOI CE SCRIPT. La maquette << 12 symboles signalement sur la carte >> donne quatre
couleurs d'anneau, une taille et un emoji par type. Un controle sur le code source prouverait
que ces valeurs sont ecrites quelque part ; il ne dirait rien de ce que le conducteur verra.

Et ces marqueurs ont une facon particuliere de rater en silence. Ils sont cuits par Pillow a
partir d'une police COULEUR : si `embedded_color` disparait, les emoji deviennent des
silhouettes NOIRES, toutes identiques — douze pastilles avec la meme tache sombre au milieu.
Rien ne plante, aucun test de code ne bronche, et le defaut ne se voit qu'en regardant la
carte. On mesure donc les pixels.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-marqueurs-rendus.py
"""
import io
import os
import re
from collections import Counter

from PIL import Image

RACINE = os.path.join(os.path.dirname(__file__), '..')
CARTE = os.path.join(RACINE, 'assets', 'map')
SIGNALISATION = os.path.join(RACINE, 'src', 'map', 'signalisation.ts')

COTE_DP = 34
ANNEAU = {
    'blocage': (211, 47, 47),
    'danger': (230, 92, 0),
    'info': (21, 101, 192),
    'standard': (13, 110, 79),
}

fautes = []


def verifier(nom, ok, detail=''):
    print('  %s  %s%s' % ('ok  ' if ok else 'FAUX', nom, ('  - ' + detail) if detail else ''))
    if not ok:
        fautes.append(nom)


def proche(a, b, tolerance=26):
    return all(abs(a[i] - b[i]) <= tolerance for i in range(3))


# LA TABLE DES CATEGORIES EST LUE DANS LE CODE, pas recopiee : si un type change de categorie,
# c'est l'image qui doit suivre, et ce script doit le constater — pas repeter l'ancienne valeur.
texte = io.open(SIGNALISATION, encoding='utf-8').read()
bloc = texte[texte.index('export const CATEGORIE'):texte.index('\n};', texte.index('export const CATEGORIE'))]
CATEGORIE = dict(re.findall(r"(\w+):\s*'(\w+)'", bloc))

print('\nLES QUATORZE MARQUEURS EXISTENT, EN TROIS DENSITES')
manquants = []
for kind in CATEGORIE:
    for echelle, suffixe in ((1, ''), (2, '@2x'), (3, '@3x')):
        f = os.path.join(CARTE, 'marker-%s%s.png' % (kind, suffixe))
        if not os.path.exists(f):
            manquants.append(os.path.basename(f))
verifier(
    '%d types x 3 densites' % len(CATEGORIE),
    not manquants,
    ' '.join(manquants[:4]) or 'aucune image absente',
)
if manquants:
    print('\nRelancer scripts/make-report-markers.py\n')
    raise SystemExit(1)

print('\nCHAQUE MARQUEUR FAIT 34 POINTS')
mauvaise = []
for kind in CATEGORIE:
    for echelle, suffixe in ((1, ''), (2, '@2x'), (3, '@3x')):
        im = Image.open(os.path.join(CARTE, 'marker-%s%s.png' % (kind, suffixe)))
        if im.size != (COTE_DP * echelle, COTE_DP * echelle):
            mauvaise.append('%s%s %s' % (kind, suffixe, im.size))
verifier('valeur du document', not mauvaise, ' · '.join(mauvaise[:3]) or '34, 68 et 102 pixels')

print("\nL ANNEAU PORTE LA COULEUR DE LA CATEGORIE")
for kind, categorie in sorted(CATEGORIE.items()):
    im = Image.open(os.path.join(CARTE, 'marker-%s@3x.png' % kind)).convert('RGBA')
    S = im.size[0]
    c = S // 2
    # L'anneau est au bord. On echantillonne A MI-EPAISSEUR, pas sur l'arete : a 0.045 le point
    # tombait sur le lissage et renvoyait un rose delave — la mesure accusait l'image d'un
    # defaut qui etait le sien. Le profil vertical donne l'anneau entre 0.06 et 0.12 : 0.09.
    bord = int(S * 0.09)
    pts = [(c, bord), (c, S - 1 - bord), (bord, c), (S - 1 - bord, c)]
    dominante = Counter(im.getpixel(p)[:3] for p in pts).most_common(1)[0][0]
    verifier(
        '%-12s %-9s' % (kind, categorie),
        proche(dominante, ANNEAU[categorie]),
        'rgb%s attendu rgb%s' % (dominante, ANNEAU[categorie]),
    )

print('\nLE FOND EST PALE, PAS LA COULEUR DE LA CATEGORIE')
# Le marqueur est pose sur une carte chargee : un fond sature rendrait l'emoji illisible, et
# c'est le contraire de la maquette, dont les pastilles sont presque blanches.
sombres = []
for kind in CATEGORIE:
    im = Image.open(os.path.join(CARTE, 'marker-%s@3x.png' % kind)).convert('RGBA')
    S = im.size[0]
    c = S // 2
    # QUATRE POINTS, ET ON GARDE LE DOMINANT. Entre l'anneau et le dessin il reste une bande
    # de fond etroite, et certains emoji (la poubelle, la vague) la mordent d'un cote. Un seul
    # point tombait alors sur le dessin et declarait le fond noir. Trois points sur quatre
    # suffisent a dire la couleur du fond.
    pts = [(c, int(S * 0.18)), (c, S - 1 - int(S * 0.18)), (int(S * 0.18), c), (S - 1 - int(S * 0.18), c)]
    p = Counter(im.getpixel(q)[:3] for q in pts).most_common(1)[0][0]
    if min(p) < 215:
        sombres.append('%s rgb%s' % (kind, p))
verifier(
    'les quatorze fonds sont clairs',
    not sombres,
    ' · '.join(sombres[:3]) or 'teintes tres pales, comme la maquette',
)

print('\nLES EMOJI SONT EN COULEUR, ET TOUS DIFFERENTS')

# LE CONTROLE QUI ATTRAPE LA PANNE SILENCIEUSE. Sans `embedded_color`, Pillow rend les emoji en
# NOIR : douze pastilles identiques, et rien pour le signaler.
monochromes = []
empreintes = {}
for kind in CATEGORIE:
    im = Image.open(os.path.join(CARTE, 'marker-%s@3x.png' % kind)).convert('RGBA')
    S = im.size[0]
    coeur = im.crop((int(S * 0.3), int(S * 0.3), int(S * 0.7), int(S * 0.7)))
    couleurs = set(coeur.convert('RGB').getdata())
    # L'empreinte sert a comparer les marqueurs entre eux, plus bas.
    empreintes[kind] = sorted(Counter(coeur.convert('RGB').getdata()).most_common(6))
    if len(couleurs) < 12:
        monochromes.append('%s (%d couleurs)' % (kind, len(couleurs)))
verifier(
    'aucun emoji ne sort en silhouette noire',
    not monochromes,
    ' · '.join(monochromes[:4]) or 'la police couleur est bien rendue',
)

# ET ILS NE SE RESSEMBLENT PAS. Deux types qui partagent leur emoji deviennent indiscernables
# sur la carte. Les trois forces le font VOLONTAIREMENT — elles ne sont plus creables et
# designent toutes un barrage.
FORCES = {'police', 'gendarmerie', 'armee'}
doublons = []
cles = [k for k in CATEGORIE if k not in FORCES]
for i, a in enumerate(cles):
    for b in cles[i + 1:]:
        if empreintes[a] == empreintes[b]:
            doublons.append('%s = %s' % (a, b))
verifier(
    'deux types ne partagent jamais le meme dessin',
    not doublons,
    ' · '.join(doublons[:3]) or '%d types compares' % len(cles),
)
verifier(
    'les trois forces partagent le leur, et c est voulu',
    empreintes['police'] == empreintes['gendarmerie'] == empreintes['armee'],
    'elles ne sont plus creables depuis le 9 novembre et designent le meme barrage',
)

print(
    '\nLes douze symboles de la carte sont ceux de la maquette.\n'
    if not fautes
    else '\nA CORRIGER : %d verification(s) en echec.\n' % len(fautes)
)
raise SystemExit(1 if fautes else 0)
