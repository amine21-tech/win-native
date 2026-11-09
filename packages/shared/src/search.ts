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
  aéroports: 'airport',
  'bus station': 'bus station',
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
  /* Le reseau SNTF ne tient pas dans une seule etiquette. OpenStreetMap distingue la GARE
   * (`railway=station`, avec batiment et guichet) de la HALTE (`railway=halt`, un simple
   * arret) — et les lignes de banlieue algeriennes en comptent beaucoup. Ne demander que les
   * gares revenait a ignorer la moitie des points d'arret reels. */
  'train station': [
    ['railway', 'station'],
    ['railway', 'halt'],
  ],
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
  /* LES NOMS KABYLES EN ALPHABET LATIN — point 11 du 9 novembre, << recherche TRILINGUE >>.
   *
   * POURQUOI DANS CETTE TABLE ET NON DANS LA MESURE DE PROXIMITE. Un nom kabyle n'est pas une
   * faute d'orthographe du nom francais : << Lzzayr >> et << Alger >> n'ont aucune lettre en
   * commun dans le meme ordre, et aucune distance d'edition ne les rapprochera jamais. Ce sont
   * deux noms differents de la meme ville, exactement comme << Wahran >> et << Oran >>, et cela
   * se declare — cela ne se calcule pas.
   *
   * Ce sont les noms que les locuteurs ecrivent reellement, pas des transcriptions inventees.
   * Une saisie en tifinagh y arrive aussi : elle est d'abord translitteree en latin. */
  lzzayr: 'Alger',
  dzayer: 'Alger',
  tizi: 'Tizi Ouzou',
  'tizi wezzu': 'Tizi Ouzou',
  'tizi wzzu': 'Tizi Ouzou',
  vgayet: 'Béjaïa',
  bgayet: 'Béjaïa',
  tubirett: 'Bouira',
  tuvirett: 'Bouira',
  bumerdas: 'Boumerdès',
  stif: 'Sétif',
  tbessa: 'Tébessa',
  wahran: 'Oran',
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


/* ------------------------------------------------------------------ */
/* Fautes de frappe et transcriptions                                  */
/* ------------------------------------------------------------------ */

/**
 * POURQUOI UNE SIMPLE LISTE D'ALIAS NE SUFFISAIT PAS.
 *
 * `CITY_ALIASES` ci-dessus est une liste ecrite a la main : elle corrige ce qu'on a pense a y
 * mettre, et rien d'autre. Or un nom algerien transcrit en caracteres latins n'a pas UNE
 * orthographe, il en a plusieurs, toutes legitimes — << Tizi Ouzou >>, << Tizi Uzou >>,
 * << Tizi-Wezzu >> designent la meme ville, et personne ne se trompe en ecrivant l'une des
 * trois. S'y ajoutent les fautes de frappe ordinaires.
 *
 * On ne peut pas les enumerer. En revanche on peut les RAMENER A LA MEME FORME, en effacant
 * ce qui varie d'une transcription a l'autre : le << ou >> francais et le << u >> anglais, le
 * << dj >> et le << j >>, le << ch >> et le << sh >>, les consonnes doublees, le << e >> final
 * muet. Deux ecritures d'un meme nom donnent alors la meme cle, et il ne reste a mesurer que
 * les vraies fautes de frappe.
 */
export function phoneticKey(s: string): string {
  let k = normalizeCity(s).replace(/[^a-z0-9]/g, '');
  k = k.replace(/ph/g, 'f');
  // << sh >> ramene a << ch >>, pas l'inverse : la transcription francaise est la plus
  // repandue en Algerie, et c'est celle de nos noms de reference.
  k = k.replace(/sh/g, 'ch');
  k = k.replace(/dj/g, 'j');
  k = k.replace(/ou/g, 'u');
  k = k.replace(/w/g, 'u');
  k = k.replace(/y/g, 'i');
  // Consonnes et voyelles doublees : << Abbes >> et << Abes >>, << Naama >> et << Nama >>.
  k = k.replace(/(.)\1+/g, '$1');
  // << e >> final muet : << Boumerdes >> et << Boumerd >> se rejoignent.
  k = k.replace(/e$/, '');
  return k;
}

/**
 * Distance d'edition, bornee. On s'arrete des que l'ecart depasse `max` : il n'y a aucune
 * raison de calculer la distance exacte entre deux mots qui n'ont manifestement rien a voir,
 * et cette fonction tourne a chaque frappe contre soixante noms.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let precedent = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const courant = [i];
    let minLigne = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(courant[j - 1]! + 1, precedent[j]! + 1, precedent[j - 1]! + cout);
      courant.push(v);
      if (v < minLigne) minLigne = v;
    }
    if (minLigne > max) return max + 1;
    precedent = courant;
  }
  return precedent[b.length]!;
}

/**
 * Noms de reference : les 58 wilayas, dans l'orthographe que WIN affiche.
 *
 * Ce sont eux que l'on cherche a retrouver derriere une saisie approximative. La liste est
 * volontairement limitee aux wilayas : ce sont les noms que l'on tape pour situer une
 * recherche (<< pharmacie tizi ouzou >>), et plus la liste est longue, plus le risque de
 * corriger a tort un nom de commerce qui ressemble a une ville.
 */
