import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Language } from '../shared';
import { refreshVoices, resolveSpokenLanguage } from './voice';

/**
 * Langue effectivement parlee par le guidage (voir resolveSpokenLanguage) : la langue de
 * l'application quand le telephone sait la prononcer, le francais sinon.
 *
 * Reverifiee au retour dans l'application : si l'utilisateur est alle installer la voix arabe
 * dans les reglages, le guidage repasse en arabe sans qu'il ait a relancer WIN.
 */
export function useSpokenLanguage(lang: Language): Language {
  const [spoken, setSpoken] = useState<Language>(lang);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void resolveSpokenLanguage(lang).then((l) => {
        if (!cancelled) setSpoken(l);
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshVoices();
        check();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [lang]);

  return spoken;
}
