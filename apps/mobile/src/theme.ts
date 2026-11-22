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
    /* #0B5B2C : le vert des maquettes du client, au point pres. Il etait a #0D6E4F —
     * imperceptiblement different, mais c'est exactement l'ecart qui fait qu'une application ne
     * semble pas d'une seule main quand le bouton « C'est parti » et le tracé sont a cote. */
    accent: '#0B5B2C',
    accentDark: '#07401F',
    accentText: '#FFFFFF',
    gold: '#E9B949',
    goldDeep: '#D4AF6A',
    alert: '#B8860B',
    danger: '#C8102E',
    /* LES CINQ JETONS DE LA FICHE VIP PREMIUM — synthese du 19 novembre, valeurs exactes du
     * document. Ils s'AJOUTENT a `gold` et `goldDeep` sans les remplacer : ces deux-la portent
     * depuis la v83 les badges partenaire et admin partout dans l'application, et les redefinir
     * aurait repeint une dizaine d'ecrans que personne n'avait demande de changer.
     *
     * Le dore de la synthese est plus sature que le notre (#C8880E contre #E9B949), et c'est
     * precisement ce que le client cherche : « une carte Gold vs une carte standard ». Le
     * distinguer demandait un or qui ne ressemble pas a celui des badges ordinaires. */
    gold500: '#C8880E',
    gold300: '#F0B429',
    /* LE BRUN D'OR DES DEUX BORDS DU BANDEAU — point B du correctif v2, qui chiffre le degrade
     * teinte par teinte : << #7A4D00 -> #C8880E -> #F0B429 -> #C8880E -> #7A4D00 >>.
     *
     * C'EST UNE SIXIEME TEINTE, ET NON UN REMPLACEMENT. Les cinq autres portent la fiche VIP
     * depuis le 19 novembre ; celle-ci n'existait pas, parce que le bandeau d'alors allait de
     * l'or sature au clair et retour, sans assise sombre. Le brun ferme le motif aux deux bouts,
     * ce qui donne au filet un relief de metal plutot qu'une lueur uniforme. */
    gold700: '#7A4D00',
    goldBg: '#FFFAED',
    openGreen: '#1A7A40',
    openBg: '#E5F5EC',
  },
  /* LA NUIT GARDE SON VERT PLUS CLAIR, et ce n'est pas un oubli : les maquettes du client sont
   * dessinees de jour, et un vert plus sombre encore sur un fond sombre perd le contraste dont
   * un bouton a besoin. Meme raisonnement que pour la couleur du tracé, ou il avait lui-meme
   * signale ne plus voir l'itineraire la nuit. */
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
    /* L'OR NE CHANGE PAS LA NUIT — comme `gold` et l'accent depuis la v83 : un dore assombri
     * cesse de se lire comme de l'or et devient du brun.
     *
     * LES DEUX FONDS, EUX, SONT RETOURNES, et il fallait le faire. #FFFAED et #E5F5EC sont des
     * blancs casses : poses sur le fond nocturne (#0E1512), ils auraient fait deux rectangles
     * eblouissants au milieu d'une fiche sombre — exactement ce que le client avait signale sur
     * le trace de l'itineraire, qu'il ne voyait plus la nuit. On garde donc la TEINTE (un soupcon
     * d'or, un soupcon de vert) en inversant la luminosite. */
    gold500: '#C8880E',
    gold300: '#F0B429',
    /* Le brun d'or ne change pas la nuit, pour la raison ecrite juste au-dessus : il EST la
     * partie sombre du degrade, l'assombrir davantage le confondrait avec le fond. */
    gold700: '#7A4D00',
    goldBg: '#2A2416',
    openGreen: '#4FD188',
    openBg: '#13301F',
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
 * DIMENSIONS DE LA FICHE VIP PREMIUM — les quatre valeurs du dimens.xml de la synthese.
 *
 * Elles sont ici, nommees, et non recopiees a la main dans chaque composant : le client les a
 * chiffrees une par une, et c'est le genre de nombre qu'on finit par ecrire 16 ici et 15 la.
 * Le verificateur les relit a cette seule adresse.
 */
export const vip = {
  /** `vip_card_corner` : rayon des coins de la carte VIP. */
  cardCorner: 16,
  /** `vip_stroke_width` : epaisseur de la bordure doree. */
  strokeWidth: 2,
  /** `vip_gold_stripe_h` : hauteur du lisere anime en haut de la carte. */
  goldStripeH: 3,
  /** `carousel_height` : hauteur du carousel de photos. */
  carouselHeight: 175,
} as const;

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
  // 24 points, valeur donnee par le client le 27 octobre (« nom destination 24sp Bold »). La
  // police est deja un gras italique : seule la taille manquait, d'un point.
  destinationName: { fontFamily: fonts.destinationName, fontSize: 24 },
} as const;
