"""
Verifie que chaque cle passee a `t('...')` existe dans les quatre langues.

POURQUOI CE SCRIPT EXISTE. `t('errors.generic')` n'a jamais existe dans aucun fichier de
langue : la bonne cle est `errors.unknown`. i18next ne leve rien dans ce cas — il rend la CLE
elle-meme. L'utilisateur voyait donc le texte brut

    errors.generic

a la place d'un message, et cela depuis plusieurs versions, dans la fiche << Gerer cette
fiche >> comme dans l'espace admin. Ni `tsc` ni `expo export` ne voient quoi que ce soit : une
cle de traduction est une chaine de caracteres, et toutes les chaines se compilent.

CE QUE LE SCRIPT NE VOIT PAS. Les cles construites a l'execution (`t(variable)`,
`t(\\`prefixe.${x}\\`)`) lui echappent forcement. Elles sont signalees a part, pour relecture,
plutot que passees sous silence.

Les cles au pluriel sont acceptees des que `cle_one` ou `cle_other` existe : i18next choisit la
variante selon la langue et retombe sur `_other` quand la categorie exacte manque, ce qui est
la convention deja suivie ici pour l'arabe.

Usage, depuis apps/mobile :
  python -I scripts/verifier-traductions.py
"""
import glob
import io
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, '..'))
LANGUES = ('fr', 'en', 'ar', 'dz')

# `t('une.cle')` ou `t("une.cle")`, avec ou sans arguments derriere.
APPEL = re.compile(r"""\bt\(\s*(['"])([a-zA-Z0-9_.]+)\1""")
# Un appel dont la cle n'est pas litterale : on ne peut pas la verifier.
APPEL_DYNAMIQUE = re.compile(r"""\bt\(\s*(?![\'"])[^)\s]""")


def fichiers_source():
    for motif in ('app/**/*.tsx', 'app/**/*.ts', 'src/**/*.tsx', 'src/**/*.ts'):
        for p in glob.glob(os.path.join(RACINE, motif), recursive=True):
            if 'node_modules' not in p:
                yield p


def charger(langue):
    chemin = os.path.join(RACINE, 'src', 'i18n', 'locales', '%s.json' % langue)
    return json.load(io.open(chemin, encoding='utf-8'))


def presente(dico, cle):
    """La cle existe-t-elle, directement ou sous une de ses formes au pluriel ?"""
    parts = cle.split('.')
    noeud = dico
    for part in parts[:-1]:
        if not isinstance(noeud, dict):
            return False
        noeud = noeud.get(part)
    if not isinstance(noeud, dict):
        return False
    dernier = parts[-1]
    if dernier in noeud:
        return True
    return any(k.startswith(dernier + '_') for k in noeud)


def main():
    tables = {l: charger(l) for l in LANGUES}
    utilisees = {}
    dynamiques = []

    for chemin in sorted(fichiers_source()):
        texte = io.open(chemin, encoding='utf-8').read()
        relatif = os.path.relpath(chemin, RACINE).replace('\\', '/')
        for m in APPEL.finditer(texte):
            cle = m.group(2)
            # `t('...')` sert aussi a i18next pour des cles sans point : on les garde quand
            # meme, une cle de premier niveau est legitime.
            ligne = texte.count('\n', 0, m.start()) + 1
            utilisees.setdefault(cle, []).append('%s:%d' % (relatif, ligne))
        for m in APPEL_DYNAMIQUE.finditer(texte):
            ligne = texte.count('\n', 0, m.start()) + 1
            dynamiques.append('%s:%d' % (relatif, ligne))

    fautes = []
    for cle in sorted(utilisees):
        absentes = [l for l in LANGUES if not presente(tables[l], cle)]
        if absentes:
            fautes.append((cle, absentes, utilisees[cle]))

    print('%d cle(s) litterale(s) trouvee(s) dans le code.' % len(utilisees))
    if dynamiques:
        print('%d appel(s) a cle calculee, non verifiables : %s%s'
              % (len(dynamiques), ', '.join(dynamiques[:6]),
                 ' …' if len(dynamiques) > 6 else ''))

    if fautes:
        print('\nCLES MANQUANTES — elles s\'afficheront telles quelles a l\'ecran :')
        for cle, absentes, endroits in fautes:
            print('  %-34s absente de %-18s  (%s)'
                  % (cle, ','.join(absentes), ', '.join(endroits[:3])))
        return 1

    print('Toutes presentes dans %s.' % ', '.join(LANGUES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
