import { normalizeCity } from '../shared';

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

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Adresse reelle d'un fichier Wikimedia Commons, a partir de son nom. */
async function commonsUrl(title: string): Promise<string | null> {
  const data = await json<{ query?: { pages?: Record<string, { imageinfo?: { url?: string }[] }> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&origin=*&titles=${encodeURIComponent(title)}`,
  );
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : undefined;
  return page?.imageinfo?.[0]?.url ?? null;
}

/** Image de tete d'un article Wikipedia francais. */
async function wikipediaThumb(title: string): Promise<string | null> {
  const data = await json<{ query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } }>(
    `https://fr.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=thumbnail&pithumbsize=600&redirects=1&origin=*&titles=${encodeURIComponent(title)}`,
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
}): Promise<string | null> {
  const name = place.name?.trim();
  if (!name) return null;

  const curated = CURATED[normalizeCity(name)];
  if (curated?.[0]) {
    const url = await commonsUrl(curated[0]);
    if (url) return url;
  }

  if (!isCityLike(place)) return null;
  return (await wikipediaThumb(`${name} (Algérie)`)) ?? (await wikipediaThumb(name));
}
