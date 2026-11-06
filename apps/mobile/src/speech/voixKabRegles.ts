import { palierParleM } from '../navigation/instructions';

/**
 * LES REGLES DE LA VOIX TAMAZIGHT — quel enregistrement pour quelle phrase.
 *
 * SEPARE DE voixKab.ts POUR POUVOIR ETRE EPROUVE. Ce module ne touche a aucun fichier audio :
 * il ne fait que choisir des cles. Son voisin, lui, contient les `require` que seul Metro sait
 * resoudre — un script de verification qui l'importerait echouerait au chargement, avant
 * d'avoir rien verifie. Meme raison que degradeTrace.ts et alerteApproche.ts.
 *
 * LA LISTE DES CLES EST ECRITE ICI, A LA MAIN, et non deduite des fichiers. C'est volontaire :
 * elle sert de contrat. verifier-voix.py compare cette liste au contenu du dossier et echoue
 * si l'un des deux a bouge sans l'autre — un enregistrement ajoute mais jamais joue, ou une
 * cle qui designe un fichier disparu.
 */
export const CLES_VOIX = [
  'accident',
  'adresseIntrouvable',
  'aeroport',
  'approcheDestination',
  'arretBus',
  'arrivee',
  'attention',
  'banque',
  'bienvenue',
  'bouchon',
  'd100m',
  'd10km',
  'd1km',
  'd200m',
  'd2km',
  'd300m',
  'd500m',
  'd50m',
  'd5km',
  'demiTour',
  'destinationDroite',
  'destinationGauche',
  'destinationToutDroit',
  'ditesDestination',
  'gpsFaible',
  'gpsPerdu',
  'gpsRetrouve',
  'hopital',
  'horsLigne',
  'hotel',
  'internetPerdu',
  'itineraireRecalcule',
  'mosquee',
  'navigationArretee',
  'navigationDemarree',
  'nouvelItineraire',
  'parking',
  'pharmacie',
  'plusieursResultats',
  'police',
  'pont',
  'protectionCivile',
  'radar',
  'ralentir',
  'ralentissez',
  'recalculEnCours',
  'recherche',
  'repriseItineraire',
  'restaurant',
  'resterDroite',
  'resterGauche',
  'rondPoint',
  'sortie1',
  'sortie2',
  'sortie3',
  'sortie4',
  'sortieAutoroute',
  'stationService',
  'supermarche',
  'tournerDroite',
  'tournerGauche',
  'toutDroit',
  'travaux',
  'tunnelEntree',
  'tunnelSortie',
  'virageDangereux',
  'vousVoulezDire',
  'zoneScolaire',
] as const;

export type CleVoix = (typeof CLES_VOIX)[number];

/* ------------------------------------------------------------------ */
/* Les distances                                                       */
/* ------------------------------------------------------------------ */

/**
 * Les paliers enregistres, en metres. Ce sont ceux que `spokenDistance` prononce en francais :
 * 300, 200, 100 et 50 metres pres du virage, puis des kilometres entiers.
 */
const PALIERS_DISTANCE: Record<number, CleVoix> = {
  50: 'd50m',
  100: 'd100m',
  200: 'd200m',
  300: 'd300m',
  500: 'd500m',
  1000: 'd1km',
  2000: 'd2km',
  5000: 'd5km',
  10000: 'd10km',
};

/**
 * Le clip de distance, ou `null` s'il faut laisser parler la synthese.
 *
 * ON PART DU PALIER QUE LA SYNTHESE PRONONCERAIT, jamais de la distance brute. C'est la seule
 * facon que le clip kabyle et la phrase francaise disent le MEME chiffre — deux arrondis
 * separes auraient fini par diverger, et personne n'aurait pu s'en apercevoir sans parler les
 * deux langues.
 *
 * Les kilometres sont arrondis au cent metres pres par la synthese : << 2,3 km >> n'a pas
 * d'enregistrement et passe donc en francais, ce qui est juste. Seuls 1, 2, 5 et 10 km
 * tombent sur un clip.
 */
export function clipDistance(metres: number): CleVoix | null {
  return PALIERS_DISTANCE[palierParleM(metres)] ?? null;
}

/* ------------------------------------------------------------------ */
/* Les manoeuvres                                                      */
/* ------------------------------------------------------------------ */

/**
 * Types de manoeuvre Valhalla vers clip. Les absents sont volontaires : il n'existe pas
 * d'enregistrement pour << serrez legerement a droite >>, << tournez franchement >>,
 * << prenez la bretelle >> ni << inserez-vous >>. Ils passent par la synthese francaise.
 *
 * ON NE REMPLACE PAS UN CLIP MANQUANT PAR UN CLIP VOISIN. Dire << tournez a droite >> pour
 * << serrez legerement a droite >> ferait prendre la mauvaise voie a une bifurcation
 * d'autoroute, et le conducteur n'aurait aucun moyen de savoir que l'application a approxime.
 */
const MANOEUVRES: Record<number, CleVoix> = {
  0: 'toutDroit',
  4: 'arrivee',
  5: 'destinationDroite',
  6: 'destinationGauche',
  7: 'toutDroit',
  8: 'toutDroit',
  10: 'tournerDroite',
  12: 'demiTour',
  13: 'demiTour',
  15: 'tournerGauche',
  20: 'sortieAutoroute',
  21: 'sortieAutoroute',
  22: 'toutDroit',
  23: 'resterDroite',
  24: 'resterGauche',
  26: 'rondPoint',
};

/** Les quatre sorties de rond-point enregistrees. Au-dela, la synthese francaise. */
const SORTIES_ROND_POINT: Record<number, CleVoix> = {
  1: 'sortie1',
  2: 'sortie2',
  3: 'sortie3',
  4: 'sortie4',
};

/**
 * Le clip d'une manoeuvre, ou `null`.
 *
 * LA SORTIE DE ROND-POINT EST LE SEUL CAS OU UN NUMERO COMPTE. Valhalla donne le rang de la
 * sortie a prendre ; sans lui, << sortez du rond-point >> ne dit pas laquelle — et c'est
 * precisement l'information dont on a besoin. On prend donc le clip numerote quand le rang est
 * connu, la synthese francaise sinon.
 */
export function clipManoeuvre(type: number, sortieRondPoint?: number | null): CleVoix | null {
  if (type === 27) {
    return sortieRondPoint ? (SORTIES_ROND_POINT[sortieRondPoint] ?? null) : null;
  }
  return MANOEUVRES[type] ?? null;
}
