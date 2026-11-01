import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { alertesAAfficher, FRAICHEUR_HORS_LIGNE_MS, type Alerte } from '../shared';
import { storage, StorageKeys } from '../store/storage';

/**
 * LES ALERTES OFFICIELLES, DEMANDEES UNE FOIS PAR OUVERTURE D'APPLICATION.
 *
 * UNE FOIS, ET PAS UNE DE PLUS. Le cahier des charges est categorique : la banniere
 * << dure 12 secondes, une seule fois a l'ouverture, puis disparait completement : plus jamais
 * pendant l'utilisation, quel que soit le service, ni pendant une navigation >>.
 *
 * C'est la contrainte qui dicte toute la forme de ce fichier. Un `useQuery` avec
 * rafraichissement, ou meme un simple `useEffect` dependant de la position, rappellerait le
 * serveur en cours de route — et une alerte activee pendant que le conducteur roule
 * surgirait au milieu d'un virage. Une vigilance meteo n'est pas une urgence a la seconde :
 * elle peut attendre la prochaine ouverture.
 *
 * LE DELAI EST BORNE A SIX SECONDES, valeur du client. Au-dela, on se rabat sur la derniere
 * reponse connue. Une banniere qui arrive apres que l'utilisateur a commence a taper une
 * adresse est une gene, pas une information.
 *
 * LE CACHE HORS LIGNE VAUT VINGT-QUATRE HEURES. Une vigilance d'hier peut encore valoir
 * aujourd'hui ; celle de la semaine derniere, non — et une alerte perimee qui s'affiche quand
 * meme ruine la confiance dans toutes les suivantes. C'est aussi pour cela que le filtrage des
 * expirees est REFAIT ici : le serveur a filtre au moment ou il a repondu, mais entre sa
 * reponse et cette lecture il peut s'etre ecoule une journee entiere.
 */

type Cache = { at: number; alertes: Alerte[] };

/** Delai maximal avant de se rabattre sur le cache. Valeur du cahier des charges. */
const DELAI_MS = 6_000;

function lireCache(): Alerte[] {
  try {
    const brut = storage.getString(StorageKeys.alertesOfficielles);
    if (!brut) return [];
    const cache = JSON.parse(brut) as Cache;
    if (!cache?.at || Date.now() - cache.at > FRAICHEUR_HORS_LIGNE_MS) return [];
    return Array.isArray(cache.alertes) ? cache.alertes : [];
  } catch {
    /* Un cache illisible n'est pas une panne : on repart de rien. */
    return [];
  }
}

function ecrireCache(alertes: Alerte[]) {
  try {
    storage.set(StorageKeys.alertesOfficielles, JSON.stringify({ at: Date.now(), alertes } satisfies Cache));
  } catch {
    /* Le stockage plein ne doit pas empecher l'affichage de ce qu'on vient de recevoir. */
  }
}

/**
 * `pret` dit quand on peut commencer a afficher : le cahier des charges demande d'attendre la
 * fin de l'ecran de consentement. Tant qu'il vaut faux, rien n'est demande au serveur — et
 * surtout rien ne s'affiche par-dessus un ecran que l'utilisateur est en train de lire.
 */
export function useAlertesOfficielles(pret: boolean): Alerte[] {
  const [alertes, setAlertes] = useState<Alerte[]>([]);

  useEffect(() => {
    if (!pret) return;
    let vivant = true;

    void (async () => {
      try {
        const reponse = await api<{ alertes: Alerte[] }>('/alertes-officielles', {
          signal: AbortSignal.timeout(DELAI_MS),
        });
        if (!vivant) return;
        const recues = Array.isArray(reponse?.alertes) ? reponse.alertes : [];
        ecrireCache(recues);
        setAlertes(alertesAAfficher(recues));
      } catch {
        /* HORS LIGNE, OU SERVEUR MUET : la derniere reponse connue, si elle a moins de
         * vingt-quatre heures. Se taire serait le pire des deux — c'est justement dans une
         * zone sans reseau qu'une route coupee se decouvre trop tard. */
        if (!vivant) return;
        setAlertes(alertesAAfficher(lireCache()));
      }
    })();

    return () => {
      vivant = false;
    };
    /* `pret` seul : ce fil ne doit jamais se relancer. Voir l'en-tete — une alerte qui
     * surgirait en cours de navigation est exactement ce que le client interdit. */
  }, [pret]);

  return alertes;
}
