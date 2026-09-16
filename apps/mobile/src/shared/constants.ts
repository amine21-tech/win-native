// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------
/**
 * Constantes partagees entre l'API et l'application mobile.
 * Toute valeur presente ici est la seule source de verite : ne pas la
 * redupliquer cote client ni cote serveur.
 */

/** Langues de l'interface. `dz` = derja algerienne (ecrite en caracteres arabes). */
export const LANGUAGES = ['fr', 'dz', 'ar', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Langues affichees de droite a gauche. */
export const RTL_LANGUAGES: readonly Language[] = ['ar', 'dz'];

export const DEFAULT_LANGUAGE: Language = 'fr';

/**
 * Types de signalement. Repris a l'identique de la v83 (menu `alertMenu`)
 * pour que la migration des donnees existantes soit une simple copie.
 */
export const REPORT_KINDS = [
  'radar',
  'bump', // dos d'ane
  'pothole', // trou sur la route
  'police',
  'crash', // accident
  'jam', // embouteillage
  'object', // objet sur la chaussee
  'fire',
  'flood',
  'block', // route bloquee
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * Un signalement permanent survit aux redemarrages et ne disparait que par
 * vote ; un signalement temporaire expire tout seul.
 */
export const PERMANENT_KINDS: readonly ReportKind[] = ['radar', 'bump', 'pothole'];

/** Duree de vie d'un signalement temporaire, en minutes, par type. */
export const TEMPORARY_TTL_MINUTES: Record<ReportKind, number> = {
  radar: 0,
  bump: 0,
  pothole: 0,
  police: 45,
  crash: 90,
  jam: 60,
  object: 60,
  fire: 180,
  flood: 240,
  block: 240,
};

/**
 * Nombre de votes « n'existe plus » provenant d'appareils differents avant
 * retrait d'un signalement permanent. Reprend WIN_SEUIL_SUPPRESSION de la v82.
 */
export const ABSENT_VOTE_THRESHOLD = 3;

/** Rayon par defaut, en metres, pour la recherche de signalements a proximite. */
export const NEARBY_RADIUS_M = 5000;
export const NEARBY_RADIUS_MAX_M = 25000;

/** Categories de lieux proposees a la saisie. */
export const PLACE_CATEGORIES = [
  'pharmacie',
  'hopital',
  'clinique',
  'medecin',
  'ecole',
  'universite',
  'mosquee',
  'administration',
  'banque',
  'poste',
  'commerce',
  'restaurant',
  'cafe',
  'hotel',
  'station_service',
  'parking',
  'garage',
  'immobilier',
  'transport',
  'sport',
  'autre',
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/** Pays couverts par l'application. */
export const COUNTRIES = ['DZ', 'TN', 'FR'] as const;
export type CountryCode = (typeof COUNTRIES)[number];

/** Rayon, en metres, sous lequel deux lieux sont consideres comme doublons. */
export const DUPLICATE_RADIUS_M = 60;

/** Taille des cellules de diffusion temps reel, en degres. */
export const REALTIME_CELL_DEG = 0.1;

/** Nom de la salle Socket.io correspondant a une position. */
export function realtimeCell(lat: number, lon: number): string {
  const la = Math.floor(lat / REALTIME_CELL_DEG);
  const lo = Math.floor(lon / REALTIME_CELL_DEG);
  return `cell:${la}:${lo}`;
}

/** Cellules a rejoindre pour couvrir un rayon autour d'une position. */
export function realtimeCellsAround(lat: number, lon: number, radiusM = NEARBY_RADIUS_M): string[] {
  const degLat = radiusM / 111_320;
  const degLon = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const cells = new Set<string>();
  const steps = [-1, 0, 1];
  for (const dy of steps) {
    for (const dx of steps) {
      cells.add(realtimeCell(lat + dy * degLat, lon + dx * degLon));
    }
  }
  return [...cells];
}

