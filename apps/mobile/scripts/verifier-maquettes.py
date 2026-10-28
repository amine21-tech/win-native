"""
Verifie que les VALEURS CHIFFREES des maquettes du client sont bien celles du code.

POURQUOI CE SCRIPT. Quand le client ecrit << largeur 85 % >>, << coins 16 dp >>, << icone
36 dp >>, ce sont des engagements verifiables, et c'est exactement le genre d'engagement qu'on
croit tenu parce qu'on l'a tenu une fois. Une retouche ulterieure deplace une valeur, personne
ne relit le tableau du PDF, et l'ecart ne se voit qu'a la capture d'ecran suivante — chez le
client.

Ce script ne juge pas le rendu : il lit les constantes et les styles dans les fichiers source
et les compare au tableau du document. Il attrape la derive, pas la laideur.

Points couverts :
  - point 14 (synthese du 29 octobre) : la boite de suppression ;
  - point 17 (synthese du 29 octobre) : la carte d'alerte compacte.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-maquettes.py
"""
import io
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]
SUPPRESSION = RACINE / 'apps/mobile/src/components/ConfirmDeleteSheet.tsx'
ALERTE = RACINE / 'apps/mobile/src/components/AlerteApproche.tsx'

fautes = []


def lire(chemin):
    return io.open(chemin, encoding='utf-8-sig').read()


def verifier(nom, ok, detail=''):
    print(f"  {'ok  ' if ok else 'FAUX'}  {nom}{('  — ' + detail) if detail else ''}")
    if not ok:
        fautes.append(nom)


def valeur(texte, motif):
    """Premier nombre capture par `motif`, ou None."""
    m = re.search(motif, texte)
    return m.group(1) if m else None


# ------------------------------------------------------------------ point 14
print("\nPOINT 14 — boite de suppression (tableau du client)")
src = lire(SUPPRESSION)

verifier("largeur : 85 % de l'ecran au maximum", "width: '85%'" in src, valeur(src, r"width: '(\d+%)'"))
verifier('coins : 16 points', 'borderRadius: 16' in src)
verifier(
    'position : centree dans les deux sens',
    "alignItems: 'center'" in src and "justifyContent: 'center'" in src,
)
verifier('icone poubelle : 36 points', 'fontSize: 36' in src)
verifier(
    'titre : 16 points, gras',
    bool(re.search(r'titre: \{[^}]*fontSize: 16[^}]*fontWeight', src)),
)
verifier('nom tronque a 40 caracteres', 'NOM_MAX = 40' in src)
verifier('nom sur UNE seule ligne', 'numberOfLines={1}' in src)
verifier(
    'deux boutons : ANNULER en contour, SUPPRIMER en plein',
    'borderWidth: 1.5' in src and "textTransform: 'uppercase'" in src,
)
verifier('ombre portee douce', 'shadowOpacity' in src and 'elevation' in src)
verifier(
    "plus d'avertissement ni de coordonnees : le contenu necessaire seulement",
    'gpsCoords' not in src and 'deleteConfirm' not in src,
)

# ------------------------------------------------------------------ point 17
print("\nPOINT 17 — carte d'alerte compacte (tableau du client)")
src = lire(ALERTE)

verifier('largeur : 230 points', 'LARGEUR = 230' in src, valeur(src, r'LARGEUR = (\d+)'))
verifier('hauteur : 110 points', 'HAUTEUR_MIN = 110' in src, valeur(src, r'HAUTEUR_MIN = (\d+)'))
verifier('barre de couleur en tete : 5 points', 'BARRE = 5' in src)
verifier(
    'position : bas-gauche',
    'bottom:' in src and 'left:' in src and "position: 'absolute'" in src,
)
verifier(
    'la barre systeme Android n\'est jamais couverte',
    'insets.bottom' in src and 'useSafeAreaInsets' in src,
)
verifier('panneau triangulaire + symbole, 22 points', 'width: 22' in src and 'height: 22' in src)
verifier('badge de distance', 'badge' in src and 'formatDistance' in src)
verifier('separateur fin avant la question', 'hairlineWidth' in src)
verifier("question « Desactiver les alertes ? »", 'approach.disableQuestion' in src)
verifier("bouton OUI en vert fonce", "VERT = '#0B5B2C'" in src and 'approach.disableYes' in src)
verifier('bouton NON en gris clair', "GRIS = '#ECEFED'" in src and 'approach.disableNo' in src)
verifier(
    "point vert + « Alertes actives »",
    "backgroundColor: '#2BA84A'" in src and 'approach.alertsOn' in src,
)

# ------------------------------------------------------------------ repetitions
print('\nPOINT 17 — « maximum 2 fois, puis silence »')
paliers = lire(RACINE / 'apps/mobile/src/navigation/alerteApproche.ts')
liste = valeur(paliers, r'PALIERS_M = \[([^\]]+)\]')
nombre = len(re.findall(r'\d+', liste or ''))
verifier(
    f'exactement deux paliers d\'annonce : {liste}',
    nombre == 2,
    'le client demande deux annonces au plus, puis le silence',
)
verifier(
    'chaque palier est retenu pour ne pas se repeter',
    'dejaDits' in paliers and 'consommes' in paliers,
)

# ------------------------------------------------------------------ le retour
print("\nPOINT 17 — le reglage doit pouvoir etre RALLUME")
menu = lire(RACINE / 'apps/mobile/src/components/ReportMenu.tsx')
verifier(
    'le menu de signalement porte l\'interrupteur',
    'setApproachAlerts' in menu and 'approach.reenable' in menu,
    'un reglage qu\'on ne peut que desactiver est un piege',
)

print(
    '\nLes maquettes du client sont respectees au chiffre pres.\n'
    if not fautes
    else f'\nA CORRIGER : {len(fautes)} verification(s) en echec.\n'
)
sys.exit(0 if not fautes else 1)
