import { api } from '../api/client';
import { decodePolyline } from '../shared';

export type RouteMode = 'auto' | 'pedestrian';

type RawManeuver = {
  type: number;
  instruction: string;
  verbal_pre_transition_instruction?: string;
  street_names?: string[];
  time: number;
  length: number;
  begin_shape_index: number;
};

type RawTrip = {
  legs: { maneuvers: RawManeuver[]; shape: string }[];
  summary: { time: number; length: number };
};

type RawRouteResponse = { trip: RawTrip; alternates?: { trip: RawTrip }[] };

export type Maneuver = {
  type: number;
  /** Instruction telle que renvoyee par Valhalla — fiable en fr/en, retombe sur l'anglais sinon. */
  instructionFrEn: string;
  /** Langue dans laquelle `instructionFrEn` a ete redigee. L'itineraire est calcule dans la
   * langue active AU MOMENT du calcul : si l'utilisateur change de langue ensuite, ce texte
   * reste dans l'ancienne, et il ne faut plus s'en servir (voir localizedInstruction). */
  narration: 'fr' | 'en';
  streetName: string;
  distanceM: number;
  durationS: number;
  /** Coordonnee [lon, lat] a laquelle la manoeuvre doit etre annoncee/executee. */
  point: [number, number];
  /** Index dans `geometry` ou commence cette manoeuvre — sert a detecter qu'elle est
   * franchie par avancement sur le trace, pas seulement par proximite au point exact
   * (voir locateOnRoute : un virage serre fait parfois passer le GPS a plus de 30 m
   * du point de manoeuvre sans jamais s'en rapprocher davantage). */
  shapeIndex: number;
  /** Distance depuis le depart, le long du trace, a laquelle commence cette manoeuvre.
   * Permet d'afficher « dans 250 m » en distance REELLEMENT parcourue plutot qu'a vol
   * d'oiseau, et de faire descendre la distance restante en continu. */
  startM: number;
};

export type Route = {
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  maneuvers: Maneuver[];
  /** Distance cumulee depuis le depart pour chaque point du trace (meme longueur que
   * `geometry`). Calculee une fois a la reception de l'itineraire : elle transforme le
   * calcul de la distance restante, a chaque seconde, en deux soustractions. */
  cumulativeM: number[];
};

/** Longueur planaire d'un segment, en metres. A l'echelle d'un troncon de route,
 * l'ecart avec la formule spherique est de l'ordre du centimetre. */
function segmentLengthM(a: [number, number], b: [number, number]): number {
  const cos = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dx = (b[0] - a[0]) * 111_320 * cos;
  const dy = (b[1] - a[1]) * 110_540;
  return Math.hypot(dx, dy);
}

function cumulate(geometry: [number, number][]): number[] {
  const cum = new Array<number>(geometry.length);
  cum[0] = 0;
  for (let i = 1; i < geometry.length; i++) {
    cum[i] = cum[i - 1]! + segmentLengthM(geometry[i - 1]!, geometry[i]!);
  }
  return cum;
}

function normalize(trip: RawTrip, narration: 'fr' | 'en'): Route {
  const leg = trip.legs[0]!;
  const geometry = decodePolyline(leg.shape);
  const cumulativeM = cumulate(geometry);
  const maneuvers: Maneuver[] = leg.maneuvers.map((m) => ({
    type: m.type,
    instructionFrEn: m.instruction,
    narration,
    streetName: m.street_names?.[0] ?? '',
    distanceM: m.length * 1000,
    durationS: m.time,
    point: geometry[m.begin_shape_index] ?? geometry[0]!,
    shapeIndex: m.begin_shape_index,
    startM: cumulativeM[m.begin_shape_index] ?? 0,
  }));
  return {
    distanceM: trip.summary.length * 1000,
    durationS: trip.summary.time,
    geometry,
    maneuvers,
    cumulativeM,
  };
}

/**
 * Calcule un itineraire (passe-plat vers Valhalla, deja utilise par WIN — voir
 * apps/api/src/routes/routing.ts). Valhalla ne sait produire de narration
 * qu'en fr-FR/en-US : le francais et l'anglais utilisent directement son
 * texte, l'arabe et le darija reconstruisent la phrase eux-memes (voir
 * instructions.ts) a partir du type de manoeuvre et du nom de rue.
 */
export async function fetchRoute(opts: {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  mode: RouteMode;
  narrationLanguage: 'fr-FR' | 'en-US';
  alternates?: number;
  /** Cap du vehicule au depart : evite qu'un recalcul ne commence par un demi-tour. */
  heading?: number;
}): Promise<{ primary: Route; alternates: Route[] }> {
  const data = await api<RawRouteResponse>('/routing/route', {
    method: 'POST',
    body: {
      from: opts.from,
      to: opts.to,
      mode: opts.mode,
      language: opts.narrationLanguage,
      alternates: opts.alternates ?? 2,
      heading: opts.heading,
    },
  });
  const narration = opts.narrationLanguage === 'en-US' ? 'en' : 'fr';
  return {
    primary: normalize(data.trip, narration),
    alternates: (data.alternates ?? []).map((a) => normalize(a.trip, narration)),
  };
}

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
export function pointOnRoute(route: Route, location: RouteLocation): [number, number] {
  const geometry = route.geometry;
  const i = Math.min(Math.max(location.segmentIndex, 0), geometry.length - 2);
  const a = geometry[i]!;
  const b = geometry[i + 1]!;
  return [a[0] + (b[0] - a[0]) * location.t, a[1] + (b[1] - a[1]) * location.t];
}

/** Distance parcourue depuis le depart, le long du trace, pour une position projetee. */
export function traveledMeters(route: Route, location: RouteLocation): number {
  const { cumulativeM } = route;
  const i = Math.min(location.segmentIndex, cumulativeM.length - 2);
  if (i < 0) return 0;
  const start = cumulativeM[i]!;
  const end = cumulativeM[i + 1]!;
  return start + (end - start) * location.t;
}
