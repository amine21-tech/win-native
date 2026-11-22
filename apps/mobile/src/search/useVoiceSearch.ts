import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { claimMic, holdsMic, releaseMic } from '../assistant/micOwner';
import { appuiMicro, ECOUTE_MS, phraseUtilisable } from './micro';
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
 * Dictee vocale de la barre de recherche : UN SEUL APPUI, cinq secondes d'ecoute, resultat
 * automatique — point 8 du 22 novembre.
 *
 * << Remplacement de l'appui long (peu intuitif) par un appui simple de 5 secondes. >>
 *
 * CE QUI A CHANGE, ET CE QUI N'A PAS CHANGE. Le GESTE change : `appuyer()` remplace le couple
 * appui/relachement. Tout le reste — la permission, le proprietaire du micro, les evenements
 * `result` / `end` / `error`, le code de langue, le seuil de deux caracteres — est exactement
 * celui d'avant. C'est la consigne du document : << NE PAS MODIFIER la logique existante >>.
 *
 * LE RELACHEMENT N'EST PLUS CE QUI FINALISE : c'est la minuterie, ou un second appui. Il n'y a
 * donc plus qu'un seul chemin de sortie cote moteur (`stop`), et c'est une simplification
 * reelle : l'ancien geste pouvait relacher AVANT que le moteur ait confirme son demarrage, et
 * la dictee restait alors ouverte jusqu'au silence.
 *
 * Ne remplace PAS l'assistant a commandes (retire sur demande) : ici, aucun mot-cle n'est
 * interprete, la phrase entendue part telle quelle dans la recherche d'adresse existante.
 */
export function useVoiceSearch({ lang, onPartial, onFinal, onUnavailable }: Options) {
  const [listening, setListening] = useState(false);
  // Dernier texte entendu, garde hors du state React : `end` arrive parfois dans le meme cycle
  // de rendu que le dernier `result`, et une valeur d'etat y serait encore l'ancienne.
  const heardRef = useRef('');
  /**
   * LA MINUTERIE DES CINQ SECONDES, hors de l'etat React pour la meme raison que `heardRef` :
   * elle doit pouvoir etre annulee depuis un evenement du moteur, qui arrive parfois dans le
   * cycle de rendu courant.
   *
   * ELLE DOIT ETRE ANNULEE DANS LES TROIS SORTIES — fin normale, erreur, et demontage de
   * l'ecran. Une minuterie oubliee appellerait `stop()` sur un moteur deja arrete cinq secondes
   * plus tard, ou, pire, sur la dictee SUIVANTE : l'utilisateur relance le micro, et son ecoute
   * est coupee par la minuterie de la precedente.
   */
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * L'ECOUTE A-T-ELLE ETE DEMANDEE ? Ecrit TOUT DE SUITE, la ou `listening` attend un rendu.
   *
   * SANS CETTE REFERENCE, DEUX APPUIS RAPPROCHES LANCENT DEUX DICTEES. `start()` est
   * asynchrone : entre l'appui et le `setListening(true)` qui en decoule, il y a au moins un
   * cycle de rendu, et un doigt impatient — c'est-a-dire un doigt normal, sur un bouton qui ne
   * reagit pas encore — y passe deux fois. Le second appui lirait `listening` encore a `false`,
   * conclurait << demarrer >>, reclamerait le micro une seconde fois et armerait une seconde
   * minuterie. L'etat React reste la verite AFFICHEE ; celle-ci est la verite du geste.
   */
  const ecouteDemandee = useRef(false);

  const annulerMinuterie = useCallback(() => {
    if (minuterie.current != null) {
      clearTimeout(minuterie.current);
      minuterie.current = null;
    }
  }, []);

  /* Le demontage de l'ecran est la troisieme sortie, et la seule qu'on ne voit pas en lisant le
   * reste : quitter la carte pendant une dictee laisserait la minuterie courir. */
  useEffect(() => annulerMinuterie, [annulerMinuterie]);

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
    annulerMinuterie();
    ecouteDemandee.current = false;
    releaseMic('search');
    setListening(false);
    const said = heardRef.current.trim();
    heardRef.current = '';
    /* << Resultat : automatique apres 5s >>. C'est ici que le document est tenu : personne
     * n'appuie sur rien, c'est la fin de l'ecoute qui lance la recherche. */
    if (phraseUtilisable(said)) onFinal(said);
  });

  useSpeechRecognitionEvent('error', () => {
    if (!holdsMic('search')) return;
    annulerMinuterie();
    ecouteDemandee.current = false;
    releaseMic('search');
    setListening(false);
    heardRef.current = '';
  });

  const start = useCallback(async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        ecouteDemandee.current = false;
        onUnavailable();
        return;
      }
      heardRef.current = '';
      ecouteDemandee.current = true;
      claimMic('search');
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: recognitionLocale(lang),
        interimResults: true,
        continuous: false,
      });
    } catch {
      ecouteDemandee.current = false;
      releaseMic('search');
      setListening(false);
      onUnavailable();
    }
  }, [lang, onUnavailable]);

  const stop = useCallback(() => {
    // `stop` demande au moteur de finaliser ce qu'il a entendu (l'evenement `end` suit) —
    // contrairement a `abort`, qui jetterait la phrase.
    annulerMinuterie();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  }, [annulerMinuterie]);

  /**
   * L'APPUI SIMPLE — le seul geste du micro depuis le point 8.
   *
   * Premier appui : on ecoute, et la minuterie finalisera au bout de cinq secondes. Second
   * appui pendant l'ecoute : on finalise tout de suite, sans jeter ce qui a ete entendu. La
   * regle elle-meme vit dans `search/micro`, ou elle s'eprouve.
   *
   * LA MINUTERIE EST ARMEE ICI ET NON DANS `start`, et la nuance compte : `start` est
   * asynchrone (il demande la permission du micro). Armee a l'interieur, elle commencerait a
   * courir apres la reponse de l'utilisateur a la demande de permission — donc, la premiere
   * fois, plusieurs secondes trop tard.
   */
  const appuyer = useCallback(() => {
    if (appuiMicro(ecouteDemandee.current) === 'finir') {
      stop();
      return;
    }
    ecouteDemandee.current = true;
    annulerMinuterie();
    minuterie.current = setTimeout(stop, ECOUTE_MS);
    void start();
  }, [annulerMinuterie, start, stop]);

  return { listening, start, stop, appuyer };
}
