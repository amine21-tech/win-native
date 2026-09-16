import { speakGuidance, stopSpeaking } from '../speech/voice';
import { useSpokenLanguage } from '../speech/useSpokenLanguage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localizedInstruction, lowerFirst, spokenDistance } from './instructions';
import {
  fetchRoute,
  locateOnRoute,
  traveledMeters,
  type Maneuver,
  type Route,
  type RouteLocation,
  type RouteMode,
} from './routing';
import { haversine, type Language } from '../shared';
import { useSession } from '../store/session';

type Coords = { lat: number; lon: number };

const MANEUVER_ARRIVAL_RADIUS_M = 30;
const OFF_ROUTE_THRESHOLD_M = 50;
const OFF_ROUTE_STREAK_TO_RECALC = 3;
const RECALC_COOLDOWN_MS = 10_000;

/** Distances d'annonce, exprimees en SECONDES de trajet puis bornees : a 120 km/h une
 * consigne donnee a 200 m arrive trop tard pour changer de file, et en ville la meme
 * consigne a 800 m ferait tourner au mauvais carrefour. Ce sont les deux temps de v83
 * (« dans 400 metres, tournez a droite », puis « tournez a droite »). */
const PRE_ANNOUNCE_S = 18;
const PRE_ANNOUNCE_MIN_M = 200;
const PRE_ANNOUNCE_MAX_M = 800;
const FINAL_ANNOUNCE_S = 4;
const FINAL_ANNOUNCE_MIN_M = 60;
const FINAL_ANNOUNCE_MAX_M = 180;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Etat vivant d'une navigation guidee : calcule l'itineraire au demarrage, avance de
 * manoeuvre en manoeuvre au fil de la position GPS, annonce vocalement chaque manoeuvre
 * a venir — une premiere fois a distance, une seconde au moment d'agir — et recalcule
 * automatiquement des qu'un ecart soutenu au trace est detecte.
 *
 * La progression est suivie EN CONTINU le long du trace, pas de manoeuvre en manoeuvre :
 * la distance restante et l'heure d'arrivee descendent seconde apres seconde, au lieu de
 * rester figees puis de sauter d'un coup au passage d'un carrefour.
 */
