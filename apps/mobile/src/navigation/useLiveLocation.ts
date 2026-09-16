import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haversine } from '../shared';

/**
 * Position mesuree puis lissee : ce que le reste de l'application considere comme
 * « ou l'on est ». Une mesure GPS brute n'est jamais utilisee telle quelle — elle
 * tremble de quelques metres a l'arret et saute a la reprise de signal.
 */
export type LiveFix = {
  lat: number;
  lon: number;
  /** Cap au sol en degres (0 = Nord, sens horaire). `null` a l'arret : le GPS renvoie
   * alors un cap aleatoire, et faire pivoter la carte dessus donne le tournis. */
  heading: number | null;
  /** Vitesse au sol en m/s, jamais negative. */
  speedMps: number;
  accuracyM: number;
  /** Horodatage de la mesure. */
  at: number;
};

export type FixListener = (fix: LiveFix) => void;

/* ------------------------------------------------------------------------- */
/* Reglages                                                                   */
/* ------------------------------------------------------------------------- */

/** Au repos, une mesure toutes les 3 s / 15 m suffit a garder le point bleu juste,
 * et menage la batterie. */
const IDLE_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 15,
  timeInterval: 3000,
};

/** En navigation on demande le maximum : 1 Hz, sans filtre de distance. C'est la
 * cadence que le materiel Android sait tenir, et c'est elle qui permet d'interpoler
 * un mouvement continu entre deux mesures. Avec l'ancien reglage (15 m / 3 s), a
 * 90 km/h la voiture parcourait 75 m entre deux points : la carte avancait par sauts. */
const NAV_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 0,
  timeInterval: 1000,
};

/** Cadence de republication dans l'etat React. Le rendu React est VOLONTAIREMENT
 * cadence : l'affichage fluide passe par `subscribe()`, qui ne declenche aucun rendu. */
const REACT_MIN_INTERVAL_MS = { nav: 1000, idle: 3000 };
const REACT_MIN_MOVE_M = { nav: 4, idle: 12 };

/** Au-dela, le point precedent n'a plus rien a voir avec le nouveau (sortie de tunnel,
 * reprise de signal, saut du fournisseur reseau) : on se replace d'un coup, au lieu de
 * glisser lentement a travers la ville. */
const TELEPORT_M = 120;
const STALE_MS = 6000;

/**
 * Seuils de l'immobilite.
 *
 * A l'arret, le recepteur continue d'annoncer des positions qui varient de quelques metres :
 * c'est son bruit propre, pas un deplacement. Tant que la vitesse mesuree est negligeable et
 * que le nouveau point reste dans la marge d'erreur annoncee, on garde la position
 * precedente. Le plancher de 6 m evite qu'un GPS trop optimiste sur sa precision (2-3 m
 * annonces en ville, jamais tenus) ne laisse passer le tremblement malgre tout.
 */
const STILL_SPEED_MPS = 0.7;
const STILL_RADIUS_MIN_M = 6;

/** En dessous, le cap GPS est du bruit pur (telephone pose, feu rouge). */
const HEADING_MIN_SPEED_MPS = 1.4;

/** Constante de temps du rattrapage visuel, en secondes. Plus elle est grande, plus le
 * mouvement est doux — et plus il retarde sur la mesure. 0,22 s : imperceptible en
 * ligne droite, sans depassement dans un rond-point. */
const SMOOTH_TAU_S = 0.22;

/** Au-dela, on cesse d'extrapoler : mieux vaut un point immobile qu'un point invente
 * qui continue tout droit alors que la voiture est arretee depuis trois secondes. */
const MAX_DEAD_RECKONING_S = 2.5;

/* ------------------------------------------------------------------------- */
/* Geometrie                                                                  */
/* ------------------------------------------------------------------------- */

const EARTH_RADIUS_M = 6_371_008.8;

/** Point atteint en avancant de `distanceM` depuis (lat, lon) selon `headingDeg`. */
function projectForward(
  lat: number,
  lon: number,
  headingDeg: number,
  distanceM: number,
): { lat: number; lon: number } {
  if (distanceM <= 0) return { lat, lon };
  const rad = (headingDeg * Math.PI) / 180;
  const dLat = ((distanceM * Math.cos(rad)) / EARTH_RADIUS_M) * (180 / Math.PI);
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLon =
    Math.abs(cos) < 1e-6
      ? 0
      : ((distanceM * Math.sin(rad)) / (EARTH_RADIUS_M * cos)) * (180 / Math.PI);
  return { lat: lat + dLat, lon: lon + dLon };
}