export const DZ_WILAYA_NAMES: readonly string[] = [
  'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Béjaïa', 'Biskra', 'Béchar',
  'Blida', 'Bouira', 'Tamanrasset', 'Tébessa', 'Tlemcen', 'Tiaret', 'Tizi Ouzou', 'Alger',
  'Djelfa', 'Jijel', 'Sétif', 'Saïda', 'Skikda', 'Sidi Bel Abbès', 'Annaba', 'Guelma',
  'Constantine', 'Médéa', 'Mostaganem', "M'Sila", 'Mascara', 'Ouargla', 'Oran', 'El Bayadh',
  'Illizi', 'Bordj Bou Arréridj', 'Boumerdès', 'El Tarf', 'Tindouf', 'Tissemsilt', 'El Oued',
  'Khenchela', 'Souk Ahras', 'Tipaza', 'Mila', 'Aïn Defla', 'Naâma', 'Aïn Témouchent',
  'Ghardaïa', 'Relizane', 'Timimoun', 'Bordj Badji Mokhtar', 'Ouled Djellal', 'Béni Abbès',
  'In Salah', 'In Guezzam', 'Touggourt', 'Djanet', "El M'Ghair", 'El Meniaa',
];

/**
 * AUTRES NOMS DE LA MEME VILLE — et pourquoi ils ne relevent pas de la distance d'edition.
 *
 * << Bgayet >> n'est pas une faute pour << Bejaia >> : c'est le nom kabyle de la ville, et
 * celui que beaucoup tapent. << Wahran >> pour Oran, << Qacentina >> pour Constantine,
 * << Dzair >> pour Alger : ce sont des noms, pas des coquilles. Les mesurer en nombre de
 * lettres a changer n'a aucun sens — ils en partagent a peine la moitie.
 *
 * Ils se declarent donc, un par un. La cle est leur forme phonetique, pour que les variantes
 * d'ecriture de l'autre nom marchent aussi (<< Vgayet >> comme << Bgayet >>).
 */
const AUTRES_NOMS: Record<string, string> = {
  [phoneticKey('Bgayet')]: 'Béjaïa',
  [phoneticKey('Vgayet')]: 'Béjaïa',
  [phoneticKey('Bgaia')]: 'Béjaïa',
  [phoneticKey('Wahran')]: 'Oran',
  [phoneticKey('Qacentina')]: 'Constantine',
  [phoneticKey('Ksentina')]: 'Constantine',
  [phoneticKey('Dzair')]: 'Alger',
  [phoneticKey('El Djazair')]: 'Alger',
  [phoneticKey('Alger Centre')]: 'Alger',
  [phoneticKey('Tiziwezzu')]: 'Tizi Ouzou',
  [phoneticKey('Tamanghasset')]: 'Tamanrasset',
  [phoneticKey('Taghzut')]: 'Tizi Ouzou',
  [phoneticKey('Annaba Bone')]: 'Annaba',
  [phoneticKey('Bone')]: 'Annaba',
  [phoneticKey('Philippeville')]: 'Skikda',
  [phoneticKey('Setif Stif')]: 'Sétif',
};

/**
 * Mots courants qui ne designent jamais une ville. Sans eux, une saisie comme << poste >> ou
 * << plage >> finirait par etre << corrigee >> vers la wilaya la plus proche a une faute pres,
 * ce qui est exactement le contraire du service rendu.
 */
const MOTS_NON_LIEUX = new Set([
  'poste', 'hotel', 'hopital', 'clinique', 'pharmacie', 'banque', 'gare', 'plage', 'cafe',
  'ecole', 'lycee', 'mosquee', 'marche', 'souk', 'stade', 'parking', 'station', 'bureau',
  'centre', 'place', 'rue', 'avenue', 'boulevard', 'cite', 'residence', 'salle', 'magasin',
  'restaurant', 'taxi', 'police', 'mairie', 'airport', 'aeroport', 'port', 'universite',
]);

/** Le nom de wilaya cache derriere une saisie, ou `null` si aucune ne colle. */
function wilayaProche(texte: string): string | null {
  const brut = normalizeCity(texte);
  if (MOTS_NON_LIEUX.has(brut)) return null;

  /* UNE AUTRE ECRITURE N'EST JAMAIS << PROCHE >>, et ce refus repare un defaut reel.
   *
   * `phoneticKey` ne garde que [a-z0-9] : tout caractere arabe ou tifinagh est simplement
   * EFFACE. << صيدلية Tizi Ouzou >> (pharmacie Tizi Ouzou) donnait donc la cle << tiziuzu >>,
   * identique a celle de Tizi Ouzou — et `corrigerLieu`, croyant avoir reconnu la ville dans
   * la phrase ENTIERE, rendait << Tizi Ouzou >> en jetant le mot cherche.
   *
   * Le defaut etait invisible tant que personne ne tapait en arabe. La recherche trilingue du
   * 9 novembre l'a rendu atteignable, et il se manifestait de la pire facon : une recherche de
   * pharmacie se transformait en recherche de ville, sans erreur, sans trace.
   *
   * On refuse donc avant de mesurer. Les saisies d'une autre ecriture sont ramenees en lettres
   * latines bien avant d'arriver ici — voir `translittererRequete`. */
  if (/[^\u0000-\u024F]/.test(texte)) return null;

  const cle = phoneticKey(texte);
  // En dessous de quatre caracteres, deux noms sans rapport se ressemblent trop.
  if (cle.length < 4) return null;

  // Un AUTRE NOM de la meme ville se reconnait avant toute mesure d'ecart : il n'y a rien a
  // mesurer entre << Wahran >> et << Oran >>.
  const autre = AUTRES_NOMS[cle];
  if (autre) return autre;

  // Une faute toleree sur un nom court, deux sur un nom long : un ecart de deux lettres sur
  // << Mila >> en ferait un autre mot, sur << Bordj Bou Arreridj >> c'est une coquille.
  const max = cle.length >= 8 ? 2 : 1;

  let meilleur: { nom: string; d: number } | null = null;
  for (const nom of DZ_WILAYA_NAMES) {
    const k = phoneticKey(nom);
    if (k === cle) return nom;
    const d = editDistance(k, cle, max);
    if (d <= max && (meilleur === null || d < meilleur.d)) meilleur = { nom, d };
  }
  return meilleur ? meilleur.nom : null;
}

