import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

/**
 * La fleche du vehicule, QUAND LA CAMERA NE SUIT PLUS.
 *
 * Le client decrit le symptome ainsi : pendant une navigation avec deviation, le marqueur
 * redevient « un rond vert simple » au lieu de la fleche a halo. Il a raison, et voici ce qui se
 * passait. Pour choisir un point de deviation, on deplace la carte du doigt ; le suivi de camera
 * s'interrompt alors — il le faut, sinon la carte reviendrait sous le doigt trente fois par
 * seconde et serait litteralement immobilisable. Mais la fleche du guidage, elle, est posee a un
 * point FIXE de l'ecran, celui que vise la camera : des que la camera ne vise plus le vehicule,
 * cette fleche n'a plus de sens et disparait. Il ne restait que le point d'accueil, un rond.
 *
 * Il manquait donc simplement une fleche pour ce cas-la : celle-ci, posee sur la carte, a la
 * position reelle, et tournee dans la direction du deplacement.
 *
 * C'est un SYMBOLE DE CARTE et non une vue React Native, pour les deux memes raisons que le
 * point « Vous etes ici » (voir MeMarker) : une vue posee sur la carte est repositionnee apres
 * chaque image, donc toujours en retard d'un glissement ; et surtout,
 * `icon-rotation-alignment: 'map'` exprime la rotation PAR RAPPORT AU NORD — le moteur compose
 * lui-meme avec l'orientation de la carte, que l'utilisateur l'ait tournee ou non. Avec une vue,
 * il aurait fallu lui retrancher a la main une orientation que seul le moteur connait vraiment.
 *
 * Voir scripts/make-nav-arrow.py pour le dessin, repris trait pour trait de NavArrow.tsx.
 */

const IMAGES = {
  'nav-arrow-day': require('../../assets/map/nav-arrow-day.png'),
  'nav-arrow-night': require('../../assets/map/nav-arrow-night.png'),
};

type Props = {
  lat: number;
  lon: number;
  /** Cap du vehicule, en degres depuis le nord. `null` a l'arret : la fleche garde alors sa
   * derniere direction connue plutot que de sauter vers le nord. */
  heading: number | null;
  night: boolean;
};

export function NavMarker({ lat, lon, heading, night }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { cap: heading ?? 0 },
          geometry: { type: 'Point', coordinates: [lon, lat] },
        },
      ],
    }),
    [lat, lon, heading],
  );

  return (
    <>
      <Images images={IMAGES} />
      <GeoJSONSource id="nav-me" data={data}>
        <Layer
          id="nav-me-arrow"
          type="symbol"
          source="nav-me"
          layout={{
            'icon-image': night ? 'nav-arrow-night' : 'nav-arrow-day',
            'icon-rotate': ['get', 'cap'],
            // 'map' : la rotation est comptee depuis le nord, pas depuis le haut de l'ecran.
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            // Rien ne doit jamais faire disparaitre la position du conducteur.
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
