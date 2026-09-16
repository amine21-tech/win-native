/**
 * Qibla : direction de la Kaaba, date du jour (gregorienne + hegirienne) et
 * liste des 58 chefs-lieux de wilaya pour un calcul hors-ligne sans GPS.
 * Repris de win-v83 (openQibla/DZ_CITIES/bearingTo).
 */
import type { Language } from '../shared';

export const MECCA = { lat: 21.4225, lon: 39.8262 };

export const DZ_CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'Adrar', lat: 27.8742, lon: -0.2939 },
  { name: 'Chlef', lat: 36.1647, lon: 1.3317 },
  { name: 'Laghouat', lat: 33.8, lon: 2.865 },
  { name: 'Oum El Bouaghi', lat: 35.8775, lon: 7.1136 },
  { name: 'Batna', lat: 35.5559, lon: 6.1741 },
  { name: 'Béjaïa', lat: 36.7515, lon: 5.0563 },
  { name: 'Biskra', lat: 34.8513, lon: 5.7281 },
  { name: 'Béchar', lat: 31.6177, lon: -2.2286 },
  { name: 'Blida', lat: 36.4703, lon: 2.8277 },
  { name: 'Bouira', lat: 36.3736, lon: 3.902 },
  { name: 'Tamanrasset', lat: 22.785, lon: 5.5228 },
  { name: 'Tébessa', lat: 35.4042, lon: 8.1242 },
  { name: 'Tlemcen', lat: 34.8783, lon: -1.315 },
  { name: 'Tiaret', lat: 35.3711, lon: 1.317 },
  { name: 'Tizi Ouzou', lat: 36.7169, lon: 4.0497 },
  { name: 'Alger', lat: 36.7538, lon: 3.0588 },
  { name: 'Djelfa', lat: 34.6703, lon: 3.263 },
  { name: 'Jijel', lat: 36.819, lon: 5.7667 },
  { name: 'Sétif', lat: 36.1898, lon: 5.4108 },
  { name: 'Saïda', lat: 34.8303, lon: 0.1517 },
  { name: 'Skikda', lat: 36.8761, lon: 6.9094 },
  { name: 'Sidi Bel Abbès', lat: 35.1894, lon: -0.6306 },
  { name: 'Annaba', lat: 36.9, lon: 7.7667 },
  { name: 'Guelma', lat: 36.4625, lon: 7.4264 },
  { name: 'Constantine', lat: 36.365, lon: 6.6147 },
  { name: 'Médéa', lat: 36.2675, lon: 2.7508 },
  { name: 'Mostaganem', lat: 35.9311, lon: 0.0892 },
  { name: "M'Sila", lat: 35.7058, lon: 4.5419 },
  { name: 'Mascara', lat: 35.3969, lon: 0.1411 },
  { name: 'Ouargla', lat: 31.9492, lon: 5.3256 },
  { name: 'Oran', lat: 35.6969, lon: -0.6331 },
  { name: 'El Bayadh', lat: 33.6831, lon: 1.0192 },
  { name: 'Illizi', lat: 26.4833, lon: 8.4667 },
  { name: 'Bordj Bou Arréridj', lat: 36.0731, lon: 4.7608 },
  { name: 'Boumerdès', lat: 36.7667, lon: 3.4772 },
  { name: 'El Tarf', lat: 36.7672, lon: 8.3139 },
  { name: 'Tindouf', lat: 27.6742, lon: -8.1478 },
  { name: 'Tissemsilt', lat: 35.6072, lon: 1.8108 },
  { name: 'El Oued', lat: 33.3683, lon: 6.8675 },
  { name: 'Khenchela', lat: 35.4361, lon: 7.1431 },
  { name: 'Souk Ahras', lat: 36.2864, lon: 7.9511 },
  { name: 'Tipaza', lat: 36.5894, lon: 2.4486 },
  { name: 'Mila', lat: 36.4503, lon: 6.2647 },
  { name: 'Aïn Defla', lat: 36.2639, lon: 1.9678 },
  { name: 'Naâma', lat: 33.2672, lon: -0.3128 },
  { name: 'Aïn Témouchent', lat: 35.2983, lon: -1.14 },
  { name: 'Ghardaïa', lat: 32.4911, lon: 3.6736 },
  { name: 'Relizane', lat: 35.7372, lon: 0.5558 },
  { name: 'Timimoun', lat: 29.2639, lon: 0.2306 },
  { name: 'Bordj Badji Mokhtar', lat: 21.3281, lon: 0.9544 },
  { name: 'Ouled Djellal', lat: 34.4167, lon: 5.0667 },
  { name: 'Béni Abbès', lat: 30.13, lon: -2.1672 },
  { name: 'In Salah', lat: 27.1933, lon: 2.4608 },
  { name: 'In Guezzam', lat: 19.5686, lon: 5.7722 },
  { name: 'Touggourt', lat: 33.1, lon: 6.0667 },
  { name: 'Djanet', lat: 24.5544, lon: 9.4844 },
  { name: "El M'Ghair", lat: 33.95, lon: 5.9167 },
  { name: 'El Meniaa', lat: 30.5814, lon: 2.8856 },
];

