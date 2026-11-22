// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------
import { z } from 'zod';
import {
  COUNTRIES,
  LANGUAGES,
  NEARBY_RADIUS_M,
  NEARBY_RADIUS_MAX_M,
  PLACE_CATEGORIES,
  REPORT_KINDS,
} from './constants';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

/**
 * Variantes pour les parametres d'URL : tout arrive en chaine de caracteres
 * dans une query string, il faut donc convertir avant de valider. Les corps de
 * requete JSON, eux, conservent les versions strictes ci-dessus — un client qui
 * envoie "36.75" au lieu de 36.75 dans un POST a un bug qu'il vaut mieux voir.
 */
export const latitudeQuery = z.coerce.number().min(-90).max(90);
export const longitudeQuery = z.coerce.number().min(-180).max(180);

export const coordinates = z.object({ lat: latitude, lon: longitude });
export type Coordinates = z.infer<typeof coordinates>;

/** Numero de telephone algerien ou international, tolerant a la saisie. */
export const phone = z
  .string()
  .trim()
  .min(6)
  .max(24)
  .regex(/^[+0-9 ().-]+$/, 'Numero de telephone invalide');

export const uuid = z.string().uuid();

/* ------------------------------------------------------------------ */
/* Identite                                                            */
/* ------------------------------------------------------------------ */

export const registerDeviceInput = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  appVersion: z.string().max(32).optional(),
  language: z.enum(LANGUAGES).optional(),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceInput>;

export const deviceSession = z.object({
  deviceId: uuid,
  token: z.string(),
});
export type DeviceSession = z.infer<typeof deviceSession>;

export const adminLoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type AdminLoginInput = z.infer<typeof adminLoginInput>;

/* ------------------------------------------------------------------ */
/* Paiement — deblocage de la navigation transfrontaliere               */
/* ------------------------------------------------------------------ */

/** Compte (CCP ou bancaire algerien) sur lequel les paiements de deblocage
 * Tunisie sont recus — configure par un administrateur, jamais par un
 * contributeur. Premiere brique du chantier paiement (le reglement en ligne
 * lui-meme suivra une fois le fournisseur choisi). */
export const payoutAccountInput = z.object({
  type: z.enum(['ccp', 'bank']),
  accountNumber: z.string().trim().min(4).max(34),
  holderName: z.string().trim().min(2).max(120),
});
export type PayoutAccountInput = z.infer<typeof payoutAccountInput>;

/* ------------------------------------------------------------------ */
/* Lieux                                                               */
/* ------------------------------------------------------------------ */

export const placePhoto = z.object({
  id: uuid,
  url: z.string(),
  thumbUrl: z.string().nullable(),
  credit: z.string().nullable(),
  position: z.number().int(),
});
export type PlacePhoto = z.infer<typeof placePhoto>;

/**
 * UNE PLAGE D'OUVERTURE — amelioration 4 de la synthese « Fiche VIP Premium ».
 *
 * `jour` suit `Date.prototype.getDay()` : 0 = dimanche … 6 = samedi. Plusieurs plages peuvent
 * porter le meme jour, et c'est voulu : c'est ainsi qu'on ecrit la coupure de midi, que la
 * synthese ne prevoyait pas et qui aurait fait afficher « Ouvert » a treize heures devant une
 * porte close. Voir apps/mobile/src/place/horaires.ts pour la regle complete.
 *
 * L'heure est acceptee en « 08h00 » comme en « 08:00 » : refuser l'une des deux ecritures ne
 * protege rien et fait perdre une saisie.
 */
export const horaire = z.object({
  jour: z.number().int().min(0).max(6),
  ouv: z.string().trim().regex(/^\d{1,2}\s*[h:]\s*\d{0,2}$/),
  ferm: z.string().trim().regex(/^\d{1,2}\s*[h:]\s*\d{0,2}$/),
});
export type Horaire = z.infer<typeof horaire>;

