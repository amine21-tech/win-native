import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Colonne PostGIS `geography(Point, 4326)`.
 *
 * En lecture on ne selectionne jamais la colonne brute : les routes passent par
 * ST_Y / ST_X pour recuperer lat et lon directement en nombres. Le type est
 * declare ici pour que Drizzle sache generer les comparaisons spatiales.
 */
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

/** Fabrique un point PostGIS a partir d'une latitude et d'une longitude. */
export const makePoint = (lat: number, lon: number) =>
  sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;

/* ------------------------------------------------------------------ */

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: text('platform').notNull(),
  appVersion: text('app_version'),
  language: text('language'),
  legacyUid: text('legacy_uid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  blocked: boolean('blocked').notNull().default(false),
});

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('moderator'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull().default('autre'),
  geom: geographyPoint('geom').notNull(),
  houseNumber: text('house_number'),
  street: text('street'),
  city: text('city'),
  postalCode: text('postal_code'),
  wilaya: text('wilaya'),
  country: text('country').notNull().default('DZ'),
  phoneFixe: text('phone_fixe'),
  phoneMobile: text('phone_mobile'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  enseigne: text('enseigne'),
  promo: text('promo'),
  isPartner: boolean('is_partner').notNull().default(false),
  partnerId: uuid('partner_id'),
  status: text('status').notNull().default('published'),
  createdBy: uuid('created_by'),
  legacyId: text('legacy_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const placePhotos = pgTable('place_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: uuid('place_id'),
  storageKey: text('storage_key').notNull(),
  thumbKey: text('thumb_key'),
  width: integer('width'),
  height: integer('height'),
  bytes: integer('bytes'),
  credit: text('credit'),
  position: integer('position').notNull().default(0),
  uploadedBy: uuid('uploaded_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const partners = pgTable('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tier: text('tier').notNull().default('standard'),
  contactName: text('contact_name'),
  phone: text('phone'),
  email: text('email'),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  status: text('status').notNull().default('active'),
  declassedAt: timestamp('declassed_at', { withTimezone: true }),
  declassedBy: uuid('declassed_by'),
  legacyId: text('legacy_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  permanent: boolean('permanent').notNull().default(false),
  geom: geographyPoint('geom').notNull(),
  heading: doublePrecision('heading'),
  speedLimit: integer('speed_limit'),
  createdBy: uuid('created_by'),
  status: text('status').notNull().default('active'),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  legacyId: text('legacy_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reportVotes = pgTable(
  'report_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id').notNull(),
    deviceId: uuid('device_id').notNull(),
    vote: text('vote').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    once: uniqueIndex('report_votes_once').on(t.reportId, t.deviceId, t.vote),
  }),
);

export const corrections = pgTable('corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: uuid('place_id'),
  geom: geographyPoint('geom'),
  message: text('message').notNull(),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('pending'),
  deviceId: uuid('device_id'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  legacyId: text('legacy_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const partnerLeads = pgTable('partner_leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  city: text('city'),
  message: text('message'),
  status: text('status').notNull().default('new'),
  deviceId: uuid('device_id'),
  legacyId: text('legacy_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const moderationLog = pgTable('moderation_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  action: text('action').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  adminId: uuid('admin_id'),
  deviceId: uuid('device_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contributors = pgTable('contributors', {
  deviceId: uuid('device_id').primaryKey(),
  placesCount: integer('places_count').notNull().default(0),
  reportsCount: integer('reports_count').notNull().default(0),
  confirmsCount: integer('confirms_count').notNull().default(0),
  score: integer('score').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
