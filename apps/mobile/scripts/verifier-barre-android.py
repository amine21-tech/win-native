"""
Verifie qu'aucune feuille ancree en bas ne passe sous la barre de navigation d'Android.

POURQUOI CE SCRIPT. C'est la correction C3 du client, et il l'a formulee comme une REGLE
GENERALE : « aucun panneau ne doit passer sous la barre Android ». Une regle generale ne se
tient pas en corrigeant les cinq panneaux du jour — elle se tient en empechant le sixieme
d'apparaitre.

Le defaut est invisible a la relecture et invisible au developpement : sur un telephone a
gestes, la barre fait quelques points et ne cache rien ; sur un telephone a trois boutons, elle
en fait quarante-huit et avale le dernier element de la feuille. Le client l'a decouvert sur le
panneau de partage GPS, dont le bouton « Ajouter ce lieu » etait simplement introuvable.

CE QUI EST VERIFIE, ET CE QUI NE L'EST PAS. Une feuille ANCREE EN BAS — reconnaissable a son
`justifyContent: 'flex-end'` — doit lire `useSafeAreaInsets` et s'en servir. Un panneau CENTRE
n'est pas concerne : il ne touche pas le bas de l'ecran, et lui ajouter une marge le
decalerait sans raison. Le script fait donc la difference au lieu d'exiger la meme chose
partout.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-barre-android.py
"""
import io
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]
COMPOSANTS = RACINE / 'apps/mobile/src/components'

fautes = []


def lire(chemin):
    return io.open(chemin, encoding='utf-8-sig').read()


def verifier(nom, ok, detail=''):
    print(f"  {'ok  ' if ok else 'FAUX'}  {nom}{('  — ' + detail) if detail else ''}")
    if not ok:
        fautes.append(nom)


ancrees, centrees, sans_modal = [], [], []

for chemin in sorted(COMPOSANTS.glob('*.tsx')):
    texte = lire(chemin)
    if '<Modal' not in texte:
        sans_modal.append(chemin.stem)
        continue
    if "justifyContent: 'flex-end'" in texte:
        ancrees.append((chemin.stem, texte))
    else:
        centrees.append(chemin.stem)

print(f"\nPANNEAUX EXAMINES : {len(ancrees)} ancre(s) en bas, {len(centrees)} centre(s)")

print('\nCHAQUE FEUILLE ANCREE EN BAS TIENT COMPTE DE LA BARRE')
for nom, texte in ancrees:
    lit = 'useSafeAreaInsets' in texte
    # Lire les insets sans s'en servir ne protege rien : on exige l'usage.
    sert = 'insets.bottom' in texte
    verifier(
        nom,
        lit and sert,
        '' if lit and sert else ('lit les insets mais ne s\'en sert pas' if lit else 'aucun inset'),
    )

if not ancrees:
    verifier('au moins une feuille ancree a ete trouvee', False,
             'le script ne reconnait plus les feuilles — son motif est perime')

print('\nLES PANNEAUX CENTRES NE SONT PAS CONCERNES')
print('  ' + ', '.join(centrees))
print('  (ils ne touchent pas le bas de l\'ecran ; leur ajouter une marge les decalerait)')

print(
    '\nAucune feuille ne passe sous la barre Android.\n'
    if not fautes
    else f'\nA CORRIGER : {len(fautes)} feuille(s).\n'
    "  Ajouter `const insets = useSafeAreaInsets();` et l'appliquer en paddingBottom.\n"
)
sys.exit(0 if not fautes else 1)
