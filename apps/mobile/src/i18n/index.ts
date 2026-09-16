import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import { DEFAULT_LANGUAGE, LANGUAGES, RTL_LANGUAGES, type Language } from '../shared';
import { useSession } from '../store/session';
import { storage, StorageKeys } from '../store/storage';
import ar from './locales/ar.json';
import dz from './locales/dz.json';
import en from './locales/en.json';
import fr from './locales/fr.json';

/** Langue retenue : choix explicite de l'utilisateur, sinon celle du telephone. */
function resolveLanguage(): Language {
  const saved = storage.getString(StorageKeys.language) as Language | undefined;
  if (saved && LANGUAGES.includes(saved)) return saved;

  const system = Localization.getLocales()[0]?.languageCode;
  if (system && (LANGUAGES as readonly string[]).includes(system)) return system as Language;
  return DEFAULT_LANGUAGE;
}

const language = resolveLanguage();

/**
 * Sens de lecture.
 *
 * En React Native, l'inversion est appliquee par le systeme et exige un
 * redemarrage de l'application : c'est plus propre que le CSS `direction` de
 * la version web, qui laissait quelques panneaux a l'envers.
 */
export const isRTL = RTL_LANGUAGES.includes(language);
if (I18nManager.isRTL !== isRTL) {
  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);
}

void i18n.use(initReactI18next).init({
  lng: language,
  fallbackLng: 'fr',
  resources: {
    fr: { translation: fr },
    dz: { translation: dz },
    ar: { translation: ar },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

/**
 * Change la langue active. Le texte bascule immediatement partout (i18next),
 * mais le sens de lecture (RTL) est impose par le systeme d'exploitation : le
 * changer exige un redemarrage de l'app, contrairement au `direction` CSS de
 * la version web qui basculait a la volee. Retourne `true` quand ce
 * redemarrage est necessaire, pour que l'appelant puisse le proposer.
 */
export function changeLanguage(next: Language): boolean {
  useSession.getState().setLanguage(next);
  void i18n.changeLanguage(next);
  const nextIsRTL = RTL_LANGUAGES.includes(next);
  if (nextIsRTL === I18nManager.isRTL) return false;
  I18nManager.allowRTL(nextIsRTL);
  I18nManager.forceRTL(nextIsRTL);
  return true;
}

export default i18n;
