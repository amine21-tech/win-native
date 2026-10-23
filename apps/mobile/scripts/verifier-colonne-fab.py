"""
Verifie que la colonne de dix boutons TIENT sur les hauteurs d'ecran reelles.

POURQUOI CE SCRIPT EXISTE. La colonne a deja deborde une fois en vrai : sur un telephone de
667 points elle depassait son budget de 93 points, et le premier bouton remontait dans la rangee
des rubriques. Le defaut n'etait pas visuel mais arithmetique — un plancher de taille trop haut
rendait le calcul insoluble — et il ne se voyait que sur l'appareil du client.

Le client demande maintenant un ecart d'au moins 8 a 10 points entre les boutons (document du
23 octobre, point 3). Cet ecart se prend necessairement sur la taille des boutons : le budget
vertical, lui, ne change pas. Ce script dit ce que les deux contraintes donnent ensemble, avant
qu'une version ne parte sur un telephone.

Usage, depuis apps/mobile :
  python -I scripts/verifier-colonne-fab.py
"""
import io
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, '..'))


def constante(chemin, nom, defaut=None):
    """
    Lit `export const NOM = 42;` ou `const NOM = 42;` dans un fichier source.

    LES CONSTANTES SE LISENT, ELLES NE SE RECOPIENT PAS. Recopiees, elles ont ete fausses deux
    fois en une seule seance : HIT_SIZE valait 52 et non 48, HEADER_HEIGHT est passe de 92 a 102
    le jour meme. Un verificateur qui travaille sur des valeurs perimees est pire qu'absent — il
    rend un verdict rassurant sur une geometrie qui n'existe plus.
    """
    texte = io.open(os.path.join(RACINE, chemin), encoding='utf-8').read()
    m = re.search(r'^(?:export )?const %s = (\d+(?:\.\d+)?)\s*;' % nom, texte, re.M)
    if m:
        return float(m.group(1)) if '.' in m.group(1) else int(m.group(1))
    if defaut is not None:
        print('  (%s introuvable dans %s, valeur par defaut %s)' % (nom, chemin, defaut))
        return defaut
    raise SystemExit('ECHEC : %s introuvable dans %s.' % (nom, chemin))


HIT_SIZE = constante('src/theme.ts', 'HIT_SIZE')
HEADER_HEIGHT = constante('app/index.tsx', 'HEADER_HEIGHT')
FAB_COUNT = constante('app/index.tsx', 'FAB_COUNT')
ECART_FAB_MIN = constante('app/index.tsx', 'ECART_FAB_MIN', 8)
FAB_PRIMARY_RATIO = 64.0 / HIT_SIZE
FAB_TOP_RESERVE = HIT_SIZE + 56
SPACING_MD = 12
SPACING_XL = 24

# Hauteurs utiles en points (densite independante), des plus petits Android courants aux
# grands formats. Les deux premieres sont celles qui avaient debordé.
ECRANS = [
    ('petit Android (640)', 640, 24, 0),
    ('Android courant (667)', 667, 24, 0),
    ('Android 6,1 pouces (760)', 760, 28, 16),
    ('Android 6,7 pouces (820)', 820, 32, 24),
    ('grand format (915)', 915, 36, 24),
]


def calculer(hauteur, haut, bas, plancher_taille, plancher_ecart, reserve_ecart):
    """
    Reproduit baseFabSize puis baseFabGap, dans cet ordre — comme le fait l'ecran.

    `reserve_ecart` est l'ecart PROVISOIRE que l'etape de la taille met de cote avant de savoir
    quel sera l'ecart reel. Il differe du plancher : le code actuel reserve spacing.md (12) puis
    retombe a 4, ce qui explique des boutons plus petits qu'il n'aurait fallu.
    """
    dispo = hauteur - (haut + HEADER_HEIGHT + FAB_TOP_RESERVE) - (bas + SPACING_XL)
    ecarts = (FAB_COUNT - 1) * reserve_ecart
    brut = (dispo - ecarts) / (FAB_COUNT - 1 + FAB_PRIMARY_RATIO)
    taille = max(plancher_taille, min(HIT_SIZE, int(brut)))

    hauteur_boutons = taille * (FAB_COUNT - 1 + FAB_PRIMARY_RATIO)
    reste = dispo - hauteur_boutons
    ecart = max(plancher_ecart, min(SPACING_MD, int(reste // (FAB_COUNT - 1))))

    occupe = hauteur_boutons + ecart * (FAB_COUNT - 1)
    return dispo, taille, ecart, occupe


def essai(titre, plancher_taille, plancher_ecart, reserve_ecart):
    print('\n%s — plancher taille %d, plancher ecart %d, reserve %d'
          % (titre, plancher_taille, plancher_ecart, reserve_ecart))
    print('  %-26s %7s %7s %7s %9s %s' % ('ecran', 'dispo', 'taille', 'ecart', 'occupe', 'verdict'))
    ok = True
    for nom, h, haut, bas in ECRANS:
        dispo, taille, ecart, occupe = calculer(h, haut, bas, plancher_taille, plancher_ecart, reserve_ecart)
        tient = occupe <= dispo
        assez = ecart >= 8
        if not tient or not assez:
            ok = False
        verdict = 'OK' if (tient and assez) else (
            'DEBORDE de %d' % (occupe - dispo) if not tient else 'ecart < 8')
        print('  %-26s %7d %7d %7d %9d %s' % (nom, dispo, taille, ecart, occupe, verdict))
    return ok


def main():
    print('COLONNE DE %d BOUTONS — budget vertical' % FAB_COUNT)
    print('  constantes lues : HIT_SIZE=%d, HEADER_HEIGHT=%d, FAB_COUNT=%d, ECART_FAB_MIN=%d'
          % (HIT_SIZE, HEADER_HEIGHT, FAB_COUNT, ECART_FAB_MIN))
    actuel = essai('Avant le 23 octobre', 32, 4, SPACING_MD)
    demande = essai('Reglage en place (demande du client)', 30, ECART_FAB_MIN, ECART_FAB_MIN)

    print()
    if demande:
        print('Le reglage demande tient sur tous les ecrans testes.')
        return 0
    print('Le reglage demande NE TIENT PAS : il faut reduire le nombre de boutons,')
    print('la reserve haute, ou accepter un ecart plus faible sur les petits ecrans.')
    return 0 if actuel else 1


if __name__ == '__main__':
    sys.exit(main())
