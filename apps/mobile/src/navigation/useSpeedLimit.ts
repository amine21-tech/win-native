import { useEffect, useRef, useState } from 'react';
import type { MapRef } from '@maplibre/maplibre-react-native';
import { api } from '../api/client';
import { haversine } from '../shared';

/**
 * Limite de vitesse reglementaire du troncon en cours (v79 #7 du site).
 *
 * D'ou vient le chiffre, dans cet ordre :
 *   1. la limite REELLE des panneaux, quand OpenStreetMap la connait : le serveur la lit dans
 *      les tuiles Valhalla (GET /routing/speed-limit). Interrogee au plus une fois toutes les
 *      vingt secondes, et seulement apres 250 m parcourus — sans ces deux garde-fous, ce serait
 *      une requete par releve GPS ;
 *   2. a defaut, le TYPE de route lu dans les tuiles vectorielles deja affichees a l'ecran.
 *      Aucune requete, aucune batterie consommee, et c'est ce que font les cartes courantes sur
 *      les troncons non renseignes.
 *
 * Ce que l'on NE fait pas : deviner. Si le type de route n'est pas reconnu, la pastille reste
 * masquee. Une limite fausse est pire que pas de limite du tout — le conducteur s'y fierait.
 *
 * Les valeurs sont celles du code de la route algerien, reprises telles quelles de la version
 * web (LIMITES_DZ). Les limites « chaussee humide » (40 / 80 / 100) y figurent mais ne sont pas
 * appliquees : l'application n'a aucune source meteo, et supposer la pluie afficherait une
 * limite erronee la plupart du temps.
 */
const LIMITS: Record<string, number> = {
  motorway: 120,
  trunk: 100,
  primary: 100,
  secondary: 100,
  tertiary: 80,
  unclassified: 80,
  residential: 50,
  living_street: 20,
  service: 30,
};

/** Du plus rapide au plus lent. Sur un echangeur, plusieurs routes se superposent a l'ecran :
 * en voiture, on est presque toujours sur la plus importante. */
const BY_IMPORTANCE = Object.keys(LIMITS);

/** Couches de tuiles qui portent les routes, selon les styles (OpenMapTiles, autres). */
const ROAD_LAYERS = new Set(['transportation', 'road', 'roads']);

/** Fenetre de lecture autour du vehicule, en points d'ecran. */
const PROBE_RADIUS = 22;
/** Cadence de lecture. Plus court n'apporterait rien : le type de route change rarement. */
const INTERVAL_MS = 3000;
/** Garde-fous de l'interrogation du serveur, repris de la version web. */
const SERVER_MIN_INTERVAL_MS = 20_000;
const SERVER_MIN_MOVE_M = 250;

type Props = {
  active: boolean;
  mapRef: React.RefObject<MapRef | null>;
  /** Position du vehicule a l'ecran, en points : [x, y]. */
  vehiclePoint: () => [number, number];
  /** Position geographique courante, pour interroger le serveur. */
  here: { lat: number; lon: number } | null;
};

export function useSpeedLimit({ active, mapRef, vehiclePoint, here }: Props): number | null {
  const [limit, setLimit] = useState<number | null>(null);
  const pointRef = useRef(vehiclePoint);
  pointRef.current = vehiclePoint;
  const hereRef = useRef(here);
  hereRef.current = here;
  /** Derniere limite obtenue du serveur, et conditions de la prochaine demande. */
  const posted = useRef<{ at: number; lat: number; lon: number } | null>(null);
  const fromServer = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setLimit(null);
      fromServer.current = null;
      posted.current = null;
      return;
    }
    let cancelled = false;

    /** Limite reelle, demandee au serveur avec parcimonie. */
    const askServer = async () => {
      const position = hereRef.current;
      if (!position) return;
      const last = posted.current;
      const now = Date.now();
      if (
        last &&
        (now - last.at < SERVER_MIN_INTERVAL_MS ||
          haversine(last.lat, last.lon, position.lat, position.lon) < SERVER_MIN_MOVE_M)
      ) {
        return;
      }
      posted.current = { at: now, lat: position.lat, lon: position.lon };
      try {
        const { limitKmh } = await api<{ limitKmh: number | null }>('/routing/speed-limit', {
          query: { lat: position.lat, lon: position.lon },
        });
        if (!cancelled) fromServer.current = limitKmh;
      } catch {
        // Reseau absent : on garde la deduction par type de route.
      }
    };

    const read = async () => {
      void askServer();
      try {
        const [x, y] = pointRef.current();
        const box: [[number, number], [number, number]] = [
          [x - PROBE_RADIUS, y - PROBE_RADIUS],
          [x + PROBE_RADIUS, y + PROBE_RADIUS],
        ];
        const features = await mapRef.current?.queryRenderedFeatures(box);
        if (cancelled) return;

        let best: string | null = null;
        let bestRank = Number.MAX_SAFE_INTEGER;
        for (const feature of features ?? []) {
          const properties = (feature.properties ?? {}) as Record<string, unknown>;
          const layer = String(
            (feature as { sourceLayer?: string }).sourceLayer ?? properties['sourceLayer'] ?? '',
          ).toLowerCase();
          if (!ROAD_LAYERS.has(layer)) continue;
          // Les tuiles nomment les bretelles « motorway_link », « primary_link »… : meme limite
          // que la route qu'elles rejoignent.
          const cls = String(properties['class'] ?? properties['highway'] ?? properties['subclass'] ?? '')
            .toLowerCase()
            .replace(/_link$/, '');
          const rank = BY_IMPORTANCE.indexOf(cls);
          if (rank >= 0 && rank < bestRank) {
            bestRank = rank;
            best = cls;
          }
        }
        // La valeur des panneaux prime toujours sur la deduction.
        setLimit(fromServer.current ?? (best ? (LIMITS[best] ?? null) : null));
      } catch {
        // Carte pas encore prete, ou lecture impossible : on garde la valeur precedente plutot
        // que de faire clignoter la pastille.
      }
    };

    void read();
    const timer = setInterval(() => void read(), INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, mapRef]);

  return limit;
}
