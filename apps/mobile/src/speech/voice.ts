import * as Speech from 'expo-speech';
import type { Language } from '../shared';
import { storage, StorageKeys } from '../store/storage';

/**
 * Choix de la voix de synthese.
 *
 * Jusqu'ici l'application se contentait de passer une LANGUE a `Speech.speak`. Android
 * choisissait alors seul, et son choix par defaut est souvent la voix de secours du systeme —
 * celle qui sonne robotique, voire qui lit du francais avec l'accent d'une autre langue quand
 * aucune voix francaise n'est installee. C'est le meme probleme que resolvait `pickBestVoice`
 * en v83, dont la logique de notation est reprise ici.
 */

export function speechLocale(lang: Language): string {
  if (lang === 'ar' || lang === 'dz') return 'ar-DZ';
  if (lang === 'en') return 'en-US';
  return 'fr-FR';
}

/**
 * Langue transmise au moteur de synthese : le code sur DEUX lettres, jamais « fr-FR ».
 *
 * Le module Android d'expo-speech construit `Locale(language)` avec le constructeur a un seul
 * argument, qui prend la chaine entiere pour un code de langue : « fr-FR » y devient une langue
 * inconnue nommee « fr-fr ». Le moteur la declare non prise en charge et expo-speech se rabat
 * alors, sans rien dire, sur la langue du TELEPHONE. Sur un telephone regle en anglais, les
 * consignes francaises etaient donc lues par une voix anglaise — « Turnus taut to suite » pour
 * « Tournez tout de suite ». Avec « fr », la locale est valide et la voix reste francaise, meme
 * quand aucune voix precise n'a pu etre choisie.
 */
function ttsLanguage(lang: Language): string {
  return speechLocale(lang).slice(0, 2);
}

/** Debit de parole. L'arabe se prononce mieux un peu plus lentement, le francais et
 * l'anglais un poil plus vifs — memes valeurs qu'en v83. */
function speechRate(lang: Language): number {
  return lang === 'ar' || lang === 'dz' ? 0.9 : 0.96;
}

/** Dialecte prefere quand plusieurs existent pour la meme langue. */
const PREFERRED_DIALECT: Record<string, string> = { fr: 'fr-FR', ar: 'ar-DZ', en: 'en-US' };

/**
 * Genre d'une voix, quand il est reconnaissable — sinon `null`.
 *
 * Android n'expose AUCUN champ de genre : il faut le lire dans le nom ou l'identifiant, et
 * chaque constructeur ecrit ce qu'il veut. On reconnait donc trois formes seulement :
 * la mention explicite (« female », « #female_1 » chez Samsung), la mention masculine, et la
 * convention de Google, dont les variantes A, C et E des voix Standard/WaveNet/Neural sont
 * feminines. Tout le reste reste indetermine — d'ou le panneau de choix manuel, qui est le
 * seul moyen fiable sur un telephone qui ne declare rien.
 */
export function voiceGender(voice: Speech.Voice): 'female' | 'male' | null {
  const name = `${voice.name ?? ''} ${voice.identifier ?? ''}`.toLowerCase();
  // « female » contient « male » : ce test doit rester le premier.
  if (/female|femme|woman/.test(name)) return 'female';
  if (/(^|[^e])male|homme|\bman\b/.test(name)) return 'male';
  if (/-(standard|wavenet|neural2|polyglot)-[ace]\b/.test(name)) return 'female';
  return null;
}

/**
 * Note une voix. Plus c'est haut, plus elle est naturelle.
 *
 * Les noms de voix Android ne sont pas normalises : on ne peut que reconnaitre les familles
 * connues. Une voix « compact » ou « espeak » est fortement penalisee — ce sont les voix de
 * secours minuscules, celles qui donnent l'impression d'un robot des annees 90.
 */
function scoreVoice(voice: Speech.Voice, base: string): number {
  const name = `${voice.name ?? ''} ${voice.identifier ?? ''}`.toLowerCase();
  let score = 0;

  if (/neural|natural|wavenet/.test(name)) score += 50;
  if (/google/.test(name)) score += 42;
  if (/microsoft|enhanced|premium/.test(name)) score += 38;
  if (/samsung/.test(name)) score += 22;
  if (voice.quality === Speech.VoiceQuality.Enhanced) score += 25;
  if (PREFERRED_DIALECT[base] && voice.language === PREFERRED_DIALECT[base]) score += 15;
  if (/compact|espeak|pico|robot|low/.test(name)) score -= 40;

  // Voix feminine preferee, comme sur les cartes de navigation courantes — mais APRES la
  // qualite, volontairement : entre une voix feminine robotique et une voix masculine
  // naturelle, la seconde reste plus agreable a suivre pendant une heure de route. Le poids
  // choisi departage des voix de meme famille sans jamais renverser cet ordre.
  const gender = voiceGender(voice);
  if (gender === 'female') score += 30;
  else if (gender === 'male') score -= 25;

  return score;
}

/** Toutes les voix du telephone, demandees une seule fois. */
let voicesPromise: Promise<Speech.Voice[]> | null = null;

