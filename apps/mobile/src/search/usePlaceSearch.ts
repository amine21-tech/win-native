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
import {
  fetchNominatim,
  fetchPhoton,
  fetchPhotonCategory,
  fetchPhotonNearby,
  type Coords,
  type GeocodedResult,
} from './geocode';

const DEBOUNCE_MS = 150;

/**
 * Les mots que tout le monde tape.
 *
 * Charges en fond des l'ouverture de l'application, pendant que l'utilisateur regarde encore la
 * carte. Quand il tape enfin << aeroport >>, la reponse est deja la : zero milliseconde de
 * reseau. C'est la seule facon d'obtenir l'instantaneite que le client reclame — aucun reglage
 * de delai ne rattrape un aller-retour vers un serveur allemand depuis un telephone algerien.
 *
 * Le chargement se fait UN PAR UN et non tous ensemble : vingt requetes simultanees au
 * demarrage retarderaient la premiere vraie recherche de l'utilisateur, qui est justement celle
 * qui compte. Elles s'arretent des qu'il tape quelque chose.
 */
const TERMES_FREQUENTS = [
  'aéroport',
  'hôpital',
  'pharmacie',
  'mosquée',
  'gare',
  'hôtel',
  'restaurant',
  'station-service',
  'banque',
  'parking',
  'école',
  'mairie',
  'police',
  'poste',
  'supermarché',
  'café',
  'plage',
  'université',
  'clinique',
  'marché',
];
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

/**
 * Nombre de recherches gardees en memoire.
 *
 * Le cache n'avait aucune borne : une session longue — un trajet ou l'on cherche vingt stations,
 * puis des restaurants, puis des pharmacies — le faisait grossir sans fin, chaque entree
 * retenant une liste complete de resultats. Sur un telephone modeste, c'est de la memoire prise
 * a la carte elle-meme.
 *
 * Cent entrees couvrent tres largement un aller-retour : au-dela, c'est la plus ANCIENNE
 * qui part. Une recherche reutilisee se replace en tete, de sorte que les habitudes de
 * quelqu'un — son travail, l'ecole des enfants — ne se font jamais evincer par une recherche
 * faite une seule fois.
 */
const CACHE_MAX = 100;

/** La cle d'une recherche : le texte, la langue, et le quartier ou l'on se trouve. */
function cleCache(q: string, here: Coords | null, lang: Language): string {
  const lieu = here ? `${here.lat.toFixed(2)},${here.lon.toFixed(2)}` : 'noloc';
  return `${q.toLowerCase().trim()}|${lang}|${lieu}`;
}

function cacheSet(cle: string, value: SearchOutcome) {
  // Reecrire une cle existante ne la remonte pas dans l'ordre d'insertion : on la retire
  // d'abord. Sans cela, la plus utilisee pourrait etre la premiere expulsee.
  cache.delete(cle);
  cache.set(cle, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) {
    const plusAncienne = cache.keys().next().value;
    if (plusAncienne === undefined) break;
    cache.delete(plusAncienne);
  }
}

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
    photos: p.photos.map((ph) => ({ id: ph.id, url: ph.url, thumbUrl: ph.thumbUrl, credit: ph.credit })),
    isPartner: p.isPartner,
    houseNumber: p.houseNumber,
    street: p.street,
    city: p.city,
    postalCode: p.postalCode,
    wilaya: p.wilaya,
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

/** Deux fiches a moins de cette distance, portant le meme nom, designent le meme lieu. */
const MEME_LIEU_M = 120;

/**
 * Un meme lieu, une seule fiche — et c'est TOUJOURS la version WIN qui gagne.
 *
 * Le symptome etait deroutant : chercher << Plage Medusa >> donnait la fiche avec sa photo et
 * son badge << ajoute par un utilisateur WIN >>, puis la meme recherche, une minute plus tard,
 * la rendait sans photo et sans badge.
 *
 * La cause n'est pas le cache, qui conserve bien tous les champs. C'est cette fonction :
 * elle comparait le nom ET l'adresse complete. Or la meme plage s'ecrit
 * << Plage Medusa, 06000 Bejaia, Algerie >> chez nous et << Plage Medusa, Bejaia, Algerie >>
 * chez OpenStreetMap. Deux chaines differentes, donc deux fiches conservees — et selon le
 * classement du moment, c'est tantot l'une tantot l'autre qui se presentait en premier. D'ou
 * une photo qui apparait et disparait sans raison visible.
 *
 * On rapproche donc sur le NOM et la POSITION, pas sur le texte de l'adresse. Et quand deux
 * fiches se rapprochent, celle de WIN l'emporte : elle seule porte la photo, le badge, le
 * telephone et les horaires que quelqu'un a pris le temps de saisir.
 */
