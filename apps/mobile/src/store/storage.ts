import { MMKV } from 'react-native-mmkv';

/**
 * Stockage local, successeur des onze cles localStorage de la version web
 * (win_uid, win_favs, win_hist, win_alerts, win_myContrib, win_absent_votes,
 * win_dz_unlocked, win_tn_unlocked, winConsentAccepted, winConsentDate,
 * win_install_dismissed).
 *
 * MMKV est synchrone : un favori se lit sans await, donc sans clignotement a
 * l'ouverture de l'ecran.
 */
export const storage = new MMKV({ id: 'win' });

export const StorageKeys = {
  deviceId: 'deviceId',
  deviceToken: 'deviceToken',
  adminToken: 'adminToken',
  language: 'language',
  consentAcceptedAt: 'consentAcceptedAt',
  favorites: 'favorites',
  history: 'history',
  voiceEnabled: 'voiceEnabled',
  /** Identifiant de la voix de synthese choisie a la main, absent = meilleure disponible. */
  voiceId: 'voiceId',
  unlockedCountries: 'unlockedCountries',
} as const;

export function readJson<T>(key: string, fallback: T): T {
  const raw = storage.getString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  storage.set(key, JSON.stringify(value));
}
