import { api } from '../api/client';
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
  /** `id` sert a signaler une photo incorrecte : sans lui, le serveur ne sait pas laquelle. */
  photos?: { id?: string; url: string; thumbUrl: string | null; credit: string | null }[];
  isPartner?: boolean;
  /* Adresse decomposee, telle qu'elle a ete SAISIE. `displayName` la recompose pour
   * l'affichage, mais la corriger demande les champs separes. */
  houseNumber?: string | null;
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  wilaya?: string | null;
  phoneFixe?: string | null;
  phoneMobile?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  promo?: string | null;
};

/**
 * LE TELEPHONE NE PARLE PLUS AUX SERVICES PUBLICS : IL PARLE A NOTRE SERVEUR.
 *
 * Ce fichier interrogeait photon.komoot.io et nominatim.openstreetmap.org directement, avec un
 * abandon a six secondes. Mesure le 20 octobre 2026 sur cinq appels consecutifs a Photon :
 * 7,2 s — 3,2 s — 3,8 s — 14,8 s — aucune reponse. Trois sur cinq etaient donc abandonnes
 * AVANT d'avoir repondu, et il ne restait alors que nos propres fiches a l'ecran. C'est le
 * defaut signale par le client : << le moteur n'affiche plus que les adresses ajoutees par des
 * utilisateurs WIN >>.
 *
 * Notre serveur fait desormais ces appels a notre place, les garde en cache et bascule sur
 * Nominatim quand Photon se tait (voir apps/api/src/routes/geocode.ts). Ce qui change ici :
 *
 *   — une recherche deja faite par quelqu'un d'autre revient en quelques millisecondes ;
 *   — le basculement de secours ne depend plus de ce que le telephone a reussi a joindre ;
 *   — un service muet se traduit par une ERREUR et non par une liste vide, ce qui permet a
 *     l'appelant de ne pas mettre ce vide-la en cache (voir usePlaceSearch).
 *
 * Le delai reste court ICI : derriere, le serveur patiente quinze secondes pour nous, mais
 * l'utilisateur, lui, ne doit pas attendre si c'est notre propre API qui ne repond pas.
 */
const GEOCODER_TIMEOUT_MS = 8000;

