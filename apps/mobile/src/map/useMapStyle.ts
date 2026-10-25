import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';

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

/* ------------------------------------------------------------------------- */
/* Relief ombre (point 6A du client)                                          */
/* ------------------------------------------------------------------------- */

/**
 * Modele d'elevation. Le client proposait MapTiler ; ce service demande une cle, facturee a
 * l'usage, qu'il faudrait renouveler et surveiller. Les tuiles d'elevation du programme Open
 * Data d'AWS (anciennement Mapzen) couvrent la planete, ne demandent aucune cle et sont celles
 * qu'utilisent la plupart des cartes libres.
 *
 * `terrarium` est leur encodage de l'altitude dans les trois canaux de couleur — different de
 * celui de Mapbox, d'ou le `encoding` explicite : sans lui, le relief serait calcule a partir
 * de la mauvaise formule et la carte afficherait des falaises imaginaires.
 */
const DEM_SOURCE_ID = 'win-dem';
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];

/**
 * Le relief s'arrete au zoom 13 — et la raison n'est pas esthetique.
 *
 * Chaque tuile d'elevation pese plus de 100 ko, et il y en a une dizaine a l'ecran. Les laisser
 * se recharger pendant un trajet, zoom 17, ou le relief n'apprend plus rien a un conducteur qui
 * voit la route devant lui, ferait payer a l'utilisateur plusieurs mega-octets par trajet pour
 * un ombrage qu'il ne regarde pas. En Algerie, le forfait data n'est pas une abstraction.
 *
 * Le relief sert quand on prend du recul : choisir entre deux itineraires de Kabylie, comprendre
 * pourquoi la route contourne l'Atlas. C'est exactement la plage de zoom conservee ici.
 */
const HILLSHADE_MIN_ZOOM = 5;
const HILLSHADE_MAX_ZOOM = 13;
/** Au-dela, la meme tuile est reutilisee en l'agrandissant plutot que d'en telecharger une autre. */
const DEM_MAX_ZOOM = 11;

/* ------------------------------------------------------------------------- */
/* Symboles des lieux (point 6B du client)                                    */
/* ------------------------------------------------------------------------- */

/**
 * Pourquoi les mosquees, hopitaux et stations-service n'apparaissaient pas.
 *
 * Deux causes, verifiees en lisant les deux styles servis par OpenFreeMap :
 *
 *   1. DE JOUR, les couches de lieux existent mais ne s'allument qu'au zoom 15, 16 ou 17 selon
 *      l'importance du lieu. Or on regarde une ville au zoom 12-14 : a ce moment-la, la carte
 *      est vide de tout pictogramme. Ce n'est visible qu'en comparant avec Google Maps, qui les
 *      montre bien plus tot — c'est ce que le client a fait.
 *
 *   2. DE NUIT, le style sombre d'OpenFreeMap n'a AUCUNE couche de lieux. Pas une seule. Aucun
 *      reglage de zoom n'y changerait quoi que ce soit.
 *
 * Cette couche comble les deux : elle dessine, des le zoom 13 et dans les deux styles, les
 * categories que le client a listees. Elle s'eteint au zoom 15,5, la ou les couches d'origine
 * prennent le relais de jour — sans quoi chaque pictogramme serait dessine deux fois.
 *
 * La liste est fermee, et c'est volontaire : chaque valeur correspond a un pictogramme
 * REELLEMENT present dans le jeu d'icones d'OpenFreeMap (verifie un par un). Une categorie
 * absente du jeu ne dessinerait rien du tout, en silence.
 */
const ESSENTIAL_POI_CLASSES = [
  'place_of_worship',
  'hospital',
  'pharmacy',
  'school',
  'college',
  'stadium',
  'fuel',
  'bank',
  'town_hall',
  'police',
  'post',
  'bus',
  'railway',
  'airport',
  'lodging',
  'restaurant',
  'fast_food',
  'cafe',
  'grocery',
  'shop',
  'parking',
];

const ESSENTIAL_POI_LAYER_ID = 'win-poi-essential';
const ESSENTIAL_POI_MIN_ZOOM = 13;
/** Zoom auquel les couches d'origine (style clair) reprennent la main. */
const ESSENTIAL_POI_MAX_ZOOM = 15.5;
/** Le nom n'accompagne le pictogramme qu'une fois assez proche, sinon la ville devient illisible. */
const ESSENTIAL_POI_LABEL_ZOOM = 14.5;