export const place = z.object({
  id: uuid,
  name: z.string(),
  category: z.enum(PLACE_CATEGORIES),
  lat: latitude,
  lon: longitude,
  houseNumber: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  wilaya: z.string().nullable(),
  country: z.enum(COUNTRIES),
  phoneFixe: z.string().nullable(),
  phoneMobile: z.string().nullable(),
  whatsapp: z.string().nullable(),
  viber: z.string().nullable(),
  email: z.string().nullable(),
  enseigne: z.string().nullable(),
  promo: z.string().nullable(),
  isPartner: z.boolean(),
  photos: z.array(placePhoto),
  /* Les trois ajouts de la synthese « Fiche VIP Premium ». Ils sont NULLABLES et absents par
   * defaut : une fiche ordinaire n'en porte aucun, et le principe pose par le fondateur —
   * « ne rien casser » — veut qu'un client plus ancien qui ignore ces champs continue de
   * fonctionner a l'identique. */
  horaires: z.array(horaire).nullable().optional(),
  /** Moyenne des avis, calculee par le serveur. Null tant qu'il n'y a aucun avis. */
  avisNote: z.number().nullable().optional(),
  /** Nombre d'avis. L'affichage exige trois minimum — voir apps/mobile/src/place/avis.ts. */
  avisCount: z.number().int().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Place = z.infer<typeof place>;

/**
 * DEPOSER UN AVIS sur une fiche VIP.
 *
 * POURQUOI CETTE ROUTE EXISTE ALORS QUE LA SYNTHESE NE LA DEMANDE PAS. Le document decrit
 * l'affichage de la note et fixe le seuil a trois avis, en supposant la table remplie. Sans
 * aucun moyen d'en deposer un, AUCUNE fiche n'atteindrait jamais trois avis : les etoiles
 * seraient ecrites, testees, et invisibles partout — exactement le defaut trouve le 18 novembre
 * sur le rayon VIP, qui agissait dans une situation que l'application n'atteignait pas.
 *
 * Le commentaire est optionnel : la synthese n'affiche que la note et le compte, et demander un
 * texte ferait abandonner la plupart des gens avant d'avoir note.
 */
export const avisInput = z.object({
  note: z.number().int().min(1).max(5),
  commentaire: z.string().trim().max(400).optional(),
});
export type AvisInput = z.infer<typeof avisInput>;

export const createPlaceInput = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.enum(PLACE_CATEGORIES).default('autre'),
  lat: latitude,
  lon: longitude,
  houseNumber: z.string().trim().max(20).optional(),
  street: z.string().trim().max(160).optional(),
  city: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(10).optional(),
  wilaya: z.string().trim().max(80).optional(),
  country: z.enum(COUNTRIES).default('DZ'),
  phoneFixe: phone.optional(),
  phoneMobile: phone.optional(),
  whatsapp: phone.optional(),
  viber: phone.optional(),
  email: z.string().email().optional(),
  enseigne: z.string().trim().max(160).optional(),
  promo: z.string().trim().max(280).optional(),
  /* Au plus deux plages par jour, soit quatorze : c'est ce qu'il faut pour sept jours avec
   * coupure de midi, et cela borne la saisie sans jamais gener un commerce reel. */
  horaires: z.array(horaire).max(14).optional(),
  photoIds: z.array(uuid).max(6).optional(),
  /** Code du service VIP. Present et exact : le lieu est enregistre comme partenaire VIP.
   * Verifie UNIQUEMENT par le serveur — l'application ne le connait pas. */
  vipCode: z.string().trim().min(1).max(32).optional(),
});
export type CreatePlaceInput = z.infer<typeof createPlaceInput>;

/**
 * Entree de /places/:id/vip-action — point B du 18 novembre.
 *
 * Les deux actions sont NOMMEES plutot que booleennes : un `supprimer: true` se lit mal au
 * moment ou l'on relit le code, et un jour quelqu'un ecrirait `supprimer: false` en croyant
 * declasser.
 */
export const vipActionInput = z.object({
  code: z.string().min(4).max(12),
  action: z.enum(['supprimer', 'declasser']),
});

export const vipCheckInput = z.object({ code: z.string().trim().min(1).max(32) });
export type VipCheckInput = z.infer<typeof vipCheckInput>;

export const updatePlaceInput = createPlaceInput.partial().omit({ lat: true, lon: true }).extend({
  lat: latitude.optional(),
  lon: longitude.optional(),
  /** Retire le statut partenaire VIP (« Declasser », doc "22 chantiers" #17) — jamais l'inverse
   * par cette route : promouvoir un lieu en VIP reste un acte commercial distinct. */
  isPartner: z.boolean().optional(),
});
export type UpdatePlaceInput = z.infer<typeof updatePlaceInput>;

