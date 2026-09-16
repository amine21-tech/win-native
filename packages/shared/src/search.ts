/**
 * Recherche : donnees et algorithmes purs, repris a l'identique de win-v83
 * (index.html, section RECHERCHE) pour que le classement des resultats ne
 * change pas de comportement entre le web et le natif. Les appels reseau
 * (Photon, Nominatim, notre API /places/search) restent cote application :
 * ce fichier ne contient que ce qui peut se tester sans reseau.
 */
import { haversine } from './geo.js';

/* ------------------------------------------------------------------ */
/* Categories -> tags OpenStreetMap                                    */
/* ------------------------------------------------------------------ */

/** Cle interne de categorie -> tag OSM `cle=valeur` interroge en priorite. */
export const CATEGORY_OSM: Record<string, string> = {
  hotel: 'tourism=hotel',
  restaurant: 'amenity=restaurant',
  'fast food': 'amenity=fast_food',
  cafe: 'amenity=cafe',
  pharmacy: 'amenity=pharmacy',
  hospital: 'amenity=hospital',
  'private clinic': 'amenity=clinic',
  police: 'amenity=police',
  gendarmerie: 'amenity=police',
  'fire station': 'amenity=fire_station',
  'civil protection': 'amenity=fire_station',
  'emergency hospital': 'amenity=hospital',
  airport: 'aeroway=aerodrome',
  'train station': 'railway=station',
  'bus station': 'amenity=bus_station',
  'bus stop': 'highway=bus_stop',
  fuel: 'amenity=fuel',
  'gas station': 'amenity=fuel',
  bank: 'amenity=bank',
  atm: 'amenity=atm',
  school: 'amenity=school',
  university: 'amenity=university',
  bakery: 'shop=bakery',
  supermarket: 'shop=supermarket',
  mosque: 'amenity=place_of_worship',
  'place of worship': 'amenity=place_of_worship',
  'town hall': 'amenity=townhall',
  court: 'amenity=courthouse',
  government: 'office=government',
  'car repair': 'shop=car_repair',
  'car repair workshop': 'shop=car_repair',
  'car rental': 'amenity=car_rental',
  parking: 'amenity=parking',
  taxi: 'amenity=taxi',
  'vehicle inspection': 'amenity=vehicle_inspection',
  seaport: 'harbour=yes',
  museum: 'tourism=museum',
  attraction: 'tourism=attraction',
  'tourist attraction': 'tourism=attraction',
  'sports centre': 'leisure=sports_centre',
  'chamber of commerce': 'office=government',
  'chamber of commerce cci': 'office=government',
  'chambre artisanat cam': 'office=government',
  commerce: 'office=government',
  'townhall apc commune algerie': 'amenity=townhall',
  'wilaya prefecture algerie': 'office=government',
  'tax office impots cdi algerie': 'office=government',
  'cnas assurance sociale algerie': 'office=government',
  'casnos securite sociale non salaries algerie': 'office=government',
  'consulate consulat': 'diplomatic=consulate',
  'embassy ambassade': 'diplomatic=embassy',
  'marketplace souk marche': 'amenity=marketplace',
  'car market souk el outo marche automobile voitures occasion': 'shop=car',
};

/** Terme "propre" envoye a Photon pour une recherche par categorie. */
export const CATEGORY_SEARCH_TERM: Record<string, string> = {
  hotel: 'Hôtel',
  restaurant: 'Restaurant',
  'fast food': 'Fast food',
  cafe: 'Café',
  pharmacy: 'Pharmacie',
  hospital: 'Hôpital',
  'private clinic': 'Clinique',
  'emergency hospital': 'Urgences',
  police: 'Police',
  gendarmerie: 'Gendarmerie',
  'fire station': 'Pompiers',
  'civil protection': 'Protection civile',
  airport: 'Aéroport',
  'train station': 'Gare',
  'bus station': 'Gare routière',
  'bus stop': 'Arrêt de bus',
  parking: 'Parking',
  'car repair': 'Dépannage auto',
  'car repair workshop': 'Mécanicien',
  taxi: 'Taxi',
  fuel: 'Station essence',
  seaport: 'Port',
  'vehicle inspection': 'Contrôle technique',
  'townhall apc commune algerie': 'APC',
  'wilaya prefecture algerie': 'Wilaya',
  'tax office impots cdi algerie': 'Centre des impôts',
  'chamber of commerce cci': 'Chambre de commerce',
  'chambre artisanat cam': "Chambre de l'artisanat",
  'cnas assurance sociale algerie': 'CNAS',
  'casnos securite sociale non salaries algerie': 'CASNOS',
  'consulate consulat': 'Consulat',
  'embassy ambassade': 'Ambassade',
  mosque: 'Mosquée',
  'tourist attraction': 'Site touristique',
  'marketplace souk marche': 'Souk',
  'car market souk el outo marche automobile voitures occasion': 'Marché automobile',
};

