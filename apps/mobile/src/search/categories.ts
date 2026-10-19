/**
 * Taxonomie des boutons de categories rapides (groupes + sous-categories),
 * reprise a l'identique de v83 (.groups/.cats). `dataQ` est la cle interne
 * envoyee a la recherche (resolveCategoryQuery la reconnait directement),
 * `labelKey` pointe vers i18n `categories.items.<labelKey>`.
 */
export type CategoryItem = { dataQ: string; labelKey: string };
export type CategoryGroup = {
  key: string;
  emoji: string;
  labelKey: string;
  items: CategoryItem[];
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: 'gares',
    emoji: '🚆',
    labelKey: 'g_transit',
    items: [
      { dataQ: 'airport', labelKey: 'airport' },
      { dataQ: 'train station', labelKey: 'trainstation' },
      { dataQ: 'bus station', labelKey: 'busstation' },
      { dataQ: 'seaport', labelKey: 'seaport' },
      { dataQ: 'parking', labelKey: 'parking' },
    ],
  },
  /* La rubrique « Transport public (Arret) » a ete RETIREE a la demande du client.
   *
   * Elle ne contenait que les arrets de bus, et les arrets de bus algeriens sont, dans
   * OpenStreetMap, soit absents soit poses au hasard : la rubrique rendait donc un resultat
   * faux a quelqu'un qui attendait son bus. Le client fournira les coordonnees officielles ;
   * la rubrique reviendra avec elles, et pas avant. Les GARES ROUTIERES, elles, restent dans
   * « Gares & aeroports » : ce sont des lieux batis, correctement cartographies. */
  {
    key: 'urgences',
    emoji: '🆘',
    labelKey: 'g_emergency',
    items: [
      { dataQ: 'emergency hospital', labelKey: 'emergency' },
      { dataQ: 'police', labelKey: 'police' },
      { dataQ: 'gendarmerie', labelKey: 'gendarmerie' },
      { dataQ: 'fire station', labelKey: 'firefighters' },
      { dataQ: 'civil protection', labelKey: 'civilprotection' },
    ],
  },
  {
    key: 'sante',
    emoji: '💊',
    labelKey: 'g_health',
    items: [
      { dataQ: 'pharmacy', labelKey: 'pharmacy' },
      { dataQ: 'hospital', labelKey: 'hospital' },
      { dataQ: 'private clinic', labelKey: 'clinic' },
    ],
  },
  {
    key: 'depannage',
    emoji: '🚗',
    labelKey: 'g_auto',
    items: [
      { dataQ: 'car repair', labelKey: 'towing' },
      { dataQ: 'car repair workshop', labelKey: 'mechanic' },
      { dataQ: 'taxi', labelKey: 'taxi' },
      { dataQ: 'fuel', labelKey: 'fuel' },
      { dataQ: 'vehicle inspection', labelKey: 'inspection' },
    ],
  },
  {
    key: 'manger',
    emoji: '🍽️',
    labelKey: 'g_eat',
    items: [
      { dataQ: 'hotel', labelKey: 'hotel' },
      { dataQ: 'restaurant', labelKey: 'restaurant' },
      { dataQ: 'fast food', labelKey: 'fastfood' },
      { dataQ: 'cafe', labelKey: 'cafe' },
    ],
  },
  {
    key: 'admin',
    emoji: '🏛️',
    labelKey: 'g_admin',
    items: [
      { dataQ: 'townhall APC commune algerie', labelKey: 'apc' },
      { dataQ: 'wilaya prefecture algerie', labelKey: 'apw' },
      { dataQ: 'tax office impots CDI algerie', labelKey: 'taxoffice' },
      { dataQ: 'chamber of commerce CCI', labelKey: 'cci' },
      { dataQ: 'chambre artisanat CAM', labelKey: 'cam' },
      { dataQ: 'CNAS assurance sociale algerie', labelKey: 'cnas' },
      { dataQ: 'CASNOS securite sociale non salaries algerie', labelKey: 'casnos' },
      { dataQ: 'consulate consulat', labelKey: 'consulate' },
      { dataQ: 'embassy ambassade', labelKey: 'embassy' },
      { dataQ: 'mosque', labelKey: 'mosque' },
      { dataQ: 'tourist attraction', labelKey: 'tourism' },
      { dataQ: 'marketplace souk marche', labelKey: 'souk' },
    ],
  },
];
