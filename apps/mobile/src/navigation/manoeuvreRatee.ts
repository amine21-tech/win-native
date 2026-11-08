/**
 * << LE VIRAGE EST-IL RATE ? >> — correctif du 8 novembre, point 3.
 *
 * Le document demande : « lorsque l'utilisateur depasse de 20 METRES le point ou il devait
 * tourner, le recalcul se declenche automatiquement », avec ce code de reference :
 *
 *     if (distancePastTurnPoint > 20.0) { triggerReroute(); }
 *
 * CE CODE, APPLIQUE TEL QUEL, RECALCULERAIT EN PERMANENCE. On depasse le point de virage de
 * vingt metres aussi en PRENANT le virage : le point de manoeuvre est au milieu du carrefour, et
 * vingt metres plus loin on est engage dans la bonne rue, parfaitement sur l'itineraire. La
 * regle a donc besoin d'un second terme — etre HORS du trace — et ce fichier existe pour que
 * les deux soient ecrits au meme endroit, et eprouves.
 *
 * POURQUOI HORS DU HOOK. La detection vivait dans `useNavigationSession`, au milieu du suivi
 * GPS : pour l'eprouver il faudrait un telephone, une route et un conducteur qui rate son
 * virage. Ici, c'est une fonction de quatre nombres. Meme raison que degradeTrace.ts,
 * alerteApproche.ts et voixKabRegles.ts. Voir scripts/verifier-manoeuvre-ratee.ts.
 */

/**
 * TOUTES LES MANOEUVRES QU'ON PEUT RATER.
 *
 * Les types sont ceux de Valhalla. CE QUI EST DEDANS : tout ce qui change de direction — les
 * virages (9 a 11 et 14 a 16), les demi-tours (12, 13), les bretelles et sorties (17 a 21), se
 * maintenir a droite ou a gauche (23, 24), s'inserer (25), les ronds-points (26, 27).
 *
 * CE QUI N'Y EST PAS, ET POURQUOI C'EST ESSENTIEL : << continuez tout droit >> (8), les
 * manoeuvres de depart (1 a 3) et celles d'arrivee (4 a 6). Depasser de vingt metres un point ou
 * l'on devait aller TOUT DROIT, c'est exactement ce que fait un conducteur qui suit correctement
 * son itineraire — et le trace en compte des dizaines. Les inclure recalculerait tout le trajet.
 */
export const EST_MANOEUVRE_RATABLE = new Set([
  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27,
]);

/** Types Valhalla qui designent une BRETELLE ou une SORTIE : l'annonce n'est pas la meme. */
export const EST_SORTIE = new Set([17, 18, 19, 20, 21]);

/**
 * Depassement au-dela duquel une manoeuvre est consideree comme ratee.
 *
 * VINGT METRES, valeur du 8 novembre. C'etait trente, et la regle ne valait que pour les
 * sorties (point 10B du 27 octobre).
 */
export const MANOEUVRE_RATEE_M = 20;

export type Depassement = {
  /** Type Valhalla de la manoeuvre qu'on vient de depasser. */
  type: number;
  /** De combien de metres on a depasse son point, mesure LE LONG du trace. */
  depassementM: number;
  /** Ecart lateral au trace, en metres. */
  ecartM: number;
  /** Tolerance courante, qui suit la precision du GPS et la vitesse (voir DEVIATION_BANDS). */
  toleranceM: number;
};

/**
 * La manoeuvre vient-elle d'etre ratee ?
 *
 * LES DEUX CONDITIONS SONT INDISSOCIABLES. Depasser le point sans etre sorti du trace, c'est
 * avoir tourne ; etre sorti du trace sans avoir depasse le point, c'est une deviation ordinaire,
 * qui a sa propre regle avec son delai de confirmation. Seules les deux ensemble ne decrivent
 * qu'une situation : le conducteur est passe devant sans tourner.
 */
export function manoeuvreRatee(d: Depassement): boolean {
  if (!EST_MANOEUVRE_RATABLE.has(d.type)) return false;
  if (d.depassementM <= MANOEUVRE_RATEE_M) return false;
  return d.ecartM > d.toleranceM;
}
