import type { Language } from '../shared';
import type { Maneuver } from './routing';

/**
 * Type de manoeuvre Valhalla (DirectionsLeg_Maneuver_Type) -> pictogramme et
 * gabarit de phrase. Valhalla ne narre qu'en fr-FR/en-US (voir routing.ts) :
 * ce fichier ne sert qu'a l'arabe/darija, plus une fleche visuelle commune
 * aux 4 langues.
 */

const ARROWS: Record<number, string> = {
  0: '↑',
  1: '↑',
  2: '↱',
  3: '↰',
  4: '🏁',
  5: '🏁',
  6: '🏁',
  7: '↑',
  8: '↑',
  9: '↗',
  10: '↱',
  11: '↱',
  12: '↩',
  13: '↩',
  14: '↰',
  15: '↰',
  16: '↖',
  17: '↑',
  18: '↱',
  19: '↰',
  20: '↱',
  21: '↰',
  22: '↑',
  23: '↱',
  24: '↰',
  25: '↑',
  26: '🔄',
  27: '↱',
  28: '⛴️',
  29: '⛴️',
};

export function maneuverArrow(type: number): string {
  return ARROWS[type] ?? '↑';
}

const PHRASES: Record<Language, Record<number, string>> = {
  fr: {
    0: 'Continuez',
    1: 'Démarrez',
    2: 'Démarrez vers la droite',
    3: 'Démarrez vers la gauche',
    4: 'Vous êtes arrivé à destination',
    5: 'Votre destination est sur la droite',
    6: 'Votre destination est sur la gauche',
    7: 'Continuez sur la route',
    8: 'Continuez tout droit',
    9: 'Serrez légèrement à droite',
    10: 'Tournez à droite',
    11: 'Tournez franchement à droite',
    12: 'Faites demi-tour par la droite',
    13: 'Faites demi-tour par la gauche',
    14: 'Tournez franchement à gauche',
    15: 'Tournez à gauche',
    16: 'Serrez légèrement à gauche',
    17: 'Prenez la bretelle',
    18: 'Prenez la bretelle à droite',
    19: 'Prenez la bretelle à gauche',
    20: 'Sortez à droite',
    21: 'Sortez à gauche',
    22: 'Restez tout droit',
    23: 'Restez à droite',
    24: 'Restez à gauche',
    25: 'Insérez-vous',
    26: 'Entrez dans le rond-point',
    27: 'Sortez du rond-point',
    28: 'Prenez le ferry',
    29: 'Quittez le ferry',
  },
  en: {
    0: 'Continue',
    1: 'Start',
    2: 'Start right',
    3: 'Start left',
    4: 'You have arrived at your destination',
    5: 'Your destination is on the right',
    6: 'Your destination is on the left',
    7: 'Continue on the road',
    8: 'Continue straight',
    9: 'Bear right',
    10: 'Turn right',
    11: 'Turn sharp right',
    12: 'Make a U-turn to the right',
    13: 'Make a U-turn to the left',
    14: 'Turn sharp left',
    15: 'Turn left',
    16: 'Bear left',
    17: 'Take the ramp',
    18: 'Take the ramp on the right',
    19: 'Take the ramp on the left',
    20: 'Take the exit on the right',
    21: 'Take the exit on the left',
    22: 'Keep straight',
    23: 'Keep right',
    24: 'Keep left',
    25: 'Merge',
    26: 'Enter the roundabout',
    27: 'Exit the roundabout',
    28: 'Take the ferry',
    29: 'Leave the ferry',
  },

  ar: {
    0: 'تابع',
    1: 'انطلق',
    2: 'انطلق يمينًا',
    3: 'انطلق يسارًا',
    4: 'وصلت إلى وجهتك',
    5: 'وجهتك على يمينك',
    6: 'وجهتك على يسارك',
    7: 'تابع الطريق',
    8: 'تابع مستقيمًا',
    9: 'مل قليلاً إلى اليمين',
    10: 'انعطف يمينًا',
    11: 'انعطف بحدة يمينًا',
    12: 'در دورانًا كاملاً يمينًا',
    13: 'در دورانًا كاملاً يسارًا',
    14: 'انعطف بحدة يسارًا',
    15: 'انعطف يسارًا',
    16: 'مل قليلاً إلى اليسار',
    17: 'اسلك المنحدر',
    18: 'اسلك المنحدر يمينًا',
    19: 'اسلك المنحدر يسارًا',
    20: 'اخرج يمينًا',
    21: 'اخرج يسارًا',
    22: 'ابق مستقيمًا',
    23: 'ابق يمينًا',
    24: 'ابق يسارًا',
    25: 'اندمج',
    26: 'ادخل الدوار',
    27: 'اخرج من الدوار',
    28: 'اركب العبّارة',
    29: 'غادر العبّارة',
  },
  dz: {
    0: 'كمّل',
    1: 'يالله انطلق',
    2: 'انطلق نحو اليمين',
    3: 'انطلق نحو الشمال',
    4: 'وصلت لوجهتك',
    5: 'وجهتك على يمينك',
    6: 'وجهتك على شمالك',
    7: 'كمّل الطريق',
    8: 'كمّل تو دغري',
    9: 'ميل شوية نحو اليمين',
    10: 'دور نحو اليمين',
    11: 'دور بالقوة نحو اليمين',
    12: 'دور فولطة كاملة نحو اليمين',
    13: 'دور فولطة كاملة نحو الشمال',
    14: 'دور بالقوة نحو الشمال',
    15: 'دور نحو الشمال',
    16: 'ميل شوية نحو الشمال',
    17: 'خش في المنحدر',
    18: 'خش في المنحدر نحو اليمين',
    19: 'خش في المنحدر نحو الشمال',
    20: 'أخرج نحو اليمين',
    21: 'أخرج نحو الشمال',
    22: 'ابقى دغري',
    23: 'ابقى نحو اليمين',
    24: 'ابقى نحو الشمال',
    25: 'دخل',
    26: 'دخل الدوّار',
    27: 'أخرج من الدوّار',
    28: 'ركب الفيري',
    29: 'أهبط من الفيري',
  },
};

