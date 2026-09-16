import { haversine } from '../shared';

/**
 * Aeroports algeriens -> autorite EGSA dont ils dependent, pour le lien
 * "Horaires vols" de la fiche lieu. Repris de EGSA_AIRPORTS/EGSA_ORGS en v83 :
 * aucune donnee de vol reelle n'existe (v83 ne fait que renvoyer vers le site
 * officiel de l'autorite competente), donc rien a interroger, juste a lier.
 */
export const EGSA_ORGS = {
  alger: { nom: 'EGSA Alger', url: 'https://aeroports-egsa-alger.dz/' },
  oran: { nom: 'EGSA Oran', url: 'https://egsa-oran.dz/index.php/programmes-des-vols/' },
  constantine: { nom: 'EGSA Constantine', url: 'https://egsa-constantine.dz/programme_vols.php' },
} as const;

type EgsaRegion = keyof typeof EGSA_ORGS;

const EGSA_AIRPORTS: { org: EgsaRegion; lat: number; lon: number }[] = [
  { org: 'alger', lat: 36.691, lon: 3.215 },
  { org: 'alger', lat: 36.712, lon: 5.07 },
  { org: 'alger', lat: 36.213, lon: 1.332 },
  { org: 'alger', lat: 33.512, lon: 6.777 },
  { org: 'alger', lat: 32.384, lon: 3.794 },
  { org: 'alger', lat: 31.673, lon: 6.14 },
  { org: 'alger', lat: 28.052, lon: 9.643 },
  { org: 'alger', lat: 24.293, lon: 9.452 },
  { org: 'alger', lat: 22.811, lon: 5.451 },
  { org: 'alger', lat: 35.325, lon: 4.206 },
  { org: 'alger', lat: 30.571, lon: 2.859 },
  { org: 'alger', lat: 32.93, lon: 3.311 },
  { org: 'alger', lat: 26.723, lon: 8.622 },
  { org: 'alger', lat: 19.567, lon: 5.74 },
  { org: 'alger', lat: 27.251, lon: 2.512 },
  { org: 'alger', lat: 33.764, lon: 2.928 },
  { org: 'alger', lat: 31.917, lon: 5.413 },
  { org: 'alger', lat: 33.068, lon: 6.089 },
  { org: 'oran', lat: 35.624, lon: -0.621 },
  { org: 'oran', lat: 35.017, lon: -1.45 },
  { org: 'oran', lat: 35.341, lon: 1.463 },
  { org: 'oran', lat: 33.535, lon: -0.242 },
  { org: 'oran', lat: 31.646, lon: -2.27 },
  { org: 'oran', lat: 35.208, lon: 0.147 },
  { org: 'oran', lat: 27.838, lon: -0.187 },
  { org: 'oran', lat: 27.7, lon: -8.167 },
  { org: 'oran', lat: 33.722, lon: 1.093 },
  { org: 'oran', lat: 29.237, lon: 0.276 },
  { org: 'oran', lat: 21.375, lon: 0.928 },
  { org: 'constantine', lat: 36.276, lon: 6.62 },
  { org: 'constantine', lat: 36.822, lon: 7.809 },
  { org: 'constantine', lat: 35.752, lon: 6.309 },
  { org: 'constantine', lat: 36.178, lon: 5.324 },
  { org: 'constantine', lat: 36.795, lon: 5.874 },
  { org: 'constantine', lat: 35.432, lon: 8.121 },
  { org: 'constantine', lat: 34.793, lon: 5.739 },
];

/** Region par defaut selon la position quand l'aeroport n'est pas dans la table (nouveau, piste privee...). */
function egsaByRegion(lat: number, lon: number): EgsaRegion {
  if (lon < -0.3) return 'oran';
  if (lon > 5.6 && lat > 33.5) return 'constantine';
  return 'alger';
}

/** Autorite EGSA dont depend un aeroport, par position (30 km : large, deux aeroports ne sont jamais si proches). */
export function egsaForAirport(lat: number, lon: number): (typeof EGSA_ORGS)[EgsaRegion] {
  let best: EgsaRegion | null = null;
  let bestDistanceM = 30_000;
  for (const airport of EGSA_AIRPORTS) {
    const d = haversine(lat, lon, airport.lat, airport.lon);
    if (d < bestDistanceM) {
      bestDistanceM = d;
      best = airport.org;
    }
  }
  return EGSA_ORGS[best ?? egsaByRegion(lat, lon)];
}

export function isAirport(info: { osmKey?: string; osmValue?: string; type?: string; name?: string }): boolean {
  const key = (info.osmKey ?? '').toLowerCase();
  const value = (info.osmValue ?? '').toLowerCase();
  const type = (info.type ?? '').toLowerCase();
  if (key === 'aeroway' && (value === 'aerodrome' || value === 'terminal')) return true;
  if (value === 'airport' || type === 'aerodrome') return true;
  return /a[ée]roport|airport|مطار|aerodrome/i.test(info.name ?? '');
}

export function isTrainStation(info: { osmKey?: string; osmValue?: string; type?: string }): boolean {
  return info.osmKey === 'railway' && info.osmValue === 'station';
}

export const SNTF_URL = 'https://www.sntf.dz';
