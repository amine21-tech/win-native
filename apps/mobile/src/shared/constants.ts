// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------
/**
 * Constantes partagees entre l'API et l'application mobile.
 * Toute valeur presente ici est la seule source de verite : ne pas la
 * redupliquer cote client ni cote serveur.
 */

/** Langues de l'interface. `dz` = derja algerienne (ecrite en caracteres arabes). */
export const LANGUAGES = ['fr', 'dz', 'ar', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Langues affichees de droite a gauche. */
export const RTL_LANGUAGES: readonly Language[] = ['ar', 'dz'];

export const DEFAULT_LANGUAGE: Language = 'fr';

/**
 * Types de signalement. Repris a l'identique de la v83 (menu `alertMenu`)
 * pour que la migration des donnees existantes soit une simple copie.
 */
export const REPORT_KINDS = [
  'radar',
  'bump', // dos d'ane
  'pothole', // trou sur la route
  'police',
  'crash', // accident
  'jam', // embouteillage
  'object', // objet sur la chaussee
  'fire',
  'flood',
  'block', // route bloquee
  /* Les trois forces separement, a la demande du client (document v4.0, point J).
   *
   * Un conducteur algerien ne lit pas << barrage >> de la meme facon selon qui le tient : la
   * gendarmerie sur une nationale, la police en ville, l'armee sur un axe sensible. Les
   * confondre sous un seul mot, c'est perdre l'information la plus utile de l'annonce.
   *
   * Trois types distincts plutot qu'un type et un sous-champ : chacun garde sa couleur, son
   * pictogramme et sa duree de vie, et le filtrage reste une simple comparaison. */
  'gendarmerie',
  'armee',
  /* Les travaux manquaient. Ils ne sont ni un bouchon ni une route coupee : la voie passe, mais
   * lentement, et souvent pendant des semaines. */
  'works',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * Un signalement permanent survit aux redemarrages et ne disparait que par vote ; un
 * signalement temporaire expire tout seul.
 *
 * Le BARRAGE rejoint la liste a la demande du client. Un barrage de police ou de gendarmerie
 * n'est pas un evenement d'une heure : en Algerie, le meme point de controle est tenu des mois
 * durant, et l'annoncer est precisement ce qu'on attend de l'application. Comme le dos d'ane,
 * il reste donc affiche jusqu'a ce qu'un conducteur reponde « Plus la » ou qu'un
 * administrateur le retire.
 */
/* LA ROUTE BLOQUEE REJOINT LES PERMANENTS (point 12 du client, 28 octobre).
 *
 * Elle expirait au bout de quatre heures. Le client demande explicitement une duree
 * << indeterminee : la route bloquee reste active jusqu'a confirmation de degagement >>, et le
 * test terrain du 28 octobre dit pourquoi. Une route barree par un eboulement, un chantier ou
 * un accident grave le reste souvent plusieurs jours ; l'annonce s'effacait toute seule a 4 h,
 * et le conducteur suivant repartait droit dans la barriere. L'echeance etait une hypothese
 * sur la duree des travaux, et c'est precisement ce qu'on ne peut pas deviner.
 *
 * La contrepartie est le degagement par vote : deux conducteurs qui repondent << plus la >>
 * suffisent a reouvrir le segment (voir seuilDegagement). */
export const PERMANENT_KINDS: readonly ReportKind[] = [
  'radar',
  'bump',
  'pothole',
  'police',
  'gendarmerie',
  'armee',
  'block',
];

/**
 * Duree de vie d'un signalement temporaire, en minutes, par type.
 *
 * Valeurs reprises du tableau du client, lui-meme aligne sur `getAlertTTL(type)` de la version
 * web. Elles ne sont pas arbitraires : elles suivent le temps que met l'evenement a disparaitre
 * REELLEMENT de la route. Un objet tombe est ramasse ou evite en une demi-heure ; une
 * inondation met une demi-journee a se retirer.
 */
export const TEMPORARY_TTL_MINUTES: Record<ReportKind, number> = {
  radar: 0, // permanent
  bump: 0, // permanent
  pothole: 0, // permanent
  police: 0, // permanent — barrage, voir ci-dessus
  object: 30, // objet sur la route
  jam: 60, // bouchon
  crash: 120, // accident
  fire: 180, // incendie
  block: 0, // permanente depuis le point 12 — voir PERMANENT_KINDS
  flood: 360, // route inondee
  gendarmerie: 0, // permanent — voir PERMANENT_KINDS
  armee: 0, // permanent — voir PERMANENT_KINDS
  /* Douze heures pour les travaux.
   *
   * Un chantier dure des semaines, mais l'ANNONCE, elle, ne doit pas survivre au chantier : une
   * route rendue reste signalee en travaux des mois si personne ne pense a l'infirmer. Douze
   * heures couvrent la journee de travail qui a motive le signalement, et le chantier encore la
   * demain sera resignale par le premier conducteur qui le traverse. */
  works: 720,
};

/**
 * Nombre de votes « n'existe plus » provenant d'appareils differents avant
 * retrait d'un signalement permanent. Reprend WIN_SEUIL_SUPPRESSION de la v82.
 */
export const ABSENT_VOTE_THRESHOLD = 3;

/**
 * ROUTE BLOQUEE : DEUX TEMOINS POUR CONFIRMER (point 12 du client, 28 octobre).
 *
 * Un seul signalement laisse le segment EN ATTENTE : il s'affiche sur la carte, mais aucun
 * itineraire n'est modifie. Deux temoins independants le CONFIRMENT, et le segment est alors
 * exclu de tous les calculs.
 *
 * POURQUOI DEUX, ET PAS UN. Exclure une route sur la parole d'un seul appareil, c'est offrir a
 * n'importe qui le pouvoir de couper une nationale pour tout le monde — par erreur, par
 * plaisanterie, ou en confondant un bouchon avec un barrage. Deux temoins ne suppriment pas le
 * risque, mais ils le rendent couteux. Et le temps d'attente n'est pas perdu : le signalement
 * est deja VISIBLE sur la carte des le premier temoin.
 */
export const TEMOINS_BLOCAGE = 2;

/**
 * Distance en metres sous laquelle deux signalements de blocage se temoignent l'un l'autre.
 *
 * Devant une barriere, les conducteurs ne s'arretent pas au meme endroit : la queue s'etire.
 * Le serveur fusionne deja deux signalements identiques a moins de 40 m, mais au-dela chacun
 * reste un signalement separe — et deux signalements separes a 100 m d'ecart decrivent pourtant
 * le MEME blocage. Cent cinquante metres couvrent une file d'attente sans aller jusqu'a
 * confondre deux blocages distincts.
 */
export const RAYON_TEMOIN_M = 150;

/**
 * Votes « route degagee » necessaires pour reouvrir un segment bloque (point 12 du client).
 *
 * Deux, et non les trois des autres permanents. Un blocage confirme COUTE cher a tout le
 * monde : il detourne chaque itineraire qui passait par la. Une route rendue a la circulation
 * doit donc redevenir utilisable vite, et la dissymetrie est voulue — il est plus grave de
 * laisser une route ouverte fermee que l'inverse, puisque le conducteur detourne ne decouvre
 * jamais son erreur.
 */
export const VOTES_DEGAGEMENT = 2;

/** Votes « plus la » necessaires pour retirer un signalement, selon son type. */
export function seuilDegagement(kind: ReportKind): number {
  return kind === 'block' ? VOTES_DEGAGEMENT : ABSENT_VOTE_THRESHOLD;
}

/**
 * Un blocage est-il CONFIRME, au vu du nombre de temoins independants ?
 *
 * `temoins` est calcule par le serveur : l'auteur, plus les appareils distincts qui ont
 * confirme, plus ceux qui ont signale un blocage a moins de RAYON_TEMOIN_M.
 */
export function blocageConfirme(temoins: number | null | undefined): boolean {
  return (temoins ?? 1) >= TEMOINS_BLOCAGE;
}

/** Rayon par defaut, en metres, pour la recherche de signalements a proximite. */
export const NEARBY_RADIUS_M = 5000;
export const NEARBY_RADIUS_MAX_M = 25000;

/** Categories de lieux proposees a la saisie. */
export const PLACE_CATEGORIES = [
  'pharmacie',
  'hopital',
  'clinique',
  'medecin',
  'ecole',
  'universite',
  'mosquee',
  'administration',
  'banque',
  'poste',
  'commerce',
  'restaurant',
  'cafe',
  'hotel',
  'station_service',
  'parking',
  'garage',
  'immobilier',
  'transport',
  'sport',
  'autre',
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/** Pays couverts par l'application. */
export const COUNTRIES = ['DZ', 'TN', 'FR'] as const;
export type CountryCode = (typeof COUNTRIES)[number];

/** Rayon, en metres, sous lequel deux lieux sont consideres comme doublons. */
export const DUPLICATE_RADIUS_M = 60;

/** Taille des cellules de diffusion temps reel, en degres. */
export const REALTIME_CELL_DEG = 0.1;

/** Nom de la salle Socket.io correspondant a une position. */
export function realtimeCell(lat: number, lon: number): string {
  const la = Math.floor(lat / REALTIME_CELL_DEG);
  const lo = Math.floor(lon / REALTIME_CELL_DEG);
  return `cell:${la}:${lo}`;
}

/** Cellules a rejoindre pour couvrir un rayon autour d'une position. */
export function realtimeCellsAround(lat: number, lon: number, radiusM = NEARBY_RADIUS_M): string[] {
  const degLat = radiusM / 111_320;
  const degLon = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const cells = new Set<string>();
  const steps = [-1, 0, 1];
  for (const dy of steps) {
    for (const dx of steps) {
      cells.add(realtimeCell(lat + dy * degLat, lon + dx * degLon));
    }
  }
  return [...cells];
}
