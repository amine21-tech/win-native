import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';

/**
 * Badges de numero de route (ex. "N 59", "CW 222") beaucoup trop rapproches sur un trace tout
 * droit — jusqu'a 6 fois sur un meme segment (doc "Badges de route & signalisations
 * communautaires" #1, doc "22 chantiers" #5). Cause confirmee en inspectant le style OpenFreeMap
 * Liberty : `symbol-spacing: 200` (en pixels ecran) sur les couches de plaques routieres.
 * Valable pour l'Algerie ET la Tunisie, puisque c'est une propriete du style, pas de la base.
 */
const SHIELD_LAYER_IDS = new Set(['highway-shield-non-us', 'highway-shield-us-interstate', 'road_shield_us']);
const SHIELD_SPACING = 500;

/**
 * Aplats du fond de carte adoucis.
 *
 * Compare a une carte de navigation courante sur le meme trajet, notre fond ressortait
 * beaucoup plus criard : de larges zones ROSE VIF autour des hopitaux, et des batiments en
 * relief presque blancs qui accrochaient l'oeil plus que la route elle-meme.
 *
 * Ce n'est pas un defaut de notre code — c'est le style Liberty d'OpenFreeMap, qui peint
 * `landuse_hospital` en `#fde`. Acceptable sur une carte qu'on consulte posement, beaucoup
 * moins au volant : au moment de lire une sortie d'autoroute, ce qui doit ressortir est le
 * trace, pas l'emprise de l'hopital voisin.
 *
 * On garde la TEINTE (l'information reste lisible : rose = hopital) et on baisse la
 * saturation. Meme logique pour le relief des batiments, ramene de 0,8 a 0,45 : ils situent
 * encore, sans dominer.
 */
const CALMER_FILLS: Record<string, string> = {
  landuse_hospital: '#F5EDEF',
};

const cache = new Map<string, StyleSpecification | 'error'>();

function patchStyle(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers ?? []) {
    if (!('id' in layer)) continue;

    if (SHIELD_LAYER_IDS.has(layer.id) && 'layout' in layer && layer.layout) {
      (layer.layout as Record<string, unknown>)['symbol-spacing'] = SHIELD_SPACING;
    }

    const calmer = CALMER_FILLS[layer.id];
    if (calmer && 'paint' in layer && layer.paint) {
      (layer.paint as Record<string, unknown>)['fill-color'] = calmer;
    }

    // Plus de batiments en relief. Vue inclinee a 55 degres pendant la navigation, ils
    // formaient des blocs gris qui masquaient les rues et rendaient la carte illisible —
    // les cartes de navigation courantes ne les montrent pas a ce zoom. Les batiments a
    // plat (couche `building`) restent affiches.
    if (layer.id === 'building-3d') {
      const withLayout = layer as { layout?: Record<string, unknown> };
      withLayout.layout = { ...(withLayout.layout ?? {}), visibility: 'none' };
    }
  }
  return style;
}

/**
 * Recupere le style distant (Liberty/dark d'OpenFreeMap), espace les badges de route et adoucit
 * les aplats les plus criards avant de le passer a la carte — plutot que de figer une copie locale du style, qui perdrait au fil du
 * temps les ameliorations qu'OpenFreeMap y apporte. En cas d'echec reseau, `mapStyle` reste
 * l'URL d'origine : la carte s'affiche normalement, juste sans ce reglage.
 */
export function useMapStyle(styleUrl: string): string | StyleSpecification {
  const [patched, setPatched] = useState<StyleSpecification | null>(() => {
    const hit = cache.get(styleUrl);
    return hit && hit !== 'error' ? hit : null;
  });

  useEffect(() => {
    const hit = cache.get(styleUrl);
    if (hit === 'error') return;
    if (hit) {
      setPatched(hit);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(styleUrl);
        const json = (await response.json()) as StyleSpecification;
        const result = patchStyle(json);
        cache.set(styleUrl, result);
        if (!cancelled) setPatched(result);
      } catch {
        cache.set(styleUrl, 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [styleUrl]);

  return patched ?? styleUrl;
}