/**
 * Libelle affiche (dans n'importe laquelle des 4 langues) -> cle interne.
 * Permet a un texte tape ou dit ("Arrêt de bus", "موقف حافلات") de profiter
 * de la meme precision qu'un clic sur le bouton de categorie, qui envoie lui
 * directement la cle interne.
 */
export const CATEGORY_LABEL_TO_KEY: Record<string, string> = {
  airports: 'airport',
  ambassades: 'embassy ambassade',
  'apc / mairie': 'townhall APC commune algerie',
  'arrêt de bus': 'bus stop',
  'arrêt bus': 'bus stop',
  aéroports: 'airport',
  'bus station': 'bus station',
  'bus stop': 'bus stop',
  cafés: 'cafe',
  'car market': 'car market souk el outo marche automobile voitures occasion',
  casnos: 'CASNOS securite sociale non salaries algerie',
  'centre des impôts': 'tax office impots CDI algerie',
  'chamber of commerce': 'chamber of commerce CCI',
  'chamber of crafts': 'chambre artisanat CAM',
  'chambre de commerce': 'chamber of commerce CCI',
  "chambre de l'artisanat": 'chambre artisanat CAM',
  'civil protection': 'civil protection',
  'clinique privée': 'private clinic',
  cnas: 'CNAS assurance sociale algerie',
  consulates: 'consulate consulat',
  consulats: 'consulate consulat',
  'contrôle tech.': 'vehicle inspection',
  'dépannage auto': 'car repair',
  embassies: 'embassy ambassade',
  emergency: 'emergency hospital',
  'fast food': 'fast food',
  'fast-food': 'fast food',
  firefighters: 'fire station',
  food: 'restaurant',
  fuel: 'fuel',
  'gare routière': 'bus station',
  gendarmerie: 'gendarmerie',
  hospitals: 'hospital',
  hotels: 'hotel',
  hôpitaux: 'hospital',
  hôtels: 'hotel',
  inspection: 'vehicle inspection',
  'marché auto': 'car market souk el outo marche automobile voitures occasion',
  mechanic: 'car repair workshop',
  mosques: 'mosque',
  mosquées: 'mosque',
  mécanicien: 'car repair workshop',
  parking: 'parking',
  parkings: 'parking',
  pharmacies: 'pharmacy',
  police: 'police',
  pompiers: 'fire station',
  'port maritime': 'seaport',
  prefecture: 'wilaya prefecture algerie',
  'private clinic': 'private clinic',
  'protection civile': 'civil protection',
  préfecture: 'wilaya prefecture algerie',
  restos: 'restaurant',
  seaport: 'seaport',
  'sntf (gare train)': 'train station',
  'sntf (train station)': 'train station',
  souk: 'marketplace souk marche',
  stations: 'fuel',
  'tax office': 'tax office impots CDI algerie',
  taxis: 'taxi',
  'to visit': 'tourist attraction',
  towing: 'car repair',
  'town hall': 'townhall APC commune algerie',
  urgences: 'emergency hospital',
  'à visiter': 'tourist attraction',
};

/** Categories dont plusieurs etiquettes OSM designent la meme realite. */
export const CATEGORY_OSM_ALT: Record<string, [string, string][]> = {
  'car repair': [
    ['shop', 'car_repair'],
    ['shop', 'car'],
    ['craft', 'car_repair'],
  ],
  'car repair workshop': [
    ['shop', 'car_repair'],
    ['craft', 'car_repair'],
  ],
  'wilaya prefecture algerie': [
    ['office', 'government'],
    ['amenity', 'townhall'],
  ],
  'tax office impots cdi algerie': [
    ['office', 'government'],
    ['office', 'tax'],
  ],
  'car market souk el outo marche automobile voitures occasion': [
    ['shop', 'car'],
    ['shop', 'car_repair'],
  ],
};

