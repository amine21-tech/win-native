import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api/client';
import { boundingBox, type Place } from '../shared';
import { emojiForPlace } from './placeIcons';

/** Rayon charge autour du conducteur. Trois kilometres couvrent largement ce qui est visible
 * au zoom ou la couche apparait, sans ramener une ville entiere. */
const RADIUS_M = 3_000;

/**
 * Lieux WIN affiches en fond de carte, sans recherche prealable (`loadPOIs` en v83).
 *
 * La requete est indexee sur la position ARRONDIE au centieme de degre, soit environ un
 * kilometre : sans cet arrondi, chaque mesure GPS — une par seconde en navigation —
 * declencherait un appel reseau. On ne recharge donc qu'apres avoir reellement change de
 * quartier, et le resultat precedent reste affiche entre-temps.
 */
export function usePoiLayer(position: { lat: number; lon: number } | null, enabled: boolean) {
  const key = position ? `${position.lat.toFixed(2)},${position.lon.toFixed(2)}` : null;

  const { data } = useQuery({
    queryKey: ['poi', key],
    enabled: enabled && position !== null,
    staleTime: 5 * 60_000,
    queryFn: () => {
      const [west, south, east, north] = boundingBox(position!.lat, position!.lon, RADIUS_M);
      return api<{ items: Place[] }>('/places/in-bounds', {
        query: { bbox: `${west},${south},${east},${north}` },
      });
    },
  });

  return useMemo<GeoJSON.FeatureCollection>(() => {
    const items = enabled ? (data?.items ?? []) : [];
    return {
      type: 'FeatureCollection',
      features: items.map((place) => ({
        type: 'Feature',
        id: place.id,
        properties: {
          id: place.id,
          name: place.enseigne || place.name,
          emoji: emojiForPlace({ category: place.category }),
          partner: place.isPartner,
        },
        geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
      })),
    };
  }, [data, enabled]);
}