/**
 * Remet d'aplomb la partie << lieu >> d'une recherche, et elle seule.
 *
 * << pharmacie tizi uzou >> devient << pharmacie Tizi Ouzou >> : le commerce cherche n'est pas
 * touche, seule la ville est corrigee. On essaie les groupes de mots les plus LONGS d'abord,
 * sans quoi << sidi bel abbes >> serait reconnu par son dernier mot et corrige de travers.
 *
 * Quand rien ne correspond, la saisie repart telle quelle : ne pas corriger vaut toujours
 * mieux que corriger a tort.
 */
export function corrigerLieu(saisie: string): string {
  const mots = saisie.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return saisie;

  for (let taille = Math.min(3, mots.length); taille >= 1; taille -= 1) {
    const debut = mots.length - taille;
    const canonique = wilayaProche(mots.slice(debut).join(' '));
    if (canonique) {
      const avant = mots.slice(0, debut).join(' ');
      return avant ? `${avant} ${canonique}` : canonique;
    }
  }
  return saisie;
}

/* ------------------------------------------------------------------ */
/* Recherche TRILINGUE : francais, arabe, tamazight (point 11, 9 nov.) */
/* ------------------------------------------------------------------ */

/**
 * LES NOMS ARABES DES 58 WILAYAS, pour qu'on puisse taper << تيزي وزو >>.
 *
 * POURQUOI UNE TABLE ET NON UNE TRANSLITTERATION. L'arabe ne note pas les voyelles courtes :
 * << وهران >> s'ecrit w-h-r-a-n, et une translitteration mecanique en tire << whran >>, qui ne
 * ressemble a << Oran >> par aucun calcul de proximite. Le meme probleme rend
 * << قسنطينة >> (q-s-n-t-i-n-a) introuvable depuis << Constantine >>. Il n'y a pas de regle : il
 * faut la liste.
 *
 * CE SONT LES NOMS OFFICIELS, ceux de l'etat civil et des plaques — pas des transcriptions
 * approchees. C'est ce qu'un utilisateur algerien tape quand son clavier est en arabe, et c'est
 * ce qu'affichent les panneaux routiers du pays.
 *
 * LA TABLE VA DE L'ARABE VERS LE NOM CANONIQUE de WIN, dans ce sens-la seulement : on cherche a
 * reconnaitre une SAISIE, pas a traduire un affichage. Les libelles affiches viennent des
 * fichiers de langue.
 */
export const WILAYAS_AR: Record<string, string> = {
  'أدرار': 'Adrar',
  'الشلف': 'Chlef',
  'الأغواط': 'Laghouat',
  'أم البواقي': 'Oum El Bouaghi',
  'باتنة': 'Batna',
  'بجاية': 'Béjaïa',
  'بسكرة': 'Biskra',
  'بشار': 'Béchar',
  'بشّار': 'Béchar',
  'البليدة': 'Blida',
  'البويرة': 'Bouira',
  'تمنراست': 'Tamanrasset',
  'تبسة': 'Tébessa',
  'تلمسان': 'Tlemcen',
  'تيارت': 'Tiaret',
  'تيزي وزو': 'Tizi Ouzou',
  'الجزائر': 'Alger',
  'الجلفة': 'Djelfa',
  'جيجل': 'Jijel',
  'سطيف': 'Sétif',
  'سعيدة': 'Saïda',
  'سكيكدة': 'Skikda',
  'سيدي بلعباس': 'Sidi Bel Abbès',
  'عنابة': 'Annaba',
  'قالمة': 'Guelma',
  'قسنطينة': 'Constantine',
  'المدية': 'Médéa',
  'مستغانم': 'Mostaganem',
  'المسيلة': "M'Sila",
  'معسكر': 'Mascara',
  'ورقلة': 'Ouargla',
  'وهران': 'Oran',
  'البيض': 'El Bayadh',
  'البيّض': 'El Bayadh',
  'إليزي': 'Illizi',
  'برج بوعريريج': 'Bordj Bou Arréridj',
  'بومرداس': 'Boumerdès',
  'الطارف': 'El Tarf',
  'تندوف': 'Tindouf',
  'تيسمسيلت': 'Tissemsilt',
  'الوادي': 'El Oued',
  'خنشلة': 'Khenchela',
  'سوق أهراس': 'Souk Ahras',
  'تيبازة': 'Tipaza',
  'ميلة': 'Mila',
  'عين الدفلة': 'Aïn Defla',
  'النعامة': 'Naâma',
  'عين تموشنت': 'Aïn Témouchent',
  'غرداية': 'Ghardaïa',
  'غليزان': 'Relizane',
  'تيميمون': 'Timimoun',
  'برج باجي مختار': 'Bordj Badji Mokhtar',
  'أولاد جلال': 'Ouled Djellal',
  'بني عباس': 'Béni Abbès',
  'عين صالح': 'In Salah',
  'عين قزام': 'In Guezzam',
  'تقرت': 'Touggourt',
  'جانت': 'Djanet',
  'المغير': "El M'Ghair",
  'المنيعة': 'El Meniaa',
};

