/**
 * GEOMETRIE DU TRACE : ou sommes-nous sur l'itineraire, et combien avons-nous parcouru.
 *
 * POURQUOI CE FICHIER EXISTE A PART. Ces fonctions sont PURES — des nombres en entree, des
 * nombres en sortie — et elles portent deux regles de securite : l'ecart au trace qui declenche
 * un recalcul, et la distance restante sur laquelle repose l'annonce d'un danger. Tant qu'elles
 * vivaient a cote de `fetchRoute`, les importer tirait tout le client HTTP et, derriere lui,
 * React Native : impossible de les eprouver hors de l'application, c'est-a-dire autrement qu'en
 * roulant. Isolees ici, elles se verifient en une seconde sur un ordinateur (voir
 * scripts/verifier-alertes.ts). Meme raison que degradeTrace.ts.
 *
 * `routing.ts` les re-exporte : rien n'a change pour ceux qui les utilisent.
 */

/** Ce dont la geometrie a besoin d'un itineraire : sa forme et ses distances cumulees. */
export type TraceMesurable = {
  geometry: [number, number][];
  cumulativeM: number[];
};

/** Distance minimale d'un point a un segment [a,b] et position du pied de la perpendiculaire
 * sur ce segment (0 = en a, 1 = en b). Approximation planaire — suffisante a l'echelle d'un
 * ecart de conduite, jamais a l'echelle d'un pays. */
function projectOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): { distanceM: number; t: number } {
  const cos = Math.cos((p[1] * Math.PI) / 180);
  const toXY = (pt: [number, number]): [number, number] => [pt[0] * 111_320 * cos, pt[1] * 110_540];
  const [px, py] = toXY(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { distanceM: Math.hypot(px - cx, py - cy), t };
}

export type RouteLocation = {
  /** Ecart au trace, en metres — sert a decider d'un recalcul. */
  distanceM: number;
  /** Index du segment le plus proche. */
  segmentIndex: number;
  /** Position sur ce segment, de 0 (debut) a 1 (fin). */
  t: number;
};

/** Nombre de segments examines autour de l'indice suggere. Une seconde de trajet a
 * 130 km/h represente 36 m, soit rarement plus de deux ou trois points de forme : une
 * fenetre de 96 segments vers l'avant couvre largement, meme apres quelques secondes sans
 * signal. En arriere on garde de la marge pour un GPS qui recule legerement a l'arret. */
const WINDOW_AHEAD = 96;
const WINDOW_BEHIND = 12;

/** Au-dela, on ne fait plus confiance a la fenetre : le conducteur a probablement quitte
 * la portion attendue (sortie manquee, demi-tour), et il faut rebalayer tout le trace. */
const WINDOW_TRUST_M = 80;

/**
 * Position d'un point par rapport au trace : ecart au trace, segment le plus proche et
 * position sur ce segment. L'index sert a faire avancer la manoeuvre en cours par
 * PROGRESSION sur le trace, en plus de la seule proximite au point de manoeuvre (la
 * proximite seule ratait parfois un virage serre : le point de manoeuvre peut rester a
 * plus de 30 m meme une fois le virage pris, si peu de points de forme l'entourent).
 *
 * `hintIndex` est l'index trouve a la seconde precedente. Un conducteur avance le long du
 * trace : la reponse se trouve juste devant. On ne balaie donc qu'une fenetre autour de
 * cet indice, et on ne repart sur le trace entier que si rien de credible n'y est trouve.
 * Sur un Alger–Tamanrasset (plusieurs dizaines de milliers de points de forme), le balayage
 * complet, execute a chaque mesure GPS, etait a lui seul de quoi faire tomber des images.
 */
export function locateOnRoute(
  position: [number, number],
  geometry: [number, number][],
  hintIndex?: number,
): RouteLocation {
  const lastSegment = geometry.length - 2;
  if (lastSegment < 0) return { distanceM: Infinity, segmentIndex: 0, t: 0 };

  const scan = (from: number, to: number): RouteLocation => {
    let best: RouteLocation = { distanceM: Infinity, segmentIndex: from, t: 0 };
    for (let i = from; i <= to; i++) {
      const { distanceM, t } = projectOnSegment(position, geometry[i]!, geometry[i + 1]!);
      if (distanceM < best.distanceM) best = { distanceM, segmentIndex: i, t };
    }
    return best;
  };

  if (hintIndex != null && hintIndex >= 0) {
    const from = Math.max(0, hintIndex - WINDOW_BEHIND);
    const to = Math.min(lastSegment, hintIndex + WINDOW_AHEAD);
    const windowed = scan(from, to);
    if (windowed.distanceM <= WINDOW_TRUST_M) return windowed;
  }

  return scan(0, lastSegment);
}

/**
 * Point exactement SUR le trace correspondant a une projection.
 *
 * C'est lui qui termine la portion deja parcourue, jamais la position GPS brute : celle-ci
 * est toujours un peu a cote de la ligne, et terminer dessus faisait partir une branche
 * disgracieuse du trace vers le vehicule (meme correction qu'en v83, updateTraveledPath).
 */
export function pointOnRoute(route: TraceMesurable, location: RouteLocation): [number, number] {
  const geometry = route.geometry;
  const i = Math.min(Math.max(location.segmentIndex, 0), geometry.length - 2);
  const a = geometry[i]!;
  const b = geometry[i + 1]!;
  return [a[0] + (b[0] - a[0]) * location.t, a[1] + (b[1] - a[1]) * location.t];
}

/** Distance parcourue depuis le depart, le long du trace, pour une position projetee. */
export function traveledMeters(route: TraceMesurable, location: RouteLocation): number {
  const { cumulativeM } = route;
  const i = Math.min(location.segmentIndex, cumulativeM.length - 2);
  if (i < 0) return 0;
  const start = cumulativeM[i]!;
  const end = cumulativeM[i + 1]!;
  return start + (end - start) * location.t;
}
