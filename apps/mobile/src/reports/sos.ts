/**
 * Numeros d'urgence, repris tels quels du panneau SOS de v83 (#sosPanel).
 * Les numeros ne se traduisent pas (memes chiffres dans les 4 langues) ; seul
 * le libelle qui les accompagne l'est, via i18n `sos.numbers.<labelKey>`.
 */
export type SosNumber = {
  number: string;
  href: string;
  emoji: string;
  labelKey: string;
  external?: boolean;
};

export type SosCountry = {
  code: 'DZ' | 'TN' | 'FR';
  flag: string;
  numbers: SosNumber[];
};

export const SOS_COUNTRIES: SosCountry[] = [
  {
    code: 'DZ',
    flag: '🇩🇿',
    numbers: [
      { number: '14', href: 'tel:14', emoji: '🚒', labelKey: 'dzCivilProtection' },
      { number: '17', href: 'tel:17', emoji: '🚓', labelKey: 'dzPolice' },
      { number: '1055', href: 'tel:1055', emoji: '🪖', labelKey: 'dzGendarmerie' },
      { number: '16', href: 'tel:16', emoji: '🏥', labelKey: 'dzSamu' },
      {
        number: 'Taxi',
        href: 'https://play.google.com/store/apps/details?id=sinet.startup.inDriver',
        emoji: '🚕',
        labelKey: 'dzTaxi',
        external: true,
      },
      { number: '10 54', href: 'tel:1054', emoji: '⚓', labelKey: 'dzCoastGuard' },
      { number: 'Anti-poison', href: 'tel:021979898', emoji: '☠️', labelKey: 'dzPoison' },
    ],
  },
  {
    code: 'TN',
    flag: '🇹🇳',
    numbers: [
      { number: '198', href: 'tel:198', emoji: '🚒', labelKey: 'tnCivilProtection' },
      { number: '197', href: 'tel:197', emoji: '🚓', labelKey: 'tnPolice' },
      { number: '193', href: 'tel:193', emoji: '🪖', labelKey: 'tnGendarmerie' },
      { number: '190', href: 'tel:190', emoji: '🏥', labelKey: 'tnSamu' },
    ],
  },
  {
    code: 'FR',
    flag: '🇫🇷',
    numbers: [
      { number: '112', href: 'tel:112', emoji: '🚨', labelKey: 'frEuropean' },
      { number: '15', href: 'tel:15', emoji: '🏥', labelKey: 'frSamu' },
      { number: '17', href: 'tel:17', emoji: '🚓', labelKey: 'frPolice' },
      { number: '18', href: 'tel:18', emoji: '🚒', labelKey: 'frFirefighters' },
    ],
  },
];

/**
 * Detection du pays par zone geographique, reprise a l'identique de `detectCountry()` en v83 —
 * gratuite (pas d'appel reseau), suffisante pour choisir les bons numeros d'urgence. Ne couvre
 * QUE cet usage : la v83 gate aussi, derriere ce meme detecteur, un deblocage PAYANT de la
 * navigation transfrontaliere (paiement Baridimob/D17/Flouci, code envoye par SMS) — ce
 * mecanisme-la n'est pas repris ici, faute de decision produit sur son maintien.
 */
export function detectSosCountry(lat: number, lon: number): SosCountry['code'] {
  if (lon >= 8.0 && lat >= 30.0 && lat <= 38.0 && lon <= 12.5) return 'TN';
  if (lat >= 41.0 && lat <= 51.5 && lon >= -5.5 && lon <= 9.8) return 'FR';
  return 'DZ';
}
