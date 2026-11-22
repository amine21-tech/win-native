import { OfflineManager, type OfflinePack } from '@maplibre/maplibre-react-native';
import * as Network from 'expo-network';
import { useEffect } from 'react';
import {
  BORNES_DZ_TN,
  PAQUET_ETIQUETTE,
  ZOOM_MAX,
  ZOOM_MIN,
  doitTelecharger,
  limiteTuiles,
  type EtatPaquet,
} from './horsLigne';

/**
 * LE DECLENCHEMENT DU TELECHARGEMENT HORS LIGNE — point I du correctif v2.
 *
 *   « 0 bouton, 0 action utilisateur. NE PAS MODIFIER l'interface existante. »
 *
 * C'est litteralement ce que ce fichier fait : il n'affiche rien, ne rend rien, n'ajoute aucune
 * vue. Il est appele une fois par l'ecran de la carte et, s'il se trouve que le telephone est en
 * Wi-Fi, il demande a MapLibre de garder le pays. Les regles — faut-il telecharger, jusqu'ou,
 * combien de tuiles — sont dans horsLigne.ts, qui s'eprouve sans telephone.
 *
 * LA BASCULE N'A PAS DE CODE, ET C'EST LA BONNE NOUVELLE DU POINT I. Le client demande une
 * « bascule automatique quand le reseau tombe » ; elle existe deja, dans MapLibre : une tuile
 * presente dans la base hors ligne est servie depuis le telephone, et c'est tout. Ecrire un
 * aiguillage « si hors ligne, alors... » n'ajouterait qu'un endroit ou se tromper — et ferait
 * exactement ce que le document interdit : modifier l'interface existante.
 *
 * TOUT ECHEC EST AVALE EN SILENCE, et c'est voulu. L'utilisateur n'a rien demande ; s'il n'y a
 * plus de place sur le telephone, si le serveur de tuiles refuse, si le module natif manque
 * parce que l'APK est plus vieux que ce code, l'application continue exactement comme avant.
 * Une alerte « telechargement hors ligne impossible » serait un bouton de plus a comprendre
 * pour une fonction dont il ignore l'existence.
 */
export function useTuilesHorsLigne(styleUrl: string): void {
  useEffect(() => {
    let annule = false;

    /** Notre paquet parmi ceux de la base, reconnu a son etiquette. */
    const trouverPaquet = async (): Promise<OfflinePack | null> => {
      const paquets = await OfflineManager.getPacks();
      return paquets.find((p) => p.metadata?.etiquette === PAQUET_ETIQUETTE) ?? null;
    };

    const etatDu = async (paquet: OfflinePack | null): Promise<EtatPaquet> => {
      if (!paquet) return 'absent';
      try {
        const etat = await paquet.status();
        return etat.state === 'complete' || etat.percentage >= 100 ? 'complet' : 'partiel';
      } catch {
        /* Un paquet dont on ne peut pas lire l'etat est traite comme partiel : le reprendre ne
         * coute rien s'il est deja complet, MapLibre ne retelecharge pas ce qu'il possede. */
        return 'partiel';
      }
    };

    /* RIEN N'EST AFFICHE DE LA PROGRESSION, mais les deux ecouteurs sont OBLIGATOIRES :
     * `createPack` les exige. On s'en sert pour une seule chose utile — detacher l'ecouteur
     * quand le paquet est complet, sans quoi il reste accroche pour la vie de l'application. */
    const surProgression = (paquet: OfflinePack, etat: { state: string }) => {
      if (etat.state === 'complete') OfflineManager.removeListener(paquet.id);
    };
    const surErreur = (paquet: OfflinePack) => {
      OfflineManager.removeListener(paquet.id);
    };

    void (async () => {
      try {
        const reseau = await Network.getNetworkStateAsync();
        /* `isInternetReachable` vaut `undefined` sur certains Android : on ne prend pour un
         * refus que le `false` explicite. Un Wi-Fi d'hotel sans sortie, lui, repond bien
         * `false`, et c'est le cas qu'on veut ecarter — telecharger deux cents megaoctets qui
         * n'arriveront jamais userait la batterie pour rien. */
        const etatReseau = {
          wifi: reseau.type === Network.NetworkStateType.WIFI,
          joignable: reseau.isInternetReachable !== false,
        };
        const existant = await trouverPaquet();
        const etatPaquet = await etatDu(existant);
        if (annule || !doitTelecharger(etatReseau, etatPaquet)) return;

        /* LA LIMITE AVANT LA DEMANDE : elle se calcule a partir du zoom, de sorte qu'un
         * plafond releve un jour ne se heurte pas aux six mille tuiles par defaut de MapLibre
         * (voir limiteTuiles). */
        OfflineManager.setTileCountLimit(limiteTuiles());
        /* Un evenement toutes les dix secondes : personne ne les regarde, et le defaut de cinq
         * cents millisecondes ferait traverser le pont React Native quarante mille fois pendant
         * que l'utilisateur cherche son chemin. */
        OfflineManager.setProgressEventThrottle(10_000);

        if (existant) {
          await existant.resume();
          return;
        }
        await OfflineManager.createPack(
          {
            mapStyle: styleUrl,
            /* La copie n'est pas un caprice du compilateur : `BORNES_DZ_TN` est `readonly`
             * pour que personne ne modifie les bornes du pays au detour d'un appel, et
             * MapLibre, lui, demande un tableau ordinaire. On lui en donne un, le sien. */
            bounds: [...BORNES_DZ_TN],
            minZoom: ZOOM_MIN,
            maxZoom: ZOOM_MAX,
            metadata: { etiquette: PAQUET_ETIQUETTE },
          },
          surProgression,
          surErreur,
        );
      } catch {
        /* Silence : voir l'en-tete. */
      }
    })();

    return () => {
      annule = true;
    };
    /* LE STYLE EST LA SEULE DEPENDANCE, et il ne change qu'entre le jour et la nuit. Les deux
     * styles d'OpenFreeMap partagent LA MEME SOURCE DE TUILES : le paquet telecharge pour l'un
     * sert a l'autre, et la seconde execution trouve le paquet complet et ne fait rien. */
  }, [styleUrl]);
}
