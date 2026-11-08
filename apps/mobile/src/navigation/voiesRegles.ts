import { LANE, type Lane } from './voies';

/**
 * LES NEUF FLECHES DE VOIE, DESSINEES — correctif du 8 novembre, point 4.
 *
 * Elles etaient des CARACTERES : ↩ ↰ ↖ ↱ ↗ ↑. Six signes pour onze directions, et le fichier
 * expliquait pourquoi : les fleches du bandeau de consigne sont deja affichees tous les jours
 * sur les telephones du client, donc eprouvees. Le raisonnement etait prudent et il etait
 * faux de la meme facon que pour la fleche de manoeuvre, corrigee le 29 octobre pour la
 * meme raison : un caractere ne grandit pas, change d'aspect d'un Android a l'autre, et
 * s'affiche en carre vide quand la police ne le contient pas.
 *
 * Surtout, six signes ne peuvent pas distinguer neuf mouvements. << Tournez a gauche >> et
 * << serrez franchement a gauche >> partageaient ↰ : deux voies differentes, un seul dessin.
 * Sur une bifurcation d'autoroute, c'est la difference entre deux routes.
 *
 * CE FICHIER NE CONTIENT QUE LES REGLES ET LES TRACES, et aucun import de React Native :
 * c'est ce qui permet de les eprouver sans telephone (voir scripts/verifier-voies.ts). Un
 * script qui importerait le composant chargerait react-native-svg, puis react-native, que Node
 * ne sait pas lire — meme raison que degradeTrace.ts, manoeuvreRatee.ts et voixKabRegles.ts.
 *
 * NEUF TRACES, comme le demande le document. Le rabattement n'est dessine qu'une fois et
 * retourne pour le cote gauche : c'est le MEME mouvement, et un dessin retourne reste exact la
 * ou un dessin refait de l'autre cote risque de ne pas lui ressembler.
 */

export type GesteVoie =
  | 'demi-tour'
  | 'serree-gauche'
  | 'gauche'
  | 'legere-gauche'
  | 'tout-droit'
  | 'legere-droite'
  | 'droite'
  | 'serree-droite'
  | 'rabattement';

/* Traces dans une boite de 100 x 100. Chaque fleche part du BAS AU CENTRE — la ou se trouve la
 * voiture dans sa file — et file vers la direction peinte au sol. Le trait fait 13 points :
 * moins serait fin sur une case de trente-deux points, plus empaterait la pointe. */
export const TRACES_VOIE: Record<GesteVoie, string> = {
  /* LE DEMI-TOUR EN ARC CONTINU, POINTE VERS LE BAS — exigence explicite du document :
   * << arc en U CONTINU, tete de fleche pointant VERS LE BAS >>.
   *
   * Le caractere ↩ dessinait l'inverse : une fleche qui part a gauche et dont la pointe va vers
   * la gauche. Elle se lisait comme un virage serre, ce qui est precisement le contresens a
   * eviter — on repart dans l'autre sens, pas sur la route d'a cote.
   *
   * La tige monte a droite, l'arc passe par le haut, la tige redescend a gauche, et la pointe
   * regarde le sol. */
  'demi-tour': 'M68 92 L68 46 Q68 22 50 22 Q32 22 32 46 L32 66 M32 80 L19 58 M32 80 L45 58',
  /* Serree : l'angle est pris plus haut et plus franchement que le virage ordinaire, et la
   * fleche repart LEGEREMENT VERS LE BAS — c'est ce qui dit << presque un demi-tour >>. */
  'serree-gauche': 'M50 92 L50 42 Q50 28 36 30 L20 36 M8 42 L30 24 M8 42 L32 46',
  gauche: 'M50 92 L50 44 Q50 32 38 32 L22 32 M9 32 L31 18 M9 32 L31 46',
  'legere-gauche': 'M50 92 L50 58 L28 28 M26 15 L25 41 M26 15 L50 20',
  'tout-droit': 'M50 92 L50 28 M50 14 L31 38 M50 14 L69 38',
  'legere-droite': 'M50 92 L50 58 L72 28 M74 15 L75 41 M74 15 L50 20',
  droite: 'M50 92 L50 44 Q50 32 62 32 L78 32 M91 32 L69 18 M91 32 L69 46',
  'serree-droite': 'M50 92 L50 42 Q50 28 64 30 L80 36 M92 42 L70 24 M92 42 L68 46',
  /* LE RABATTEMENT : deux traits qui convergent. Il ne dit pas << tournez >> mais << votre voie
   * rejoint la voisine >>, ce qui n'est pas le meme geste — on ne tourne pas le volant, on
   * laisse la file se fondre. Dessine vers la droite ; retourne pour la gauche. */
  rabattement: 'M34 92 L34 62 Q34 46 50 40 L66 34 M79 30 L57 20 M79 30 L61 44',
};

/**
 * Le geste d'une voie, du mouvement le plus tranche au plus neutre.
 *
 * L'ORDRE EST UN ORDRE DE PRIORITE, et il compte : une voie porte souvent plusieurs directions
 * peintes (tout droit ET a droite). On dessine la plus marquee, parce que c'est celle qui
 * engage — se tromper en montrant << tout droit >> sur une voie qui tourne aussi fait manquer
 * la sortie, l'inverse fait seulement hesiter.
 */
const PRIORITE: [number, GesteVoie][] = [
  [LANE.reverse, 'demi-tour'],
  [LANE.sharpLeft, 'serree-gauche'],
  [LANE.left, 'gauche'],
  [LANE.slightLeft, 'legere-gauche'],
  [LANE.mergeToLeft, 'rabattement'],
  [LANE.sharpRight, 'serree-droite'],
  [LANE.right, 'droite'],
  [LANE.slightRight, 'legere-droite'],
  [LANE.mergeToRight, 'rabattement'],
  [LANE.through, 'tout-droit'],
  [LANE.none, 'tout-droit'],
];

export function gesteDeVoie(lane: Lane): GesteVoie {
  /* LA DIRECTION ACTIVE D'ABORD : c'est le mouvement a FAIRE depuis cette voie. A defaut, tout
   * ce qui y est peint — on montre alors ce que le conducteur voit par terre. */
  const masque = lane.active || lane.directions;
  for (const [bit, geste] of PRIORITE) {
    if (masque & bit) return geste;
  }
  return 'tout-droit';
}

/** Le rabattement part-il vers la GAUCHE ? Seul cas ou le trace est retourne. */
export function rabattementAGauche(lane: Lane): boolean {
  const masque = lane.active || lane.directions;
  return (masque & LANE.mergeToLeft) !== 0 && (masque & LANE.mergeToRight) === 0;
}

