import { useQuery } from '@tanstack/react-query';
import { fetchRoute, type RouteMode } from './routing';
import type { Language } from '../shared';

type Coords = { lat: number; lon: number };

/** Apercu d'itineraire affiche dans la fiche du lieu, avant de demarrer la navigation. */
export function useRoutePreview(from: Coords | null, to: Coords | null, mode: RouteMode, lang: Language) {
  return useQuery({
    queryKey: ['route-preview', from?.lat.toFixed(3), from?.lon.toFixed(3), to?.lat, to?.lon, mode, lang],
    enabled: !!from && !!to,
    staleTime: 60_000,
    retry: 1,
    queryFn: () =>
      fetchRoute({
        from: from!,
        to: to!,
        mode,
        narrationLanguage: lang === 'en' ? 'en-US' : 'fr-FR',
        alternates: 2,
      }),
  });
}
