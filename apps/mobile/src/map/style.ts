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
 * Couleur d'un signalement sur la carte. Les permanents de type route (dos
 * d'ane, trou) partagent l'ambre ; le radar reste bleu (cadre bleu demande
 * par le client, doc "Badges de route & signalisations communautaires" #3) ;
 * les evenements ponctuels prennent le rouge.
 */
export const REPORT_COLORS: Record<string, string> = {
  radar: '#2F6FE0',
  bump: '#EFB63F',
  pothole: '#EFB63F',
  police: '#4A7DD4',
  crash: '#D64545',
  jam: '#D6822C',
  object: '#D64545',
  fire: '#D64545',
  flood: '#4A7DD4',
  block: '#D64545',
};
