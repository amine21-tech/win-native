import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../api/client';

export type UnlockStatus = 'none' | 'pending' | 'paid';

export type UnlockInfo = {
  TN: UnlockStatus;
  priceDa: number;
  payout: { type: string; accountNumber: string; holderName: string } | null;
};

/**
 * Etat du deblocage de la Tunisie pour cet appareil.
 *
 * Tant qu'une demande est « en attente », l'etat est redemande toutes les 30 secondes : des que
 * l'administrateur valide le paiement, l'acces s'ouvre sans que le client ait a relancer quoi
 * que ce soit. Une fois « paye », plus aucune requete inutile.
 */
export function useTunisiaUnlock() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['unlocks'],
    queryFn: () => api<UnlockInfo>('/unlocks'),
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.TN === 'pending' ? 30_000 : false),
  });

  const requestUnlock = useCallback(
    async (phone: string) => {
      const res = await api<{ TN: UnlockStatus }>('/unlocks/TN/request', { method: 'POST', body: { phone } });
      await queryClient.invalidateQueries({ queryKey: ['unlocks'] });
      return res.TN;
    },
    [queryClient],
  );

  return {
    info: query.data ?? null,
    loading: query.isLoading,
    /** Faux tant que l'etat n'est pas connu : on ne debloque jamais par defaut. */
    unlocked: query.data?.TN === 'paid',
    refresh: () => query.refetch(),
    requestUnlock,
  };
}
