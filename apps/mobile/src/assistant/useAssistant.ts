import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { speakGuidance, speechLocale, stopSpeaking } from '../speech/voice';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { claimMic, holdsMic, releaseMic } from './micOwner';
import {
  extractDestination,
  matchCommand,
  normalizeSpoken,
  type AssistantAction,
} from './commands';
import type { Language } from '../shared';
import { useSession } from '../store/session';

/** Le moteur de reconnaissance n'accepte pas d'autre code que ceux-ci ; le darija n'en a
 * pas et retombe sur l'arabe algerien, qui est ce qui s'en rapproche le plus. */
function recognitionLocale(lang: Language): string {
  return speechLocale(lang);
}

/** Delai avant fermeture automatique du panneau, une fois la commande executee. Assez long
 * pour lire la reponse, assez court pour ne pas rester en travers de la carte. */
const CLOSE_AFTER_MS = 2200;

type Handlers = {
  lang: Language;
  /** Lance une recherche de categorie (« pharmacie de garde »). */
  onCategory: (categoryKey: string, label: string) => void;
  /** Lance une recherche libre : destination d'un « emmene-moi a X », ou repli quand
   * aucune commande n'est reconnue. */
  onSearchText: (text: string) => void;
  onStopNavigation: () => void;
  onLocate: () => void;
  /** Reponse a « combien de temps reste-t-il ? », calculee par l'ecran a partir de ce qui
   * est DEJA affiche — jamais un second calcul qui pourrait diverger de ce que le
   * conducteur lit (meme regle qu'en v83). */
  etaAnswer: () => string;
  onUnavailable: () => void;
};

/**
 * Assistant vocal a commandes : on appuie sur le bouton, on parle, l'application repond a
 * voix haute et agit. Il ne remplace pas la dictee de la barre de recherche (useVoiceSearch),
 * qui envoie la phrase telle quelle dans la recherche sans rien interpreter.
 *
 * Les deux ne peuvent pas ecouter en meme temps — un seul moteur de reconnaissance existe
 * sur le telephone. L'appelant est responsable de ne pas les ouvrir ensemble ; l'assistant,
 * lui, arrete toujours sa propre ecoute avant d'agir.
 */
export function useAssistant({
  lang,
  onCategory,
  onSearchText,
  onStopNavigation,
  onLocate,
  etaAnswer,
  onUnavailable,
}: Handlers) {
  const { t } = useTranslation();
  const voiceGuidanceEnabled = useSession((s) => s.voiceGuidanceEnabled);

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('');
  const [heard, setHeard] = useState('');

  const heardRef = useRef('');
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs plutot que dependances : ces fonctions sont ecrites en ligne par l'ecran et
  // changent a chaque rendu. En dependances, elles recreeraient `execute` en permanence.
  const handlersRef = useRef({ onCategory, onSearchText, onStopNavigation, onLocate, etaAnswer, onUnavailable });
  handlersRef.current = { onCategory, onSearchText, onStopNavigation, onLocate, etaAnswer, onUnavailable };
  const langRef = useRef(lang);
  langRef.current = lang;
  const voiceRef = useRef(voiceGuidanceEnabled);
  voiceRef.current = voiceGuidanceEnabled;

  /** Affiche ET prononce une phrase. Le bouton haut-parleur de l'ecran coupe la voix,
   * jamais le texte : sans le son, l'assistant reste utilisable en lisant. */
  const say = useCallback((text: string) => {
    setStatus(text);
    if (!voiceRef.current) return;
    speakGuidance(text, langRef.current);
  }, []);

  const stopListening = useCallback(() => {
    releaseMic('assistant');
    setListening(false);
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* le moteur n'ecoutait pas : sans consequence */
    }
  }, []);

  const close = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    stopListening();
    setOpen(false);
    setStatus('');
    setHeard('');
    heardRef.current = '';
  }, [stopListening]);

  const closeSoon = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => close(), CLOSE_AFTER_MS);
  }, [close]);

  const runAction = useCallback((action: AssistantAction, label: string) => {
    const handlers = handlersRef.current;
    switch (action.kind) {
      case 'category':
        handlers.onCategory(action.categoryKey, label);
        break;
      case 'stopNavigation':
        handlers.onStopNavigation();
        break;
      case 'locate':
        handlers.onLocate();
        break;
      case 'eta':
        break;
    }
  }, []);

  /** Interprete la phrase entendue et agit — port de `assistExecuter` en v83. */
  const execute = useCallback(
    (phrase: string) => {
      const language = langRef.current;
      const candidates = [normalizeSpoken(phrase)].filter(Boolean);
      setHeard(phrase);
      if (!candidates.length) {
        say(t('assistant.notHeard'));
        closeSoon();
        return;
      }

      // « Emmene-moi a X » passe AVANT les categories : « emmene-moi a la pharmacie
      // centrale » est une destination nommee, pas une recherche de pharmacies.
      const destination = extractDestination(candidates);
      if (destination) {
        say(`${t('assistant.searchingRoute')} ${destination}`);
        handlersRef.current.onSearchText(destination);
        closeSoon();
        return;
      }

      const command = matchCommand(candidates);
      if (command) {
        if (command.action.kind === 'eta') {
          say(handlersRef.current.etaAnswer());
        } else {
          const spoken = command.say?.[language] ?? command.say?.fr;
          if (spoken) say(spoken);
          runAction(command.action, command.action.kind === 'category' ? t(command.action.labelKey) : '');
        }
        closeSoon();
        return;
      }

      // Rien de reconnu : on ne devine pas. On le dit, et on bascule sur la recherche
      // normale avec ce qui a ete entendu — exactement ce que fait le micro de la barre.
      say(t('assistant.notUnderstood'));
      handlersRef.current.onSearchText(phrase);
      closeSoon();
    },
    [say, closeSoon, runAction, t],
  );

  /* --------------------- evenements du moteur vocal --------------------- */

  useSpeechRecognitionEvent('result', (event) => {
    if (!holdsMic('assistant')) return;
    const text = event.results?.[0]?.transcript ?? '';
    if (!text) return;
    heardRef.current = text;
    setHeard(text);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!holdsMic('assistant')) return;
    releaseMic('assistant');
    setListening(false);
    const said = heardRef.current.trim();
    heardRef.current = '';
    // Le panneau ferme a la main coupe l'ecoute : on ne doit pas executer ce qui
    // trainait dans le tampon.
    if (said.length >= 2) execute(said);
  });

  useSpeechRecognitionEvent('error', () => {
    if (!holdsMic('assistant')) return;
    releaseMic('assistant');
    setListening(false);
    heardRef.current = '';
    setStatus(t('assistant.notHeard'));
    closeSoon();
  });

  /* --------------------- ouverture / ecoute --------------------- */

  const start = useCallback(async () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpen(true);
    setHeard('');
    heardRef.current = '';
    setStatus(t('assistant.listening'));

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        handlersRef.current.onUnavailable();
        close();
        return;
      }
      claimMic('assistant');
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: recognitionLocale(langRef.current),
        interimResults: true,
        continuous: false,
      });
    } catch {
      releaseMic('assistant');
      setListening(false);
      handlersRef.current.onUnavailable();
      close();
    }
  }, [close, t]);

  return { open, listening, status, heard, start, close };
}
