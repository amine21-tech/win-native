// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------
/** Rayon terrestre moyen, en metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Distance orthodromique entre deux points, en metres. */
export function haversine(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Cap, en degres depuis le nord, du point A vers le point B. */
export function bearing(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLon = toRad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Distance formatee pour l'affichage : « 850 m », « 12,4 km ». */
export function formatDistance(meters: number, locale = 'fr'): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  const digits = km < 10 ? 1 : 0;
  return `${km.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} km`;
}

/** Duree formatee pour l'affichage : « 4 min », « 1 h 12 ». */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Boite englobante d'un rayon autour d'un point : [minLon, minLat, maxLon, maxLat]. */
export function boundingBox(
  lat: number,
  lon: number,
  radiusM: number,
): [number, number, number, number] {
  const dLat = toDeg(radiusM / EARTH_RADIUS_M);
  const dLon = toDeg(radiusM / (EARTH_RADIUS_M * Math.cos(toRad(lat))));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/**
 * Normalisation d'un libelle pour la comparaison : minuscules, accents retires,
 * ponctuation reduite a des espaces. Sert a l'anti-doublon et a la recherche.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // on conserve le latin, les chiffres et l'ensemble du bloc arabe
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim();
}

/**
 * Pays deduit des COORDONNEES, et non du champ enregistre en base.
 *
 * Une adresse parisienne s'affichait « Algerie » : elle avait ete ajoutee par une version de
 * l'application qui inscrivait « DZ » en dur a l'enregistrement. Le champ est donc faux pour ces
 * fiches, et il le restera. La position, elle, ne ment pas : c'est elle qui decide de l'etiquette.
 *
 * Boites englobantes larges, suffisantes pour trois pays que la Mediterranee separe. `null` hors
 * de ces zones : mieux vaut aucune etiquette qu'une fausse.
 */
export function countryFromCoords(lat: number, lon: number): 'DZ' | 'TN' | 'FR' | null {
  if (lat > 41 && lat < 51.5 && lon > -5.5 && lon < 9.8) return 'FR';
  if (lat > 30 && lat < 37.6 && lon > 7.5 && lon < 11.8 && !(lat < 34 && lon < 8.3)) return 'TN';
  if (lat > 18.9 && lat < 37.5 && lon > -8.7 && lon < 12) return 'DZ';
  return null;
}
