/**
 * Palette de l'application.
 *
 * Reprise a l'identique de win-v83 (index.html, variables :root et body.night)
 * plutot qu'inventee : meme vert de signaletique routiere algerienne, meme
 * fond creme, meme dore reserve aux badges partenaire/admin. Le mode nuit de
 * la v83 ne change QUE bg/card/ink/muted/line — accent, or et rouge restent
 * identiques de jour comme de nuit, donc on reproduit exactement ce choix ici
 * plutot que d'assombrir l'accent "pour faire propre".
 */
export const palette = {
  light: {
    background: '#F4F1E8',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F1E8',
    text: '#15201C',
    textMuted: '#6B7A72',
    border: '#E2DDCD',
    accent: '#0D6E4F',
    accentDark: '#0A5840',
    accentText: '#FFFFFF',
    gold: '#E9B949',
    goldDeep: '#D4AF6A',
    alert: '#B8860B',
    danger: '#C8102E',
  },
  dark: {
    background: '#0E1512',
    surface: '#1A2420',
    surfaceAlt: '#24332D',
    text: '#EAF1ED',
    textMuted: '#8BA295',
    border: '#2A3833',
    accent: '#0D6E4F',
    accentDark: '#0A5840',
    accentText: '#FFFFFF',
    gold: '#E9B949',
    goldDeep: '#D4AF6A',
    alert: '#B8860B',
    danger: '#C8102E',
  },
} as const;

/**
 * Widened en `string` (pas les couleurs litterales exactes) : sans ca, un
 * composant type `colors: Palette` refusait `palette.dark` des que light et
 * dark different sur un champ (donc a peu pres partout), puisque TypeScript
 * comparait les deux variantes litteralement au lieu de structurellement.
 */
export type Palette = { [K in keyof (typeof palette)['light']]: string };

/**
 * Familles de police, chargees via expo-font dans app/_layout.tsx.
 * Sora habille le francais/anglais, Cairo l'arabe (bascule RTL), et
 * Playfair Display italique est reservee au nom du lieu dans la fiche
 * destination (`.dest-name` en CSS v83) : c'est la seule touche editoriale
 * au milieu d'une interface par ailleurs entierement utilitaire.
 */
export const fonts = {
  sans: 'Sora_400Regular',
  sansMedium: 'Sora_600SemiBold',
  sansBold: 'Sora_700Bold',
  sansExtraBold: 'Sora_800ExtraBold',
  arabic: 'Cairo_400Regular',
  arabicMedium: 'Cairo_600SemiBold',
  arabicBold: 'Cairo_700Bold',
  arabicExtraBold: 'Cairo_800ExtraBold',
  destinationName: 'PlayfairDisplay_700Bold_Italic',
} as const;

/** Police de titre a utiliser selon la langue active (bascule RTL comprise). */
export function titleFontFor(lang: string) {
  return lang === 'ar' || lang === 'dz' ? fonts.arabicExtraBold : fonts.sansExtraBold;
}

export function bodyFontFor(lang: string) {
  return lang === 'ar' || lang === 'dz' ? fonts.arabic : fonts.sans;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Rayons repris de la v83 : searchbox/resultats 15px, sheet/tripcard 22px, fab 13px. */
export const radius = { sm: 10, md: 15, lg: 22, pill: 999 } as const;

/**
 * Taille minimale des zones tactiles. En navigation, l'utilisateur vise mal :
 * on ne descend jamais sous 52 points, au-dessus des 44 recommandes.
 */
export const HIT_SIZE = 52;

export const typography = {
  title: { fontFamily: fonts.sansExtraBold, fontSize: 22 },
  heading: { fontFamily: fonts.sansBold, fontSize: 17 },
  body: { fontFamily: fonts.sans, fontSize: 15 },
  caption: { fontFamily: fonts.sans, fontSize: 13 },
  /** Consigne de navigation : lisible d'un coup d'oeil, au volant. */
  instruction: { fontFamily: fonts.sansExtraBold, fontSize: 26 },
  /** Nom du lieu dans la fiche destination — seule touche editoriale (Playfair italique). */
  destinationName: { fontFamily: fonts.destinationName, fontSize: 23 },
} as const;
