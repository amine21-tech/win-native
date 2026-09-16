import type { Language, PlaceCategory } from '../shared';
import { countryLabel, normalizeCity, WILAYA_POSTCODE, type RankableResult } from '../shared';

export type Coords = { lat: number; lon: number };

/** Resultat de geocodage, source confondue (Photon, Nominatim, ou notre propre API). */
export type GeocodedResult = RankableResult & {
  displayName: string;
  postcode?: string;
  /** Ajoutee par le classement (rankSearchResults / rankByDistance), absente avant. */
  distanceM?: number;
  source: 'win' | 'photon' | 'nominatim' | 'curated';
  placeId?: string;
  category?: PlaceCategory;
  photoUrl?: string | null;
  photos?: { url: string; thumbUrl: string | null; credit: string | null }[];
  isPartner?: boolean;
  phoneFixe?: string | null;
  phoneMobile?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  promo?: string | null;
};

/**
 * Delai au-dela duquel on renonce a interroger un service de geocodage.
 *
 * Photon et Nominatim sont des services publics gratuits : ils repondent en general en moins
 * d'une seconde, parfois en dix, et parfois jamais — surtout depuis une connexion mobile
 * algerienne. Sans ce garde-fou, une requete restee suspendue laissait la recherche « en
 * chargement » indefiniment : la roue tournait, et plus aucune frappe ne relancait rien
 * puisque la promesse precedente ne se terminait jamais.
 */
const GEOCODER_TIMEOUT_MS = 6000;

/** Nominatim exige une identification distincte dans ses conditions d'utilisation, et bloque
 * les requetes anonymes. Photon, lui, l'accepte sans s'en servir. */
const GEOCODER_USER_AGENT = 'WIN-DZ/1.0 (application de navigation, Algerie)';

/**
 * Appel a un service de geocodage externe : delai borne, code HTTP verifie.
 *
 * Un 429 ou un 503 de Photon renvoie une page HTML, pas du JSON. Sans la verification du code,
 * `response.json()` levait une erreur de syntaxe illisible la ou un simple « service
 * indisponible » suffisait — et l'appelant, qui rattrape tout, se contentait de n'afficher
 * aucun resultat sans qu'on sache jamais pourquoi.
 */
async function fetchGeocoder<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': GEOCODER_USER_AGENT },
    });
    if (!response.ok) throw new Error(`geocodeur indisponible (${response.status})`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Code Photon/Nominatim pour la langue active. Photon ne comprend que fr/en (ar retombe sur fr). */
function accLang(lang: Language): 'fr' | 'en' | 'ar' {
  if (lang === 'en') return 'en';
  if (lang === 'ar' || lang === 'dz') return 'ar';
  return 'fr';
}

const ALLOWED_COUNTRIES = new Set(['algeria', 'dz', 'algérie', 'tunisia', 'tn', 'tunisie', 'france', 'fr', '']);

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
};

function mapPhotonFeature(f: PhotonFeature, lang: Language): GeocodedResult | null {
  const p = f.properties ?? {};
  const lat = f.geometry?.coordinates?.[1];
  const lon = f.geometry?.coordinates?.[0];
  const name = p.name || p.street || '';
  if (lat == null || lon == null || !name) return null;

  const country = (p.country || p.countrycode || '').toLowerCase();
  if (!ALLOWED_COUNTRIES.has(country)) return null;

  const pays = countryLabel({ countryCode: p.countrycode, country: p.country }, accLang(lang));
  const isDZ = (p.countrycode || '').toUpperCase() === 'DZ' || /alger|جزائر/i.test(p.country || '');
  const locality = p.city || p.town || p.village || '';
  const postcode = p.postcode || (isDZ ? WILAYA_POSTCODE[normalizeCity(locality)] : '') || undefined;
  const localityWithCP = [postcode, locality].filter(Boolean).join(' ');

  return {
    name,
    displayName: [name, p.street, localityWithCP, p.state, pays].filter(Boolean).join(', '),
    lat,
    lon,
    osmKey: p.osm_key,
    osmValue: p.osm_value,
    type: p.type,
    postcode,
    source: 'photon',
  };
}