/** Categorie resolue a partir d'un texte tape ou dit (bouton, libelle, ou libelle + complement). */
export function resolveCategoryQuery(raw: string): { key: string; extraText: string } | null {
  let key = (raw || '').toLowerCase().trim().replace(/\s+/g, ' ');
  let extraText = '';

  if (CATEGORY_OSM[key]) return { key, extraText };

  const mapped = CATEGORY_LABEL_TO_KEY[key];
  if (mapped) {
    key = mapped.toLowerCase().trim();
    return CATEGORY_OSM[key] ? { key, extraText } : null;
  }

  const labels = Object.keys(CATEGORY_LABEL_TO_KEY).sort((a, b) => b.length - a.length);
  for (const label of labels) {
    if (key.startsWith(label + ' ')) {
      extraText = key.slice(label.length).trim();
      key = CATEGORY_LABEL_TO_KEY[label]!.toLowerCase().trim();
      return CATEGORY_OSM[key] ? { key, extraText } : null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Lieux verifies a la main (fiabilite OSM inegale sur ces categories)  */
/* ------------------------------------------------------------------ */

export type CuratedPlace = { name: string; lat: number; lon: number };

export const CURATED_AIRPORTS: CuratedPlace[] = [
  { name: "Aéroport d'Alger – Houari Boumédiène", lat: 36.691, lon: 3.2154 },
  { name: "Aéroport d'Oran – Ahmed Ben Bella", lat: 35.6239, lon: -0.6212 },
  { name: 'Aéroport de Constantine – Mohamed Boudiaf', lat: 36.276, lon: 6.6204 },
  { name: "Aéroport d'Annaba – Rabah Bitat", lat: 36.8268, lon: 7.8133 },
  { name: 'Aéroport de Béjaïa – Soummam Abane Ramdane', lat: 36.7125, lon: 5.0699 },
  { name: 'Aéroport de Batna – Mostefa Ben Boulaid', lat: 35.7519, lon: 6.3094 },
  { name: 'Aéroport de Biskra – Mohamed Khider', lat: 34.7933, lon: 5.7389 },
  { name: 'Aéroport de Chlef – Aboubakr Belkaid', lat: 36.2166, lon: 1.3411 },
  { name: 'Aéroport de Sétif – Aïn Arnat', lat: 36.1868, lon: 5.3135 },
  { name: 'Aéroport de Tlemcen – Zenata Messali El Hadj', lat: 35.0152, lon: -1.4508 },
  { name: "Aéroport de Hassi Messaoud – Oued Irara Krim Belkacem", lat: 31.673, lon: 6.1404 },
];

export const CURATED_PORTS: CuratedPlace[] = [
  { name: "Port d'Alger", lat: 36.7831, lon: 3.0639 },
  { name: "Port d'Oran", lat: 35.7058, lon: -0.6453 },
  { name: "Port d'Annaba", lat: 36.9039, lon: 7.7644 },
  { name: 'Port de Béjaïa', lat: 36.7572, lon: 5.0876 },
  { name: 'Port de Skikda', lat: 36.8786, lon: 6.9325 },
  { name: 'Port de Mostaganem', lat: 35.9311, lon: 0.0892 },
  { name: "Port d'Arzew", lat: 35.8522, lon: -0.3167 },
  { name: 'Port de Ghazaouet', lat: 35.0964, lon: -1.8514 },
  { name: 'Port de Ténès', lat: 36.5189, lon: 1.3019 },
  { name: 'Port de Djen Djen (Jijel)', lat: 36.8214, lon: 5.8847 },
  { name: 'Port de Cherchell', lat: 36.6058, lon: 2.1947 },
  { name: 'Port de Dellys', lat: 36.9189, lon: 3.9186 },
  { name: 'Port de Béni Saf', lat: 35.3056, lon: -1.3886 },
];

/** Fusionne une liste de lieux verifies avec des resultats deja trouves, sans doublon (< 3 km). */
export function mergeCurated<T extends { lat: number; lon: number }>(
  curated: CuratedPlace[],
  existing: T[],
  here: { lat: number; lon: number },
): (CuratedPlace & { distanceM: number })[] {
  return curated
    .filter((c) => !existing.some((r) => haversine(r.lat, r.lon, c.lat, c.lon) < 3000))
    .map((c) => ({ ...c, distanceM: haversine(here.lat, here.lon, c.lat, c.lon) }));
}

/* ------------------------------------------------------------------ */
/* Villes : alias orthographiques et codes postaux                     */
/* ------------------------------------------------------------------ */

/** Orthographe tapee sans accent -> orthographe exacte, pour corriger avant de chercher. */
export const CITY_ALIASES: Record<string, string> = {
  'sidi bel abess': 'Sidi Bel Abbès',
  'sidi belabes': 'Sidi Bel Abbès',
  'sidi bel abbes': 'Sidi Bel Abbès',
  'sidi belabbes': 'Sidi Bel Abbès',
  bechar: 'Béchar',
  tebessa: 'Tébessa',
  tenes: 'Ténès',
  medea: 'Médéa',
  tiziouzou: 'Tizi Ouzou',
  'tizi ouzou': 'Tizi Ouzou',
  boumerdes: 'Boumerdès',
  boumerdas: 'Boumerdès',
  setif: 'Sétif',
  'ain defla': 'Aïn Defla',
  ghardaia: 'Ghardaïa',
  saida: 'Saïda',
  naama: 'Naâma',
  msila: "M'Sila",
  'm sila': "M'Sila",
  tipaza: 'Tipaza',
  tipasa: 'Tipaza',
  'draa el mizan': 'Draâ El Mizan',
  'bordj bou arreridj': 'Bordj Bou Arréridj',
  'el taref': 'El Tarf',
  'souk ahras': 'Souk Ahras',
  'oum el bouaghi': 'Oum El Bouaghi',
};

/** Codes postaux des 48 wilayas historiques (chef-lieu = XX000), pour completer Photon quand il n'en fournit pas. */
export const WILAYA_POSTCODE: Record<string, string> = {
  adrar: '01000',
  chlef: '02000',
  laghouat: '03000',
  'oum el bouaghi': '04000',
  batna: '05000',
  bejaia: '06000',
  béjaïa: '06000',
  biskra: '07000',
  bechar: '08000',
  béchar: '08000',
  blida: '09000',
  bouira: '10000',
  tamanrasset: '11000',
  tebessa: '12000',
  tébessa: '12000',
  tlemcen: '13000',
  tiaret: '14000',
  'tizi ouzou': '15000',
  alger: '16000',
  djelfa: '17000',
  jijel: '18000',
  setif: '19000',
  sétif: '19000',
  saida: '20000',
  saïda: '20000',
  skikda: '21000',
  'sidi bel abbes': '22000',
  'sidi bel abbès': '22000',
  annaba: '23000',
  guelma: '24000',
  constantine: '25000',
  medea: '26000',
  médéa: '26000',
  mostaganem: '27000',
  msila: '28000',
  "m'sila": '28000',
  mascara: '29000',
  ouargla: '30000',
  oran: '31000',
  'el bayadh': '32000',
  illizi: '33000',
  'bordj bou arreridj': '34000',
  boumerdes: '35000',
  boumerdès: '35000',
  'el tarf': '36000',
  tindouf: '37000',
  tissemsilt: '38000',
  'el oued': '39000',
  khenchela: '40000',
  'souk ahras': '41000',
  tipaza: '42000',
  mila: '43000',
  'ain defla': '44000',
  'aïn defla': '44000',
  naama: '45000',
  naâma: '45000',
  'ain temouchent': '46000',
  'aïn témouchent': '46000',
  ghardaia: '47000',
  ghardaïa: '47000',
  relizane: '48000',
};

/** Libelle du pays selon le code renvoye par le geocodeur, dans les 4 langues de l'app. */
export const COUNTRY_LABEL: Record<'DZ' | 'TN' | 'FR', Record<'fr' | 'ar' | 'dz' | 'en', string>> = {
  DZ: { fr: 'Algérie', ar: 'الجزائر', dz: 'الجزائر', en: 'Algeria' },
  TN: { fr: 'Tunisie', ar: 'تونس', dz: 'تونس', en: 'Tunisia' },
  FR: { fr: 'France', ar: 'فرنسا', dz: 'فرنسا', en: 'France' },
};

/**
 * Normalise le nom d'une ville pour la comparaison (accents et apostrophes
 * retires) : sert a la fois pour CITY_ALIASES et pour reperer une
 * correspondance exacte independamment des accents ("bejaia" == "Béjaïa").
 */
export function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Libelle du pays a partir du code ISO ou du nom renvoye par le geocodeur. */
export function countryLabel(
  info: { countryCode?: string; country?: string },
  lang: 'fr' | 'ar' | 'dz' | 'en',
): string {
  const code = (info.countryCode || '').toUpperCase() as 'DZ' | 'TN' | 'FR';
  if (COUNTRY_LABEL[code]) return COUNTRY_LABEL[code][lang];
  const c = (info.country || '').toLowerCase();
  if (c.includes('alger') || c.includes('جزائر')) return COUNTRY_LABEL.DZ[lang];
  if (c.includes('tunis') || c.includes('تونس')) return COUNTRY_LABEL.TN[lang];
  if (c.includes('france') || c.includes('فرنسا')) return COUNTRY_LABEL.FR[lang];
  return info.country || '';
}

/* ------------------------------------------------------------------ */
/* Classement des resultats                                            */
/* ------------------------------------------------------------------ */

export type RankableResult = {
  name: string;
  lat: number;
  lon: number;
  osmKey?: string;
  osmValue?: string;
  type?: string;
};

/** Rang d'entite habitee : ville > bourg > village/lieu-dit. 0 si ce n'en est pas une. */
export function cityRank(r: RankableResult): number {
  const k = (r.osmKey || '').toLowerCase();
  const v = (r.osmValue || '').toLowerCase();
  const t = (r.type || '').toLowerCase();
  if (v === 'city' || t === 'city') return 3;
  if (v === 'town' || t === 'town') return 2;
  if (v === 'village' || v === 'municipality' || v === 'hamlet' || t === 'village' || t === 'municipality') return 1;
  if (k === 'place' && (t === 'locality' || t === 'district')) return 1;
  return 0;
}

export type RankedResult<T> = T & {
  distanceM?: number;
  score: number;
  exactCity: boolean;
};

/**
 * Classement des resultats de recherche, repris a l'identique de doSearch()
 * en v83 : deux paliers seulement.
 *   1. les VILLES dont le nom est exactement celui tape (la plus grande
 *      d'abord, puis la plus proche) — corrige "Strasbourg -> Belfort" (la
 *      ville passe devant un lieu-dit homonyme plus proche).
 *   2. tout le reste, strictement du plus proche au plus eloigne — corrige
 *      "Paris" (un "Paris Store" a 1,6 km ne doit pas suivre des resultats a
 *      400 km juste parce qu'ils correspondent mieux au texte tape).
 * Les autoroutes et troncons multi-villes ("Blida;Oran") sont elimines par
 * un score negatif avant le tri, jamais par la distance.
 */
export function rankSearchResults<T extends RankableResult>(
  results: T[],
  query: string,
  here: { lat: number; lon: number } | null,
): RankedResult<T>[] {
  const qLow = query.toLowerCase().trim();
  const qNorm = normalizeCity(query);

  const scored: RankedResult<T>[] = results.map((r) => {
    let score = 0;
    const nLow = (r.name || '').toLowerCase();
    const isExact = nLow === qLow || normalizeCity(r.name || '') === qNorm;
    const rank = cityRank(r);
    if (isExact) score += 100;
    else if (nLow.startsWith(qLow)) score += 60;
    else if (nLow.includes(qLow)) score += 30;
    if (['city', 'town', 'village', 'municipality'].includes(r.type ?? '') || ['city', 'town', 'village'].includes(r.osmValue ?? '')) {
      score += 50;
    }
    if (r.osmKey === 'place') score += 25;
    if (r.osmKey === 'highway' || ['motorway', 'trunk', 'primary', 'secondary'].includes(r.osmValue ?? '')) score -= 60;
    if ((r.name || '').includes(';')) score -= 80;

    return {
      ...r,
      score,
      exactCity: isExact && rank > 0,
      _cityRank: rank,
      distanceM: here ? haversine(here.lat, here.lon, r.lat, r.lon) : undefined,
    } as RankedResult<T> & { _cityRank: number };
  });

  const filtered = scored.filter((r) => r.score > -40);

  if (here) {
    filtered.sort((a, b) => {
      const ac = (a as unknown as { _cityRank: number })._cityRank;
      const bc = (b as unknown as { _cityRank: number })._cityRank;
      if (a.exactCity !== b.exactCity) return a.exactCity ? -1 : 1;
      if (a.exactCity && b.exactCity && ac !== bc) return bc - ac;
      return (a.distanceM! - b.distanceM!) || (b.score - a.score);
    });
  } else {
    filtered.sort((a, b) => {
      const ac = (a as unknown as { _cityRank: number })._cityRank;
      const bc = (b as unknown as { _cityRank: number })._cityRank;
      return (Number(b.exactCity) - Number(a.exactCity)) || (bc - ac) || (b.score - a.score);
    });
  }
  return filtered;
}
