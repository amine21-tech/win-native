import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';
import { claimMic, holdsMic, releaseMic } from '../assistant/micOwner';
import type { Language } from '../shared';

/** Code de langue passe au moteur de reconnaissance. L'arabe algerien (ar-DZ) est reconnu par
 * les services Google presents sur la plupart des telephones vendus en Algerie ; le darija n'a
 * pas de code propre et retombe donc sur ar-DZ, qui est ce qui s'en rapproche le plus. */
function recognitionLocale(lang: Language): string {
  if (lang === 'ar' || lang === 'dz') return 'ar-DZ';
  if (lang === 'en') return 'en-US';
  return 'fr-FR';
}

type Options = {
  lang: Language;
  /** Appele avec le texte entendu au fil de la dictee (affichage temps reel dans la barre). */
  onPartial: (text: string) => void;
  /** Appele une fois la dictee terminee, avec le texte final — declenche la recherche. */
  onFinal: (text: string) => void;
  onUnavailable: () => void;
};

/**
 * Dictee vocale de la barre de recherche (micBtn en v83) : on appuie et on maintient pour
 * parler, le texte entendu s'affiche en direct, et le relachement lance la recherche.
 *
 * Ne remplace PAS l'assistant a commandes (retire sur demande) : ici, aucun mot-cle n'est
 * interprete, la phrase entendue part telle quelle dans la recherche d'adresse existante.
 */
export function useVoiceSearch({ lang, onPartial, onFinal, onUnavailable }: Options) {
  const [listening, setListening] = useState(false);
  // Dernier texte entendu, garde hors du state React : `end` arrive parfois dans le meme cycle
  // de rendu que le dernier `result`, et une valeur d'etat y serait encore l'ancienne.
  const heardRef = useRef('');

  // `expo-speech-recognition` diffuse ses evenements a TOUS les abonnes : sans ce filtre,
  // une phrase dictee a l'assistant vocal remplissait aussi la barre de recherche et lancait
  // une seconde recherche par-dessus la commande. Voir assistant/micOwner.
  useSpeechRecognitionEvent('result', (event) => {
    if (!holdsMic('search')) return;
    const text = event.results?.[0]?.transcript ?? '';
    if (!text) return;
    heardRef.current = text;
    onPartial(text);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!holdsMic('search')) return;
    releaseMic('search');
    setListening(false);
    const said = heardRef.current.trim();
    heardRef.current = '';
    if (said.length >= 2) onFinal(said);
  });

  useSpeechRecognitionEvent('error', () => {
    if (!holdsMic('search')) return;
    releaseMic('search');
    setListening(false);
    heardRef.current = '';
  });

  const start = useCallback(async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        onUnavailable();
        return;
      }
      heardRef.current = '';
      claimMic('search');
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: recognitionLocale(lang),
        interimResults: true,
        continuous: false,
      });
    } catch {
      releaseMic('search');
      setListening(false);
      onUnavailable();
    }
  }, [lang, onUnavailable]);

  const stop = useCallback(() => {
    // `stop` demande au moteur de finaliser ce qu'il a entendu (l'evenement `end` suit) —
    // contrairement a `abort`, qui jetterait la phrase.
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  }, []);

  return { listening, start, stop };
}
