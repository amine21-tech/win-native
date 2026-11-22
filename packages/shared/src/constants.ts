/**
 * Constantes partagees entre l'API et l'application mobile.
 * Toute valeur presente ici est la seule source de verite : ne pas la
 * redupliquer cote client ni cote serveur.
 */

/**
 * Langues de l'interface.
 *
 * `dz` = derja algerienne, ecrite en caracteres arabes.
 * `kab` = kabyle (tamazight), ecrit en caracteres LATINS.
 *
 * POURQUOI LE KABYLE EN CARACTERES LATINS ET NON EN TIFINAGH. Le tifinagh est l'ecriture
 * officielle du tamazight, et c'est celle qu'on attendrait. Mais il demande une police que la
 * plupart des Android algeriens n'ont pas : le texte s'afficherait en carres vides, ce qui est
 * pire que ne pas proposer la langue du tout. Les locuteurs kabyles ecrivent de toute facon
 * couramment en caracteres latins — c'est l'usage du quotidien, des messages et des
 * enseignes. Le cahier des charges du client le demande explicitement ainsi.
 */
export const LANGUAGES = ['fr', 'dz', 'ar', 'en', 'kab'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Langues affichees de droite a gauche. Le kabyle s'ecrit de gauche a droite. */
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
  /* LES DECHETS SAUVAGES — correctif du 8 novembre, point 5.
   *
   * Le document les veut EN DERNIER dans le menu, seuls sur leur ligne, avec un badge
   * << NOUVEAU >> dore. Ce sont les decharges en bord de route : ni un danger immediat ni un
   * ralentissement, mais une nuisance que l'application est bien placee pour cartographier,
   * puisqu'elle a deja la position et la photo.
   *
   * SON DOCUMENT EN LISTE SEPT EN TOUT, ET ON EN GARDE QUATORZE. Sa liste de sept est une
   * SELECTION — bouchon, accident, barrage, route bloquee, travaux, objet, dechets — qui laisse
   * tomber le radar, le dos d'ane, le trou, l'incendie, l'inondation et deux des trois forces.
   * Ce sont des types deja en service, deja signales par des conducteurs, et deja en base. Les
   * retirer effacerait des donnees reelles pour suivre une liste qui ne dit nulle part qu'elle
   * remplace l'existante. Decision prise avec arsanne : on garde les treize et on ajoute les
   * dechets. */
  'waste',
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
  'waste',
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
  /* LES DECHETS SONT PERMANENTS, comme le trou et le dos d'ane.
   *
   * Une decharge sauvage ne se dissipe pas : elle grossit. Lui donner une echeance, c'est
   * decider qu'elle aura disparu dans N heures — exactement l'hypothese qui a fait retirer
   * l'echeance de la route bloquee le 28 octobre. Elle s'efface donc par vote, quand trois
   * conducteurs repondent << plus la >> parce que le terrain a ete nettoye. */
  waste: 0,
};

/**
 * Nombre de votes « n'existe plus » provenant d'appareils DIFFERENTS avant retrait d'un
 * signalement permanent.
 *
 * DEUX — POINT J DU CORRECTIF v2, ET C'ETAIT TROIS. Le client decrit le defaut tel qu'il le
 * voit : << Un utilisateur vote "Disparu" -> le symbole reste visible sur la carte (aucun
 * effet). Meme apres 2 votes "Disparu" de 2 utilisateurs differents -> le symbole ne disparait
 * pas. >> Son diagnostic (<< les votes sont enregistres mais la logique de suppression n'est pas
 * declenchee >>) n'est pas exact — elle l'etait, mais a trois. A deux votes, sur un radar, il ne
 * se passait effectivement rien, et c'est bien ce qu'il a vu.
 *
 * << Cette correction s'applique a TOUS les symboles et signalisations de la carte : Radar,
 * Accident, Obstacle, Travaux, Animal, Danger, Embouteillage, Controle, tout autre symbole. >>
 * La dissymetrie qui donnait deux votes a la route barree et trois aux autres disparait donc.
 *
 * CE QUE CE CHIFFRE COUTE, PUISQU'IL FAUT LE DIRE : deux conducteurs de mauvaise foi effacent
 * un radar. C'etait trois. Ce qui protege reellement n'est pas le nombre mais l'unicite — un
 * appareil, un vote, enregistre en base — et le fait qu'un seul << toujours la >> remette le
 * compteur a zero (voir ci-dessous). Un symbole reel est traverse par des dizaines de
 * conducteurs par jour : il suffit qu'un seul le confirme pour annuler les deux autres.
 */
export const ABSENT_VOTE_THRESHOLD = 2;

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

