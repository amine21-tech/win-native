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
  lanes?: RawLane[];
};

type RawLane = { directions: number; valid?: number; active?: number };

type RawTrip = {
  legs: { maneuvers: RawManeuver[]; shape: string }[];
  summary: { time: number; length: number };
};

type RawRouteResponse = { trip: RawTrip; alternates?: { trip: RawTrip }[] };

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
  /** Voies a prendre a cette manoeuvre, de gauche a droite. Vide quand la donnee n'existe pas. */
  lanes: Lane[];
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
    lanes: (m.lanes ?? []).map((lane) => ({
      directions: lane.directions,
      valid: lane.valid ?? 0,
      active: lane.active ?? 0,
    })),
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
  /** Preference du conducteur : passer par l'autoroute, ou l'eviter (voir store/session). */
  prefs?: { autoroute: boolean };
  /** Recalcul en roulant : attente courte et une reprise, plutot qu'une longue attente. */
  quick?: boolean;
  /** Barrages et routes coupees signales par les utilisateurs, a contourner. */
  avoid?: { lat: number; lon: number }[];
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
      autoroute: opts.prefs?.autoroute ?? true,
      quick: opts.quick ?? false,
      avoid: opts.avoid ?? [],
    },
  });
  const narration = opts.narrationLanguage === 'en-US' ? 'en' : 'fr';
  return {
    primary: normalize(data.trip, narration),
    alternates: (data.alternates ?? []).map((a) => normalize(a.trip, narration)),
  };
}

/* La geometrie du trace vit dans son propre fichier pour pouvoir etre eprouvee hors de
 * l'application : l'importer d'ici tirait le client HTTP et, derriere lui, React Native.
 * Re-exportee telle quelle — rien ne change pour ceux qui l'utilisent. */
export { locateOnRoute, pointOnRoute, traveledMeters } from './traceGeometrie';
export type { RouteLocation, TraceMesurable } from './traceGeometrie';
