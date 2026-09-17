import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import {
  CATEGORY_OSM,
  CATEGORY_OSM_ALT,
  CATEGORY_SEARCH_TERM,
  CITY_ALIASES,
  CURATED_AIRPORTS,
  CURATED_PORTS,
  countryFromCoords,
  countryLabel,
  mergeCurated,
  normalizeCity,
  rankSearchResults,
  resolveCategoryQuery,
  type Language,
  type Place,
} from '../shared';
import { fetchNominatim, fetchPhoton, fetchPhotonCategory, type Coords, type GeocodedResult } from './geocode';

const DEBOUNCE_MS = 180;
const CACHE_TTL_MS = 3 * 60 * 1000;
/** Un partenaire au-dela de cette distance n'est plus mis en avant (reste trouvable par son nom). */
const VIP_RADIUS_M = 60_000;
const BUS_STOP_RADIUS_M = 5_000;

/**
 * Cache memoire, module-scope : partage entre tous les usages de l'ecran de
 * recherche (il n'y en a qu'un a la fois), comme le `searchCache` de v83.
 * Vide integralement apres tout ajout de lieu — voir clearSearchCache().
 */
const cache = new Map<string, { at: number; value: SearchOutcome }>();
export function clearSearchCache() {
  cache.clear();
}

function mapPlace(p: Place, lang: Language): GeocodedResult {
  const line1 = [p.houseNumber, p.street].filter(Boolean).join(' ') || p.enseigne || p.name;
  const line2 = [p.postalCode, p.city].filter(Boolean).join(' ');
  // Le pays vient des COORDONNEES, avec le champ enregistre en secours : des fiches ajoutees
  // par une version anterieure portent « DZ » en dur, d'ou une adresse parisienne etiquetee
  // « Algerie » dans les resultats.
  const pays = countryLabel(
    { countryCode: countryFromCoords(p.lat, p.lon) ?? p.country },
    lang === 'dz' ? 'ar' : lang,
  );
  return {
    name: p.name || line1,
    displayName: [line1, line2, pays].filter(Boolean).join(', '),
    lat: p.lat,
    lon: p.lon,
    source: 'win',
    placeId: p.id,
    category: p.category,
    photoUrl: p.photos[0]?.url ?? null,
    photos: p.photos.map((ph) => ({ url: ph.url, thumbUrl: ph.thumbUrl, credit: ph.credit })),
    isPartner: p.isPartner,
    phoneFixe: p.phoneFixe,
    phoneMobile: p.phoneMobile,
    whatsapp: p.whatsapp,
    email: p.email,
    promo: p.promo,
  };
}

async function fetchWinPlaces(q: string, here: Coords | null, lang: Language): Promise<GeocodedResult[]> {
  try {
    const { items } = await api<{ items: Place[] }>('/places/search', {
      query: { q, lat: here?.lat, lon: here?.lon, limit: 15 },
    });
    return items.map((p) => mapPlace(p, lang));
  } catch {
    return [];
  }
}

function dedupe(results: GeocodedResult[]): GeocodedResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.name}|${r.displayName}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runCategorySearch(
  key: string,
  extraText: string,
  q: string,
  here: Coords,
  lang: Language,
): Promise<SearchOutcome> {
  const osmTag = CATEGORY_OSM[key]!;
  const term = (CATEGORY_SEARCH_TERM[key] ?? q) + (extraText ? ` ${extraText}` : '');

  const [winResults, photonResults] = await Promise.all([
    fetchWinPlaces(CATEGORY_SEARCH_TERM[key] ?? q, here, lang),
    fetchPhotonCategory(term, osmTag, CATEGORY_OSM_ALT[key], here, lang).catch(() => []),
  ]);

  const raw: GeocodedResult[] = [...winResults, ...photonResults];

  if (key === 'airport') {
    raw.push(...mergeCurated(CURATED_AIRPORTS, raw, here).map((c) => toGeocoded(c, 'curated')));
  }
  if (key === 'seaport') {
    raw.push(...mergeCurated(CURATED_PORTS, raw, here).map((c) => toGeocoded(c, 'curated')));
  }

  let ranked = rankByDistance(raw, here).slice(0, 40);

  if (key === 'bus stop') {
    ranked = ranked.filter((r) => r.distanceM <= BUS_STOP_RADIUS_M);
  }

  // Une recherche par RUBRIQUE repond a « lequel est le plus pres de moi ». On ne remonte
  // donc aucun partenaire en tete : la liste suit strictement la distance, et les
  // partenaires y gardent leur etoile a leur vraie place. Remonter un partenaire situe a
  // 40 km au-dessus d'un mecanicien a 500 m rendait la rubrique inutilisable.
  // La recherche par NOM, elle, conserve la mise en avant (voir runTextSearch).
  return { partners: [], results: ranked };
}

function toGeocoded(c: { name: string; lat: number; lon: number }, source: GeocodedResult['source']): GeocodedResult {
  return { name: c.name, displayName: c.name, lat: c.lat, lon: c.lon, source };
}

