import { SIGNALISATION } from './signalisation';

/**
 * Fonds de carte.
 *
 * OpenFreeMap est deja la source de la version web : garder le meme fournisseur
 * evite une rupture visuelle entre l'application et le site pendant les mois ou
 * les deux coexisteront.
 */
export const MAP_STYLES = {
  day: 'https://tiles.openfreemap.org/styles/liberty',
  night: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/** Vue d'ouverture : l'Algerie entiere, centree sur les hauts plateaux. */
export const INITIAL_VIEW_STATE = {
  center: [2.6, 34.5] as [number, number],
  zoom: 4.6,
};

/**
 * Vue d'ensemble de chaque pays couvert, pour le bouton drapeau de la colonne.
 * La Tunisie n'est routable que depuis l'ajout de tunisia-latest.osm.pbf au graphe
 * Valhalla du VPS : avant cela, la carte l'affichait mais aucun trajet n'y etait calculable.
 */
export const COUNTRY_VIEWS = {
  DZ: { center: [2.6, 34.5] as [number, number], zoom: 4.6 },
  TN: { center: [9.6, 34.4] as [number, number], zoom: 5.9 },
  FR: { center: [2.4, 46.6] as [number, number], zoom: 5 },
} as const;

export type CountryView = keyof typeof COUNTRY_VIEWS;

/** Reglages de camera quand le guidage est actif. */
export const NAVIGATION_CAMERA = {
  zoom: 17,
  pitch: 55,
};

/**
 * COULEURS DES SIGNALEMENTS — derivees de la table de la carte, jamais ecrites deux fois.
 *
 * Elles vivaient ici, et une seconde table est arrivee le 31 octobre avec la maquette des
 * marqueurs (voir signalisation.ts). Deux tables de couleurs pour la meme chose, c'est la
 * garantie qu'elles divergeront : le jour ou le client change une teinte, l'une suivra et
 * l'autre non, et le meme signalement sera rouge sur la carte et brun dans la carte d'alerte.
 *
 * On garde donc la table de la carte comme source, et celle-ci n'en est plus qu'une VUE : la
 * variante de jour, parce que les panneaux qui s'en servent ont tous un fond blanc.
 */
export const REPORT_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SIGNALISATION).map(([kind, teinte]) => [kind, teinte.jour]),
);
