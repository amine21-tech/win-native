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

/* Ce qui compte comme « lieu habite » et merite donc une illustration.
 *
 * La liste etait limitee a quatre valeurs, et c'est ce qui privait Tizi Ouzou de sa photo : le
 * premier resultat rendu par le geocodeur pour une wilaya n'est pas la ville mais sa LIMITE
 * ADMINISTRATIVE (`boundary/administrative`, type `state`). Paris, lui, remonte en
 * `place/city` — d'ou une ville illustree et l'autre non, sans raison visible pour
 * l'utilisateur, qui a tape le meme genre de nom.
 *
 * Les echelons administratifs sont desormais acceptes : wilaya, daira, commune, departement,
 * region ont tous un article Wikipedia illustre, et c'est bien la photo de l'endroit.
 */
const PLACE_VALUES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'locality',
  'suburb',
  'borough',
  'quarter',
  'district',
  'county',
  'province',
  'state',
  'region',
  'island',
]);

/**
 * Un lieu habite — ville, village, commune ou echelon administratif — et non un commerce.
 *
 * On ne teste plus `osmKey === 'place'` en bloc : cette cle couvre aussi `place=house`,
 * c'est-a-dire une simple adresse. Demander a Wikipedia un article portant le nom d'une maison
 * ramene, au mieux, rien ; au pire la photo d'un homonyme a l'autre bout du monde — exactement
 * l'erreur d'association que le client nous demande d'eviter.
 */
export function isCityLike(place: { osmKey?: string; osmValue?: string; type?: string }): boolean {
  if (place.osmKey === 'boundary' && place.osmValue === 'administrative') return true;
  return PLACE_VALUES.has(place.osmValue ?? '') || PLACE_VALUES.has(place.type ?? '');
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
export const WIKI_HEADERS = {
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

/** Image de tete d'un article Wikipedia, dans la langue demandee. */
async function wikipediaThumb(lang: 'fr' | 'en', title: string): Promise<string | null> {
  const data = await json<{ query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } }>(
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=thumbnail&pithumbsize=600&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  const page = data?.query?.pages ? Object.values(data.query.pages)[0] : undefined;
  return page?.thumbnail?.source ?? null;
}

/* Photos deja trouvees, gardees pour la duree de la session.
 *
 * Une recherche repetee — le cas le plus courant : on cherche Alger, on ferme, on recherche
 * Alger — ne redemande plus rien au reseau et affiche la photo instantanement. Les absences
 * sont memorisees AUSSI (`null`), sinon un lieu sans photo relancerait deux requetes a chaque
 * ouverture de sa fiche. La cle est celle du lieu, normalisee.
 */
const cache = new Map<string, string | null>();

/** Une seule nouvelle tentative, apres une demi-seconde : de quoi absorber une coupure de
 * reseau passagere — frequente en voiture — sans faire attendre pour rien quand le lieu n'a
 * reellement pas de photo. */
const RETRY_DELAY_MS = 500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  const key = `${normalizeCity(name)}|${place.lat?.toFixed(2) ?? ''},${place.lon?.toFixed(2) ?? ''}`;
  const known = cache.get(key);
  if (known !== undefined) return known;

  const found = await lookupOnce(place, name);
  // Un echec reseau et une absence de photo se ressemblent ici : on retente une fois avant de
  // conclure, et on ne retient un « pas de photo » qu'apres cette seconde tentative.
  const result = found ?? (await wait(RETRY_DELAY_MS), await lookupOnce(place, name));
  cache.set(key, result);
  return result;
}

/** Une passe de recherche, sans cache ni nouvelle tentative. */
async function lookupOnce(
  place: { osmKey?: string; osmValue?: string; type?: string; lat?: number; lon?: number },
  name: string,
): Promise<string | null> {
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
    const disambiguated = await wikipediaThumb('fr', `${name} (${qualifier})`);
    if (disambiguated) return disambiguated;
  }
  const french = await wikipediaThumb('fr', name);
  if (french) return french;

  /* Dernier recours : le Wikipedia ANGLAIS.
   *
   * Le francais couvre tres bien l'Algerie — les noms y sont ecrits comme sur les panneaux —
   * mais il laisse des trous ailleurs : Msaken, en Tunisie, n'a pas d'illustration en francais
   * et en a une en anglais. Comme le client demande une photo pour n'importe quelle ville, un
   * second essai vaut mieux qu'une fiche nue. Il ne coute une requete de plus que lorsque le
   * francais n'a rien trouve, et le resultat est ensuite garde en cache. */
  return await wikipediaThumb('en', name);
}

/**
 * Source d'image a donner a `<Image>` pour une photo Wikimedia.
 *
 * Le refus d'agent ne vise pas que l'API : le SERVEUR D'IMAGES l'applique aussi. L'adresse de
 * la photo etait donc bien trouvee, mais le telechargement de l'image repondait 403 — d'ou le
 * cadre gris vide, avec sa mention « © Wikimedia », que le client a photographie. Verifie a la
 * main sur thumb.wikimedia.org : agent d'Android -> 403, agent declare -> 200.
 *
 * React Native accepte des en-tetes dans la source d'une image distante ; on ne les envoie qu'a
 * Wikimedia, les photos de nos propres serveurs n'en ayant que faire.
 */
export function photoSource(uri: string): { uri: string; headers?: Record<string, string> } {
  return /(^https?:\/\/)([a-z0-9-]+\.)*(wikimedia|wikipedia)\.org\//i.test(uri)
    ? { uri, headers: WIKI_HEADERS }
    : { uri };
}