function rankByDistance<T extends { lat: number; lon: number }>(
  results: T[],
  here: Coords,
): (T & { distanceM: number })[] {
  return results
    .map((r) => ({ ...r, distanceM: haversineM(here, r) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

function haversineM(a: Coords, b: Coords): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Separe les partenaires VIP (mis en avant) du reste, comme le fait renderResults() en v83. */
function partition(results: (GeocodedResult & { distanceM?: number })[]): SearchOutcome {
  const partners = results.filter((r) => r.isPartner && (r.distanceM == null || r.distanceM <= VIP_RADIUS_M));
  const others = results.filter((r) => !partners.includes(r));
  return { partners, results: others };
}

export type SearchOutcome = { partners: GeocodedResult[]; results: GeocodedResult[] };

async function runTextSearch(qRaw: string, here: Coords | null, lang: Language): Promise<SearchOutcome> {
  const alias = CITY_ALIASES[normalizeCity(qRaw)];
  const q = alias ?? qRaw;

  const [winResults, photonResults] = await Promise.all([
    fetchWinPlaces(q, here, lang),
    fetchPhoton(q, { here, lang }).catch(() => []),
  ]);

  let combined = dedupe([...winResults, ...photonResults]);
  let ranked = rankSearchResults(combined, q, here);

  if (ranked.length === 0) {
    const nominatimResults = await fetchNominatim(q, { here, lang }).catch(() => []);
    ranked = rankSearchResults(dedupe(nominatimResults), q, here);
  }

  return partition(hoistOwnPlaces(ranked, q));
}

/**
 * Remonte en tete les lieux WIN dont le NOM contient ce qui a ete tape.
 *
 * Le classement general suit la distance. Or quelqu'un qui tape le nom de la salle de sport
 * qu'il vient d'ajouter cherche CE lieu-la : le voir passer derriere une rue homonyme d'OpenStreetMap
 * situee 200 m plus pres donne l'impression que l'ajout n'a pas fonctionne. Entre eux, ces
 * lieux gardent leur ordre de distance.
 */
function hoistOwnPlaces<T extends GeocodedResult>(results: T[], q: string): T[] {
  // Mot par mot : « salle gaia » doit remonter « Gaia », dont le nom ne contient pas « salle ».
  const words = normalizeCity(q)
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return results;
  const hits = (r: T) => {
    const name = normalizeCity(r.name);
    // Longueur totale des mots retrouves plutot que leur nombre : pour « salle gaia », « Gaia »
    // doit passer devant une « Salle des fetes » voisine, qui ne partage que le mot generique.
    return words.filter((w) => name.includes(w)).reduce((sum, w) => sum + w.length, 0);
  };
  const own = results
    .filter((r) => r.source === 'win' && hits(r) > 0)
    // Le meilleur recouvrement d'abord ; a egalite, l'ordre de distance deja etabli.
    .sort((a, b) => hits(b) - hits(a));
  if (own.length === 0) return results;
  return [...own, ...results.filter((r) => !own.includes(r))];
}

async function search(qRaw: string, here: Coords | null, lang: Language): Promise<SearchOutcome> {
  const category = resolveCategoryQuery(qRaw);
  if (category && here) {
    return runCategorySearch(category.key, category.extraText, qRaw, here, lang);
  }
  return runTextSearch(qRaw, here, lang);
}

/**
 * Recherche de lieux : debounce 180 ms, cache 3 min, et le meme choix
 * categorie/texte-libre que doSearch() en v83. `here` peut changer sans
 * relancer la recherche courante : seule une nouvelle frappe la relance.
 */
export function usePlaceSearch(here: Coords | null, lang: Language) {
  // `displayValue` est ce que montre la barre de recherche ; `searchTerm` est ce qui pilote
  // reellement la recherche. Un appui sur une puce de categorie les decouple exprès : la barre
  // affiche le libelle traduit ("Pharmacies"), mais la recherche part sur la cle interne
  // ("pharmacy"), qui seule est reconnue par resolveCategoryQuery dans les 4 langues.
  const [displayValue, setDisplayValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [outcome, setOutcome] = useState<SearchOutcome>({ partners: [], results: [] });
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const setQuery = useCallback((text: string) => {
    setDisplayValue(text);
    setSearchTerm(text);
  }, []);

  /** Appui sur une puce de categorie : affiche son libelle, cherche sur sa cle interne. */
  const searchCategory = useCallback((dataQ: string, label: string) => {
    setDisplayValue(label);
    setSearchTerm(dataQ);
  }, []);

  // La position change desormais chaque seconde en navigation. En dependance de `runSearch`,
  // elle recreait la fonction a chaque mesure, ce qui relancait l'effet de debounce et
  // remettait le minuteur a zero : la recherche pouvait ne jamais partir. Elle passe donc par
  // une reference — conformement a ce que promet deja la documentation de ce hook, « seule une
  // nouvelle frappe relance la recherche ».
  const hereRef = useRef(here);
  hereRef.current = here;

  const runSearch = useCallback(
    async (q: string) => {
      const here = hereRef.current;
      const cacheKey = `${q.toLowerCase().trim()}|${lang}|${here ? `${here.lat.toFixed(2)},${here.lon.toFixed(2)}` : 'noloc'}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setOutcome(cached.value);
        setLoading(false);
        return;
      }

      const id = ++requestId.current;
      setLoading(true);
      try {
        const value = await search(q, here, lang);
        if (id !== requestId.current) return; // une frappe plus recente a devance cette reponse
        cache.set(cacheKey, { at: Date.now(), value });
        setOutcome(value);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [lang],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setOutcome({ partners: [], results: [] });
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(trimmed), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, runSearch]);

  return {
    query: displayValue,
    setQuery,
    searchCategory,
    loading,
    partners: outcome.partners,
    results: outcome.results,
  };
}