function allVoices(): Promise<Speech.Voice[]> {
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync()
      .catch(() => [] as Speech.Voice[])
      .then((voices) => {
        // Au lancement, le moteur de synthese s'initialise en arriere-plan : interroge trop tot,
        // il repond par une liste vide (ou une erreur). Garder ce resultat condamnait
        // l'application a ne JAMAIS choisir de voix pendant toute la session. Une liste vide
        // n'est donc pas memorisee : la prochaine phrase redemandera.
        if (voices.length === 0) voicesPromise = null;
        return voices;
      });
  }
  return voicesPromise;
}

/** Voix installees pour une langue, de la plus naturelle a la moins bonne. */
export async function voicesForLanguage(lang: Language): Promise<Speech.Voice[]> {
  const base = speechLocale(lang).slice(0, 2).toLowerCase();
  const voices = await allVoices();
  return voices
    .filter((v) => (v.language ?? '').slice(0, 2).toLowerCase() === base)
    .sort((a, b) => scoreVoice(b, base) - scoreVoice(a, base));
}

/**
 * Le telephone a-t-il au moins une voix pour cette langue ?
 *
 * Sans elle, Android ne peut pas lire la phrase dans la bonne langue et la confie a sa voix par
 * defaut : de l'arabe lu par une voix francaise ou anglaise, incomprehensible. L'application ne
 * peut pas installer une voix elle-meme — elle doit donc au moins le dire.
 * `null` : reponse inconnue (moteur pas encore pret), a ne pas prendre pour un « non ».
 */
export async function hasVoiceFor(lang: Language): Promise<boolean | null> {
  const all = await allVoices();
  if (all.length === 0) return null;
  return (await voicesForLanguage(lang)).length > 0;
}

/**
 * Langue dans laquelle le guidage doit PARLER.
 *
 * Regle voulue : la langue de l'application, si le telephone possede une voix pour elle ; sinon
 * le francais. Faire lire une phrase arabe par une voix francaise ne donne rien de comprehensible
 * — mieux vaut une consigne claire en francais qu'une consigne dans la bonne langue que personne
 * ne comprend. Si la reponse est inconnue (moteur pas encore pret) on garde la langue choisie :
 * on ne bascule que sur un « non » certain.
 */
export async function resolveSpokenLanguage(lang: Language): Promise<Language> {
  if (lang === 'fr') return 'fr';
  if ((await hasVoiceFor(lang)) !== false) return lang;
  // Pas de voix francaise non plus : basculer n'apporterait rien.
  return (await hasVoiceFor('fr')) === false ? lang : 'fr';
}

/** Oublie la liste des voix : a appeler au retour dans l'application, l'utilisateur vient
 * peut-etre d'installer la voix qui manquait dans les reglages Android. */
export function refreshVoices(): void {
  voicesPromise = null;
  resolved.clear();
}

/* ------------------------------------------------------------------------- */
/* Choix de l'utilisateur                                                     */
/* ------------------------------------------------------------------------- */

/** Identifiant choisi a la main, ou `null` pour « la meilleure voix disponible ». */
export function preferredVoiceId(): string | null {
  return storage.getString(StorageKeys.voiceId) ?? null;
}

export function setPreferredVoiceId(identifier: string | null): void {
  if (identifier) storage.set(StorageKeys.voiceId, identifier);
  else storage.delete(StorageKeys.voiceId);
  resolved.clear();
}

/** Voix retenue par langue, pour ne pas refaire le tri a chaque phrase prononcee. */
const resolved = new Map<Language, string | undefined>();

async function resolveVoice(lang: Language): Promise<string | undefined> {
  const cached = resolved.get(lang);
  if (cached !== undefined || resolved.has(lang)) return cached;

  const candidates = await voicesForLanguage(lang);
  const chosen = preferredVoiceId();
  // Le choix de l'utilisateur n'est retenu que s'il existe ENCORE et qu'il parle bien la
  // langue active : une voix desinstallee, ou une voix francaise alors que l'interface est
  // passee en arabe, ferait parler l'application dans le vide.
  const match = chosen ? candidates.find((v) => v.identifier === chosen) : undefined;
  const best = match ?? candidates[0];
  // Meme raison que dans allVoices : « aucune voix trouvee » n'est pas une reponse definitive.
  if (best) resolved.set(lang, best.identifier);
  return best?.identifier;
}

/* ------------------------------------------------------------------------- */

/**
 * Prononce une phrase avec la meilleure voix disponible pour la langue active.
 *
 * Le premier appel interroge le telephone puis garde le resultat : les annonces de
 * navigation s'enchainent a quelques secondes d'intervalle, et refaire ce tri a chaque
 * virage serait du gaspillage.
 */
export function speakGuidance(text: string, lang: Language): void {
  if (!text) return;
  const language = ttsLanguage(lang);
  void resolveVoice(lang).then((voice) => {
    Speech.stop();
    Speech.speak(text, {
      language,
      voice,
      rate: speechRate(lang),
      // Tres legerement plus haut : voix plus claire, moins sourde dans un habitacle.
      pitch: 1.02,
    });
  });
}

/** Arrete la phrase en cours. */
export function stopSpeaking(): void {
  Speech.stop();
}
