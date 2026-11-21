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
/**
 * LE CHOIX D'ITINERAIRE : TROIS PROFILS, ET << LE PLUS COURT >> PAR DEFAUT - point 5A du
 * 21 novembre.
 *
 * L'HISTOIRE DE CE REGLAGE EN TROIS TEMPS, parce qu'elle explique pourquoi il revient a trois.
 *
 *   - Au depart, TROIS boutons : << Sans peage >>, << Sans piste >>, << Grands axes >>. Ils se
 *     recouvraient a moitie et aucun ne posait la question que se pose un conducteur algerien.
 *   - En octobre, UN booleen : l'autoroute, oui ou non. Le seul peage du pays etant sur
 *     l'Est-Ouest, le choix l'englobait ; et les pistes sont devenues une regle permanente,
 *     plus une preference.
 *   - Le 21 novembre, le client redemande TROIS choix - << avec autoroute / sans autoroute /
 *     plus court >> - et il dit pourquoi : << sur un trajet vers l'aeroport d'Alger, le GPS
 *     affichait 10-11 km alors que le conducteur etait a 2 km >>.
 *
 * ET LE TROISIEME N'EST PAS UN RETOUR EN ARRIERE. Les anciens boutons etaient trois facons de
 * dire la meme chose ; ceux-ci sont trois INTENTIONS distinctes, dont une que le booleen ne
 * pouvait pas exprimer. << Le plus court >> n'est ni << avec >> ni << sans >> autoroute : il
 * l'accepte quand elle raccourcit vraiment, et c'est precisement ce qui manquait pour que le
 * trajet de l'aeroport fasse 2 km au lieu de 10. Les valeurs elles-memes vivent cote serveur,
 * dans apps/api/src/lib/profilsItineraire.ts, avec le detail de chaque reglage.
 */
export type ProfilItineraire = 'court' | 'autoroute' | 'sansAutoroute';

export type RoutePrefs = {
  profil: ProfilItineraire;
};

/* Par defaut, LE PLUS COURT - c'est la demande du 21 novembre, et c'est le reglage qui corrige
 * le detour constate. Le defaut precedent etait l'autoroute : le plus rapide entre deux grandes
 * villes, mais un detour de huit kilometres pour aller a l'aeroport d'Alger. */
const DEFAULT_ROUTE_PREFS: RoutePrefs = { profil: 'court' };

/**
 * Reglage relu depuis le telephone, en se mefiant de ce qu'on y trouve.
 *
 * TROIS GENERATIONS D'ENREGISTREMENT COHABITENT sur les telephones en service, et ce sont de
 * VRAIS appareils : celui des trois anciens boutons, celui du booleen d'octobre, et le nouveau.
 * Sans cette relecture, un appareil mis a jour depuis octobre trouverait `profil` a `undefined`
 * et le calcul d'itineraire partirait sur une valeur qui n'en est pas une.
 *
 * LE BOOLEEN EST TRADUIT, PAS JETE. Quelqu'un qui avait choisi << sans autoroute >> l'a choisi
 * pour une raison - il evite le peage, ou il n'aime pas l'Est-Ouest - et la mise a jour ne doit
 * pas le remettre dessus en silence. On ne lui applique donc PAS le nouveau defaut : son choix
 * est conserve tel quel. Seul un appareil qui n'avait jamais rien choisi recoit << le plus
 * court >>.
 */
function lireRoutePrefs(): RoutePrefs {
  const brut = readJson<{ profil?: unknown; autoroute?: unknown }>(
    StorageKeys.routePrefs,
    DEFAULT_ROUTE_PREFS,
  );
  if (brut.profil === 'court' || brut.profil === 'autoroute' || brut.profil === 'sansAutoroute') {
    return { profil: brut.profil };
  }
  if (typeof brut.autoroute === 'boolean') {
    return { profil: brut.autoroute ? 'autoroute' : 'sansAutoroute' };
  }
  return DEFAULT_ROUTE_PREFS;
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
  /** Le profil d itineraire choisi dans la carte de trajet (voir ProfilItineraire). */
  setProfil: (profil: ProfilItineraire) => void;
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

  setProfil: (profil) => {
    const next: RoutePrefs = { profil };
    writeJson(StorageKeys.routePrefs, next);
    set({ routePrefs: next });
  },
}));
