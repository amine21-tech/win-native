# -*- coding: utf-8 -*-
"""
Verifie que RIEN NE RECOUVRE RIEN dans l'interface de navigation — points 3 et 4 du 21 novembre.

POURQUOI CES DEUX POINTS SONT LE MEME DEFAUT. Le client a photographie deux ecrans :
un bouton qui touchait le compteur de vitesse dans la colonne de gauche, et des puces de
sous-categories qui passaient sous le bouton microphone. Dans les deux cas, un element etait
pose a une distance CALCULEE A LA MAIN en supposant la taille de son voisin — et la supposition
avait cesse d'etre vraie sans que personne ne l'apprenne.

CE QU'UN TEL DEFAUT A DE PARTICULIER, ET POURQUOI IL FAUT UNE MACHINE POUR L'ATTRAPER. Il ne
provoque aucune erreur, ne ralentit rien, et n'apparait pas dans les tests : tout fonctionne, on
ne voit simplement plus la moitie de ce qu'on a mis a l'ecran. Il se decouvre sur une capture
d'ecran du client, trois versions plus tard. Et il revient : chaque fois qu'on change un rayon,
une bordure, une taille de police ou qu'on ajoute un bouton dans la colonne.

CE SCRIPT NE REGARDE PAS SI LE CODE EST CELUI QU'ON A ECRIT. Il relit les TAILLES REELLES dans
les sources — la hauteur de chaque pastille, la taille du bouton, l'ecart de la colonne — et
refait l'arithmetique. C'est la seule formulation qui resisterait a quelqu'un qui agrandit une
pastille sans penser a la colonne.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-chevauchements.py
"""
import io
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(ICI, '..', 'src'))

fautes = []


def verifier(nom, ok, detail=''):
    print('  %s  %s%s' % ('ok  ' if ok else 'FAUX', nom, ('  - ' + detail) if detail else ''))
    if not ok:
        fautes.append(nom)


def lire(*bouts):
    return io.open(os.path.join(SRC, *bouts), encoding='utf-8').read()


def valeur_dans_style(source, nom_style, cle):
    """
    Lit `cle: 42` a l'interieur du bloc `nom_style: { ... }`.

    LES TAILLES SE LISENT, ELLES NE SE RECOPIENT PAS. Recopiees ici, elles seraient justes le
    jour ou ce script est ecrit et fausses le lendemain — et un controle qui se trompe est pire
    qu'une absence de controle, parce qu'on lui fait confiance.
    """
    m = re.search(re.escape(nom_style) + r':\s*\{', source)
    if not m:
        return None
    i = m.end()
    profondeur = 1
    while i < len(source) and profondeur > 0:
        if source[i] == '{':
            profondeur += 1
        elif source[i] == '}':
            profondeur -= 1
        i += 1
    bloc = source[m.end():i]
    m2 = re.search(re.escape(cle) + r':\s*([0-9]+(?:\.[0-9]+)?)', bloc)
    return float(m2.group(1)) if m2 else None


def constante(source, nom):
    m = re.search(r'const\s+' + re.escape(nom) + r'\s*=\s*([0-9]+(?:\.[0-9]+)?)', source)
    return float(m.group(1)) if m else None


overlay = lire('components', 'NavigationOverlay.tsx')
vitesse = lire('components', 'SpeedBadge.tsx')
limite = lire('components', 'SpeedLimitBadge.tsx')
langue = lire('components', 'BoutonLangueNav.tsx')
chips = lire('components', 'CategoryChips.tsx')

print('\nLA COLONNE DE GAUCHE EMPILE ELLE-MEME SES ELEMENTS — point 3')
# Le defaut d'origine : trois decalages codes en dur (48, puis +66, puis +62) qui supposaient la
# hauteur de chaque pastille. Ils ne doivent plus exister.
verifier(
    'plus aucun decalage ajoute au BADGE_GAP',
    not re.search(r'BADGE_GAP\s*\+\s*[0-9]', overlay),
    're-apparu' if re.search(r'BADGE_GAP\s*\+\s*[0-9]', overlay) else 'la colonne decide seule',
)
verifier(
    'la colonne existe et porte un ecart unique',
    valeur_dans_style(overlay, 'colonneGauche', 'gap') is not None,
)
ecart = valeur_dans_style(overlay, 'colonneGauche', 'gap')
verifier(
    'cet ecart vaut au moins les 8 points du document',
    ecart is not None and ecart >= 8,
    'gap = %s' % ecart,
)
verifier(
    'la colonne est posee une seule fois, en absolu',
    "colonneGauche: { position: 'absolute'" in overlay,
)

print('\nLES QUATRE ELEMENTS Y SONT, ET AUCUN NE SE PLACE PLUS LUI-MEME')
verifier('le bouton de langue est en tete de colonne', '<BoutonLangueNav' in overlay)
verifier(
    'le compteur de vitesse rentre dans le flux',
    re.search(r'<SpeedBadge[^>]*enColonne', overlay, re.S) is not None,
)
verifier(
    'la limite reglementaire aussi',
    re.search(r'<SpeedLimitBadge[^>]*enColonne', overlay, re.S) is not None,
)
verifier(
    "le bouton de vue d'ensemble n'est plus pose en absolu",
    valeur_dans_style(overlay, 'overviewBtn', 'width') is not None
    and "overviewBtn: {\n    position: 'absolute'" not in overlay,
)

