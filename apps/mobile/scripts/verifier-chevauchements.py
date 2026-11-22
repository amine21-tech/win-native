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
alerte = lire('components', 'BandeauInfoSignalement.tsx')

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

print('\nLES CINQ ELEMENTS Y SONT, DANS L ORDRE DU 22 NOVEMBRE, ET AUCUN NE SE PLACE PLUS LUI-MEME')
# << ORDRE FINAL — colonne gauche (haut -> bas) : alerte 26dp, vitesse, limitation, recentrer,
# bouton langue DERNIER >>. L'ordre etait l'inverse la veille pour le bouton de langue, et c'est
# exactement le genre de chose qui se reinverse sans qu'on s'en apercoive : on le lit donc dans
# la source, par la POSITION des balises les unes par rapport aux autres.
rang = {}
for nom, balise in (
    ('alerte', '{pastilleAlerte}'),
    ('vitesse', '<SpeedBadge subscribe'),
    ('limite', '<SpeedLimitBadge limitKmh'),
    ("vue d'ensemble", 'onPress={onOverview}'),
    ('langue', '<BoutonLangueNav'),
):
    rang[nom] = overlay.find(balise)
    verifier('%s : present dans la colonne' % nom, rang[nom] > 0)
ordre_lu = [n for n, _ in sorted(rang.items(), key=lambda kv: kv[1]) if rang[n] > 0]
verifier(
    "la pastille d'alerte est la PREMIERE",
    ordre_lu[:1] == ['alerte'],
    ' > '.join(ordre_lu),
)
verifier(
    'le bouton de langue est le DERNIER',
    ordre_lu[-1:] == ['langue'],
    ' > '.join(ordre_lu),
)
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

print('\nLA PASTILLE D ALERTE EST ENTREE DANS LA COLONNE — point 2')
# Elle se posait elle-meme a huit points sous le bandeau et faisait 38 points de haut : elle
# finissait donc SIX POINTS plus bas que le haut de la colonne, sur le compteur de vitesse.
# C'est le chevauchement photographie par le client.
cote_alerte = valeur_dans_style(alerte, 'reduit', 'height')
verifier(
    'elle est descendue aux 26 points du document',
    cote_alerte is not None and cote_alerte <= 26,
    '%s points' % cote_alerte,
)
verifier(
    "elle ne porte plus 'absolute' dans son style",
    "reduit: {\n    position: 'absolute'" not in alerte,
)
verifier(
    'son rayon suit son cote : elle reste un disque',
    valeur_dans_style(alerte, 'reduit', 'borderRadius') == (cote_alerte or 0) / 2,
    'rayon %s pour un cote de %s' % (valeur_dans_style(alerte, 'reduit', 'borderRadius'), cote_alerte),
)
# ET LE MODE 'tout' SURVIT : hors trajet il n'y a pas de colonne, et une pastille qui ne serait
# plus dessinee nulle part laisserait le reglage coupe sans aucune trace a l'ecran.
verifier(
    'les trois modes existent, pastille comprise',
    "mode?: 'tout' | 'barre' | 'pastille'" in alerte,
)
verifier(
    "le defaut reste 'tout', donc le comportement d'avant",
    "mode = 'tout'" in alerte,
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
    ("pastille d'alerte", valeur_dans_style(alerte, 'reduit', 'height')),
    ('compteur de vitesse', valeur_dans_style(vitesse, 'badge', 'height')),
    ('limite reglementaire', valeur_dans_style(limite, 'badge', 'height')),
    ("vue d'ensemble", valeur_dans_style(overlay, 'overviewBtn', 'height')),
    ('bouton de langue', constante(langue, 'COTE')),
]
for nom, h in hauteurs:
    verifier('hauteur lue pour %s' % nom, h is not None, '%s points' % h)

if all(h is not None for _, h in hauteurs) and ecart is not None:
    total = sum(h for _, h in hauteurs) + ecart * (len(hauteurs) - 1)
    print('    colonne : %s + %s ecarts de %s = %s points'
          % (' + '.join(str(h) for _, h in hauteurs), len(hauteurs) - 1, ecart, total))

    # L'ECART SOUS LE BANDEAU VAUT 6 POINTS — << android:layout_marginTop="6dp" >>, point 2.
    #
    # IL VALAIT 48, JUSTIFIE PAR UNE MESURE QUI N'EXISTAIT PAS : le commentaire disait que la
    # languette « puis » pendait SOUS le bandeau et qu'il fallait 36 points pour la laisser
    # passer. Or `bannerHeight` est mesure par le onLayout du Pressable qui CONTIENT la
    # consigne, et la languette est une simple rangee dans son flux : elle etait deja comptee.
    # Les 48 points ne protegeaient de rien, ils descendaient la colonne de quarante points.
    gap_bandeau = constante(overlay, 'BADGE_GAP')
    verifier(
        'la colonne commence a 6 points sous le cadre vert',
        gap_bandeau == 6,
        'BADGE_GAP = %s' % gap_bandeau,
    )
    verifier(
        "et elle ne le touche pas : l'ecart est strictement positif",
        gap_bandeau is not None and gap_bandeau > 0,
    )
    # LE MESSAGE D'ECHEC DE CALCUL commence a la meme hauteur, et il est large. En portrait il
    # doit demarrer APRES la colonne, sinon il passe derriere les pastilles — c'est le message
    # qu'il faut le moins masquer de tous.
    large = max(h for _, h in hauteurs)
    import re as _re
    m_echec = _re.search(r'landscape \? null : \{ left: spacing\.md \+ ([0-9]+) \}', overlay)
    decale = float(m_echec.group(1)) if m_echec else None
    verifier(
        "le message d'echec demarre apres la colonne en portrait",
        decale is not None and decale >= large,
        'decale de %s pour une colonne large de %s' % (decale, large),
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
