import type { Language } from '../shared';

/**
 * Grammaire de l'assistant vocal, reprise de `ASSIST_CMDS` en v83.
 *
 * Les formulations reconnues et la phrase de confirmation vivent dans la MEME entree,
 * volontairement : ce sont les deux faces d'une commande, et les separer (les mots ici,
 * les reponses dans les fichiers de traduction) garantissait qu'un jour l'une soit
 * modifiee sans l'autre. Seuls les libelles d'interface passent par i18n.
 *
 * Aucune reconnaissance d'intention n'est tentee au-dela de ces tables : quand rien ne
 * correspond, l'assistant le dit et bascule sur la recherche normale. Deviner une
 * destination au volant a partir d'une phrase mal entendue est la pire chose a faire.
 */

export type AssistantAction =
  | { kind: 'category'; categoryKey: string; labelKey: string }
  | { kind: 'eta' }
  | { kind: 'stopNavigation' }
  | { kind: 'locate' };

export type AssistantCommand = {
  id: string;
  /** Formulations reconnues, dans les quatre langues. */
  words: string[];
  /** Phrase prononcee avant d'agir. `null` quand la reponse est calculee (voir l'ETA). */
  say: Record<Language, string> | null;
  action: AssistantAction;
};

export const ASSISTANT_COMMANDS: AssistantCommand[] = [
  {
    id: 'pharmacie_garde',
    words: [
      'pharmacie de garde', 'pharmacie garde', 'pharmacie ouverte', 'pharmacie',
      'صيدلية مناوبة', 'صيدلية الحراسة', 'صيدلية',
      'on duty pharmacy', 'pharmacy on duty', 'pharmacy',
    ],
    say: {
      fr: 'Je cherche une pharmacie de garde pres de vous.',
      ar: 'أبحث عن صيدلية مناوبة قريبة منك.',
      dz: 'راني نقلب على صيدلية مناوبة قريبة.',
      en: 'Looking for an on-duty pharmacy near you.',
    },
    action: { kind: 'category', categoryKey: 'pharmacy', labelKey: 'categories.items.pharmacy' },
  },
  {
    id: 'essence',
    words: [
      'station essence', 'station service', 'essence', 'carburant', 'mazout', 'gasoil', 'naphta',
      'محطة بنزين', 'بنزين', 'مازوت',
      'fuel', 'gas station', 'petrol',
    ],
    say: {
      fr: 'Je cherche une station-service a proximite.',
      ar: 'أبحث عن محطة وقود قريبة.',
      dz: 'راني نقلب على محطة بنزين قريبة.',
      en: 'Looking for a fuel station nearby.',
    },
    action: { kind: 'category', categoryKey: 'fuel', labelKey: 'categories.items.fuel' },
  },
  {
    id: 'restaurant',
    words: ['restaurant', 'manger', 'resto', 'مطعم', 'ناكل', 'food'],
    say: {
      fr: 'Je cherche un restaurant a proximite.',
      ar: 'أبحث عن مطعم قريب.',
      dz: 'راني نقلب على مطعم قريب.',
      en: 'Looking for a restaurant nearby.',
    },
    action: { kind: 'category', categoryKey: 'restaurant', labelKey: 'categories.items.restaurant' },
  },
  {
    id: 'cafe',
    words: ['cafe', 'قهوة', 'مقهى', 'coffee'],
    say: {
      fr: 'Je cherche un cafe a proximite.',
      ar: 'أبحث عن مقهى قريب.',
      dz: 'راني نقلب على قهوة قريبة.',
      en: 'Looking for a cafe nearby.',
    },
    action: { kind: 'category', categoryKey: 'cafe', labelKey: 'categories.items.cafe' },
  },
  {
    id: 'hotel',
    words: ['hotel', 'dormir', 'فندق', 'نبات'],
    say: {
      fr: 'Je cherche un hotel a proximite.',
      ar: 'أبحث عن فندق قريب.',
      dz: 'راني نقلب على فندق قريب.',
      en: 'Looking for a hotel nearby.',
    },
    action: { kind: 'category', categoryKey: 'hotel', labelKey: 'categories.items.hotel' },
  },
  {
    id: 'hopital',
    words: ['hopital', 'urgences', 'clinique', 'مستشفى', 'استعجالات', 'hospital', 'emergency room'],
    say: {
      fr: 'Je cherche un hopital a proximite.',
      ar: 'أبحث عن مستشفى قريب.',
      dz: 'راني نقلب على سبيطار قريب.',
      en: 'Looking for a hospital nearby.',
    },
    action: { kind: 'category', categoryKey: 'hospital', labelKey: 'categories.items.hospital' },
  },
  {
    id: 'mecanicien',
    words: ['mecanicien', 'garage', 'reparateur', 'ميكانيكي', 'ورشة', 'mechanic'],
    say: {
      fr: 'Je cherche un mecanicien a proximite.',
      ar: 'أبحث عن ميكانيكي قريب.',
      dz: 'راني نقلب على ميكانيسيان قريب.',
      en: 'Looking for a mechanic nearby.',
    },
    action: {
      kind: 'category',
      categoryKey: 'car repair workshop',
      labelKey: 'categories.items.mechanic',
    },
  },
  {
    id: 'depanneuse',
    words: ['depanneuse', 'depannage', 'remorquage', 'مصلحة الجر', 'towing', 'tow truck'],
    say: {
      fr: 'Je cherche une depanneuse a proximite.',
      ar: 'أبحث عن مصلحة جر قريبة.',
      dz: 'راني نقلب على ديبانوز قريبة.',
      en: 'Looking for a tow truck nearby.',
    },
    action: { kind: 'category', categoryKey: 'car repair', labelKey: 'categories.items.towing' },
  },
  {
    id: 'police',
    words: ['police', 'commissariat', 'gendarmerie', 'شرطة', 'درك', 'police station'],
    say: {
      fr: 'Je cherche un poste de police a proximite.',
      ar: 'أبحث عن مركز شرطة قريب.',
      dz: 'راني نقلب على مركز شرطة قريب.',
      en: 'Looking for a police station nearby.',
    },
    action: { kind: 'category', categoryKey: 'police', labelKey: 'categories.items.police' },
  },
  {
    id: 'parking',
    words: ['parking', 'se garer', 'موقف', 'مواقف', 'park the car'],
    say: {
      fr: 'Je cherche un parking a proximite.',
      ar: 'أبحث عن موقف قريب.',
      dz: 'راني نقلب على باركينڨ قريب.',
      en: 'Looking for a parking nearby.',
    },
    action: { kind: 'category', categoryKey: 'parking', labelKey: 'categories.items.parking' },
  },
  {
    id: 'eta',
    words: [
      'combien de temps pour arriver', 'combien de temps', 'temps restant', 'heure d arrivee',
      'on arrive quand', 'quand est ce qu on arrive',
      'شحال باقي', 'وقتاش نوصل', 'متى نصل',
      'how long', 'when do we arrive', 'time to arrive',
    ],
    say: null,
    action: { kind: 'eta' },
  },
  {
    id: 'stop_nav',
    words: [
      'arrete la navigation', 'arreter la navigation', 'annule l itineraire', 'arrete le guidage',
      'أوقف التوجيه',
      'stop navigation', 'stop the route',
    ],
    say: {
      fr: "J'arrete la navigation.",
      ar: 'أوقفت التوجيه.',
      dz: 'وقفت التوجيه.',
      en: 'Stopping navigation.',
    },
    action: { kind: 'stopNavigation' },
  },
  {
    id: 'ou_suis_je',
    words: ['ou suis je', 'ma position', 'je suis ou', 'وين راني', 'أين أنا', 'where am i'],
    say: {
      fr: 'Voici votre position actuelle.',
      ar: 'هذا موقعك الحالي.',
      dz: 'هذا وين راك.',
      en: 'Here is your current position.',
    },
    action: { kind: 'locate' },
  },
];