/**
 * TIFINAGH VERS LATIN, lettre par lettre.
 *
 * POURQUOI UNE TRANSLITTERATION ICI, ALORS QUE L'ARABE DEMANDAIT UNE TABLE. Le tifinagh NOTE LES
 * VOYELLES : ⵜⵉⵣⵉ se lit t-i-z-i, sans ambiguite. Une conversion lettre a lettre donne donc un
 * mot latin que la correction phonetique existante reconnait deja — << tizi wzzu >> trouve
 * << Tizi Ouzou >> par la meme mesure de proximite qui corrige << tizi uzou >>.
 *
 * ET ON N'INVENTE RIEN. Une table de noms tifinagh pour les cinquante-huit wilayas supposerait
 * d'ecrire en tifinagh des noms de villes arabophones ou il n'est pas en usage — Souk Ahras, El
 * Oued. Ce serait fabriquer des noms que personne n'ecrit, puis les servir comme s'ils etaient
 * officiels. La translitteration, elle, marche pour ce que les gens ecrivent reellement en
 * tifinagh : les noms kabyles et touaregs.
 *
 * Les noms kabyles EN ALPHABET LATIN marchaient deja : << Bgayet >> trouve Béjaïa depuis le
 * 2 novembre, par la meme correction phonetique.
 */
const TIFINAGH_VERS_LATIN: Record<string, string> = {
  'ⴰ': 'a', 'ⴱ': 'b', 'ⴲ': 'b', 'ⴳ': 'g', 'ⴴ': 'g', 'ⴵ': 'j', 'ⴶ': 'j',
  'ⴷ': 'd', 'ⴸ': 'd', 'ⴹ': 'd', 'ⴺ': 'd', 'ⴻ': 'e', 'ⴼ': 'f', 'ⴽ': 'k',
  'ⴾ': 'k', 'ⴿ': 'k', 'ⵀ': 'h', 'ⵁ': 'h', 'ⵂ': 'h', 'ⵃ': 'h', 'ⵄ': 'a',
  'ⵅ': 'kh', 'ⵆ': 'kh', 'ⵇ': 'q', 'ⵈ': 'q', 'ⵉ': 'i', 'ⵊ': 'j', 'ⵋ': 'j',
  'ⵌ': 'j', 'ⵍ': 'l', 'ⵎ': 'm', 'ⵏ': 'n', 'ⵐ': 'n', 'ⵑ': 'n', 'ⵒ': 'p',
  'ⵓ': 'u', 'ⵔ': 'r', 'ⵕ': 'r', 'ⵖ': 'gh', 'ⵗ': 'gh', 'ⵘ': 'gh', 'ⵙ': 's',
  'ⵚ': 's', 'ⵛ': 'ch', 'ⵜ': 't', 'ⵝ': 't', 'ⵞ': 'ch', 'ⵟ': 't', 'ⵠ': 'v',
  'ⵡ': 'w', 'ⵢ': 'y', 'ⵣ': 'z', 'ⵤ': 'z', 'ⵥ': 'z', 'ⵦ': 'z', 'ⵧ': 'o',
  'ⵯ': 'w',
};

/** La chaine contient-elle du tifinagh ? */
export function estTifinagh(s: string): boolean {
  return /[\u2D30-\u2D7F]/.test(s);
}