type AnyLayer = StyleSpecification['layers'][number] & {
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  'source-layer'?: string;
  source?: string;
};

/** Identifiant de la source vectorielle du fond (`openmaptiles` dans les deux styles — mais
 * cherche plutot que suppose : les deux styles ne partagent deja pas leurs noms de couches). */
function vectorSourceId(style: StyleSpecification): string | null {
  for (const [id, source] of Object.entries(style.sources ?? {})) {
    if ((source as { type?: string }).type === 'vector') return id;
  }
  return null;
}

/**
 * Couche AU-DESSUS de laquelle l'itineraire ne doit pas passer (point 3 du client : les
 * panneaux et noms de route disparaissaient sous le trace vert, « critique sur autoroutes
 * algeriennes »).
 *
 * On ne peut pas nommer cette couche en dur : le style clair et le style sombre d'OpenFreeMap
 * n'ont pas les memes identifiants — ni meme le meme nombre de couches (111 contre 47). Pire,
 * prendre simplement « la premiere couche de texte » donnerait le nom des cours d'eau dans le
 * style sombre, qui arrive AVANT les routes : le trace passerait alors sous les routes
 * elles-memes et deviendrait invisible.
 *
 * La regle retenue tient dans les deux : la derniere couche de ROUTE dessinee (traits et
 * surfaces de la couche `transportation`), puis la premiere etiquette qui la suit. L'itineraire
 * se glisse juste avant celle-ci — au-dessus de l'asphalte, sous les panneaux.
 */
export function routeAnchorFor(style: StyleSpecification): string | undefined {
  const layers = (style.layers ?? []) as AnyLayer[];
  let lastRoad = -1;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    if (layer.type !== 'symbol' && layer['source-layer'] === 'transportation') lastRoad = i;
  }
  for (let i = lastRoad + 1; i < layers.length; i++) {
    if (layers[i]!.type === 'symbol') return layers[i]!.id;
  }
  // Style inattendu : pas d'ancrage plutot qu'un mauvais ancrage. Le trace reste alors
  // au-dessus de tout, comme avant cette correction.
  return undefined;
}

export function addWinLayers(style: StyleSpecification, night: boolean): void {
  const layers = style.layers as AnyLayer[];

  /* Relief : insere juste avant le premier trait du fond. Il recouvre ainsi les aplats de
   * vegetation et d'urbanisation — qu'il doit ombrer — mais passe sous les cours d'eau, les
   * routes et tout le reste. */
  if (!style.sources[DEM_SOURCE_ID]) {
    style.sources[DEM_SOURCE_ID] = {
      type: 'raster-dem',
      tiles: DEM_TILES,
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: DEM_MAX_ZOOM,
      attribution: 'Relief : Mapzen / AWS Open Data',
    } as StyleSpecification['sources'][string];

    const firstLine = layers.findIndex((l) => l.type === 'line');
    const hillshade = {
      id: 'win-hillshade',
      type: 'hillshade',
      source: DEM_SOURCE_ID,
      minzoom: HILLSHADE_MIN_ZOOM,
      maxzoom: HILLSHADE_MAX_ZOOM,
      paint: {
        // Discret : le relief doit SITUER, jamais concurrencer le trace. Un peu plus marque de
        // nuit, ou le fond est sombre et l'ombrage se voit moins.
        'hillshade-exaggeration': night ? 0.45 : 0.3,
        'hillshade-shadow-color': night ? '#000000' : '#3A4A42',
        'hillshade-highlight-color': night ? '#4A5A52' : '#FFFFFF',
      },
    } as unknown as AnyLayer;
    layers.splice(firstLine < 0 ? layers.length : firstLine, 0, hillshade);
  }

  /* Lieux essentiels, inseres juste avant les etiquettes : ils se placent donc avec elles et
   * se bousculent avec elles (c'est le moteur qui arbitre), au-dessus de l'itineraire. */
  const sourceId = vectorSourceId(style);
  if (sourceId && !layers.some((l) => l.id === ESSENTIAL_POI_LAYER_ID)) {
    const anchorId = routeAnchorFor(style);
    const at = anchorId ? layers.findIndex((l) => l.id === anchorId) : -1;
    const poi = {
      id: ESSENTIAL_POI_LAYER_ID,
      type: 'symbol',
      source: sourceId,
      'source-layer': 'poi',
      minzoom: ESSENTIAL_POI_MIN_ZOOM,
      maxzoom: ESSENTIAL_POI_MAX_ZOOM,
      filter: ['match', ['get', 'class'], ESSENTIAL_POI_CLASSES, true, false],
      layout: {
        'icon-image': ['get', 'class'],
        'icon-size': 0.9,
        // Le nom n'apparait qu'en approchant : au zoom 13, seul le pictogramme compte.
        'text-field': ['step', ['zoom'], '', ESSENTIAL_POI_LABEL_ZOOM, ['coalesce', ['get', 'name:latin'], ['get', 'name']]],
        // SANS POLICE EXPLICITE, RIEN NE S'AFFICHE : MapLibre demanderait « Open Sans Regular »
        // au serveur de tuiles, qui ne la sert pas (404 verifie) — la couche entiere resterait
        // vide, en silence. OpenFreeMap ne sert que les trois variantes de Noto Sans.
        'text-font': ['Noto Sans Regular'],
        'text-size': 11.5,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': night ? '#C9D6D0' : '#4A5A52',
        'text-halo-color': night ? '#0B1512' : '#FFFFFF',
        'text-halo-width': 1.4,
      },
    } as unknown as AnyLayer;
    layers.splice(at < 0 ? layers.length : at, 0, poi);
  }
}

