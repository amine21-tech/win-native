import { StyleSheet, Text, View } from 'react-native';
import { LANE, type Lane } from '../navigation/routing';
import { radius, spacing, type Palette } from '../theme';

/**
 * Voies a prendre a l'approche d'une bifurcation (point 4 du client).
 *
 * « L'utilisateur ne sait pas quelle voie prendre » : sur l'autoroute Est-Ouest comme a
 * l'entree d'Alger, rater la bonne file coute plusieurs kilometres. Les cartes de navigation
 * courantes montrent les fleches peintes au sol, et eteignent celles qui ne menent pas la ou
 * l'on va.
 *
 * Trois etats, et non deux — c'est ce qui distingue cet affichage d'une simple liste de
 * fleches :
 *
 *   VERTE  la voie suit l'itineraire SANS changer de file. C'est celle ou se placer.
 *   BLANCHE la voie suit l'itineraire, mais il faudra encore se rabattre ensuite.
 *   GRISE  la voie ne mene pas la ou l'on va.
 *
 * Rien ne s'affiche quand la donnee n'existe pas : OpenStreetMap ne porte les marquages au sol
 * (`turn:lanes`) que sur une partie du reseau, surtout en Algerie. Une voie inventee serait
 * pire que pas de voie du tout.
 */

/** Distance d'apparition : au-dela, le conducteur ne peut encore rien faire de l'information. */
export const LANE_GUIDANCE_VISIBLE_M = 500;

/* Une voie porte souvent PLUSIEURS directions peintes (tout droit + a droite). On dessine la
 * plus parlante : celle qui correspond au mouvement le plus marque. L'ordre de ce tableau est
 * donc un ordre de priorite, du plus tranche au plus neutre.
 *
 * Les fleches sont EXACTEMENT celles du bandeau de consigne (voir instructions.ts), et non des
 * fleches pleines plus epaisses : celles du bandeau sont deja affichees tous les jours sur les
 * telephones du client. Un caractere absent de la police s'afficherait en carre vide, et
 * l'information disparaitrait au moment precis ou elle compte. */
const GLYPHS: [number, string][] = [
  [LANE.reverse, '↩'],
  [LANE.sharpLeft, '↰'],
  [LANE.left, '↰'],
  [LANE.slightLeft, '↖'],
  [LANE.mergeToLeft, '↖'],
  [LANE.sharpRight, '↱'],
  [LANE.right, '↱'],
  [LANE.slightRight, '↗'],
  [LANE.mergeToRight, '↗'],
  [LANE.through, '↑'],
  [LANE.none, '↑'],
];

/** Fleche a dessiner pour une voie : celle de la direction ACTIVE si la voie en a une (c'est
 * le mouvement a faire), sinon celle de tout ce qui y est peint. */
function glyphFor(lane: Lane): string {
  const mask = lane.active || lane.directions;
  for (const [bit, glyph] of GLYPHS) {
    if (mask & bit) return glyph;
  }
  return '↑';
}

export function LaneGuidance({
  lanes,
  distanceM,
  colors,
  top,
}: {
  lanes: Lane[];
  /** Distance restante jusqu'a la bifurcation, ou `null` si elle est inconnue. */
  distanceM: number | null;
  colors: Palette;
  /** Hauteur a laquelle accrocher la rangee : juste sous le bandeau de consigne. */
  top: number;
}) {
  if (lanes.length === 0 || distanceM == null || distanceM > LANE_GUIDANCE_VISIBLE_M) return null;

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="none">
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {lanes.map((lane, i) => {
          const active = lane.active !== 0;
          const possible = active || lane.valid !== 0;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                active ? { backgroundColor: colors.accent } : null,
                // Un separateur discret entre voies : sans lui, quatre fleches collees se
                // lisent comme un seul dessin et on ne compte plus les files.
                i > 0 ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border } : null,
              ]}
            >
              <Text
                style={[
                  styles.glyph,
                  {
                    color: active ? colors.accentText : possible ? colors.text : colors.textMuted,
                    opacity: possible ? 1 : 0.4,
                  },
                ]}
              >
                {glyphFor(lane)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    marginHorizontal: spacing.md,
  },
  cell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 20, fontWeight: '800' as const },
});