export function useNavigationSession(params: {
  active: boolean;
  position: Coords | null;
  destination: Coords | null;
  mode: RouteMode;
  lang: Language;
  /** Itineraire deja calcule (apercu choisi dans la fiche du lieu) : evite un
   * appel reseau redondant pile au moment ou l'utilisateur demarre. */
  initialRoute?: Route | null;
  /** Acces a la vitesse instantanee, en m/s, sans passer par un rendu React : elle sert
   * a decider QUAND annoncer une manoeuvre. Voir useLiveLocation. */
  getSpeedMps?: () => number;
}) {
  const { active, position, destination, mode, lang, initialRoute, getSpeedMps } = params;
  const [route, setRoute] = useState<Route | null>(null);
  const [maneuverIndex, setManeuverIndex] = useState(0);
  const [traveledM, setTraveledM] = useState(0);
  /** Projection de la position sur le trace. Publiee parce que la carte en a besoin pour
   * couper l'itineraire en deux : la part deja parcourue et celle qui reste. */
  const [progress, setProgress] = useState<RouteLocation | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState(false);

  const routeRef = useRef<Route | null>(null);
  const maneuverIndexRef = useRef(0);
  /** Index du segment ou l'on se trouvait a la mesure precedente : point de depart de la
   * recherche suivante (voir locateOnRoute). */
  const segmentHintRef = useRef<number | undefined>(undefined);
  const offRouteStreakRef = useRef(0);
  const lastRecalcAtRef = useRef(0);
  const initialRouteRef = useRef<Route | null>(null);
  const getSpeedRef = useRef(getSpeedMps);
  getSpeedRef.current = getSpeedMps;
  useEffect(() => {
    initialRouteRef.current = initialRoute ?? null;
  }, [initialRoute]);

  /** Etape d'annonce deja franchie pour la manoeuvre a venir : 0 = rien dit,
   * 1 = annonce a distance, 2 = annonce finale. Remis a zero a chaque manoeuvre. */
  const announcedForRef = useRef({ index: -1, stage: 0 });
  /** La consigne de depart n'a ete donnee qu'une fois pour cet itineraire. */
  const departureSaidRef = useRef(false);

  const applyRoute = useCallback((next: Route | null) => {
    setRoute(next);
    setManeuverIndex(0);
    setTraveledM(0);
    setProgress(null);
    segmentHintRef.current = undefined;
    offRouteStreakRef.current = 0;
    announcedForRef.current = { index: -1, stage: 0 };
    departureSaidRef.current = false;
  }, []);

  const loadRoute = useCallback(
    async (from: Coords) => {
      if (!destination) return;
      setRecalculating(true);
      try {
        const { primary } = await fetchRoute({
          from,
          to: destination,
          mode,
          narrationLanguage: lang === 'en' ? 'en-US' : 'fr-FR',
          alternates: 0,
        });
        setError(false);
        applyRoute(primary);
      } catch {
        setError(true);
      } finally {
        setRecalculating(false);
      }
    },
    [destination, mode, lang, applyRoute],
  );

  // Changement de langue PENDANT le trajet : les consignes basculent tout de suite grace aux
  // phrases locales (localizedInstruction), puis l'itineraire est recalcule depuis la position
  // actuelle pour retrouver le texte detaille de Valhalla dans la nouvelle langue. Rien a faire
  // en arabe : Valhalla ne le redige pas, les phrases sont toujours construites localement.
  /** Langue des annonces vocales : celle de l'application, ou le francais si le telephone n'a
   * pas la voix correspondante. Le TEXTE affiche, lui, reste toujours dans la langue choisie. */
  const spokenLang = useSpokenLanguage(lang);

  const narrationLang = lang === 'en' ? 'en' : 'fr';
  const previousNarrationRef = useRef(narrationLang);
  useEffect(() => {
    if (previousNarrationRef.current === narrationLang) return;
    previousNarrationRef.current = narrationLang;
    if (active && position && destination && lang !== 'ar' && lang !== 'dz') void loadRoute(position);
    // `position` volontairement hors dependances : seule la langue declenche ce recalcul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationLang]);

  // Demarrage / arret de la session, et RE-demarrage si la destination change en cours de route
  // (ex. l'utilisateur cherche une autre categorie via l'assistant vocal pendant la navigation
  // et choisit un nouveau lieu) — cle sur les coordonnees plutot que sur `active` seul, sinon un
  // changement de destination alors qu'on navigue deja (active reste `true`) ne se voyait jamais.
  // Volontairement PAS sur `position` : un seul calcul par destination, pas a chaque frappe GPS.
  useEffect(() => {
    if (active && position && destination) {
      if (initialRouteRef.current) {
        setError(false);
        applyRoute(initialRouteRef.current);
        initialRouteRef.current = null;
      } else {
        void loadRoute(position);
      }
    }
    if (!active) {
      applyRoute(null);
      stopSpeaking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, destination?.lat, destination?.lon]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    maneuverIndexRef.current = maneuverIndex;
  }, [maneuverIndex]);

  // Avancement de manoeuvre, progression continue et detection de deviation, a chaque
  // nouvelle position GPS.
  useEffect(() => {
    if (!active || !position) return;
    const currentRoute = routeRef.current;
    if (!currentRoute) return;
    const here: [number, number] = [position.lon, position.lat];

    const located = locateOnRoute(here, currentRoute.geometry, segmentHintRef.current);
    segmentHintRef.current = located.segmentIndex;
    const traveled = traveledMeters(currentRoute, located);
    setTraveledM(traveled);
    setProgress(located);

    // Une manoeuvre est franchie soit par proximite a son point exact, soit des que la
    // position la plus proche sur le trace a depasse son index de depart — necessaire dans
    // un virage serre, ou le GPS peut ne jamais repasser a moins de 30 m du point de
    // manoeuvre tout en ayant clairement pris le virage. La boucle gere aussi le cas, rare,
    // ou une mise a jour GPS saute plusieurs manoeuvres tres rapprochees d'un coup.
    let idx = maneuverIndexRef.current;
    while (true) {
      const next = currentRoute.maneuvers[idx + 1];
      if (!next) break;
      const closeToPoint =
        haversine(position.lat, position.lon, next.point[1], next.point[0]) <
        MANEUVER_ARRIVAL_RADIUS_M;
      const passedByProgress = located.segmentIndex >= next.shapeIndex;
      if (!closeToPoint && !passedByProgress) break;
      idx += 1;
    }
    if (idx !== maneuverIndexRef.current) setManeuverIndex(idx);

    if (located.distanceM > OFF_ROUTE_THRESHOLD_M) {
      offRouteStreakRef.current += 1;
      const cooledDown = Date.now() - lastRecalcAtRef.current > RECALC_COOLDOWN_MS;
      if (offRouteStreakRef.current >= OFF_ROUTE_STREAK_TO_RECALC && cooledDown) {
        lastRecalcAtRef.current = Date.now();
        offRouteStreakRef.current = 0;
        void loadRoute(position);
      }
    } else {
      offRouteStreakRef.current = 0;
    }
  }, [position, active, loadRoute]);

  const currentManeuver: Maneuver | null = route?.maneuvers[maneuverIndex] ?? null;
  const nextManeuver: Maneuver | null = route?.maneuvers[maneuverIndex + 1] ?? null;
  /** Manoeuvre d'APRES la prochaine : « puis a droite ». Annoncee sur les cartes de
   * navigation courantes parce que deux virages rapproches se preparent ensemble — savoir
   * qu'on tourne encore juste apres change la file qu'on choisit. */
  const followingManeuver: Maneuver | null = route?.maneuvers[maneuverIndex + 2] ?? null;

  /** Distance qui reste a parcourir, sur la route, jusqu'a la prochaine manoeuvre. C'est
   * elle qu'affiche le bandeau (« dans 250 m ») : la distance a vol d'oiseau utilisee
   * auparavant annoncait un virage trop tot des que la route faisait un coude. */
  const distanceToNextManeuverM = useMemo(() => {
    if (!nextManeuver) return null;
    return Math.max(0, nextManeuver.startM - traveledM);
  }, [nextManeuver, traveledM]);

  const voiceGuidanceEnabled = useSession((s) => s.voiceGuidanceEnabled);

  // Annonce vocale de la manoeuvre A VENIR, en deux temps : une premiere fois assez tot
  // pour se rabattre, une seconde au moment d'agir. Chaque etape ne parle qu'une fois —
  // et elle est marquee comme dite meme quand le son est coupe, pour que reactiver le son
  // en cours de trajet ne declenche pas une rafale de consignes deja passees.
  useEffect(() => {
    if (!active || !route) return;

    // Consigne de depart, donnee une seule fois des que l'itineraire est pret. Sans elle,
    // un trajet qui commence par dix kilometres de ligne droite demarre dans le silence :
    // le conducteur n'a aucune confirmation que le guidage a bien pris.
    if (!departureSaidRef.current) {
      departureSaidRef.current = true;
      const first = route.maneuvers[0];
      if (first && voiceGuidanceEnabled) {
        speakGuidance(localizedInstruction(first, spokenLang), spokenLang);
        return;
      }
    }

    if (!nextManeuver || distanceToNextManeuverM == null) return;

    const speedMps = getSpeedRef.current?.() ?? 0;
    const preM = clamp(speedMps * PRE_ANNOUNCE_S, PRE_ANNOUNCE_MIN_M, PRE_ANNOUNCE_MAX_M);
    const finalM = clamp(speedMps * FINAL_ANNOUNCE_S, FINAL_ANNOUNCE_MIN_M, FINAL_ANNOUNCE_MAX_M);

    const target = maneuverIndex + 1;
    const state = announcedForRef.current;
    if (state.index !== target) announcedForRef.current = { index: target, stage: 0 };
    const stage = announcedForRef.current.stage;

    const instruction = localizedInstruction(nextManeuver, spokenLang);
    let phrase: string | null = null;
    if (distanceToNextManeuverM <= finalM && stage < 2) {
      announcedForRef.current = { index: target, stage: 2 };
      phrase = instruction;
    } else if (distanceToNextManeuverM <= preM && stage < 1) {
      announcedForRef.current = { index: target, stage: 1 };
      // « Dans 300 metres, tournez a droite » — arrondi parle, comme en v83.
      phrase = `${spokenDistance(distanceToNextManeuverM, spokenLang)}, ${lowerFirst(instruction)}`;
    }

    if (!phrase || !voiceGuidanceEnabled) return;
    speakGuidance(phrase, spokenLang);
  }, [active, route, nextManeuver, distanceToNextManeuverM, maneuverIndex, spokenLang, voiceGuidanceEnabled]);

  /**
   * Distance et duree restantes, calculees a partir de la progression reelle sur le trace.
   * La duree combine le temps restant sur la manoeuvre en cours (au prorata de ce qui en
   * reste) et le temps de toutes les suivantes : l'heure d'arrivee descend donc en continu.
   */
  const remaining = useMemo(() => {
    if (!route) return null;
    // Longueur mesuree sur le trace, et non le total renvoye par Valhalla : `traveledM` et
    // `startM` sont calcules sur cette meme geometrie, et melanger les deux sources ferait
    // terminer le decompte a quelques dizaines de metres de zero.
    const total = route.cumulativeM[route.cumulativeM.length - 1] ?? route.distanceM;
    const distanceM = Math.max(0, total - traveledM);

    const current = route.maneuvers[maneuverIndex];
    let durationS = 0;
    for (let i = maneuverIndex + 1; i < route.maneuvers.length; i++) {
      durationS += route.maneuvers[i]!.durationS;
    }
    if (current) {
      const start = current.startM;
      const end = route.maneuvers[maneuverIndex + 1]?.startM ?? total;
      const span = end - start;
      const done = span > 0 ? clamp((traveledM - start) / span, 0, 1) : 1;
      durationS += current.durationS * (1 - done);
    }
    return { distanceM, durationS };
  }, [route, maneuverIndex, traveledM]);

  return {
    route,
    maneuverIndex,
    currentManeuver,
    nextManeuver,
    followingManeuver,
    distanceToNextManeuverM,
    remaining,
    progress,
    recalculating,
    error,
  };
}
