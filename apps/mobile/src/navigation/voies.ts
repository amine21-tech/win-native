/**
 * LES VOIES DE CIRCULATION — la donnee brute, sans rien qui touche au reseau ni a l'affichage.
 *
 * POURQUOI UN FICHIER A ELLES SEULES. Ces masques et ce type vivaient dans routing.ts, qui
 * importe le client HTTP, lequel finit par importer React Native. Un script de verification qui
 * voulait seulement connaitre la valeur de `LANE.sharpLeft` chargeait donc tout React Native et
 * echouait au demarrage : Node ne sait pas lire ce code.
 *
 * C'est le meme decoupage que degradeTrace.ts, manoeuvreRatee.ts et voixKabRegles.ts, et
 * toujours pour la meme raison : ce qui doit etre eprouve ne doit dependre de rien.
 *
 * routing.ts les re-exporte, pour que rien n'ait a changer ailleurs.
 */

/* Voies de circulation a l'approche d'une bifurcation (point 4 du client).
 *
 * Valhalla les decrit en MASQUES DE BITS, une voie par element du tableau, de gauche a droite.
 * Un meme masque peut porter plusieurs directions : une voie peignant a la fois une fleche tout
 * droit et une fleche a droite vaut 2 + 64 = 66.
 *
 *   `directions` : tout ce qui est peint au sol sur cette voie.
 *   `valid`      : ce qui permet de suivre l'itineraire, quitte a changer encore de file.
 *   `active`     : ce qui le permet SANS changer de file. C'est la voie a prendre.
 *
 * Les trois champs ne sont renvoyes qu'a partir de Valhalla 3.6 et seulement la ou
 * OpenStreetMap porte les marquages au sol (`turn:lanes`). Partout ailleurs, le tableau est
 * vide et l'application n'affiche rien — jamais une voie inventee. */
export const LANE = {
  none: 1,
  through: 2,
  sharpLeft: 4,
  left: 8,
  slightLeft: 16,
  slightRight: 32,
  right: 64,
  sharpRight: 128,
  reverse: 256,
  mergeToLeft: 512,
  mergeToRight: 1024,
} as const;

export type Lane = {
  directions: number;
  /** Suit l'itineraire, eventuellement apres un nouveau changement de file. */
  valid: number;
  /** Suit l'itineraire sans changer de file : c'est la voie ou se placer. */
  active: number;
};
