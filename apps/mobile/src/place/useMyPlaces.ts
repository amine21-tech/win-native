import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Place } from '../shared';

/**
 * Les lieux enregistres par CET appareil.
 *
 * Le serveur garde l'appareil createur dans `created_by` : c'est lui qui fait foi, et non une
 * liste locale, qui serait perdue a la reinstallation et qui n'autoriserait rien du cote
 * serveur. La meme requete sert deux usages — la section « Mes enregistrements » du profil, et
 * la reconnaissance de l'auteur dans la fiche d'un lieu, pour lui ouvrir « Modifier » et
 * « Supprimer ».
 */
export function useMyPlaces(enabled = true) {
  return useQuery({
    queryKey: ['places', 'mine'],
    queryFn: () => api<{ items: Place[] }>('/places/mine'),
    enabled,
    staleTime: 60_000,
  });
}

/** Identifiants des lieux de cet appareil, pour un test immediat dans la fiche. */
export function useMyPlaceIds(): Set<string> {
  const { data } = useMyPlaces();
  return new Set((data?.items ?? []).map((p) => p.id));
}

/** A appeler apres toute creation, correction ou suppression d'un lieu. */
export function useRefreshMyPlaces(): () => void {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ['places', 'mine'] });
}
