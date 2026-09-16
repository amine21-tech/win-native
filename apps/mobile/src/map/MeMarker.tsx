import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import type { Language } from '../shared';

/**
 * Le point « Vous etes ici » de l'ecran d'accueil.
 *
 * Il est dessine PAR LE MOTEUR DE LA CARTE (images de style + calque de symboles), et non comme
 * une vue React Native posee par-dessus. Une vue posee sur la carte est repositionnee apres
 * chaque image de la carte, donc toujours avec un temps de retard : pendant un glissement du
 * doigt, le point decrochait des rues et semblait bouger alors que l'utilisateur etait immobile.
 * Un symbole est dessine dans la meme image que les rues : il ne peut pas decrocher.
 *
 * Il suit `useLiveLocation`, dont la position est deja figee a l'arret : le point ne bouge que
 * lorsque l'on bouge.
 *
 * Les images viennent de scripts/make-me-marker.py : le `meDot` de v83 (halo, fleche doree,
 * rond vert) et l'etiquette `.you-here-label`, en 1x/2x/3x.
 */

const IMAGES = {
  'me-dot': require('../../assets/map/me-dot.png'),
  'me-label-fr': require('../../assets/map/me-label-fr.png'),
  'me-label-en': require('../../assets/map/me-label-en.png'),
  'me-label-ar': require('../../assets/map/me-label-ar.png'),
};

/** Distance, en dp, entre le centre du rond et la pointe de l'etiquette : la pointe touche le
 * haut du halo, comme sur le site. */
const LABEL_GAP_DP = 20;

type Props = {
  lat: number;
  lon: number;
  /** Langue de l'etiquette, ou `null` pour la masquer (pendant le guidage, comme en v83). */
  labelLang: Language | null;
};

export function MeMarker({ lat, lon, labelLang }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } }],
    }),
    [lat, lon],
  );

  const label = labelLang == null ? null : labelLang === 'en' ? 'me-label-en' : labelLang === 'fr' ? 'me-label-fr' : 'me-label-ar';

  return (
    <>
      <Images images={IMAGES} />
      <GeoJSONSource id="me" data={data}>
        <Layer
          id="me-dot"
          type="symbol"
          source="me"
          layout={{
            'icon-image': 'me-dot',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            // Toujours face a l'ecran, meme carte tournee ou inclinee : c'est un repere, pas un
            // objet pose au sol.
            'icon-rotation-alignment': 'viewport',
            'icon-pitch-alignment': 'viewport',
          }}
        />
        {label ? (
          <Layer
            id="me-label"
            type="symbol"
            source="me"
            layout={{
              'icon-image': label,
              'icon-anchor': 'bottom',
              'icon-offset': [0, -LABEL_GAP_DP],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-rotation-alignment': 'viewport',
              'icon-pitch-alignment': 'viewport',
            }}
          />
        ) : null}
      </GeoJSONSource>
    </>
  );
}
