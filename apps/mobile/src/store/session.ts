import { create } from 'zustand';
import type { Language } from '../shared';
import { api, ensureDeviceToken } from '../api/client';
import { readJson, storage, StorageKeys, writeJson } from './storage';
import { isNightTime } from '../utils/clock';

/**
 * 'auto' suit l'HEURE (nuit de 19 h a 6 h, seuils de v83) ; 'light' et 'dark' l'emportent
 * explicitement, le temps de la session.
 *
 * Volontairement pas le theme du telephone : la v83 ne le consulte pas, et l'application doit
 * ressembler au site.
 *
 * Ce choix n'est PAS enregistre, et c'est deliberé : la v83 decide a chaque chargement de page
 * (`if(h>=19||h<6) applyNight(true)`), et le bouton lune n'y est qu'un interrupteur valable
 * pour la visite en cours. Le conserver d'une session a l'autre ferait s'ouvrir l'application
 * en plein noir a midi parce qu'on a force la nuit la veille — et, l'automatique n'etant plus
 * atteignable, sans aucun moyen d'en sortir. Chaque lancement repart donc de l'heure.
 */
export type ThemeOverride = 'auto' | 'light' | 'dark';

/**
 * Preferences d'itineraire, transmises a Valhalla (document 143, point 2).
 *
 * Elles comptent particulierement en Algerie, ou la qualite des routes varie beaucoup d'un
 * axe a l'autre : une piste praticable en 4x4 ne l'est pas pour une berline, et le moteur ne
 * peut pas le deviner. Conservees d'une session a l'autre, contrairement au mode nuit : c'est
 * un choix lie au vehicule, pas a l'heure.
 */
export type RoutePrefs = {
  /**
   * Passer par l'autoroute, ou l'eviter. UN seul reglage la ou il y en avait trois.
   *
   * Il y avait << Sans peage >>, << Sans piste >> et << Grands axes >>. Trois boutons qui se
   * recouvraient a moitie et dont aucun ne posait la question que se pose vraiment un
   * conducteur algerien : est-ce que je prends l'Est-Ouest, oui ou non.
   *
   * Les deux autres n'avaient plus lieu d'etre : le seul peage du pays est sur cette autoroute
   * — le choix l'englobe donc —, et les pistes ne sont pas une preference mais une regle. Elles
   * sont desormais ecartees en permanence (voir costingOptions cote API), parce que personne ne
   * demande a etre envoye sur un chemin de terre.
   */
  autoroute: boolean;
};

/* Par defaut, l'autoroute. C'est l'itineraire le plus rapide entre deux grandes villes
 * algeriennes, et celui que choisit quelqu'un qui ne choisit rien. */
const DEFAULT_ROUTE_PREFS: RoutePrefs = { autoroute: true };

/**
 * Reglage relu depuis le telephone, en se mefiant de ce qu'on y trouve : les appareils deja
 * installes portent l'ANCIEN enregistrement, celui des trois boutons. Sans ce controle,
 * `routePrefs.autoroute` y vaudrait `undefined` — ni vrai ni faux — et le calcul d'itineraire
 * partirait sur une valeur qui n'en est pas une.
 */
function lireRoutePrefs(): RoutePrefs {
  const brut = readJson<Partial<RoutePrefs>>(StorageKeys.routePrefs, DEFAULT_ROUTE_PREFS);
  return { autoroute: typeof brut.autoroute === 'boolean' ? brut.autoroute : true };
}