/**
 * LES TYPES QUI BLOQUENT LA ROUTE, et qui declenchent donc un recalcul proactif.
 *
 * CE QUE LE DOCUMENT DEMANDE (14 novembre, correction 3, son enum SignalType) : BARRAGE,
 * ROUTE_BARREE et CHEMIN_SANS_ISSUE font sortir le troncon des calculs des que deux temoins
 * differents l'ont signale. Tous les autres types — bouchon, accident, travaux, dos d'ane,
 * radar, objet, trou, inondation, incendie, dechets — sont << informatifs seulement >>.
 *
 * << CHEMIN SANS ISSUE >> N'A PAS DE TYPE A LUI : c'est le sous-titre de la carte Route barree
 * depuis le 9 novembre (<< Ou chemin sans issue >>), et les deux decrivent la meme chose pour
 * le conducteur — on ne passe pas. Un type de plus aurait ajoute une case au menu pour une
 * distinction qu'aucun temoin ne fait au volant.
 *
 * LE BARRAGE S'AJOUTE AUJOURD'HUI. Il ne declenchait rien : seul `block` sortait de
 * l'itineraire. C'etait un oubli, pas un choix — un barrage tenu depuis une heure arrete la
 * circulation aussi surement qu'une route barree, et c'est precisement la situation ou un
 * detour vaut quelque chose.
 *
 * L'INONDATION RESTE A PART, et volontairement : elle exclut le troncon DES LE PREMIER temoin
 * (voir avoidPoints), parce que personne ne signale une inondation par erreur et que s'y
 * engager ne se repare pas. Elle n'a donc rien a faire dans une liste qui attend deux voix.
 */
export const KINDS_BLOQUANTS = ['block', 'police'] as const;

