import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { storage, StorageKeys } from '../store/storage';

/**
 * Cet appareil est-il reconnu comme contributeur ?
 *
 * ATTENTION A CE QUE CE CROCHET NE DIT PLUS. Il commandait autrefois deux droits : enregistrer
 * un lieu, puis corriger et retirer celui d'un autre. Le client a ouvert les deux, a deux mois
 * d'intervalle — l'enregistrement le 15 octobre 2026, la correction et le retrait le 19. Plus
 * aucun geste de la carte n'en depend.
 *
 * Ce qu'il reste : un STATUT, affiche dans le profil avec le nombre de lieux enregistres et le
 * score. Le code remis par l'equipe sert a le revendiquer. C'est une reconnaissance, pas une
 * permission — et il ne faut pas le remettre a garder une porte sans y repenser.
 *
 * La reponse est gardee localement pour que le profil soit juste des le premier rendu, avant
 * meme que le reseau ne reponde.
 */
export function useContributor(): { isContributor: boolean; refresh: () => void } {
  const connuLocalement = storage.getString(StorageKeys.contributor) === '1';

  const { data } = useQuery({
    queryKey: ['contributor'],
    queryFn: async () => {
      const r = await api<{ isContributor: boolean }>('/places/contributor');
      storage.set(StorageKeys.contributor, r.isContributor ? '1' : '0');
      return r.isContributor;
    },
    // Le droit change rarement : une verification par heure suffit, et l'application reste
    // utilisable hors ligne avec la derniere reponse connue.
    staleTime: 60 * 60 * 1000,
    initialData: connuLocalement,
  });

  const client = useQueryClient();
  return {
    isContributor: data === true,
    refresh: () => void client.invalidateQueries({ queryKey: ['contributor'] }),
  };
}

/** Presente le code et, s'il est juste, ouvre le droit pour cet appareil. */
export async function claimContributor(code: string): Promise<void> {
  await api('/places/contributor-check', { method: 'POST', body: { code } });
  storage.set(StorageKeys.contributor, '1');
}