/** Appel a notre passe-plat de geocodage. Les erreurs remontent : elles ont un sens. */
async function fetchGeocoder<T>(chemin: string, query: Record<string, string | number>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODER_TIMEOUT_MS);
  try {
    return await api<T>(chemin, { query, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Reponse de notre passe-plat : Photon (features GeoJSON) ou Nominatim (lignes). */
type GeocodeResponse = {
  source: 'photon' | 'nominatim' | 'aucune';
  features?: PhotonFeature[];
  rows?: NominatimRow[];
  indisponible?: boolean;
};

type NominatimRow = {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  addresstype?: string;
  type?: string;
};

function mapNominatimRow(r: NominatimRow): GeocodedResult | null {
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
}

/** Transforme la reponse du passe-plat, quelle que soit sa source, en resultats de WIN. */
function mapGeocodeResponse(data: GeocodeResponse, lang: Language): GeocodedResult[] {
  if (data.rows) {
    return data.rows.map(mapNominatimRow).filter((r): r is GeocodedResult => r !== null);
  }
  return (data.features ?? [])
    .map((f) => mapPhotonFeature(f, lang))
    .filter((r): r is GeocodedResult => r !== null && !r.name.includes(';'));
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

  /* ARRETS DE BUS ECARTES, OU QU'ILS VIENNENT (demande du client).
   *
   * Le filtre est pose ICI, a l'entree, et non dans une rubrique : un arret de bus remonte
   * aussi d'une recherche par NOM (« Agha » en renvoyait un avant la gare elle-meme). Le
   * retirer de la seule rubrique aurait laisse la moitie du probleme.
   *
   * `highway=bus_stop` designe le poteau au bord de la route. La GARE ROUTIERE
   * (`amenity=bus_station`) n'est pas concernee : c'est un lieu bati, et elle reste
   * cherchable. */
  if (p.osm_key === 'highway' && p.osm_value === 'bus_stop') return null;

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

/**
 * Recherche texte generale (doSearch en v83) : biaisee vers la position quand elle est connue.
 *
 * Le nom reste `fetchPhoton` parce que c'est ce que l'appelant demande — des lieux par leur
 * nom — mais le serveur choisit desormais lui-meme entre Photon et Nominatim. Une erreur
 * remonte : elle signifie << je n'ai pas pu demander >>, ce qui n'est pas << rien ne
 * correspond >>, et l'appelant doit traiter les deux differemment.
 */
export async function fetchPhoton(
  query: string,
  opts: { here?: Coords | null; lang: Language; limit?: number },
): Promise<GeocodedResult[]> {
  const data = await fetchGeocoder<GeocodeResponse>('/geocode/search', {
    q: query,
    limit: opts.limit ?? 12,
    lang: accLang(opts.lang),
    ...(opts.here ? { lat: opts.here.lat, lon: opts.here.lon } : {}),
  });
  if (data.indisponible) throw new Error('geocodeur indisponible');
  return mapGeocodeResponse(data, opts.lang);
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
  const data = await fetchGeocoder<GeocodeResponse>('/geocode/search', {
    q: term,
    limit: 20,
    lang: accLang(lang),
    lat: here.lat,
    lon: here.lon,
  });
  if (data.indisponible) throw new Error('geocodeur indisponible');

  /* Le filtrage par etiquette ne s'applique qu'aux reponses de Photon : Nominatim ne rend pas
   * `osm_key`/`osm_value`, et tout ecarter faute de les trouver reviendrait a rendre la
   * rubrique vide precisement le jour ou Photon est tombe. Dans ce cas on garde la liste
   * telle quelle — le classement par distance fera le tri. */
  if (data.rows) return mapGeocodeResponse(data, lang);

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

/**
 * Lieux d'un TYPE donne autour d'un point — c'est la bonne question pour une rubrique.
 *
 * L'ancienne methode envoyait un TEXTE (<< train station >>) et triait la reponse apres coup.
 * Elle echouait exactement la ou elle comptait : la gare d'Agha, a 1,6 km du centre d'Alger,
 * ne s'appelle pas << train station >> mais << Agha >>. Photon cherchait des mots, pas des
 * gares, et la rubrique rendait << Aucun resultat >> a cote d'une gare visible depuis la rue.
 *
 * `/reverse` avec `osm_tag` pose l'autre question : non pas << qui s'appelle ainsi >> mais
 * << qu'y a-t-il de ce type autour de moi >>. La reponse arrive deja triee par distance.
 * Verifie depuis Didouche Mourad : dix gares, Agha en 1,6 km.
 *
 * Plusieurs `osm_tag` se cumulent en OU : une rubrique peut donc couvrir plusieurs tags OSM,
 * comme << Transport public >> qui reunit gares ferroviaires, gares routieres et arrets de bus.
 */
export async function fetchPhotonNearby(
  tags: [string, string][],
  here: Coords,
  lang: Language,
  radiusKm = 50,
): Promise<GeocodedResult[]> {
  const data = await fetchGeocoder<GeocodeResponse>('/geocode/nearby', {
    lat: here.lat,
    lon: here.lon,
    radius: radiusKm,
    limit: 40,
    lang: accLang(lang),
    tags: tags.map(([cle, valeur]) => `${cle}:${valeur}`).join(','),
  });
  if (data.indisponible) throw new Error('geocodeur indisponible');
  return mapGeocodeResponse(data, lang);
}

/* `fetchNominatim` a disparu de ce fichier. Le repli vers Nominatim n'est plus une decision
 * du telephone : le serveur bascule tout seul des que Photon se tait, et il le fait AVANT de
 * repondre (voir /geocode/search). L'ancien repli, lui, ne se declenchait que si la liste
 * finale etait vide — donc jamais des qu'une seule de nos fiches correspondait, ce qui est
 * precisement le cas ou le client ne voyait plus que les fiches WIN. */

/**
 * Nom d'un point a partir de ses coordonnees — l'operation inverse de la recherche.
 *
 * Elle sert a la fiche de deviation : quand un conducteur appuie longuement sur un batiment ou
 * une avenue en pleine navigation, il faut lui dire SUR QUOI il vient d'appuyer avant de lui
 * demander s'il veut y aller. « Souhaitez-vous devier vers 36,7538 / 3,0588 ? » ne veut rien
 * dire ; « vers Rue Larbi Tebessi » se decide d'un coup d'oeil.
 *
 * `zoom=18` demande le detail de la rue ou du batiment, et non celui de la commune. En cas
 * d'echec — reseau coupe, service indisponible —, on rend `null` : l'appelant affichera les
 * coordonnees, ce qui vaut mieux qu'une fiche vide.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  lang: Language,
): Promise<{ name: string; displayName: string } | null> {
  try {
    const d = await fetchGeocoder<{
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
      indisponible?: boolean;
    }>('/geocode/reverse', { lat, lon, lang: accLang(lang) });
    if (d.indisponible) return null;
    const a = d.address ?? {};
    const name =
      d.name ||
      a.amenity ||
      a.shop ||
      a.building ||
      a.road ||
      (d.display_name ?? '').split(',')[0] ||
      '';
    if (!name) return null;
    return { name, displayName: d.display_name ?? name };
  } catch {
    return null;
  }
}