print('\nLE MODE PAYSAGE N A PAS BOUGE — la propriete est un AJOUT, pas un remplacement')
# C'est tout l'enjeu du « NE RIEN CASSER » ici : en paysage les deux pastilles sont en bas a
# droite, posees par leurs propres coordonnees. Elles doivent le rester.
for nom, source in (('compteur', vitesse), ('limite', limite)):
    verifier(
        '%s : reste absolu par defaut' % nom,
        "position: 'absolute'" in source and 'enColonne' in source,
    )
    verifier(
        '%s : la colonne ne vaut que si on la demande' % nom,
        'enColonne?: boolean' in source,
    )
verifier(
    'le bloc paysage pose toujours ses pastilles en bas a droite',
    re.search(r'landscape \?[\s\S]{0,900}?bottom=\{bottomInset', overlay) is not None,
)

print('\nL ARITHMETIQUE DE LA COLONNE, REFAITE DEPUIS LES TAILLES REELLES')
hauteurs = [
    ('bouton de langue', constante(langue, 'COTE')),
    ('compteur de vitesse', valeur_dans_style(vitesse, 'badge', 'height')),
    ('limite reglementaire', valeur_dans_style(limite, 'badge', 'height')),
    ("vue d'ensemble", valeur_dans_style(overlay, 'overviewBtn', 'height')),
]
for nom, h in hauteurs:
    verifier('hauteur lue pour %s' % nom, h is not None, '%s points' % h)

if all(h is not None for _, h in hauteurs) and ecart is not None:
    total = sum(h for _, h in hauteurs) + ecart * (len(hauteurs) - 1)
    print('    colonne : %s + %s ecarts de %s = %s points'
          % (' + '.join(str(h) for _, h in hauteurs), len(hauteurs) - 1, ecart, total))

    # L'ECART SOUS LE BANDEAU reste a 48 et non a 8, et ce n'est pas un oubli : la languette
    # « puis » pend sous le bandeau a gauche et fait environ 36 points de haut (point 19 du
    # 18 novembre). A 8 points, le bouton de langue passerait dessous — on corrigerait un
    # chevauchement en en creant un autre.
    gap_bandeau = constante(overlay, 'BADGE_GAP')
    LANGUETTE = 36
    verifier(
        'le haut de la colonne laisse passer la languette « puis »',
        gap_bandeau is not None and gap_bandeau >= LANGUETTE,
        'BADGE_GAP = %s, languette %s' % (gap_bandeau, LANGUETTE),
    )

    # ET LA COLONNE DOIT TENIR SUR L'ECRAN LE PLUS PETIT QU'ON AIT VU DEBORDER : 667 points,
    # celui sur lequel la colonne des dix boutons avait deja depasse son budget de 93 points.
    # Le bandeau et le cadre du bas se mesurent a l'execution ; on prend ici des hauteurs
    # genereuses, parce qu'un controle qui passe de justesse ne protege de rien.
    ECRAN = 667
    BANDEAU_MAX = 170   # bandeau vert avec deux lignes de consigne et la languette
    CADRE_BAS = 150     # arreter / temps restant / etapes
    reste = ECRAN - BANDEAU_MAX - gap_bandeau - total - CADRE_BAS
    verifier(
        'la colonne tient sur un ecran de 667 points, cadre du bas compris',
        reste >= 0,
        'il reste %s points' % reste,
    )

print('\nLES SOUS-CATEGORIES NE PASSENT PLUS SOUS LE MICROPHONE — point 4')
# « ajouter un paddingEnd au scroll des sous-categories = largeur FABs (~72dp) »
marge = valeur_dans_style(chips, 'rowSous', 'paddingRight')
verifier('la rangee des sous-categories a sa propre marge', marge is not None, '%s points' % marge)
verifier(
    'et elle vaut les 72 points du document',
    marge is not None and marge >= 72,
    'FAB de 56 + marge de 16 = 72',
)
verifier(
    'seule la rangee des SOUS-categories la porte',
    chips.count('contentContainerStyle={styles.rowSous}') == 1
    and chips.count('contentContainerStyle={styles.row}') == 1,
    'rubriques : %d, sous-rubriques : %d'
    % (chips.count('contentContainerStyle={styles.row}'),
       chips.count('contentContainerStyle={styles.rowSous}')),
)
# clipToPadding=false n'existe pas en React Native : un ScrollView n'a jamais rogne son
# contenu sur son padding, et la derniere puce est donc deja atteignable. C'est la difference
# entre le XML Android du document et ce portage — rien a faire, mais il faut le dire.
verifier(
    'la raison du clipToPadding absent est ecrite dans le fichier',
    'clipToPadding' in chips,
    'React Native ne rogne pas : le document parle du XML Android',
)

print('')
if fautes:
    print('A CORRIGER : %d verification(s) en echec.\n' % len(fautes))
    sys.exit(1)
print("Rien ne recouvre rien : la colonne s'empile seule, et les sous-categories respirent.\n")