type Session = {
  deviceId: string | null;
  language: Language;
  consentAccepted: boolean;
  themeOverride: ThemeOverride;
  /** Annonces vocales (guidage + reponses de l'assistant) — bouton "voice" de v83, coupe le son
   * sans rien changer au reste (avancement des manoeuvres, texte affiche...). */
  voiceGuidanceEnabled: boolean;
  routePrefs: RoutePrefs;
  /**
   * Alertes de proximite aux signalements (point 17 du client, 29 octobre).
   *
   * DISTINCT du guidage vocal, et ce n'est pas un detail : `voiceGuidanceEnabled` coupe la
   * VOIX, toutes annonces confondues, y compris les consignes de conduite. Celui-ci coupe les
   * ALERTES aux signalements, voix ET carte, sans toucher au guidage. Un conducteur qui roule
   * sur une route qu'il connait par coeur veut souvent le second sans le premier — c'est
   * exactement ce que la carte d'alerte lui propose, au moment ou l'alerte l'agace.
   */
  approachAlertsEnabled: boolean;
  ready: boolean;

  /** Inscrit l'appareil au premier lancement, puis reutilise le jeton garde. */
  bootstrap: () => Promise<void>;
  setLanguage: (language: Language) => void;
  acceptConsent: () => void;
  /** Interrupteur jour/nuit, comme `applyNight(!nightMode)` en v83. */
  toggleNightMode: () => void;
  toggleVoiceGuidance: () => void;
  /** « OUI, desactiver » / « NON, garder » depuis la carte d'alerte, ou le panneau de reglages. */
  setApproachAlerts: (on: boolean) => void;
  setAutoroute: (on: boolean) => void;
};

export const useSession = create<Session>((set, get) => ({
  deviceId: storage.getString(StorageKeys.deviceId) ?? null,
  language: (storage.getString(StorageKeys.language) as Language | undefined) ?? 'fr',
  consentAccepted: storage.getString(StorageKeys.consentAcceptedAt) !== undefined,
  // Toujours 'auto' au lancement : la carte s'assombrit d'elle-meme a la tombee de la nuit,
  // comme le faisait v83 au chargement de la page. Le theme du telephone n'est jamais
  // consulte — le site ne le consulte pas non plus, et les deux doivent coincider.
  themeOverride: 'auto',
  voiceGuidanceEnabled: storage.getString(StorageKeys.voiceEnabled) !== '0',
  /* Actives par defaut : c'est une fonction de securite, et une securite ne s'active pas,
   * elle se desactive. L'absence de cle vaut donc « actives ». */
  approachAlertsEnabled: storage.getString(StorageKeys.approachAlerts) !== '0',
  routePrefs: lireRoutePrefs(),
  ready: false,

  bootstrap: async () => {
    // L'ecran n'attend jamais le reseau : la carte doit s'afficher meme hors ligne.
    set({ ready: true });

    // L'inscription elle-meme vit dans le client d'API (ensureDeviceToken) plutot qu'ici :
    // elle doit pouvoir etre retentee au moment ou l'on en a besoin — a l'ajout d'un lieu,
    // a l'envoi d'une photo — et pas seulement au demarrage. Un premier lancement sans
    // reseau privait sinon l'appareil d'identite pour toute la duree de l'installation.
    const token = await ensureDeviceToken();
    if (token) {
      set({ deviceId: storage.getString(StorageKeys.deviceId) ?? null });
      void api('/devices/heartbeat', { method: 'POST' }).catch(() => {
        /* hors ligne : sans consequence */
      });
    }
  },

  setLanguage: (language) => {
    storage.set(StorageKeys.language, language);
    set({ language });
  },

  acceptConsent: () => {
    storage.set(StorageKeys.consentAcceptedAt, new Date().toISOString());
    set({ consentAccepted: true });
  },

  toggleNightMode: () => {
    // On bascule depuis ce qui est REELLEMENT affiche : en mode automatique a 21 h, l'ecran
    // est deja sombre, et l'appui doit donc ramener au clair — pas l'assombrir une seconde fois.
    const current = get().themeOverride;
    const shown = current === 'auto' ? (isNightTime() ? 'dark' : 'light') : current;
    set({ themeOverride: shown === 'dark' ? 'light' : 'dark' });
  },

  toggleVoiceGuidance: () => {
    const next = !get().voiceGuidanceEnabled;
    storage.set(StorageKeys.voiceEnabled, next ? '1' : '0');
    set({ voiceGuidanceEnabled: next });
  },

  setApproachAlerts: (on) => {
    storage.set(StorageKeys.approachAlerts, on ? '1' : '0');
    set({ approachAlertsEnabled: on });
  },

  setAutoroute: (on) => {
    const next: RoutePrefs = { autoroute: on };
    writeJson(StorageKeys.routePrefs, next);
    set({ routePrefs: next });
  },
}));