/** Interpolation d'angles par le plus court chemin : de 350 deg vers 10 deg on passe
 * par 0, jamais par 180. Sans cela, la carte fait un tour complet sur elle-meme a
 * chaque passage au Nord. */
function smoothAngle(current: number, target: number, k: number): number {
  const delta = ((target - current + 540) % 360) - 180;
  return (current + delta * k + 360) % 360;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Lissage d'une mesure brute par rapport a la precedente (equivalent de `smoothGps`
 * en v83). Un point precis est presque pris tel quel ; un point flou ne tire la
 * position que d'un cinquieme.
 */
function blendFix(prev: LiveFix | null, raw: LiveFix): LiveFix {
  if (!prev) return raw;
  const jumped = haversine(prev.lat, prev.lon, raw.lat, raw.lon) > TELEPORT_M;
  if (jumped || raw.at - prev.at > STALE_MS) return raw;

  // Immobile : on ne bouge pas du tout. Un lissage, meme fort, laisse toujours deriver le
  // point ; seul un arret franc le cloue sur place. La precision et l'horodatage, eux, sont
  // mis a jour — c'est bien la meme position, mesuree a nouveau.
  const stillRadius = Math.max(raw.accuracyM, STILL_RADIUS_MIN_M);
  if (raw.speedMps < STILL_SPEED_MPS && haversine(prev.lat, prev.lon, raw.lat, raw.lon) < stillRadius) {
    return { ...prev, speedMps: 0, accuracyM: raw.accuracyM, at: raw.at };
  }

  const w = clamp(14 / (14 + raw.accuracyM), 0.2, 0.9);
  const speedMps = prev.speedMps + (raw.speedMps - prev.speedMps) * 0.45;

  // Le cap n'est mis a jour qu'en mouvement, et lui aussi progressivement : a l'arret
  // il reste fige sur la derniere direction reellement suivie.
  const rawHeading = raw.heading;
  const moving = raw.speedMps >= HEADING_MIN_SPEED_MPS && rawHeading != null;
  const heading = moving
    ? prev.heading == null
      ? rawHeading
      : smoothAngle(prev.heading, rawHeading, 0.5)
    : prev.heading;

  return {
    lat: prev.lat + (raw.lat - prev.lat) * w,
    lon: prev.lon + (raw.lon - prev.lon) * w,
    heading,
    speedMps,
    accuracyM: raw.accuracyM,
    at: raw.at,
  };
}

/* ------------------------------------------------------------------------- */

/**
 * Source unique de position pour toute l'application.
 *
 * Elle expose deux flux volontairement distincts :
 *
 * - `position`, un etat React **cadence** (1 Hz en navigation, 3 s au repos) : il
 *   alimente ce qui doit raisonner sur la position — avancement des manoeuvres,
 *   requetes de signalements, alertes de proximite. Ces traitements n'ont aucun besoin
 *   de tourner soixante fois par seconde, et chaque changement d'etat re-rend l'ecran.
 * - `subscribe()`, un flux **interpole a la cadence de l'ecran**, qui ne passe jamais
 *   par React : il alimente la camera et le compteur de vitesse. Entre deux mesures GPS,
 *   la position affichee est prolongee selon le cap et la vitesse (« navigation a
 *   l'estime »), puis ramenee en douceur sur la mesure suivante des qu'elle arrive.
 *
 * C'est cette separation qui rend la carte fluide : le mouvement est continu a l'ecran,
 * alors que l'application ne se re-rend qu'une fois par seconde.
 */
