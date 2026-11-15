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
  'aucunItineraire',
  'banque',
  'barrage',
  'bienvenue',
  'bouchon',
  'bretelle',
  'bretelleDroite',
  'bretelleGauche',
  'd100m',
  'd10km',
  'd1km',
  'd200m',
  'd2km',
  'd300m',
  'd400m',
  'd500m',
  'd50m',
  'd5km',
  'd600m',
  'd700m',
  'd800m',
  'demiTour',
  'destinationDroite',
  'destinationGauche',
  'destinationToutDroit',
  'ditesDestination',
  'dosDane',
  'ferryEntree',
  'ferrySortie',
  'gpsFaible',
  'gpsPerdu',
  'gpsRetrouve',
  'hopital',
  'horsLigne',
  'hotel',
  'incendie',
  'inondation',
  'insertion',
  'internetPerdu',
  'itineraireRecalcule',
  'mosquee',
  'navigationArretee',
  'navigationDemarree',
  'nouvelItineraire',
  'objet',
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
  'routeBloquee',
  'routeBloqueeRecalcul',
  'serrerDroite',
  'serrerGauche',
  'sortie1',
  'sortie2',
  'sortie3',
  'sortie4',
  'sortieAutoroute',
  'sortieManquee',
  'stationService',
  'supermarche',
  'tournerDroite',
  'tournerFranchementDroite',
  'tournerFranchementGauche',
  'tournerGauche',
  'toutDroit',
  'travaux',
  'trou',
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
  /* 400, 600, 700 ET 800 SONT ARRIVES LE 16 NOVEMBRE, avec le second envoi du locuteur.
   *
   * Ils manquaient, et le manque etait visible : `palierParleM` arrondit a la centaine des
   * 400 m, donc la synthese francaise prononcait bien << dans 700 metres >> pendant que le
   * kabyle se taisait. Et ce ne sont pas des paliers rares — la premiere annonce se declenche
   * dix-huit secondes avant la manoeuvre, plafonnees a 800 m : a vitesse d'autoroute, c'est
   * exactement cette tranche qu'on entend en premier. */
  400: 'd400m',
  500: 'd500m',
  600: 'd600m',
  700: 'd700m',
  800: 'd800m',
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
 * Types de manoeuvre Valhalla vers clip.
 *
 * LA LISTE S'EST COMPLETEE LE 16 NOVEMBRE. Elle portait jusque-la cette note : << il n'existe
 * pas d'enregistrement pour "serrez legerement a droite", "tournez franchement", "prenez la
 * bretelle" ni "inserez-vous" ; ils passent par la synthese francaise >>. Le second envoi du
 * locuteur les apporte tous les quatre, plus les deux ferries.
 *
 * ON NE REMPLACE JAMAIS UN CLIP MANQUANT PAR UN CLIP VOISIN, et c'est ce qui rendait ces
 * manques couteux plutot que genants. Dire << tournez a droite >> pour << serrez legerement a
 * droite >> ferait prendre la mauvaise voie a une bifurcation d'autoroute, et le conducteur
 * n'aurait aucun moyen de savoir que l'application a approxime. La regle ne change pas : ce
 * sont les enregistrements qui ont rattrape la liste.
 *
 * CE QUI MANQUE ENCORE, et qui reste volontaire : les types 1 a 3 (<< demarrez >>, dit par la
 * consigne de depart elle-meme) et 2/3 (depart a droite ou a gauche).
 */
const MANOEUVRES: Record<number, CleVoix> = {
  0: 'toutDroit',
  4: 'arrivee',
  5: 'destinationDroite',
  6: 'destinationGauche',
  7: 'toutDroit',
  8: 'toutDroit',
  9: 'serrerDroite',
  10: 'tournerDroite',
  11: 'tournerFranchementDroite',
  12: 'demiTour',
  13: 'demiTour',
  14: 'tournerFranchementGauche',
  15: 'tournerGauche',
  16: 'serrerGauche',
  17: 'bretelle',
  18: 'bretelleDroite',
  19: 'bretelleGauche',
  20: 'sortieAutoroute',
  21: 'sortieAutoroute',
  22: 'toutDroit',
  23: 'resterDroite',
  24: 'resterGauche',
  25: 'insertion',
  26: 'rondPoint',
  28: 'ferryEntree',
  29: 'ferrySortie',
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