/** Ce signalement empeche-t-il de passer ? Voir KINDS_BLOQUANTS. */
export function bloqueLaRoute(kind: ReportKind): boolean {
  return (KINDS_BLOQUANTS as readonly string[]).includes(kind);
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

/* ------------------------------------------------------------------ */
/* Module Emploi : les trois formules                                   */
/* ------------------------------------------------------------------ */

/**
 * LES TROIS FORMULES EMPLOYEUR (doc 196 v2.0, 29 octobre).
 *
 * UNE SEULE SOURCE POUR LES PRIX, LES RAYONS ET LES DUREES. Ces chiffres apparaissent sur la
 * carte de tarif, dans le message de confirmation, dans l'ecran d'administration, dans la
 * requete geographique du serveur et dans le calcul de la date d'expiration. Ecrits a cinq
 * endroits, ils auraient diverge au premier changement de prix — et un employeur a qui l'on
 * annonce 1 500 DA puis que l'on facture 3 000 ne revient pas.
 *
 * `porteeM: null` veut dire ALGERIE ENTIERE : pas de limite de distance, et non pas un rayon
 * inconnu. Le serveur le traduit par l'absence de condition geographique.
 */
export const FORMULES_EMPLOI = {
  essentiel: { semaine: 500, mois: 1_500, porteeM: 50_000, prioritaire: false },
  /**
   * LA SEULE FORMULE EN VENTE DEPUIS LE POINT C DU CORRECTIF v2, ET SES PRIX ONT CHANGE.
   *
   *   << APRES — 1 seule formule : STANDARD POPULAIRE, 1 000 DA / 7 jours OU 2 000 DA /
   *   30 jours. Paiement unique · Expire automatiquement. >>
   *
   * Le mois passe donc de 3 000 a 2 000 DA — c'est une baisse de prix, pas une coquille : il
   * l'ecrit en grand dans son tableau << APRES >>, et la semaine, elle, reste a 1 000.
   *
   * `porteeM: null` — L'ALGERIE ENTIERE, LA OU CETTE FORMULE S'ARRETAIT A CENT KILOMETRES, ET
   * C'EST UNE DECISION QUI ATTEND SA CONFIRMATION. La portee par formule n'existait que pour
   * distinguer les trois offres : 50 km, 100 km, le pays. Avec une offre unique, elle ne
   * distingue plus rien — elle ne fait plus que plafonner. Et elle entrerait en contradiction
   * avec ce que le meme point C conserve explicitement : << curseur rayon (50/100/200km+)
   * conserve tel quel >>. Un chercheur qui regle son curseur sur 300 km ne verrait aucune
   * annonce au-dela de 100, sans jamais savoir pourquoi. C'est donc desormais le CHERCHEUR qui
   * decide jusqu'ou il regarde, et l'employeur ne paie plus une distance — exactement la
   * << meme logique que Waze / Google Maps >> que le client invoque au point D.
   *
   * LES ANNONCES DEJA EN LIGNE NE BOUGENT PAS : leur portee est ecrite dans leur ligne en base
   * au moment du depot. Celui qui a paye Premium garde son pays, celui qui a paye Essentiel
   * garde ses cinquante kilometres.
   */
  standard: { semaine: 1_000, mois: 2_000, porteeM: null, prioritaire: false },
  premium: { semaine: 1_500, mois: 5_000, porteeM: null, prioritaire: true },
} as const;

export type FormuleEmploi = keyof typeof FORMULES_EMPLOI;

/**
 * LES TROIS FORMULES RESTENT DANS LE MODELE, ET C'EST VOLONTAIRE.
 *
 * << Supprimer les 2 autres formules DE L'UI · Garder uniquement STANDARD POPULAIRE. >> Le
 * client dit bien l'UI, et c'est heureux : des annonces deposees en octobre et en novembre
 * portent `formule = 'essentiel'` ou `'premium'` dans la base. Retirer ces deux clefs du
 * modele ferait echouer la lecture de ces annonces — un ecran d'administration vide pour
 * effacer deux cartes de tarif.
 */
export const FORMULES: readonly FormuleEmploi[] = ['essentiel', 'standard', 'premium'];

/**
 * CE QUI EST PROPOSE A L'EMPLOYEUR AUJOURD'HUI — point C du correctif v2.
 *
 * UNE LISTE PLUTOT QU'UNE CONSTANTE, et c'est ce qui permet au formulaire de ne rien savoir du
 * nombre d'offres : il boucle dessus comme il bouclait sur les trois. Le jour ou une offre
 * revient, cette ligne suffit, et les cartes, les badges, les prix et le choix de duree
 * reapparaissent tels quels.
 */
export const FORMULES_EN_VENTE: readonly FormuleEmploi[] = ['standard'];

/** La formule par defaut du formulaire : la seule en vente. */
export const FORMULE_UNIQUE: FormuleEmploi = 'standard';

/** Duree d'affichage choisie par l'employeur, et ce qu'elle vaut en jours. */
export const DUREES_EMPLOI = { semaine: 7, mois: 30 } as const;
export type DureeEmploi = keyof typeof DUREES_EMPLOI;
export const DUREES: readonly DureeEmploi[] = ['semaine', 'mois'];

/**
 * Prix en dinars d'une formule pour une duree donnee — `null` si l'un des deux est inconnu.
 *
 * POURQUOI `null` ET NON UNE EXCEPTION. Cette fonction lisait `FORMULES_EMPLOI[formule][duree]`
 * sans rien verifier. TypeScript garantit les types a la COMPILATION ; il ne garantit rien de
 * ce qui arrive du reseau, qui est simplement transtype a l'arrivee. Une formule inconnue —
 * champ absent, serveur plus ancien, annonce ecrite a la main en base — faisait donc lire une
 * propriete sur `undefined`, ce qui leve une exception pendant le rendu.
 *
 * Et une exception pendant le rendu d'un ecran React Native n'affiche pas un message : elle
 * efface TOUT. L'ecran d'administration affiche ses sections les unes sous les autres, la
 * liste des annonces comprise : une seule valeur inattendue suffisait a le rendre entierement
 * noir, sans la moindre indication de ce qui s'etait passe.
 *
 * Rendre `null` oblige l'appelant a decider quoi afficher — et le pire qu'il puisse arriver
 * est alors un tiret a la place d'un montant.
 */
export function prixEmploi(
  formule: FormuleEmploi | string | null | undefined,
  duree: DureeEmploi | string | null | undefined,
): number | null {
  const tarifs = FORMULES_EMPLOI[formule as FormuleEmploi];
  if (!tarifs) return null;
  const prix = tarifs[duree as DureeEmploi];
  return typeof prix === 'number' ? prix : null;
}

/** Jours d'affichage d'une duree — `null` si elle est inconnue. Meme raison que ci-dessus. */
export function joursEmploi(duree: DureeEmploi | string | null | undefined): number | null {
  const jours = DUREES_EMPLOI[duree as DureeEmploi];
  return typeof jours === 'number' ? jours : null;
}

/**
 * Rayon de visibilite d'une annonce, en metres — `null` pour l'Algerie entiere.
 *
 * C'est le rayon de l'ANNONCE et non celui du chercheur : une offre Premium publiee a Oran
 * doit apparaitre a Annaba, et une offre Essentiel publiee dans la meme rue ne doit pas sortir
 * de ses cinquante kilometres. Le chercheur, lui, ne regle rien.
 */
export function porteeEmploi(formule: FormuleEmploi | string | null | undefined): number | null {
  return FORMULES_EMPLOI[formule as FormuleEmploi]?.porteeM ?? null;
}
