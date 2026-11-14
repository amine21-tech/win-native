"""Toute couche de carte qui ecrit du TEXTE doit declarer sa police.

POURQUOI CETTE REGLE EXISTE, ET POURQUOI ELLE A ETE OUBLIEE TROIS FOIS.

MapLibre ne dessine pas du texte : il reclame au serveur de tuiles les GLYPHES de la police
nommee par `text-font`. Quand la couche n'en nomme aucune, il reclame la valeur par defaut de
la specification — << Open Sans Regular, Arial Unicode MS Regular >> — que notre serveur ne
sert pas. La requete echoue, et la couche reste VIDE.

Rien ne plante. Aucune erreur ne remonte a l'ecran. La couche existe, le filtre marche, les
donnees sont la : il n'y a simplement aucun texte. Le defaut ne se voit qu'en regardant une
carte reelle, avec de vraies donnees, a l'endroit precis ou le texte aurait du etre.

TROIS FOIS. L'etiquette de duree d'itineraire, le nom des lieux, puis le libelle des
signalements — a chaque fois decouvert sur le telephone, apres un build et une installation.
Les deux premieres ont ete corrigees en ajoutant la ligne a la couche concernee ; la troisieme
prouve que corriger l'instance ne suffit pas. Ce script controle la REGLE.

LES EMOJI SONT UN CAS A PART, et le script les traite a part. Aucune police servie avec nos
tuiles n'en contient : un emoji pose dans un `text-field` ne sera JAMAIS dessine, avec ou sans
`text-font`. La seule facon d'en montrer un sur la carte est de le cuire en image — c'est la
lecon du 31 octobre, et c'est ce que font les marqueurs de signalement.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-polices-carte.py
"""
import io
import os
import re

ECRAN = os.path.join(os.path.dirname(__file__), '..', 'app', 'index.tsx')

fautes = []


def verifier(nom, ok, detail=''):
    print('  %s  %s%s' % ('ok  ' if ok else 'FAUX', nom, ('  - ' + detail) if detail else ''))
    if not ok:
        fautes.append(nom)


texte = io.open(ECRAN, encoding='utf-8').read()

# ---------------------------------------------------------------- decoupage en couches
# On isole chaque <Layer ... /> avec son id : la recherche se fait DANS la couche, et non sur
# le fichier entier — un `text-font` present dans une couche voisine ne doit pas couvrir celle
# qui l'a oublie, ce qui est exactement la facon dont ce defaut se cache.
couches = []
for debut in [m.start() for m in re.finditer(r'<Layer\b', texte)]:
    profondeur = 0
    i = debut
    while i < len(texte):
        if texte[i] == '<':
            profondeur += 1
        elif texte[i] == '>':
            profondeur -= 1
            if profondeur == 0:
                break
        i += 1
    bloc = texte[debut:i + 1]
    identifiant = re.search(r'id="([^"]+)"', bloc)
    couches.append((identifiant.group(1) if identifiant else '(sans id)', bloc))

print('\nLES COUCHES DE LA CARTE')
verifier('le fichier en declare un nombre plausible', len(couches) >= 10, '%d couches' % len(couches))

# ---------------------------------------------------------------- qui ecrit du texte ?
avec_texte = [(nom, b) for nom, b in couches if "'text-field'" in b]

# Un champ dont le contenu est un emoji litteral : la police n'y changera rien.
EMOJI = re.compile(
    '[\U0001F300-\U0001FAFF☀-➿⬀-⯿️]'
)


def champ_emoji(bloc):
    """Le `text-field` de cette couche contient-il un emoji ecrit en dur ?"""
    champ = re.search(r"'text-field':\s*([^\n]+)", bloc)
    return bool(champ and EMOJI.search(champ.group(1)))


print('\nCHAQUE COUCHE DE TEXTE DECLARE SA POLICE')
sans_police = []
for nom, bloc in avec_texte:
    if champ_emoji(bloc):
        continue  # traite plus bas : la police n'est pas son probleme
    if "'text-font'" not in bloc:
        sans_police.append(nom)
    else:
        police = re.search(r"'text-font':\s*\[([^\]]*)\]", bloc)
        print('        %-16s %s' % (nom, police.group(1).strip() if police else '?'))
verifier(
    '%d couche(s) de texte, toutes servies' % len(avec_texte),
    not sans_police,
    'SANS POLICE, donc jamais dessinee(s) : %s' % ', '.join(sans_police)
    if sans_police
    else 'aucune ne reclame la police par defaut, absente du serveur',
)

print("\nAUCUN EMOJI N'EST POSE DANS UN CHAMP DE TEXTE")
# Ceux-la ne seront jamais dessines, police ou pas : la seule issue est une image cuite.
emojis = [nom for nom, bloc in avec_texte if champ_emoji(bloc)]
verifier(
    'les emoji passent par des images cuites',
    not emojis,
    'pose(s) en texte, donc invisible(s) : %s — voir scripts/make-report-markers.py' % ', '.join(emojis)
    if emojis
    else 'la lecon du 31 octobre tient',
)

print(
    '\nToutes les couches de texte de la carte sont dessinables.\n'
    if not fautes
    else '\nA CORRIGER : %d verification(s) en echec.\n' % len(fautes)
)
raise SystemExit(1 if fautes else 0)
