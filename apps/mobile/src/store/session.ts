import { create } from 'zustand';
import type { Language } from '../shared';
import { api, ensureDeviceToken } from '../api/client';
import { storage, StorageKeys } from './storage';
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

type Session = {
  deviceId: string | null;
  language: Language;
  consentAccepted: boolean;
  themeOverride: ThemeOverride;
  /** Annonces vocales (guidage + reponses de l'assistant) — bouton "voice" de v83, coupe le son
   * sans rien changer au reste (avancement des manoeuvres, texte affiche...). */
  voiceGuidanceEnabled: boolean;
  ready: boolean;

  /** Inscrit l'appareil au premier lancement, puis reutilise le jeton garde. */
  bootstrap: () => Promise<void>;
  setLanguage: (language: Language) => void;
  acceptConsent: () => void;
  /** Interrupteur jour/nuit, comme `applyNight(!nightMode)` en v83. */
  toggleNightMode: () => void;
  toggleVoiceGuidance: () => void;
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
}));
