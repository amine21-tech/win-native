import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api/client';
import { boundingBox, type Place } from '../shared';
import { emojiForPlace, imageLieu } from './placeIcons';

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
/**
 * RAYON VIP PAR DEFAUT, si le serveur ne repond pas. Le serveur fait foi — voir /config.
 *
 * Vingt kilometres est la valeur validee par le client ; elle n'est ecrite ici que pour que
 * la carte reste utilisable quand la configuration n'a pas pu etre lue, pas comme reglage.
 */
const RAYON_VIP_DEFAUT_KM = 20;

export function usePoiLayer(position: { lat: number; lon: number } | null, enabled: boolean) {
  const key = position ? `${position.lat.toFixed(2)},${position.lon.toFixed(2)}` : null;

  /* LE RAYON VIP VIENT DU SERVEUR — point A du 18 novembre : << ce parametre DOIT etre
   * modifiable depuis le serveur sans mise a jour de l'app >>.
   *
   * Lu une fois par heure et garde : un reglage qui change deux fois par an n'a pas besoin
   * d'etre redemande a chaque deplacement. En cas d'echec, la valeur par defaut prend le
   * relais — une carte sans VIP serait pire qu'une carte avec un rayon approximatif. */
  const { data: config } = useQuery({
    queryKey: ['config'],
    staleTime: 60 * 60_000,
    queryFn: () => api<{ vipRadiusKm: number }>('/config'),
  });
  const rayonVipM = (config?.vipRadiusKm ?? RAYON_VIP_DEFAUT_KM) * 1000;

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

  /* LES PARTENAIRES VIP, SUR UN RAYON BIEN PLUS LARGE, et dans leur propre requete.
   *
   * POURQUOI DEUX APPELS ET NON UN SEUL PLUS LARGE. Les deux rayons n'ont rien a voir :
   * charger vingt kilometres de boulangeries remplirait la carte d'une ville entiere et
   * couterait des centaines de points inutiles a chaque deplacement. Les VIP, eux, sont
   * rares — et c'est sur autoroute, loin de tout, qu'ils servent le plus. */
  const { data: vip } = useQuery({
    queryKey: ['poi-vip', key, rayonVipM],
    enabled: enabled && position !== null,
    staleTime: 5 * 60_000,
    queryFn: () => {
      const [west, south, east, north] = boundingBox(position!.lat, position!.lon, rayonVipM);
      return api<{ items: Place[] }>('/places/in-bounds', {
        query: { bbox: `${west},${south},${east},${north}`, partners: '1' },
      });
    },
  });

  return useMemo<GeoJSON.FeatureCollection>(() => {
    /* LES DEUX LISTES SE RECOUVRENT : un VIP a moins de trois kilometres est rendu par les
     * deux requetes. On deduplique par identifiant — deux fois le meme point sur la carte
     * doublerait son halo dore et fausserait les appuis. */
    const fusion = new Map<string, Place>();
    for (const place of enabled ? (data?.items ?? []) : []) fusion.set(place.id, place);
    for (const place of enabled ? (vip?.items ?? []) : []) fusion.set(place.id, place);
    const items = [...fusion.values()];
    return {
      type: 'FeatureCollection',
      features: items.map((place) => ({
        type: 'Feature',
        id: place.id,
        properties: {
          id: place.id,
          name: place.enseigne || place.name,
          /* LE NOM DE L'IMAGE, et non l'emoji : voir imageLieu. L'emoji reste pose a cote
           * parce que la fiche du lieu, elle, l'affiche en React Native ordinaire — et la,
           * c'est la police du systeme qui dessine, pas le serveur de tuiles. */
          picto: imageLieu(place.category),
          emoji: emojiForPlace({ category: place.category }),
          partner: place.isPartner,
        },
        geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
      })),
    };
  }, [data, vip, enabled]);
}
