import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../api/client';

export type UnlockStatus = 'none' | 'pending' | 'paid';

/**
 * Le deblocage payant est-il actif dans cette compilation ?
 *
 * Google Play exige que tout contenu numerique vendu DANS une application passe par son propre
 * systeme de facturation, dont il prend la commission — et l'Algerie ne figure pas parmi les
 * pays ou un developpeur peut s'enregistrer comme marchand. Un paiement par virement BaridiMob
 * y est donc un motif de rejet, et de suspension en cas de recidive.
 *
 * La version publiee sur Play ouvre donc la Tunisie sans paiement. Les versions distribuees
 * directement — site web, APK remis au client — ne dependent pas de Google et gardent le
 * deblocage a 200 DA. C'est la compilation qui tranche, par `EXPO_PUBLIC_PAID_UNLOCKS=0`, et
 * non un reglage que l'on pourrait oublier de changer.
 */
export const PAID_UNLOCKS_ENABLED = process.env.EXPO_PUBLIC_PAID_UNLOCKS !== '0';

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
    /** Faux tant que l'etat n'est pas connu : on ne debloque jamais par defaut. Sauf dans une
     * compilation sans deblocage payant, ou la Tunisie est ouverte a tous. */
    unlocked: !PAID_UNLOCKS_ENABLED || query.data?.TN === 'paid',
    refresh: () => query.refetch(),
    requestUnlock,
  };
}
