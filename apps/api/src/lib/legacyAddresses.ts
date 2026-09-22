import { randomUUID } from 'node:crypto';
import type { Place } from '@win/shared';
import { env } from '../env.js';

/**
 * Passerelle vers l'ancien backend, celui qui sert encore le site.
 *
 * Le site (win-v83) et l'application ne parlent pas au meme serveur : le site ecrit ses
 * adresses et ses photos dans `win-backend` (`…/api`), l'application lit cette API-ci
 * (`…/v2`). Une migration a recopie les adresses une fois, sans les photos et sans rien
 * rejouer depuis. Tout ce qu'un utilisateur ajoute DEPUIS LE SITE est donc reste invisible
 * dans l'application — c'est ce que le client constate depuis plusieurs versions avec sa
 * fiche « Promotion immobiliere iftene » : la photo existe, mais pas dans cette base.
 *
 * Plutot que de recopier les donnees (une copie vieillit des le lendemain), la recherche
 * interroge les deux sources et fusionne. L'ancien backend reste la source de ce qui est
 * ajoute sur le site, celui-ci de ce qui est ajoute dans l'application, et l'utilisateur voit
 * l'ensemble des deux cotes.
 *
 * Trois precautions, parce qu'on depend ici d'un service qu'on ne controle pas :
 *   - delai plafonne : une recherche ne doit jamais attendre l'ancien serveur ;
 *   - aucune exception ne remonte : s'il est eteint, la recherche rend simplement les
 *     resultats locaux, comme avant cette passerelle ;
 *   - passerelle facultative : sans LEGACY_API_URL, rien de tout cela ne s'execute.
 */

/** Forme renvoyee par `GET /api/addresses/search` de l'ancien backend. */
type LegacyAddress = {
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  name?: unknown;
  enseigne?: unknown;
  num?: unknown;
  rue?: unknown;
  cp?: unknown;
  ville?: unknown;
  phone?: unknown;
  photoUrl?: unknown;
  photos?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

/** Un lieu tel que la recherche le renvoie : le schema partage, plus les deux colonnes calculees. */
export type SearchedPlace = Place & { score: number; distanceM: number | null };

/* L'ancien backend met de l'ordre de 1,5 s a repondre depuis l'exterieur ; depuis le VPS, ou
 * les deux services tournent, c'est bien plus rapide. Trois secondes laissent de la marge sans
 * jamais faire attendre une recherche : passe ce delai, on rend les seuls resultats locaux. */
const TIMEOUT_MS = 3000;
/** Deux fiches du meme nom a moins de 150 m sont la meme : on garde la locale. */
const SAME_PLACE_RADIUS_M = 150;

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

function normalize(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Distance en metres entre deux points (formule de haversine). */
function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** L'ancien backend nomme ses fichiers « horodatage-uuid.jpg » : on recupere l'identifiant. */
function photoId(path: string): string {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(path)?.[0] ?? randomUUID();
}

/** Adresse complete d'une photo de l'ancien backend, qui n'en donne que le chemin. */
function photoUrl(origin: string, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

function toPlace(row: LegacyAddress, origin: string, here: { lat: number; lon: number } | null): SearchedPlace | null {
  const lat = num(row.lat);
  const lon = num(row.lon);
  const name = str(row.name) ?? str(row.enseigne);
  if (lat == null || lon == null || !name) return null;

  const paths = Array.isArray(row.photos)
    ? row.photos.map(str).filter((p): p is string => p !== null)
    : [];
  const single = str(row.photoUrl);
  const all = paths.length ? paths : single ? [single] : [];

  return {
    // L'ancien backend identifie deja ses adresses par un UUID ; on le garde, ce qui evite
    // qu'une meme fiche change d'identifiant d'une recherche a l'autre.
    id: str(row.id) ?? randomUUID(),
    name,
    // L'ancien backend ne classe pas ses adresses : elles arrivent toutes en « autre ».
    category: 'autre',
    lat,
    lon,
    houseNumber: str(row.num),
    street: str(row.rue),
    city: str(row.ville),
    postalCode: str(row.cp),
    wilaya: null,
    country: 'DZ',
    phoneFixe: str(row.phone),
    phoneMobile: null,
    whatsapp: null,
    email: null,
    enseigne: str(row.enseigne),
    promo: null,
    isPartner: false,
    photos: all.map((p, i) => ({
      id: photoId(p),
      url: photoUrl(origin, p),
      thumbUrl: null,
      credit: null,
      position: i,
    })),
    createdAt: str(row.created_at) ?? new Date().toISOString(),
    updatedAt: str(row.updated_at) ?? str(row.created_at) ?? new Date().toISOString(),
    score: 0,
    distanceM: here ? distanceM(here.lat, here.lon, lat, lon) : null,
  };
}

/**
 * Adresses de l'ancien backend correspondant a la saisie. Ne leve jamais : en cas de panne ou
 * de lenteur, rend un tableau vide et la recherche se poursuit avec les seuls lieux locaux.
 *
 * A appeler AVANT d'attendre la requete SQL : les deux interrogations se font alors en meme
 * temps, et l'ancien serveur — le plus lent des deux — n'ajoute presque rien a l'attente.
 */
export async function fetchLegacyAddresses(
  q: string,
  here: { lat: number; lon: number } | null,
): Promise<SearchedPlace[]> {
  const base = env.LEGACY_API_URL;
  if (!base) return [];

  const origin = base.replace(/\/api\/?$/, '');
  const url = new URL(`${base.replace(/\/$/, '')}/addresses/search`);
  url.searchParams.set('q', q);
  if (here) {
    url.searchParams.set('lat', String(here.lat));
    url.searchParams.set('lon', String(here.lon));
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return [];
    return (body as LegacyAddress[]).map((row) => toPlace(row, origin, here)).filter((p): p is SearchedPlace => p !== null);
  } catch {
    return [];
  }
}

/**
 * Fusionne les deux sources.
 *
 * Deux cas, et le second est celui que le client photographie depuis trois documents :
 *   - la fiche n'existe QUE dans l'ancien backend : on l'ajoute a la liste ;
 *   - la fiche existe des deux cotes, mais seule la copie de l'ancien backend porte la photo
 *     (la migration n'avait recopie que le texte). Ecarter le doublon ferait perdre la photo,
 *     et en ajouter un second montrerait deux fois le meme lieu : on complete donc la fiche
 *     locale avec les photos de l'ancienne, et on n'en affiche qu'une.
 */
export function mergeLegacyAddresses(local: SearchedPlace[], legacy: SearchedPlace[]): SearchedPlace[] {
  if (!legacy.length) return local;
  const merged = [...local];
  for (const place of legacy) {
    const name = normalize(place.name);
    const twin = merged.find(
      (m) => normalize(m.name) === name && distanceM(m.lat, m.lon, place.lat, place.lon) <= SAME_PLACE_RADIUS_M,
    );
    if (twin) {
      if (!twin.photos?.length && place.photos.length) twin.photos = place.photos;
      continue;
    }
    merged.push(place);
  }
  return merged;
}
