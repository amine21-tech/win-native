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
  email: z.string().nullable(),
  enseigne: z.string().nullable(),
  promo: z.string().nullable(),
  isPartner: z.boolean(),
  photos: z.array(placePhoto),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Place = z.infer<typeof place>;

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
  email: z.string().email().optional(),
  enseigne: z.string().trim().max(160).optional(),
  promo: z.string().trim().max(280).optional(),
  photoIds: z.array(uuid).max(6).optional(),
  /** Code du service VIP. Present et exact : le lieu est enregistre comme partenaire VIP.
   * Verifie UNIQUEMENT par le serveur — l'application ne le connait pas. */
  vipCode: z.string().trim().min(1).max(32).optional(),
});
export type CreatePlaceInput = z.infer<typeof createPlaceInput>;

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
});
export type CreateReportInput = z.infer<typeof createReportInput>;

export const voteReportInput = z.object({
  vote: z.enum(['confirm', 'absent']),
});
export type VoteReportInput = z.infer<typeof voteReportInput>;

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