/** La chaine contient-elle de l'arabe ? */
export function estArabe(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

/** Translittere le tifinagh en lettres latines, et laisse le reste intact. */
export function translittererTifinagh(s: string): string {
  let sortie = '';
  for (const c of s) sortie += TIFINAGH_VERS_LATIN[c] ?? c;
  return sortie;
}

/**
 * RAMENE UNE SAISIE EN ARABE OU EN TIFINAGH A SON NOM LATIN, quand on sait le faire.
 *
 * C'est la porte d'entree du trilingue, et elle est volontairement PRUDENTE : si elle ne
 * reconnait rien, elle rend la saisie telle quelle. Le geocodeur recoit alors l'arabe ou le
 * tifinagh d'origine et fait ce qu'il peut — Photon connait une partie des noms arabes
 * d'Algerie. Ne rien reconnaitre ne doit jamais etre pire que ne pas avoir essaye.
 *
 * L'ORDRE COMPTE. On cherche la table arabe AVANT de translitterer : << وهران >> est dans la
 * table et donne << Oran >>, alors qu'aucune translitteration n'y arriverait.
 */
export function translittererRequete(saisie: string): string {
  const q = saisie.trim();
  if (q.length === 0) return saisie;

  if (estArabe(q)) {
    /* La table d'abord, telle quelle puis sans l'article : on tape aussi bien << الجزائر >> que
     * << جزائر >>. */
    const direct = WILAYAS_AR[q];
    if (direct) return direct;
    const sansArticle = WILAYAS_AR['ال' + q];
    if (sansArticle) return sansArticle;
    /* UN MOT D'UNE PHRASE PEUT SUFFIRE : << صيدلية تيزي وزو >> (pharmacie Tizi Ouzou) doit
     * ramener la ville. On remplace les groupes de mots connus, du plus long au plus court,
     * comme le fait corrigerLieu pour le francais. */
    const mots = q.split(/\s+/);
    for (let taille = Math.min(3, mots.length); taille >= 1; taille -= 1) {
      for (let debut = 0; debut + taille <= mots.length; debut += 1) {
        const groupe = mots.slice(debut, debut + taille).join(' ');
        const trouve = WILAYAS_AR[groupe];
        if (trouve) {
          const reste = [...mots.slice(0, debut), ...mots.slice(debut + taille)];
          return reste.length > 0 ? `${reste.join(' ')} ${trouve}` : trouve;
        }
      }
    }
    return saisie;
  }

  if (estTifinagh(q)) return translittererTifinagh(q);
  return saisie;
}

/* ------------------------------------------------------------------ */
/* Point 18 du client : villes d'abord, puis adresses VIP              */
/* ------------------------------------------------------------------ */

/**
 * ORDRE DE CLASSEMENT STRICT (point 18, synthese du 29 octobre).
 *
 *   1. la VILLE / commune / wilaya dont le nom correspond exactement ;
 *   2. les ADRESSES VIP de l'utilisateur situees dans le perimetre ;
 *   3. tout le reste, du plus proche au plus eloigne.
 *
 * LE DEFAUT QUE LE CLIENT DECRIT N'EST PAS CELUI QU'IL CROIT. Il ecrit que << des
 * etablissements nommes Tipaza mais situes a Alger apparaissent avant la ville de Tipaza >>, et
 * en conclut que le classement ignore les villes. Il ne les ignore pas : `rankSearchResults`
 * les place en tete depuis le debut. Ce qui les en delogeait, c'est une remontee appliquee
 * APRES lui — celle qui fait passer devant les fiches de notre propre base dont le nom contient
 * ce qui a ete tape. Un commerce << Tipaza Pneus >> enregistre a Alger satisfait cette regle, et
 * passait donc devant la ville.
 *
 * Les deux regles sont bonnes separement. C'est leur ordre qui ne l'etait pas : la remontee des
 * fiches ne doit jouer qu'a l'interieur de ce qui n'est pas une ville exacte.
 *
 * LE PERIMETRE DES VIP n'est pas un detail d'optimisation. Un favori enregistre a Oran n'a rien
 * a faire en tete d'une recherche faite a Annaba : il repondrait au nom tape, mais pas au
 * besoin. Au-dela du perimetre, il redescend dans le lot commun et se classe a la distance,
 * comme n'importe quel resultat.
 */
export const PERIMETRE_VIP_M = 50_000;

/**
 * LES WILAYAS QUE DESIGNE UNE SAISIE PARTIELLE.
 *
 * POURQUOI << EXACTEMENT >> NE SUFFISAIT PAS. Le classement ne reconnaissait une ville que
 * si le nom tape lui correspondait EN ENTIER. Or personne ne tape << Tizi Ouzou >> : on tape
 * << tizi >>, on regarde la premiere suggestion, et on appuie. Avec un nom partiel, la ville
 * retombait dans le lot commun, ou seule la distance compte — et depuis Alger, un commerce
 * nomme << Tizi Pneus >> a trois cents metres passait devant la wilaya a cent kilometres.
 *
 * C'est le meme defaut que << Tipaza >>, deja corrige deux fois, mais par une troisieme porte :
 * la premiere fois le classement etait faux, la deuxieme un bloc remontait les partenaires
 * par-dessus, et ici la ville n'etait simplement pas RECONNUE comme telle.
 *
 * DEUX CARACTERES AU MINIMUM. A une seule lettre, << a >> designerait Adrar, Alger, Annaba,
 * Ain Defla et Ain Temouchent : cinq wilayas en tete, ce qui ne suggere rien. A deux, la
 * liste se resserre d'elle-meme.
 *
 * Plusieurs wilayas peuvent correspondre — << ain >> en designe deux — et c'est voulu : elles
 * occupent alors le premier palier ensemble, departagees comme avant par leur taille puis par
 * leur distance.
 */
export function wilayasVisees(requete: string): string[] {
  const q = normalizeCity(requete);
  if (q.length < 2) return [];
  return DZ_WILAYA_NAMES.filter((w) => normalizeCity(w).startsWith(q));
}

/** Ce resultat est-il l'une des wilayas visees ? Le nom doit correspondre, et designer un LIEU
 *  — une rue << Tizi Ouzou >> a Alger n'est pas la wilaya. */
export function estWilayaVisee(r: RankableResult, visees: readonly string[]): boolean {
  if (visees.length === 0) return false;
  if (cityRank(r) === 0) return false;
  const n = normalizeCity(r.name || '');
  return visees.some((w) => normalizeCity(w) === n);
}

/**
 * LES LIEUX PUBLICS, troisieme palier du classement (demande du 3 novembre).
 *
 * CE QUE << PUBLIC >> VEUT DIRE ICI : un etablissement que l'on cherche parce qu'on en a
 * besoin, pas parce qu'on veut y acheter quelque chose. Un hopital, une mairie, une gare, une
 * ecole, une poste, un commissariat. Ils passent devant les petites villes et devant les lieux
 * ajoutes, pour une raison simple : quand on tape le nom d'un de ces etablissements, on ne
 * cherche jamais un commerce qui porte le meme nom.
 *
 * CE QUI N'EN EST PAS, et il faut etre net, sans quoi le palier avalerait la moitie de la
 * carte : un restaurant, un cafe, un hotel, une banque, un garage, une station-service, un
 * magasin. Tous utiles, aucun public. Une pharmacie non plus — elle est privee, meme de garde,
 * et la mettre ici ferait passer toutes les pharmacies de la ville devant les villages.
 *
 * ON RECONNAIT PAR DEUX CHEMINS. Nos propres fiches portent une `category` ; celles
 * d'OpenStreetMap portent `osmKey`/`osmValue`. Les deux vocabulaires ne se recouvrent pas, et
 * ignorer l'un des deux reviendrait a ne classer qu'une moitie des resultats.
 */
const CATEGORIES_PUBLIQUES = new Set([
  'hopital',
  'ecole',
  'universite',
  'mosquee',
  'administration',
  'poste',
  'transport',
]);

const VALEURS_OSM_PUBLIQUES = new Set([
  'hospital',
  'clinic',
  'doctors',
  'townhall',
  'police',
  'fire_station',
  'school',
  'college',
  'university',
  'post_office',
  'courthouse',
  'embassy',
  'library',
  'place_of_worship',
  'bus_station',
  'station',
  'halt',
  'aerodrome',
  'terminal',
  'ferry_terminal',
]);

export function estLieuPublic(r: RankableResult & { category?: string }): boolean {
  if (cityRank(r) > 0) return false; // une ville n'est pas un etablissement
  if (r.category && CATEGORIES_PUBLIQUES.has(r.category)) return true;
  const v = (r.osmValue || '').toLowerCase();
  const t = (r.type || '').toLowerCase();
  const k = (r.osmKey || '').toLowerCase();
  if (k === 'railway' || k === 'aeroway') return true;
  return VALEURS_OSM_PUBLIQUES.has(v) || VALEURS_OSM_PUBLIQUES.has(t);
}

/**
 * LE QUARTIER ET LA DAIRA — correctif du 8 novembre, point 11.
 *
 * Le document donne quatre rangs : << 1-Ville/Commune, 2-Quartier/Daira, 3-Rue/Avenue,
 * 4-Adresse exacte >>. Les rangs 3 et 4 existaient deja — le reste du classement les departage
 * par la distance. Le rang 2 manquait completement : un quartier tombait dans le lot commun, ou
 * seule la distance compte.
 *
 * CE QUE CELA CHANGEAIT CONCRETEMENT. On tape << bab el oued >> depuis Alger-centre. Le
 * quartier est a trois kilometres ; une boulangerie << Bab El Oued >> a quatre cents metres
 * passait devant, parce que plus proche. Le quartier est ce qu'on cherche quand on tape son nom
 * — comme la wilaya l'est pour << tizi >>, et c'est exactement le meme defaut, un cran plus
 * bas dans l'echelle administrative.
 *
 * LES VALEURS VIENNENT D'OPENSTREETMAP, qui n'a pas de mot pour << daira >>. Une daira
 * algerienne y est tantot un `place=suburb` (quartier urbain), tantot un `place=district`,
 * tantot une limite administrative de niveau 6 ou 7. On accepte donc toute la famille, et c'est
 * sans risque : ces valeurs ne designent jamais un commerce.
 *
 * `locality` ET `hamlet` N'EN SONT PAS, volontairement. Ce sont des lieux-dits et des hameaux —
 * `cityRank` les compte deja comme des villes de rang 1, et les faire basculer dans ce palier
 * les ferait DESCENDRE sous les villes alors qu'ils en sont.
 */
const VALEURS_QUARTIER = new Set([
  'suburb',
  'neighbourhood',
  'quarter',
  'borough',
  'city_district',
  'city_block',
  'district',
  'subdistrict',
]);

/** Ce resultat designe-t-il un quartier ou une daira ? */
export function estQuartier(r: RankableResult): boolean {
  const v = (r.osmValue || '').toLowerCase();
  const t = (r.type || '').toLowerCase();
  return VALEURS_QUARTIER.has(v) || VALEURS_QUARTIER.has(t);
}

/**
 * Ce quartier est-il celui que DESIGNE la saisie ?
 *
 * LE NOM DOIT CORRESPONDRE, et ce n'est pas une precaution de style. Sans ce controle, taper
 * << pharmacie >> remonterait au deuxieme palier tous les quartiers des environs, qui
 * apparaissent dans les resultats des que leur description contient le mot. On exige donc,
 * comme pour la wilaya, que le nom du quartier commence par ce qui a ete tape.
 */
export function estQuartierVise(r: RankableResult, requete: string): boolean {
  if (!estQuartier(r)) return false;
  const q = normalizeCity(requete);
  if (q.length < 2) return false;
  return normalizeCity(r.name || '').startsWith(q);
}

/**
 * RAYON DYNAMIQUE DES VIP : 5 km, puis 15, puis 30 — point 12 du 9 novembre.
 *
 * CE QUE CELA REMPLACE. Un perimetre unique de cinquante kilometres. Il avait un defaut que le
 * client decrit en creux : a Alger, cinquante kilometres ramassent toute la Mitidja, et un
 * partenaire de Blida passait devant un resultat a trois rues. A Tamanrasset, le meme perimetre
 * ne contient parfois AUCUN partenaire, et le palier restait vide alors que le plus proche est a
 * soixante kilometres — l'abonne payait pour une visibilite qu'il n'avait pas.
 *
 * LE REPLI EST AUTOMATIQUE ET SILENCIEUX, et c'est le mot du document : << l'utilisateur voit
 * des resultats, pas un message d'erreur >>. On ne lui annonce pas qu'on a elargi ; il voit
 * simplement les partenaires qui existent.
 *
 * AU-DELA DE TRENTE KILOMETRES, AUCUN VIP. Ce n'est pas un oubli : un commerce a quarante
 * kilometres ne repond pas au besoin de quelqu'un qui cherche une pharmacie, et le mettre en
 * tete ferait passer la mise en avant payante avant l'utilite — ce qui finirait par couter la
 * confiance dans les resultats, donc la valeur de l'abonnement lui-meme.
 */
export const PALIERS_RAYON_VIP = [5_000, 15_000, 30_000] as const;

/**
 * Le rayon a retenir, au vu des distances des VIP presents dans les resultats.
 *
 * Rend `null` quand aucun VIP n'est a moins de trente kilometres : il n'y a alors pas de palier
 * VIP du tout, et les resultats sont ceux de tout le monde.
 *
 * UNE DISTANCE INCONNUE COMPTE COMME PROCHE. Sans position GPS on ne peut rien mesurer ; exclure
 * ces VIP reviendrait a desactiver la mise en avant payante chaque fois que le telephone cherche
 * encore son signal, c'est-a-dire souvent et au pire moment. Dans le doute, on garde.
 */
export function rayonVipActif(distancesVip: readonly (number | undefined)[]): number | null {
  return premierPalierNonVide(distancesVip, PALIERS_RAYON_VIP);
}

/**
 * Le premier palier qui contient au moins une des distances donnees, ou `null` si aucun.
 *
 * FACTORISEE PARCE QUE LA REGLE EST LA MEME DEUX FOIS : les VIP (point 12) et les lieux de
 * proximite (point 11) elargissent tous deux leur rayon par paliers jusqu'a trouver quelque
 * chose. Les seuils differrent, le raisonnement non — et deux copies d'un meme raisonnement
 * finissent toujours par diverger sur le detail qui compte, ici la borne inclusive.
 */
function premierPalierNonVide(
  distances: readonly (number | undefined)[],
  paliers: readonly number[],
): number | null {
  if (distances.length === 0) return null;
  /* UNE DISTANCE INCONNUE COMPTE COMME PROCHE : sans position GPS on ne peut rien mesurer, et
   * exclure ces resultats reviendrait a vider la liste chaque fois que le telephone cherche
   * encore son signal. Dans le doute, on garde. */
  if (distances.some((d) => d === undefined)) return paliers[0] ?? null;
  for (const rayon of paliers) {
    if (distances.some((d) => d !== undefined && d <= rayon)) return rayon;
  }
  return null;
}

/**
 * RAYON DE PROXIMITE DES LIEUX : 5 km, puis 15, 30, 50 — point 11 du 9 novembre.
 *
 * << Rayon de PROXIMITE : 5 km en ville pour les lieux/etablissements. >>
 *
 * CE QUE CELA CORRIGE. Une recherche de rubrique — << pharmacie >>, << restaurant >> —
 * interrogeait cinquante kilometres autour de l'utilisateur. A Alger, cela ramene des pharmacies
 * de Blida et de Tipaza au milieu de celles du quartier : la liste est longue, et ce qu'on
 * cherche est noye dedans.
 *
 * POURQUOI DES PALIERS PLUTOT QUE LE FILTRE DU DOCUMENT. Son code ecrit
 * `if (type == PLACE) filter: distance <= 5000m`, et applique tel quel il vide la liste partout
 * ou il n'y a rien a cinq kilometres — un village, une route du Sud, la moitie du territoire.
 * Chercher une pharmacie depuis Djanet ne rendrait plus rien du tout.
 *
 * Les paliers viennent du document LUI-MEME : c'est exactement le mecanisme qu'il decrit au
 * point 12 pour les VIP, << elargissement AUTOMATIQUE et SILENCIEUX >>. On applique sa regle a
 * sa consigne. En ville, le premier palier suffit toujours et le resultat est celui qu'il
 * demande ; ailleurs, l'utilisateur voit ce qui existe au lieu d'une liste vide.
 */
export const PALIERS_RAYON_LIEU = [5_000, 15_000, 30_000, 50_000] as const;

export function rayonProximiteActif(distances: readonly (number | undefined)[]): number | null {
  return premierPalierNonVide(distances, PALIERS_RAYON_LIEU);
}

export type ClassementPoint18Options<T> = {
  /** Vrai si ce resultat est une WILAYA que designe la saisie, meme partielle. Premier palier. */
  estWilaya?: (r: T) => boolean;
  /** Vrai si ce resultat est un etablissement PUBLIC. Deuxieme palier. */
  estPublic?: (r: T) => boolean;
  /** Vrai si ce resultat est une ville dont le nom correspond exactement a la saisie. */
  estVilleExacte: (r: T) => boolean;
  /** Vrai si ce resultat est le QUARTIER ou la DAIRA que designe la saisie. Quatrieme palier,
   *  juste apres la ville — rang 2 du correctif du 8 novembre. */
  estQuartier?: (r: T) => boolean;
  /** Vrai si ce resultat est une adresse enregistree par l'utilisateur, ou un partenaire VIP. */
  estVip: (r: T) => boolean;
  /**
   * Rayon retenu pour les VIP, en metres, ou `null` pour n'en mettre aucun en tete.
   *
   * Calcule par `rayonVipActif` a partir des distances des VIP presents : 5 km, 15 km ou 30 km
   * selon le premier palier non vide (point 12 du 9 novembre). Omis : on retombe sur
   * `PERIMETRE_VIP_M`, le perimetre unique d'avant.
   */
  rayonVip?: number | null;
  /** Distance a l'utilisateur, en metres — `undefined` si la position est inconnue. */
  distanceM: (r: T) => number | undefined;
};

export function classerPoint18<T>(resultats: T[], o: ClassementPoint18Options<T>): T[] {
  const wilayas: T[] = [];
  const publics: T[] = [];
  const villes: T[] = [];
  const quartiers: T[] = [];
  const vip: T[] = [];
  const reste: T[] = [];

  /* LE RAYON RETENU POUR LES VIP. `undefined` veut dire << l'appelant ne s'en occupe pas >> et
   * on retombe sur le perimetre unique d'avant ; `null` veut dire << aucun VIP en tete >>, ce
   * qui est la reponse quand le plus proche est au-dela de trente kilometres. */
  const rayon = o.rayonVip === undefined ? PERIMETRE_VIP_M : o.rayonVip;

  for (const r of resultats) {
    /* LES VIP SONT TESTES EN PREMIER DEPUIS LE 9 NOVEMBRE, et c'est un renversement.
     *
     * Le point 12 du document est explicite — << les etablissements abonnes WIN VIP sont
     * affiches EN TETE des resultats >> — et son code l'ecrit sans ambiguite :
     * `results = vips + standardResults`.
     *
     * CELA DEFAIT LA REGLE DU 2 NOVEMBRE, et il faut le dire ici parce que le prochain lecteur
     * trouvera les deux dans l'historique. Le client avait alors demande l'inverse : << les
     * grandes villes sont avantagees par rapport aux lieux ajoutes par des clients >>. Taper
     * << Tipaza >> ramene donc de nouveau << Tipaza Pneus >>, garage VIP d'Alger, avant la ville
     * de Tipaza. Le defaut a ete signale a arsanne, qui a tranche le 9 novembre : on suit le
     * document.
     *
     * CE QUI LIMITE LA PORTEE, et ce n'est pas rien : seuls les VIP du RAYON ACTIF montent.
     * Au-dela de trente kilometres il n'y a plus de palier VIP du tout, et le classement
     * geographique reprend la main. */
    if (o.estVip(r) && rayon !== null) {
      const dv = o.distanceM(r);
      if (dv === undefined || dv <= rayon) {
        vip.push(r);
        continue;
      }
    }
    /* LA WILAYA ENSUITE, meme sur un nom partiel. << tizi >> doit suggerer Tizi Ouzou avant
     * toute autre chose : c'est le chef-lieu que l'on cherche quand on tape le debut d'un nom
     * de wilaya, pas un commerce qui le porte. */
    if (o.estWilaya?.(r)) {
      wilayas.push(r);
      continue;
    }
    if (o.estPublic?.(r)) {
      publics.push(r);
      continue;
    }
    if (o.estVilleExacte(r)) {
      villes.push(r);
      continue;
    }
    /* LE QUARTIER EST TESTE APRES LA VILLE MAIS CLASSE APRES ELLE AUSSI : l'ordre des tests
     * n'est pas l'ordre des paliers, et il faut les deux. Teste apres, parce qu'un
     * `place=district` satisfait aussi `cityRank` et serait sinon capte par le palier des
     * villes ; classe apres, parce que le document veut la ville d'abord. */
    if (o.estQuartier?.(r)) {
      quartiers.push(r);
      continue;
    }
    /* UN VIP HORS DU RAYON TOMBE ICI, avec tout le monde, et se classe a la distance comme
     * n'importe quel resultat. Il n'est pas efface — il n'est simplement plus mis en avant. */
    reste.push(r);
  }

  /* CHAQUE PALIER GARDE L'ORDRE QU'IL AVAIT. Les trier a nouveau ici defferait le travail de
   * `rankSearchResults` — qui departage deja deux villes homonymes par leur taille puis par
   * leur distance, et le reste par la distance seule.
   *
   * SIX PALIERS, ET LE VIP EST PASSE DU CINQUIEME AU PREMIER le 9 novembre (point 12). Derriere
   * lui, l'ordre geographique du point 11 est intact : la wilaya, le lieu public, la ville
   * exacte, le quartier ou la daira, puis le reste.
   *
   * CHAQUE PALIER GARDE L'ORDRE QU'IL AVAIT — sauf les VIP, que le document veut explicitement
   * << tries par distance croissante >> a l'interieur du rayon actif. C'est la seule exception,
   * et elle est voulue : entre deux partenaires, le plus proche est le plus utile, alors qu'entre
   * deux villes homonymes c'est la plus grande, ce que `rankSearchResults` sait deja. */
  const vipTries = [...vip].sort((a, b) => {
    const da = o.distanceM(a);
    const db = o.distanceM(b);
    // Distance inconnue en dernier : on ne peut pas affirmer qu'elle est petite.
    if (da === undefined) return db === undefined ? 0 : 1;
    if (db === undefined) return -1;
    return da - db;
  });
  return [...vipTries, ...wilayas, ...publics, ...villes, ...quartiers, ...reste];
}
