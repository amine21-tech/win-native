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

# ------------------------------------------------------------------ point 15
print('\nPOINT 15 — le recalcul doit se voir, et dire quand il traine')
session = lire(RACINE / 'apps/mobile/src/navigation/useNavigationSession.ts')
verifier(
    'seuil de lenteur : 3 secondes',
    'RECALCUL_LENT_MS = 3_000' in session,
    valeur(session, r'RECALCUL_LENT_MS = ([\d_]+)'),
)
verifier(
    "le minuteur PREVIENT, il n'interrompt pas",
    'setRecalculLent(true)' in session and 'clearTimeout(lenteur)' in session,
    'couper a trois secondes ferait echouer un calcul qui allait aboutir a la quatrieme',
)
verifier('un recalcul reussi est annonce a la voix', 'phraseItineraireRecalcule' in session)

toast = lire(RACINE / 'apps/mobile/src/components/RecalcToast.tsx')
verifier("la pastille dit « verifiez votre connexion »", 'nav.slowConnection' in toast)

overlay = lire(RACINE / 'apps/mobile/src/components/NavigationOverlay.tsx')
verifier(
    "l'echec du calcul est AFFICHE",
    'nav.noRoute' in overlay,
    "il ne l'etait nulle part : l'application renoncait en silence",
)

# ------------------------------------------------------------------ point 16
print('\nPOINT 16 — la consigne en bas, fleche de 80 points')
panneau = lire(RACINE / 'apps/mobile/src/components/PanneauDirection.tsx')
fleche = lire(RACINE / 'apps/mobile/src/components/FlecheManoeuvre.tsx')

verifier('fleche : 80 points', 'TAILLE_FLECHE = 80' in panneau, valeur(panneau, r'TAILLE_FLECHE = (\d+)'))
verifier('fond vert fonce WIN DZ', "VERT = '#07401F'" in panneau)
verifier('fleche blanche', "couleur = '#FFFFFF'" in fleche)
verifier("position : bas de l'ecran", "position: 'absolute'" in panneau and 'bottom,' in panneau)
verifier('le nom de la rue est affiche', 'maneuver.streetName' in panneau)
verifier('la distance est affichee', 'formatDistance(distanceM)' in panneau)
verifier('la deuxieme consigne, en plus petit dessous', 'montrerSuivante' in panneau)
verifier(
    'la fleche est DESSINEE, pas un caractere de police',
    'react-native-svg' in fleche,
    "un caractere change d'aspect d'un Android a l'autre",
)
verifier(
    'la languette « puis » a quitte le bandeau du haut',
    'thenTab' not in overlay and 'styles.arrow' not in overlay,
)
verifier(
    "le bandeau du haut garde l'horloge et les voies",
    'clockRow' in overlay and 'LaneGuidance' in overlay,
    'demandees dans des documents anterieurs — chantier #22 et point 05',
)

print(
    '\nLes maquettes du client sont respectees au chiffre pres.\n'
    if not fautes
    else f'\nA CORRIGER : {len(fautes)} verification(s) en echec.\n'
)
sys.exit(0 if not fautes else 1)
