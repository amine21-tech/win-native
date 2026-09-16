import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, type RefObject } from 'react';
import type { FixListener, LiveFix } from './useLiveLocation';

/** Cadence maximale d'ordres envoyes a la carte. La position, elle, est recalculee a
 * chaque image ; inutile d'en pousser autant vers le moteur natif : 30 fois par seconde
 * est deja au-dela de ce que l'oeil distingue sur un deplacement de carte, et cela
 * divise par deux le trafic vers le module natif. */
const MIN_INTERVAL_MS = 33;

/** En dessous, l'ordre serait invisible : on ne l'envoie pas. Sert surtout a l'arret,
 * ou le point ne bouge plus mais ou la boucle d'animation continue de tourner. */
const MIN_MOVE_DEG = 0.0000025; // ~0,3 m
const MIN_TURN_DEG = 0.25;

/** Constante de temps du lissage de l'orientation, en secondes. Quand la camera suit la
 * route, son cap change d'un coup a chaque sommet du trace : sans lissage, la carte
 * pivoterait par a-coups a chaque coude. */
const BEARING_TAU_S = 0.35;

/** Point cale sur la route, avec la direction de la route a cet endroit. */
export type SnappedPoint = { lat: number; lon: number; bearing: number };

type Params = {
  cameraRef: RefObject<CameraRef | null>;
  subscribe: (listener: FixListener) => () => void;
  /** Vrai quand la camera doit suivre le conducteur : navigation en cours ET suivi non
   * interrompu (vue d'ensemble fermee). */
  active: boolean;
  zoom: number;
  pitch: number;
  /** Marges de la camera, en points. La haute place le vehicule dans le bas de l'ecran pour
   * degager la route devant lui (equivalent de `centerWithOffset` en v83) ; la gauche, en
   * paysage, le decale a droite de la colonne de consignes, dans la carte visible. */
  padding: { top: number; left: number };
  /**
   * Calage sur l'itineraire. Renvoie le point de la route le plus proche de la position,
   * ou `null` quand on s'en est vraiment eloigne. Tant qu'on est sur la route, c'est ce
   * point que la camera vise — exactement comme sur les cartes de navigation courantes,
   * ou le vehicule reste sur la ligne meme quand le GPS derive de quelques metres.
   */
  snap?: (fix: LiveFix) => SnappedPoint | null;
};

const shortestDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

/**
 * Pilote la camera image par image depuis le flux interpole de `useLiveLocation`.
 *
 * La camera et le marqueur du vehicule doivent viser LE MEME point. Auparavant, la camera
 * suivait la position lissee et anticipee, tandis que le point bleu de MapLibre etait
 * dessine a la position GPS brute : les deux divergeaient, et comme aucun n'etait cale sur
 * la route, le point apparaissait decale, a cote du trace. Desormais l'ecran de navigation
 * dessine un marqueur fixe au point focal de la camera (voir app/index.tsx), et la camera
 * vise le point de la route : le vehicule est donc, par construction, sur la ligne.
 */
export function useSmoothCamera({
  cameraRef,
  subscribe,
  active,
  zoom,
  pitch,
  padding,
  snap,
}: Params) {
  const lastAppliedRef = useRef({ at: 0, lat: 0, lon: 0, heading: 0 });
  // Refs plutot que dependances : ces valeurs changent au fil des rendus, et re-souscrire
  // au flux a chaque fois recreerait l'abonnement soixante fois par seconde.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const paddingRef = useRef(padding);
  paddingRef.current = padding;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    if (!active) return;

    // Entree en navigation : une seule transition animee vers la vue conduite, puis on
    // prend la main. Sans elle, la camera sauterait d'un coup en vue inclinee.
    let entered = false;
    let displayBearing: number | null = null;

    const onFix = (fix: LiveFix) => {
      const camera = cameraRef.current;
      if (!camera) return;

      const now = Date.now();
      const last = lastAppliedRef.current;
      if (entered && now - last.at < MIN_INTERVAL_MS) return;

      // Le calage se fait APRES le filtrage de cadence : il projette la position sur le
      // trace, et le faire 60 fois par seconde pour n'en envoyer que 30 serait du gaspillage.
      const snapped = snapRef.current?.(fix) ?? null;
      const lat = snapped ? snapped.lat : fix.lat;
      const lon = snapped ? snapped.lon : fix.lon;
      // Sur la route, on suit la direction de la ROUTE plutot que le cap GPS : celui-ci
      // tremble de quelques degres meme en ligne droite, celle-la ne bouge pas.
      const targetBearing = snapped ? snapped.bearing : (fix.heading ?? last.heading);

      if (displayBearing == null) {
        displayBearing = targetBearing;
      } else {
        const dt = Math.min((now - last.at) / 1000, 0.25);
        const k = 1 - Math.exp(-dt / BEARING_TAU_S);
        displayBearing = (displayBearing + shortestDelta(displayBearing, targetBearing) * k + 360) % 360;
      }
      const heading = displayBearing;

      // Tant que la carte native n'est pas initialisee, la commande leve une exception.
      // Elle est rattrapee ici et nulle part ailleurs : cet appel a lieu dans la boucle
      // d'animation de useLiveLocation, et une exception qui remonterait jusqu'a elle
      // arreterait le mouvement pour le reste de la session.
      try {
        if (!entered) {
          entered = true;
          lastAppliedRef.current = { at: now, lat, lon, heading };
          camera.easeTo({
            center: [lon, lat],
            zoom: zoomRef.current,
            pitch: pitchRef.current,
            bearing: heading,
            padding: { top: paddingRef.current.top, left: paddingRef.current.left },
            duration: 600,
          });
          return;
        }

        const still =
          Math.abs(lat - last.lat) < MIN_MOVE_DEG &&
          Math.abs(lon - last.lon) < MIN_MOVE_DEG &&
          Math.abs(shortestDelta(last.heading, heading)) < MIN_TURN_DEG;
        if (still) return;

        lastAppliedRef.current = { at: now, lat, lon, heading };
        camera.jumpTo({
          center: [lon, lat],
          zoom: zoomRef.current,
          pitch: pitchRef.current,
          bearing: heading,
          padding: { top: paddingRef.current.top, left: paddingRef.current.left },
        });
      } catch {
        // Carte pas encore prete : on retentera a l'image suivante. Le drapeau `entered`
        // est remis a faux pour que la transition d'entree ait bien lieu, une fois.
        entered = false;
      }
    };

    const unsubscribe = subscribe(onFix);
    return () => {
      unsubscribe();
      lastAppliedRef.current = { at: 0, lat: 0, lon: 0, heading: lastAppliedRef.current.heading };
    };
  }, [active, subscribe, cameraRef]);
}