export const searchPlacesQuery = z.object({
  q: z.string().trim().min(1).max(120),
  lat: latitudeQuery.optional(),
  lon: longitudeQuery.optional(),
  category: z.enum(PLACE_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchPlacesQuery = z.infer<typeof searchPlacesQuery>;

export const checkDuplicateQuery = z.object({
  name: z.string().trim().min(2).max(160),
  lat: latitudeQuery,
  lon: longitudeQuery,
});
export type CheckDuplicateQuery = z.infer<typeof checkDuplicateQuery>;

/* ------------------------------------------------------------------ */
/* Signalements                                                        */
/* ------------------------------------------------------------------ */

export const report = z.object({
  id: uuid,
  kind: z.enum(REPORT_KINDS),
  permanent: z.boolean(),
  lat: latitude,
  lon: longitude,
  heading: z.number().nullable(),
  speedLimit: z.number().int().nullable(),
  confirmCount: z.number().int(),
  absentCount: z.number().int(),
  /* TEMOINS INDEPENDANTS, pour les seuls blocages (point 12 du client, 28 octobre) : l'auteur,
   * plus les appareils distincts qui ont confirme ou signale un blocage tout pres. Deux temoins
   * CONFIRMENT la route bloquee et le segment sort des calculs d'itineraire ; un seul la laisse
   * en attente, visible sur la carte mais sans effet sur les trajets.
   *
   * Optionnel : une application plus ancienne que le serveur ne le recevra pas, et
   * `blocageConfirme` traite l'absence comme un seul temoin — donc en attente. Le defaut le
   * plus prudent. */
  temoins: z.number().int().optional(),
  /* L'INSTANT OU LE BLOCAGE A ETE CONFIRME — point H du correctif v2, phase 2.
   *
   * C'est de cette date que partent les sept jours (travaux) ou les trente jours (chemin sans
   * issue) avant reouverture provisoire, et c'est elle que le serveur remet a l'instant present
   * quand un conducteur repond << non, ce n'est pas praticable >> (<< delai repart >>). Toute la
   * phase 2 se lit dans cette seule valeur et les deux compteurs qui suivent : voir
   * `phaseBlocage` dans probation.ts.
   *
   * Nulle pour tout ce qui n'est pas un blocage confirme, et absente des reponses d'un serveur
   * plus ancien que l'application — `phaseBlocage` traite les deux comme << bloque >>, c'est-a-
   * dire comme avant le point H. */
  bloqueLe: z.string().nullable().optional(),
  /* Reponses << oui, c'est praticable >> recues depuis `bloqueLe`. Deux debloquent le segment
   * definitivement. Les reponses d'un cycle precedent ne comptent pas : la requete ne retient
   * que celles qui suivent la date ci-dessus. */
  praticableOui: z.number().int().optional(),
  /* Reponses recues en tout, les << non >> compris. Sert a savoir qu'on a deja interroge les
   * deux conducteurs prevus, et donc a ne plus poser la question. */
  praticableTotal: z.number().int().optional(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type Report = z.infer<typeof report>;

export const createReportInput = z.object({
  kind: z.enum(REPORT_KINDS),
  lat: latitude,
  lon: longitude,
  heading: z.number().min(0).max(360).optional(),
  speedLimit: z.number().int().min(5).max(160).optional(),
  /* METRES REELLEMENT PARCOURUS JUSTE AVANT LE SIGNALEMENT — point H du correctif v2 :
   * << condition : chaque utilisateur a depasse le segment de 10 m (preuve qu'il l'a vecu) >>.
   *
   * L'application le mesure sur ses propres positions GPS (voir preuvePassage.ts). Facultatif,
   * et `preuveVecue` traite l'absence comme une preuve acquise : une application plus ancienne
   * que le serveur ne l'envoie pas, et desarmer ses signalements punirait l'utilisateur pour
   * une mise a jour qu'il n'a pas faite. Ce qui est ecarte, c'est une mesure PRESENTE et
   * inferieure a dix metres.
   *
   * Plafonne a cent kilometres : au-dela, ce n'est plus une preuve de passage mais une erreur
   * de calcul, et un chiffre absurde n'a rien a faire en base. */
  parcourusM: z.number().min(0).max(100_000).optional(),
});
export type CreateReportInput = z.infer<typeof createReportInput>;

export const voteReportInput = z.object({
  vote: z.enum(['confirm', 'absent']),
});
export type VoteReportInput = z.infer<typeof voteReportInput>;

/**
 * << CETTE ROUTE EST-ELLE PRATICABLE ? >> OUI / NON — point H du correctif v2, phase 2.
 *
 * UNE ROUTE A PART, ET NON UN TROISIEME VOTE. Le document est formel : << NE PAS MODIFIER le
 * systeme de signalement existant — AJOUTER >>. Les deux votes existants disent si le
 * signalement est encore la ; celui-ci repond a une question qu'on POSE, pendant une
 * reouverture provisoire, a deux conducteurs choisis par le hasard de leur trajet. Les melanger
 * aurait fait d'un << non praticable >> un << toujours la >>, qui prolonge les signalements
 * temporaires et nourrit le compte des temoins : deux effets que personne n'a demandes.
 */
export const praticableInput = z.object({
  praticable: z.boolean(),
});
export type PraticableInput = z.infer<typeof praticableInput>;

export const nearbyReportsQuery = z.object({
  lat: latitudeQuery,
  lon: longitudeQuery,
  radius: z.coerce.number().int().min(100).max(NEARBY_RADIUS_MAX_M).default(NEARBY_RADIUS_M),
  kinds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.enum(REPORT_KINDS)).optional()),
});
export type NearbyReportsQuery = z.infer<typeof nearbyReportsQuery>;

/* ------------------------------------------------------------------ */
/* Contributions et moderation                                         */
/* ------------------------------------------------------------------ */

export const correctionInput = z.object({
  placeId: uuid.optional(),
  lat: latitude.optional(),
  lon: longitude.optional(),
  message: z.string().trim().min(3).max(1000),
  payload: z.record(z.unknown()).optional(),
});
export type CorrectionInput = z.infer<typeof correctionInput>;

/**
 * Signalement d'une photo incorrecte.
 *
 * Les motifs sont une LISTE FERMEE, et non un champ libre : au volant ou en marchant, personne
 * ne redige un paragraphe. Quatre cas couvrent ce qu'un contributeur constate reellement, et un
 * motif « autre » recueille le reste, avec un message facultatif.
 */
export const PHOTO_REPORT_REASONS = [
  'wrong_place', // ce n'est pas cet endroit
  'wrong_facade', // bon endroit, mauvaise facade
  'poor_quality', // floue, trop sombre, illisible
  'inappropriate', // contenu deplace
  'other',
] as const;
export type PhotoReportReason = (typeof PHOTO_REPORT_REASONS)[number];

export const photoReportInput = z.object({
  reason: z.enum(PHOTO_REPORT_REASONS),
  message: z.string().trim().max(500).optional(),
});
export type PhotoReportInput = z.infer<typeof photoReportInput>;

/** Code remis aux contributeurs, verifie avant d'ouvrir le formulaire d'enregistrement. */
export const contributorCheckInput = z.object({
  code: z.string().trim().min(4).max(32),
});
export type ContributorCheckInput = z.infer<typeof contributorCheckInput>;

export const partnerLeadInput = z.object({
  name: z.string().trim().min(2).max(160),
  phone: phone,
  email: z.string().email().optional(),
  city: z.string().trim().max(120).optional(),
  message: z.string().trim().max(1000).optional(),
});
export type PartnerLeadInput = z.infer<typeof partnerLeadInput>;

export const contributorRank = z.object({
  deviceId: uuid,
  placesCount: z.number().int(),
  reportsCount: z.number().int(),
  confirmsCount: z.number().int(),
  score: z.number().int(),
  rank: z.number().int(),
  total: z.number().int(),
});
export type ContributorRank = z.infer<typeof contributorRank>;

/* ------------------------------------------------------------------ */
/* Evenements temps reel                                               */
/* ------------------------------------------------------------------ */

export type RealtimeEvent =
  | { type: 'report:new'; report: Report }
  | { type: 'report:updated'; report: Report }
  | { type: 'report:removed'; reportId: string };
