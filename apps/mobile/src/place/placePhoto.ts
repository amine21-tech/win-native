import { countryFromCoords, normalizeCity } from '../shared';

/**
 * Photo illustrant un lieu DEJA REFERENCE (ville, village, site) — jamais un commerce.
 *
 * Deux sources, dans cet ordre, reprises de `loadSheetPhoto` en v86 :
 *
 *   1. une photo CHOISIE A LA MAIN sur Wikimedia Commons pour les lieux emblematiques. Wikipedia
 *      illustre parfois « Alger » par une carte ou un blason ; ces fichiers-la ont ete verifies
 *      un par un. On ne stocke que le NOM du fichier : l'adresse reelle est demandee a l'API, si
 *      bien qu'un fichier deplace ne casse rien ;
 *   2. l'image de tete de l'article Wikipedia, en cherchant d'abord « Nom (Algérie) » — la
 *      desambiguisation evite la photo d'une ville homonyme a l'autre bout du monde.
 *
 * Et une regle qui prime sur tout : PAS de photo pour un commerce, une pharmacie ou une
 * administration. Wikipedia renverrait l'image d'un lieu du meme nom ailleurs. Une fiche sans
 * photo vaut mieux qu'une fiche avec la mauvaise.
 */
const CURATED: Record<string, string[]> = {
  alger: ['File:Alger Grande-Poste IMG 0875.JPG'],
  algiers: ['File:Alger Grande-Poste IMG 0875.JPG'],
  tipaza: ['File:Ruines romaines de Tipaza.jpg'],
  tipasa: ['File:Ruines romaines de Tipaza.jpg'],
  djemila: ['File:Ruines romaines djemila.jpg'],
  'cap carbon': ['File:Cap Carbon, bejaia.jpg'],
  hoggar: ['File:Asskrem Hoggar 3.jpg'],
  assekrem: ['File:Asskrem Hoggar 3.jpg'],
  oran: ['File:Oran paysages.jpg'],
  wahran: ['File:Oran paysages.jpg'],
  ouahran: ['File:Oran paysages.jpg'],
  constantine: ['File:Pont El Kantara (Constantine).jpg'],
  qacentina: ['File:Pont El Kantara (Constantine).jpg'],
  cirta: ['File:Pont El Kantara (Constantine).jpg'],
  timgad: ['File:Roman Arch of Trajan at Thamugadi (Timgad), Algeria 04966r.jpg'],
  thamugadi: ['File:Roman Arch of Trajan at Thamugadi (Timgad), Algeria 04966r.jpg'],
  tlemcen: ['File:Mosquée de Mansourah, Tlemcen, 2024.jpg'],
  bejaia: ['File:Béjaia بجاية 11.jpg'],
  bougie: ['File:Béjaia بجاية 11.jpg'],
  ghardaia: ["File:M'zab valley (Algeria) banner.jpg"],
  djurdjura: ['File:Lalla Khadidja as seen from the Tikejda National Reserve.jpg'],
  'tala guilef': ['File:Lalla Khadidja as seen from the Tikejda National Reserve.jpg'],
  talaguilef: ['File:Lalla Khadidja as seen from the Tikejda National Reserve.jpg'],
  tikjda: ['File:Lalla Khadidja as seen from the Tikejda National Reserve.jpg'],
  aures: ['File:Chelia.jpg'],
  chelia: ['File:Chelia.jpg'],
  casbah: ["File:Casbah d'Alger.jpg"],
  'casbah dalger': ["File:Casbah d'Alger.jpg"],
  annaba: ['File:Église Saint Augustin Annaba.jpg'],
  bone: ['File:Église Saint Augustin Annaba.jpg'],
};

const CITY_TYPES = new Set(['city', 'town', 'village', 'municipality']);

/** Un lieu « ville / commune » au sens d'OpenStreetMap, et non un commerce nomme. */
export function isCityLike(place: { osmKey?: string; osmValue?: string; type?: string }): boolean {
  return (
    place.osmKey === 'place' ||
    CITY_TYPES.has(place.osmValue ?? '') ||
    CITY_TYPES.has(place.type ?? '')
  );
}

/* Wikimedia REFUSE les requetes anonymes : sans agent declare, l'API repond 403.
 *
 * C'est la cause exacte du defaut signale par le client — photo affichee sur le site, absente
 * sur Android. Un navigateur envoie son propre agent, et la version HTML passait donc ; sur
 * Android, React Native envoie « okhttp/4.x », que Wikimedia rejette au titre de sa politique
 * d'agent utilisateur (« Scripts should use an informative User-Agent »). Verifie a la main :
 * okhttp -> 403, agent ci-dessous -> 200, sur fr.wikipedia.org comme sur commons.wikimedia.org.
 *
 * L'agent doit nommer l'application et un moyen de la joindre ; c'est ce que la politique
 * demande, et c'est ce qui evite de se faire bloquer de nouveau.
 */
const WIKI_HEADERS = {
  'User-Agent': 'WIN-Navigation/1.0 (https://win-dz.netlify.app; contact@win-dz.app)',
  'Api-User-Agent': 'WIN-Navigation/1.0 (https://win-dz.netlify.app; contact@win-dz.app)',
  Accept: 'application/json',
};

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: WIKI_HEADERS });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Adresse reelle d'un fichier Wikimedia Commons, a partir de son nom. */
async function commonsUrl(title: string): Promise<string | null> {
  const data = await json<{ query?: { pages?: Record<string, { imageinfo?: { url?: string }[] }> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=${encodeURIComponent(title)}`,
  );
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : undefined;
  return page?.imageinfo?.[0]?.url ?? null;
}

/** Image de tete d'un article Wikipedia francais. */
async function wikipediaThumb(title: string): Promise<string | null> {
  const data = await json<{ query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } }>(
    `https://fr.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=thumbnail&pithumbsize=600&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : undefined;
  return page?.thumbnail?.source ?? null;
}

/**
 * Photo a afficher pour ce lieu, ou `null` s'il n'y en a pas de sure.
 * `name` sert aussi de cle de la liste choisie a la main.
 */
export async function lookupPlacePhoto(place: {
  name?: string;
  osmKey?: string;
  osmValue?: string;
  type?: string;
  lat?: number;
  lon?: number;
}): Promise<string | null> {
  const name = place.name?.trim();
  if (!name) return null;

  const curated = CURATED[normalizeCity(name)];
  if (curated?.[0]) {
    const url = await commonsUrl(curated[0]);
    if (url) return url;
  }

  if (!isCityLike(place)) return null;

  /* Desambiguisation par le PAYS du lieu, et non « (Algérie) » pour tout le monde.
   *
   * Wikipedia compte plusieurs localites du meme nom d'un pays a l'autre. Chercher « Nom
   * (Algérie) » pour une ville francaise ne renvoyait rien d'utile, et laissait le second essai
   * — le nom seul — ramener la premiere homonymie venue. En reprenant le pays deduit des
   * coordonnees, l'article vise est le bon pour l'Algerie, la Tunisie et la France, les trois
   * pays couverts par la carte. Le nom seul reste le dernier recours.
   */
  const country = place.lat != null && place.lon != null ? countryFromCoords(place.lat, place.lon) : null;
  const qualifier = country === 'TN' ? 'Tunisie' : country === 'FR' ? 'France' : country === 'DZ' ? 'Algérie' : null;
  if (qualifier) {
    const disambiguated = await wikipediaThumb(`${name} (${qualifier})`);
    if (disambiguated) return disambiguated;
  }
  return await wikipediaThumb(name);
}