export function useLiveLocation(navigating: boolean) {
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  /** Derniere mesure lissee — la verite, sans extrapolation. */
  const fixRef = useRef<LiveFix | null>(null);
  /** Position effectivement affichee, qui rattrape `fixRef` image par image. */
  const displayRef = useRef<LiveFix | null>(null);
  const listenersRef = useRef<Set<FixListener>>(new Set());
  const lastPublishRef = useRef({ at: 0, lat: 0, lon: 0 });
  const navigatingRef = useRef(navigating);
  navigatingRef.current = navigating;

  const subscribe = useCallback((listener: FixListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getFix = useCallback(() => fixRef.current, []);

  /** Diffusion aux abonnes. Chaque abonne est isole : un abonne qui echoue (typiquement la
   * camera, tant que la carte native n'est pas initialisee) ne doit ni priver les autres de
   * la mesure, ni faire remonter l'exception jusqu'a la boucle d'animation — celle-ci
   * s'arreterait alors definitivement, et le mouvement se figerait pour toute la session. */
  const emit = useCallback((fix: LiveFix) => {
    for (const listener of listenersRef.current) {
      try {
        listener(fix);
      } catch {
        /* un abonne defaillant ne bloque pas les autres */
      }
    }
  }, []);

  /* --------------------- abonnement GPS --------------------- */

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      if (cancelled) return;

      const sub = await Location.watchPositionAsync(
        navigating ? NAV_OPTIONS : IDLE_OPTIONS,
        (location) => {
          const c = location.coords;
          const raw: LiveFix = {
            lat: c.latitude,
            lon: c.longitude,
            heading: c.heading != null && c.heading >= 0 ? c.heading : null,
            speedMps: c.speed != null && c.speed > 0 ? c.speed : 0,
            accuracyM: c.accuracy != null && c.accuracy > 0 ? c.accuracy : 25,
            // Heure de RECEPTION, pas `location.timestamp` : ce dernier vient de l'horloge du
            // recepteur GPS, qui n'est pas toujours alignee sur celle du telephone. L'ecart,
            // meme d'une seconde, fausserait directement l'extrapolation ci-dessous — on
            // projetterait la voiture 25 m trop loin en permanence.
            at: Date.now(),
          };

          const smoothed = blendFix(fixRef.current, raw);
          fixRef.current = smoothed;

          // Saut franc : la position affichee se replace immediatement, sans glisser.
          const display = displayRef.current;
          if (
            !display ||
            haversine(display.lat, display.lon, smoothed.lat, smoothed.lon) > TELEPORT_M
          ) {
            displayRef.current = { ...smoothed };
          }

          // Republication cadencee vers React.
          const key = navigatingRef.current ? 'nav' : 'idle';
          const last = lastPublishRef.current;
          const moved =
            last.at === 0 ? Infinity : haversine(last.lat, last.lon, smoothed.lat, smoothed.lon);
          const elapsed = smoothed.at - last.at;
          if (moved >= REACT_MIN_MOVE_M[key] || elapsed >= REACT_MIN_INTERVAL_MS[key]) {
            lastPublishRef.current = { at: smoothed.at, lat: smoothed.lat, lon: smoothed.lon };
            setPosition({ lat: smoothed.lat, lon: smoothed.lon });
          }

          // Hors navigation aucune boucle d'animation ne tourne : on previent quand meme
          // les abonnes, a la cadence des mesures.
          if (!navigatingRef.current) emit(smoothed);
        },
      );
      if (cancelled) {
        sub.remove();
        return;
      }
      subscription = sub;
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [navigating]);

  /* --------------------- interpolation image par image --------------------- */

  useEffect(() => {
    if (!navigating) return;
    let raf = 0;
    let lastFrameAt = Date.now();

    const frame = () => {
      const now = Date.now();
      const fix = fixRef.current;
      if (fix) {
        const display = displayRef.current ?? { ...fix };

        // Cible : la derniere mesure, prolongee du chemin parcouru depuis qu'elle a ete
        // prise. Sans cette avance, la position affichee traine systematiquement d'une
        // seconde derriere la voiture — soit 25 m sur autoroute.
        const aheadS = Math.min((now - fix.at) / 1000, MAX_DEAD_RECKONING_S);
        const target =
          fix.heading != null && fix.speedMps > HEADING_MIN_SPEED_MPS
            ? projectForward(fix.lat, fix.lon, fix.heading, fix.speedMps * aheadS)
            : { lat: fix.lat, lon: fix.lon };

        // Rattrapage exponentiel independant de la cadence d'affichage : le mouvement est
        // identique a 60 Hz et a 120 Hz, et une image perdue ne provoque pas d'a-coup.
        const dt = Math.min((now - lastFrameAt) / 1000, 0.1);
        const k = 1 - Math.exp(-dt / SMOOTH_TAU_S);

        display.lat += (target.lat - display.lat) * k;
        display.lon += (target.lon - display.lon) * k;
        if (fix.heading != null) {
          display.heading =
            display.heading == null ? fix.heading : smoothAngle(display.heading, fix.heading, k);
        }
        display.speedMps = fix.speedMps;
        display.accuracyM = fix.accuracyM;
        display.at = now;
        displayRef.current = display;

        emit(display);
      }
      lastFrameAt = now;
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [navigating]);

  return { position, permissionDenied, subscribe, getFix };
}
