import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '../shared';
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
 * SENS DE LECTURE : POURQUOI L'APPLICATION N'INVERSE PLUS SA MISE EN PAGE.
 *
 * Le client demande un changement de langue instantane, sans fenetre de confirmation et sans
 * redemarrage « d'aucune sorte ». Une seule chose, ici, exigeait ce redemarrage :
 * `I18nManager.forceRTL`. Ce reglage n'est pas du CSS — il est applique par Android au moment
 * ou les vues sont creees, et les vues deja a l'ecran ne s'inversent pas. D'ou la fenetre
 * « redemarrez l'app » : elle n'etait pas un choix de confort, c'etait l'aveu d'une limite.
 *
 * On enleve donc la limite plutot que de la faire porter a l'utilisateur. L'inversion de la
 * mise en page n'etait de toute facon utilisee NULLE PART dans l'interface : rien, dans tout
 * le code de WIN, ne lisait `isRTL` pour se positionner. L'arabe et le darija s'affichaient
 * correctement par le seul rendu bidirectionnel du texte, que ce reglage ne touche pas — et
 * la colonne de boutons, la carte et les panneaux ont une place voulue, pas une place miroir.
 *
 * Reste a reparer les telephones ou l'ancienne version a laisse le drapeau arme : Android le
 * garde d'un lancement a l'autre. On le desarme donc une fois au demarrage. Ces telephones
 * verront leur mise en page revenir a l'endroit au prochain lancement — c'est le dernier
 * redemarrage, et il n'est demande a personne.
 */
if (I18nManager.isRTL) {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
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
 * Change la langue active, tout de suite et sans rien demander.
 *
 * Deux lignes, et c'est tout ce qu'il faut : i18next previent tous les composants, le texte
 * bascule a l'image suivante, et le choix est memorise pour le prochain lancement. Voir
 * ci-dessus pour ce qui a disparu — et pourquoi la fenetre de redemarrage avec.
 */
export function changeLanguage(next: Language): void {
  useSession.getState().setLanguage(next);
  void i18n.changeLanguage(next);
}

export default i18n;