/** « Itineraire vers X » : la seule commande a parametre. On retire le prefixe et on
 * cherche X, comme `ASSIST_ITI_PREFIXES` en v83. */
export const ITINERARY_PREFIXES = [
  'itineraire vers', 'itineraire pour', 'va a', 'allons a', 'emmene moi a', 'emmene moi vers',
  'conduis moi a', 'navigue vers', 'direction', 'route vers',
  'خذني إلى', 'وديني ل', 'طريق إلى',
  'navigate to', 'take me to', 'go to', 'drive to',
];

/**
 * Normalisation d'une phrase entendue : minuscules, accents et ponctuation retires,
 * espaces reduits. Le bloc arabe est conserve tel quel — c'est la meme regle que
 * `assistNorm` en v83.
 */
export function normalizeSpoken(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Commande reconnue dans les phrases candidates (la transcription et ses variantes).
 *
 * La formulation la plus LONGUE l'emporte : « pharmacie de garde » doit gagner contre
 * « pharmacie » tout court, sinon la garde serait ignoree.
 */
export function matchCommand(candidates: string[]): AssistantCommand | null {
  let best: AssistantCommand | null = null;
  let bestLength = 0;
  for (const command of ASSISTANT_COMMANDS) {
    for (const word of command.words) {
      const normalized = normalizeSpoken(word);
      if (normalized.length <= bestLength) continue;
      if (candidates.some((candidate) => candidate.includes(normalized))) {
        best = command;
        bestLength = normalized.length;
      }
    }
  }
  return best;
}

/**
 * Destination extraite d'un « emmene-moi a X ». Renvoie `null` si aucune phrase ne
 * commence par un prefixe d'itineraire, ou si ce qui suit est trop court pour etre
 * une destination.
 */
export function extractDestination(candidates: string[]): string | null {
  for (const candidate of candidates) {
    for (const prefix of ITINERARY_PREFIXES) {
      const normalized = normalizeSpoken(prefix);
      const at = candidate.indexOf(`${normalized} `);
      if (at < 0) continue;
      const target = candidate.slice(at + normalized.length).trim();
      if (target.length >= 2) return target;
    }
  }
  return null;
}

const DURATION_WORDS: Record<Language, { h: string; hs: string; m: string; ms: string }> = {
  fr: { h: 'heure', hs: 'heures', m: 'minute', ms: 'minutes' },
  en: { h: 'hour', hs: 'hours', m: 'minute', ms: 'minutes' },
  ar: { h: 'ساعة', hs: 'ساعات', m: 'دقيقة', ms: 'دقائق' },
  dz: { h: 'ساعة', hs: 'سوايع', m: 'دقيقة', ms: 'دقايق' },
};

/**
 * « 2 heures 58 minutes » — en toutes lettres, parce que cette phrase est PRONONCEE.
 * L'abrege « 2 h 58 » de l'affichage est illisible pour un moteur de synthese vocale
 * (port de `dureeEnMots` en v83).
 */
export function durationInWords(seconds: number, lang: Language): string {
  const words = DURATION_WORDS[lang] ?? DURATION_WORDS.fr;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours > 1 ? words.hs : words.h}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes > 1 ? words.ms : words.m}`);
  return parts.length ? parts.join(' ') : `1 ${words.m}`;
}
