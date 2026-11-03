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
 *
 * AUTOROUTE ET VOIE RAPIDE UNIQUEMENT depuis le 3 novembre, et au moins deux voies. La
 * POSITION, elle, ne change pas : le client demandait une barre en bas, mais son point 5 du
 * 27 octobre exigeait l'inverse — << integrees dans le bandeau vert EN HAUT, pas un widget
 * separe >>. On garde le bandeau, decision prise avec lui ; seules les conditions de
 * declenchement suivent le nouveau document.
 */

/** Distance d'apparition : au-dela, le conducteur ne peut encore rien faire de l'information. */
export const LANE_GUIDANCE_VISIBLE_M = 500;

/**
 * NOMBRE MINIMAL DE VOIES — correctif 1 du 3 novembre.
 *
 * Une seule voie peinte n'est pas un choix : elle ne dit pas ou se placer, elle dit seulement
 * ce qui est ecrit par terre. Le guidage ne sert que la ou il y a une decision a prendre.
 */
export const LANE_GUIDANCE_MIN = 2;

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

/**
 * LES VOIES SONT DESSINEES DANS LE BANDEAU VERT, pas sous lui (point 5 du client, 27 octobre :
 * « integrees dans le bandeau vert de navigation EN HAUT — pas un widget separe »).
 *
 * Elles etaient accrochees juste en dessous, dans leur propre carte blanche a ombre portee. De
 * pres cela se defend ; au volant, cela faisait un second objet a regarder, et la consigne —
 * « serrez a gauche » — se trouvait separee des fleches qui la montrent. Les reunir rend la
 * phrase et le dessin solidaires.
 *
 * Le code couleur devient celui du client, et il n'a plus que DEUX etats au lieu de trois : la
 * voie a prendre en BLANC opaque, les autres dans un vert clair a 40 %. Sur un aplat vert, la
 * nuance « suit l'itineraire mais il faudra se rabattre » ne se lisait plus — mieux vaut deux
 * etats nets qu'une troisieme teinte que personne ne distingue a 110 km/h.
 */
export function LaneGuidance({
  lanes,
  distanceM,
  surAutoroute,
}: {
  lanes: Lane[];
  /** Distance restante jusqu'a la bifurcation, ou `null` si elle est inconnue. */
  distanceM: number | null;
  /** La manoeuvre se fait-elle sur une autoroute ou une voie rapide ? */
  surAutoroute: boolean;
}) {
  /* AUTOROUTE ET VOIE RAPIDE UNIQUEMENT, et au moins deux voies — correctif 1 du 3 novembre.
   *
   * << Elle NE s'active PAS sur les virages normaux en ville, les carrefours classiques, les
   * ronds-points, ni sur une route a voie unique. >>
   *
   * Le client a raison, et pour une raison qu'on ne voit qu'au volant : en ville, les voies
   * changent a chaque carrefour et l'affichage clignoterait d'un feu a l'autre sans jamais
   * rien apprendre. Rater une file en ville coute un tour du pate de maisons ; la rater avant
   * une sortie d'autoroute coute dix kilometres. C'est la que l'information vaut. */
  if (!surAutoroute) return null;
  if (lanes.length < LANE_GUIDANCE_MIN || distanceM == null || distanceM > LANE_GUIDANCE_VISIBLE_M) {
    return null;
  }

  return (
    <View style={styles.row} pointerEvents="none">
      {lanes.map((lane, i) => {
        /* `active` = la voie ou l'on est deja bien place ; `valid` = elle mene quand meme la ou
         * l'on va. Les deux comptent comme « a prendre » pour l'affichage. */
        const aPrendre = lane.active !== 0 || lane.valid !== 0;
        return (
          <Text key={i} style={[styles.glyph, aPrendre ? styles.glypheBon : styles.glypheAutre]}>
            {glyphFor(lane)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Une simple rangee, posee dans le bandeau : ni carte, ni bordure, ni ombre. Elle fait
  // partie du bandeau, elle ne se pose plus dessus.
  row: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 2 },
  glyph: { fontSize: 22, fontWeight: '800' as const, width: 32, textAlign: 'center' },
  glypheBon: { color: '#FFFFFF' },
  /* Les voies a eviter restent VISIBLES, a quarante pour cent : les effacer tout a fait
   * empecherait de compter les files et de savoir laquelle est la bonne. */
  glypheAutre: { color: '#FFFFFF', opacity: 0.4 },
});