const COMPASS_LABELS: Record<Language, string[]> = {
  fr: ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'],
  en: ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'],
  ar: ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'],
  dz: ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'],
};

export function compassLabel(deg: number, lang: Language): string {
  const labels = COMPASS_LABELS[lang] ?? COMPASS_LABELS.fr;
  return labels[Math.round(deg / 45) % 8]!;
}

/** Hadith fixe affiche sur le panneau Qibla — traduction masquee en arabe/darija (voir QiblaPanel). */
export const HADITH_AR =
  'إِنَّ مِنْ خِيَارِ عِبَادِ اللَّهِ الَّذِينَ يُرَاعُونَ الشَّمْسَ وَالْقَمَرَ وَالظِّلَّ وَالنُّجُومَ لِذِكْرِ اللَّهِ';
export const HADITH_TRANSLATION: Record<'fr' | 'en', string> = {
  fr: "« Certes, parmi les meilleurs serviteurs d'Allah sont ceux qui prennent en considération le soleil, la lune, les ombres et les étoiles pour le rappel d'Allah. »",
  en: '"Indeed, among the best servants of Allah are those who observe the sun, the moon, the shadows and the stars for the remembrance of Allah."',
};

const HIJRI_MONTHS: Record<Language, string[]> = {
  fr: [
    'Mouharram',
    'Safar',
    "Rabi' al-awwal",
    "Rabi' al-thani",
    'Joumada al-awwal',
    'Joumada al-thani',
    'Rajab',
    "Cha'bane",
    'Ramadan',
    'Chawwal',
    "Dhou al-Qi'da",
    'Dhou al-Hijja',
  ],
  en: [
    'Muharram',
    'Safar',
    "Rabi' al-awwal",
    "Rabi' al-thani",
    'Jumada al-awwal',
    'Jumada al-thani',
    'Rajab',
    "Sha'ban",
    'Ramadan',
    'Shawwal',
    "Dhu al-Qi'dah",
    'Dhu al-Hijjah',
  ],
  ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
  dz: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
};

/**
 * Date hegirienne du jour, calcul arithmetique (algorithme tabulaire, base 30 ans / 11 annees
 * kabisa) — a un jour pres de la convention Umm al-Qura utilisee par v83 (qui, elle, delegue au
 * moteur du navigateur). Hermes n'embarque pas toujours les donnees ICU du calendrier islamique :
 * ce calcul independant garantit un affichage meme quand `Intl` ne le fournit pas.
 */
function hijriFromGregorian(date: Date): { day: number; month: number; year: number } {
  const jd =
    Math.floor((1461 * (date.getFullYear() + 4800 + Math.floor((date.getMonth() + 1 - 14) / 12))) / 4) +
    Math.floor((367 * (date.getMonth() + 1 - 2 - 12 * Math.floor((date.getMonth() + 1 - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((date.getFullYear() + 4900 + Math.floor((date.getMonth() + 1 - 14) / 12)) / 100)) / 4) +
    date.getDate() -
    32075;
  const l1 = jd - 1948440 + 10632;
  const n = Math.floor((l1 - 1) / 10631);
  const l2 = l1 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
    Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 =
    l2 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l3) / 709);
  const day = l3 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { day, month, year };
}

export function hijriDate(lang: Language, date = new Date()): string {
  const { day, month, year } = hijriFromGregorian(date);
  const monthName = (HIJRI_MONTHS[lang] ?? HIJRI_MONTHS.fr)[month - 1] ?? '';
  const weekday = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : lang === 'fr' ? 'fr-FR' : 'ar-DZ', {
    weekday: 'long',
  }).format(date);
  const hijriLabel = { fr: "de l'Hégire", ar: 'هجري', dz: 'هجري', en: 'Hijri' }[lang] ?? "de l'Hégire";
  const sep = lang === 'ar' || lang === 'dz' ? '، ' : ', ';
  return `${weekday}${sep}${day} ${monthName} ${year} ${hijriLabel}`;
}

export function gregorianDate(lang: Language, date = new Date()): string {
  const locale = { fr: 'fr-FR', en: 'en-US', ar: 'ar-DZ', dz: 'ar-DZ' }[lang] ?? 'fr-FR';
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
      date,
    );
  } catch {
    return date.toDateString();
  }
}