/** Instruction dans la langue active : texte Valhalla en fr/en, phrase construite en ar/dz. */
export function localizedInstruction(maneuver: Maneuver, lang: Language): string {
  // Le texte de Valhalla est le plus riche (numero de sortie de rond-point, direction des
  // panneaux) : on le garde tant qu'il est redige dans la langue ACTIVE. S'il ne l'est plus —
  // itineraire calcule en anglais puis application passee en francais — on reconstruit la
  // phrase dans la bonne langue, pour que texte ET voix suivent toujours le choix de langue.
  if ((lang === 'fr' || lang === 'en') && maneuver.narration === lang) return maneuver.instructionFrEn;
  const table = PHRASES[lang] ?? PHRASES.fr;
  const phrase = table[maneuver.type] ?? table[8]!;
  return maneuver.streetName ? `${phrase} — ${maneuver.streetName}` : phrase;
}

/**
 * Numero de route lu dans une manoeuvre : « N12 », « RN 24 », « A1 », « CW 25 ».
 *
 * Les cartes de navigation courantes affichent ce numero en pastille plutot que le nom
 * complet de la voie, et pour une bonne raison : sur un panneau d'autoroute algerien, c'est
 * « N12 » qui est ecrit en grand, pas « Autoroute Alger–Tizi Ouzou ». Au volant, la pastille
 * se rapproche donc de ce que le conducteur voit dehors, et se lit en un coup d'oeil.
 *
 * On ne DEVINE rien : sans numero reconnaissable, la fonction renvoie `null` et le bandeau
 * n'affiche pas de pastille. Un faux numero serait pire que pas de numero du tout.
 */
export function roadRef(maneuver: Maneuver): string | null {
  const pattern = /\b(RN|CW|[ANWP])\s?-?\s?(\d{1,3})\b/;
  for (const source of [maneuver.streetName, maneuver.instructionFrEn]) {
    const match = source?.toUpperCase().match(pattern);
    if (match) return `${match[1]}${match[2]}`;
  }
  return null;
}

const UNITS: Record<Language, { m: string; km: string; prefix: string }> = {
  fr: { m: 'metres', km: 'kilometres', prefix: 'Dans' },
  en: { m: 'meters', km: 'kilometers', prefix: 'In' },
  ar: { m: 'متر', km: 'كيلومتر', prefix: 'بعد' },
  dz: { m: 'متر', km: 'كيلومتر', prefix: 'بعد' },
};

/**
 * « Dans 300 metres » — port direct de `sayIn` en v83.
 *
 * Deux details comptent, et aucun n'est cosmetique. L'arrondi est PARLE (300, 200, 100,
 * 50 m) : au volant on entend un ordre de grandeur, pas une mesure, et « dans 287 metres »
 * demande un effort de lecture au mauvais moment. Et l'unite est ecrite en toutes lettres
 * plutot qu'abregee, parce que la prononciation de « m » depend du moteur vocal du
 * telephone — certains disent « metres », d'autres epellent la lettre.
 */
export function spokenDistance(meters: number, lang: Language): string {
  const units = UNITS[lang] ?? UNITS.fr;
  const value =
    meters >= 1000
      ? `${Math.round(meters / 100) / 10} ${units.km}`
      : `${meters >= 250 ? 300 : meters >= 150 ? 200 : meters >= 80 ? 100 : 50} ${units.m}`;
  return `${units.prefix} ${value}`;
}

/** Minuscule initiale, pour enchainer « Dans 300 metres, tournez a gauche ». */
export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