/** Styles deja telecharges et corriges, par URL. Les echecs n'y entrent pas : voir useMapStyle. */
const cache = new Map<string, StyleSpecification>();

function patchStyle(style: StyleSpecification, night: boolean): StyleSpecification {
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

  addWinLayers(style, night);
  return style;
}

export type MapStyle = {
  /** Style a passer a la carte : l'objet corrige, ou l'URL d'origine si le reseau a manque. */
  mapStyle: string | StyleSpecification;
  /** Couche sous laquelle glisser l'itineraire, pour que les panneaux restent lisibles. */
  routeAnchorId: string | undefined;
};

/**
 * Recupere le style distant (Liberty/dark d'OpenFreeMap), espace les badges de route, adoucit
 * les aplats les plus criards, ajoute le relief ombre et les symboles de lieux, puis indique ou
 * glisser l'itineraire — plutot que de figer une copie locale du style, qui perdrait au fil du
 * temps les ameliorations qu'OpenFreeMap y apporte. En cas d'echec reseau, `mapStyle` reste
 * l'URL d'origine : la carte s'affiche normalement, juste sans ces reglages.
 */
export function useMapStyle(styleUrl: string): MapStyle {
  const night = styleUrl.includes('dark');
  const [patched, setPatched] = useState<StyleSpecification | null>(() => cache.get(styleUrl) ?? null);

  useEffect(() => {
    const hit = cache.get(styleUrl);
    if (hit) {
      setPatched(hit);
      return;
    }

    /* LACHER LE STYLE DE L'AUTRE THEME, tout de suite.
     *
     * `patched` contient encore celui qu'on affichait avant la bascule. Le garder pendant que
     * le nouveau se telecharge — ou pour toujours, si le telechargement echoue — faisait que
     * les boutons et les couleurs passaient en nuit pendant que LE FOND DE CARTE restait en
     * jour. C'est le defaut rapporte par le client : « il change tous les icones, il ne change
     * pas l'arriere-plan. »
     *
     * A null, `mapStyle` rend l'URL d'origine et MapLibre va la chercher lui-meme : on perd
     * nos reglages (relief, pictogrammes, espacement des badges) le temps du chargement, mais
     * le fond est du bon theme. Mieux vaut une carte juste sans fioritures qu'une carte du
     * mauvais theme. */
    setPatched(null);

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(styleUrl);
        const json = (await response.json()) as StyleSpecification;
        const result = patchStyle(json, night);
        cache.set(styleUrl, result);
        if (!cancelled) setPatched(result);
      } catch {
        /* ON NE MEMORISE PLUS L'ECHEC. Un `cache.set(styleUrl, 'error')` condamnait ce theme
         * pour toute la duree de la session : une seule coupure de reseau — un tunnel, le mode
         * avion le temps d'un essai — et la carte ne repassait plus jamais en nuit. L'effet ne
         * se rejoue qu'au changement de theme, donc reessayer ne coute rien et rend la panne
         * passagere au lieu d'etre definitive. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [styleUrl, night]);

  return useMemo(
    () => ({ mapStyle: patched ?? styleUrl, routeAnchorId: patched ? routeAnchorFor(patched) : undefined }),
    [patched, styleUrl],
  );
}
