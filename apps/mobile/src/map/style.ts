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
/* COULEURS ALIGNEES SUR LE TABLEAU DU CLIENT (point 17, synthese du 29 octobre).
 *
 * Son tableau corrige un defaut reel, et c'est ce qui m'a decide a le suivre : QUATRE types
 * portaient exactement la meme couleur — accident, objet sur la route, route bloquee et
 * incendie etaient tous `#D64545`. Sur la carte, quatre pastilles rouges identiques ne disent
 * rien de plus qu'une seule, et le conducteur qui en voit une ne sait pas s'il doit ralentir,
 * changer de file ou faire demi-tour. Dos d'ane et trou partageaient de meme le meme ambre.
 *
 * Desormais chaque famille a sa teinte : le rouge pour ce qui blesse, le brun pour ce qui est
 * creve ou ferme, l'or pour ce qui encombre, le bleu pour l'eau et l'autorite.
 *
 * SEUL CHANGEMENT A FAIRE VALIDER : le radar passe du bleu au gris fonce. Le bleu avait ete
 * demande explicitement par le client dans un document anterieur (<< Badges de route &
 * signalisations communautaires >>, point 3) ; sa synthese du 29 octobre dit maintenant
 * << gris fonce >>. J'applique la plus recente, mais c'est un revirement, pas une precision.
 */
export const REPORT_COLORS: Record<string, string> = {
  radar: '#3A3A3A', // gris fonce (etait bleu — voir ci-dessus)
  bump: '#F07818', // orange vif
  pothole: '#A9703A', // brun clair : un trou n'est pas un dos d'ane
  police: '#1E4C8A', // bleu fonce
  crash: '#D64545', // rouge
  jam: '#C25E10', // rouge/orange, plus sombre que le dos d'ane
  object: '#E3B520', // or clair : il encombre, il ne blesse pas
  fire: '#E03A10', // rouge/feu
  flood: '#4A7DD4', // bleu
  block: '#5A2D18', // marron tres fonce : une voie fermee, pas un barrage de l'armee
  /* Les trois forces gardent chacune leur couleur institutionnelle, celle de leur uniforme :
   * bleu pour la police, vert pour la gendarmerie, brun pour l'armee. Sur la carte, la couleur
   * suffit a reconnaitre le barrage sans lire l'etiquette. */
  gendarmerie: '#2E7D4F',
  armee: '#6B5B3E',
  // L'ambre des travaux, la meme que les panneaux de chantier.
  works: '#C98A1E',
};