/** Recherche texte generale (doSearch en v83) : biaisee vers la position quand elle est connue. */
export async function fetchPhoton(
  query: string,
  opts: { here?: Coords | null; lang: Language; limit?: number },
): Promise<GeocodedResult[]> {
  const acc = accLang(opts.lang);
  const params = new URLSearchParams({ q: query, limit: String(opts.limit ?? 12), lang: acc });
  if (opts.here) {
    params.set('lat', String(opts.here.lat));
    params.set('lon', String(opts.here.lon));
  } else {
    // Algerie + Tunisie + marge : evite de renvoyer des resultats hors zone sans position connue.
    params.set('bbox', '-8.67,18.97,12.00,37.09');
  }
  const data = await fetchGeocoder<{ features?: PhotonFeature[] }>(
    `https://photon.komoot.io/api/?${params.toString()}`,
  );
  return (data.features ?? [])
    .map((f) => mapPhotonFeature(f, opts.lang))
    .filter((r): r is GeocodedResult => r !== null);
}

/**
 * Recherche par categorie, etage rapide (voie Photon de doCategorySearch en v83) : le tag OSM
 * attendu filtre les resultats, pour ne pas confondre par exemple un magasin de pneus et un
 * garage automobile juste parce que la categorie generale correspond.
 *
 * NOTE : le repli Overpass (etage 2, plus lent et plus exhaustif) de la v83 n'est pas encore porte
 * ici — seules les 40 categories les plus utilisees et bien couvertes par Photon en beneficient
 * pour l'instant. A ajouter si des categories rares reviennent vides en usage reel.
 */
export async function fetchPhotonCategory(
  term: string,
  osmTag: string,
  altTags: [string, string][] | undefined,
  here: Coords,
  lang: Language,
): Promise<GeocodedResult[]> {
  const [expectedKey, expectedValue] = osmTag.split('=');
  const acc = accLang(lang);
  const params = new URLSearchParams({
    q: term,
    limit: '20',
    lang: acc,
    lat: String(here.lat),
    lon: String(here.lon),
  });
  const data = await fetchGeocoder<{ features?: PhotonFeature[] }>(
    `https://photon.komoot.io/api/?${params.toString()}`,
  );

  return (data.features ?? [])
    .filter((f) => {
      const key = f.properties?.osm_key ?? '';
      const value = f.properties?.osm_value ?? '';
      if (altTags) return altTags.some(([k, v]) => key === k && value === v);
      return key === expectedKey && (!expectedValue || value === expectedValue);
    })
    .map((f) => mapPhotonFeature(f, lang))
    .filter((r): r is GeocodedResult => r !== null && !r.name.includes(';'));
}

/** Repli Nominatim, utilise quand Photon ne renvoie rien. */
export async function fetchNominatim(
  query: string,
  opts: { here?: Coords | null; lang: Language },
): Promise<GeocodedResult[]> {
  const acc = accLang(opts.lang);
  const params = new URLSearchParams({
    format: 'jsonv2',
    countrycodes: 'dz,tn,fr',
    addressdetails: '1',
    limit: '10',
    'accept-language': acc,
    q: query,
  });
  if (opts.here) {
    const d = 0.45; // ~50 km autour de la position, priorite aux resultats proches
    params.set(
      'viewbox',
      [opts.here.lon - d, opts.here.lat - d, opts.here.lon + d, opts.here.lat + d].join(','),
    );
    params.set('bounded', '0');
  }
  const data = await fetchGeocoder<
    {
    name?: string;
    display_name?: string;
    lat?: string;
    lon?: string;
    addresstype?: string;
    type?: string;
    }[]
  >(`https://nominatim.openstreetmap.org/search?${params.toString()}`);

  const mapRow = (r: (typeof data)[number]): GeocodedResult | null => {
    const lat = r.lat ? parseFloat(r.lat) : NaN;
    const lon = r.lon ? parseFloat(r.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const name = r.name || (r.display_name || '').split(',')[0] || '';
    if (!name) return null;
    return {
      name,
      displayName: r.display_name || name,
      lat,
      lon,
      type: r.addresstype || r.type,
      source: 'nominatim',
    };
  };

  return (Array.isArray(data) ? data : [])
    .map(mapRow)
    .filter((r): r is GeocodedResult => r !== null);
}
