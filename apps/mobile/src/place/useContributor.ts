import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { storage, StorageKeys } from '../store/storage';

/**
 * Cet appareil a-t-il le droit d'enregistrer des lieux ?
 *
 * L'enregistrement n'est pas ouvert a tous : une fiche mal nommee, mal orthographiee ou mal
 * placee reste des mois sur la carte et se voit par tout le monde. Le droit se donne a des
 * contributeurs designes, par un code que l'equipe remet.
 *
 * Le serveur fait foi — il refuse la creation a un appareil sans droit, meme si l'application
 * est modifiee. Ce crochet ne sert qu'a l'AFFICHAGE : un utilisateur ordinaire ne doit pas voir
 * apparaitre un formulaire qu'il n'a pas le droit de valider, ni meme deviner qu'il existe.
 *
 * La reponse est gardee localement pour que l'interface soit juste des le premier rendu, avant
 * meme que le reseau ne reponde : sans cela, le formulaire clignoterait a chaque ouverture chez
 * les contributeurs, et apparaitrait une fraction de seconde chez les autres.
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
