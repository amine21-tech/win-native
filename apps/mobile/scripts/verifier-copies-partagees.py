"""
Verifie que `apps/mobile/src/shared/` est bien une COPIE de `packages/shared/src/`.

POURQUOI CE SCRIPT EXISTE : il m'a manque, et deux defauts en sont sortis le meme jour.

PREMIER DEFAUT — LA DERIVE. Les deux dossiers sont censes etre identiques, la source etant
`packages/shared`. En realite la copie avait pris de l'avance : `countryFromCoords` n'existait
QUE dans la copie mobile. Une recopie de la source l'a donc effacee, et seule la compilation
l'a rattrapee. Une copie qui porte du code absent de sa source n'est plus une copie — c'est un
second original qu'on prendra un jour pour un reflet.

SECOND DEFAUT — L'EXTENSION .js. La source compile en NodeNext : ses imports relatifs portent
`./geo.js`, qui designe le fichier JavaScript produit. Metro, lui, empaquette les sources TypeScript
et ne resout pas ce specifier. Une recopie fidele casse donc l'APK — et le casse LOIN de la
cause : `tsc` passe sans rien dire, les tests passent, et l'echec n'apparait qu'a l'etape
d'empaquetage, dans un journal Gradle de huit cents lignes.

Le script compare donc les fichiers APRES la seule transformation legitime : le retrait de
`.js` sur les imports relatifs, exactement ce que fait build-apk.ps1.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-copies-partagees.py
"""
import io
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]
SOURCE = RACINE / 'packages/shared/src'
COPIE = RACINE / 'apps/mobile/src/shared'

fautes = []


def verifier(nom, ok, detail=''):
    print(f"  {'ok  ' if ok else 'FAUX'}  {nom}{('  — ' + detail) if detail else ''}")
    if not ok:
        fautes.append(nom)


def lire(chemin):
    return io.open(chemin, encoding='utf-8-sig').read().replace('\r\n', '\n')


def sans_entete(texte):
    """Retire les quatre lignes d'avertissement que porte chaque copie."""
    lignes = texte.split('\n')
    if lignes and 'NE PAS MODIFIER ICI' in '\n'.join(lignes[:4]):
        return '\n'.join(lignes[4:])
    return texte


def attendu(texte):
    """La source, telle qu'elle doit apparaitre dans la copie."""
    return re.sub(r"(from '\./[A-Za-z0-9_-]+)\.js'", r"\1'", texte)


print('\nCHAQUE FICHIER PARTAGE A SA COPIE')
sources = sorted(p for p in SOURCE.glob('*.ts'))
verifier('la source contient des fichiers', len(sources) > 0, f'{len(sources)} fichier(s)')

for src in sources:
    cible = COPIE / src.name
    if not cible.exists():
        # index.ts n'est pas toujours recopie tel quel : on le signale sans le traiter en erreur
        # muette, pour qu'un fichier reellement oublie se voie.
        verifier(f'{src.name} a une copie', False, 'absente de src/shared')

print('\nLA COPIE DIT EXACTEMENT CE QUE DIT LA SOURCE')
for src in sources:
    cible = COPIE / src.name
    if not cible.exists():
        continue
    a = attendu(lire(src)).strip()
    b = sans_entete(lire(cible)).strip()
    if a == b:
        verifier(f'{src.name}', True)
        continue

    # On dit OU elles divergent : une ligne de numero vaut mieux qu'un « elles different ».
    la, lb = a.split('\n'), b.split('\n')
    ecart = next(
        (i for i in range(max(len(la), len(lb)))
         if (la[i] if i < len(la) else None) != (lb[i] if i < len(lb) else None)),
        None,
    )
    detail = f'premiere difference ligne {ecart + 1}' if ecart is not None else 'longueurs differentes'
    if ecart is not None:
        source_l = la[ecart] if ecart < len(la) else '(fin du fichier)'
        copie_l = lb[ecart] if ecart < len(lb) else '(fin du fichier)'
        detail += f'\n          source : {source_l.strip()[:90]}\n          copie  : {copie_l.strip()[:90]}'
    verifier(f'{src.name}', False, detail)

print("\nAUCUN IMPORT EN .js DANS LA COPIE (Metro ne les resout pas)")
for cible in sorted(COPIE.glob('*.ts')):
    restants = re.findall(r"from '\./[A-Za-z0-9_-]+\.js'", lire(cible))
    verifier(f'{cible.name}', not restants, ', '.join(restants))

print(
    '\nLa copie partagee est fidele a sa source.\n'
    if not fautes
    else f'\nA CORRIGER : {len(fautes)} verification(s) en echec.\n'
    '  Recopier : packages/shared/src/<fichier>.ts -> apps/mobile/src/shared/<fichier>.ts,\n'
    "  en gardant l'en-tete de la copie et en retirant les extensions .js des imports relatifs.\n"
)
sys.exit(0 if not fautes else 1)