function dedupe(results: GeocodedResult[]): GeocodedResult[] {
  const gardes: GeocodedResult[] = [];

  for (const r of results) {
    const nom = normalizeCity(r.name);
    const jumelle = gardes.findIndex(
      (g) => normalizeCity(g.name) === nom && haversineM(g, r) <= MEME_LIEU_M,
    );

    if (jumelle < 0) {
      gardes.push(r);
      continue;
    }

    // Deja vue. La version WIN remplace celle d'OpenStreetMap ; l'inverse n'arrive jamais.
    if (r.source === 'win' && gardes[jumelle]!.source !== 'win') gardes[jumelle] = r;
  }

  return gardes;
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
/**
 * Charge en fond les recherches les plus frequentes, des l'ouverture de l'application.
 *
 * Un par un, avec une pause entre chacune : il s'agit d'occuper le temps mort pendant lequel
 * l'utilisateur regarde la carte, surtout pas de saturer le reseau au moment ou il va s'en
 * servir. Tout s'arrete des qu'il tape quelque chose — sa recherche a toujours la priorite.
 *
 * Les echecs sont silencieux : ce n'est qu'une avance prise, jamais une fonction.
 */
let prechauffageLance = false;

export function prechaufferRecherches(here: Coords | null, lang: Language, interrompu: () => boolean) {
  if (prechauffageLance) return;
  prechauffageLance = true;

  void (async () => {
    for (const terme of TERMES_FREQUENTS) {
      if (interrompu()) return;
      const cle = cleCache(terme, here, lang);
      if (cache.has(cle)) continue;
      try {
        cacheSet(cle, await search(terme, here, lang));
      } catch {
        // Hors ligne au demarrage : on reessaiera a la prochaine ouverture.
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
}

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

  /* Le prechauffage part une fois, a la premiere position connue, et se tait des que
   * l'utilisateur tape : sa recherche a toujours la priorite sur une avance qu'on prenait
   * pour lui. */
  const termeRef = useRef(searchTerm);
  termeRef.current = searchTerm;
  useEffect(() => {
    if (!here) return;
    prechaufferRecherches(here, lang, () => termeRef.current.trim().length > 0);
    // Volontairement une seule fois : la liste prechauffee ne depend pas du quartier exact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here !== null]);

  const runSearch = useCallback(
    async (q: string) => {
      const here = hereRef.current;
      const cacheKey = cleCache(q, here, lang);
      const cached = cache.get(cacheKey);
      const frais = cached && Date.now() - cached.at < CACHE_TTL_MS;

      /* CE QU'ON A, TOUT DE SUITE. Puis ce qui arrive du reseau.
       *
       * Une liste affichee immediatement, meme vieille de quelques minutes, vaut mieux qu'un
       * ecran vide pendant une seconde : l'utilisateur voit que l'application l'a compris, et
       * la bonne reponse est souvent deja celle-la. La mise a jour la remplace ensuite sans
       * qu'il ait rien a faire.
       *
       * Une entree perimee s'affiche donc AUSSI — on ne jette pas une reponse plausible pour
       * en attendre une parfaite. Elle se replace en tete du cache au passage. */
      if (cached) {
        cache.delete(cacheKey);
        cache.set(cacheKey, cached);
        setOutcome(cached.value);
      }
      if (frais) {
        setLoading(false);
        return;
      }

      const id = ++requestId.current;
      // Pas de voile d'attente quand une liste est deja affichee : elle clignoterait a chaque
      // frappe alors que des resultats utilisables sont sous les yeux.
      if (!cached) setLoading(true);
      try {
        const value = await search(q, here, lang);
        if (id !== requestId.current) return; // une frappe plus recente a devance cette reponse
        cacheSet(cacheKey, value);
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
