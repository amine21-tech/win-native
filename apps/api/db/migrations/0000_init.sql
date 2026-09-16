-- ---------------------------------------------------------------------------
-- WIN — schema initial
--
-- Remplace les sept fichiers JSON de l'ancien backend. Chaque table porte en
-- commentaire le fichier dont elle prend la suite, pour que la migration reste
-- lisible dans six mois.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Recherche insensible aux accents ET utilisable dans un index :
-- unaccent() est STABLE, on l'enveloppe dans une fonction IMMUTABLE.
CREATE OR REPLACE FUNCTION win_normalize(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT lower(public.unaccent('public.unaccent', coalesce(txt, ''))) $$;

-- ---------------------------------------------------------------------------
-- Identites
-- ---------------------------------------------------------------------------

-- Un appareil = un contributeur anonyme. Remplace la cle localStorage win_uid,
-- qui etait en clair et donc falsifiable.
CREATE TABLE IF NOT EXISTS devices (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform     text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  app_version  text,
  language     text,
  legacy_uid   text UNIQUE,           -- ancien win_uid, pour rattacher l'historique
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  blocked      boolean NOT NULL DEFAULT false
);

-- Remplace le code admin 1154 code en dur dans index.html et la cle
-- ADMIN_KEY restee a sa valeur d'exemple.
CREATE TABLE IF NOT EXISTS admins (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Lieux  (ex addresses.json + partie partenaires de partners.json)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS places (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'autre',
  geom          geography(Point, 4326) NOT NULL,
  house_number  text,
  street        text,
  city          text,
  postal_code   text,
  wilaya        text,
  country       text NOT NULL DEFAULT 'DZ' CHECK (country IN ('DZ', 'TN', 'FR')),
  phone_fixe    text,
  phone_mobile  text,
  whatsapp      text,
  email         text,
  enseigne      text,
  promo         text,
  is_partner    boolean NOT NULL DEFAULT false,
  partner_id    uuid,
  status        text NOT NULL DEFAULT 'published'
                  CHECK (status IN ('published', 'pending', 'hidden')),
  created_by    uuid REFERENCES devices(id) ON DELETE SET NULL,
  legacy_id     text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- La requete « adresses dans un rayon » passait par une lecture integrale du
-- fichier JSON. Ici c'est un index.
CREATE INDEX IF NOT EXISTS places_geom_idx ON places USING gist (geom);
CREATE INDEX IF NOT EXISTS places_name_trgm_idx
  ON places USING gin (win_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS places_city_trgm_idx
  ON places USING gin (win_normalize(city) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS places_live_idx ON places (status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS place_photos (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id   uuid REFERENCES places(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  thumb_key  text,
  width      integer,
  height     integer,
  bytes      integer,
  credit     text,
  position   integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES devices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS place_photos_place_idx ON place_photos (place_id, position);

-- ---------------------------------------------------------------------------
-- Partenaires VIP  (ex partners.json, vide en production : les deux pharmacies
-- visibles dans l'app etaient codees en dur dans index.html)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS partners (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text NOT NULL,
  tier         text NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'premium')),
  contact_name text,
  phone        text,
  email        text,
  starts_on    date,
  ends_on      date,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'declassed', 'expired')),
  declassed_at timestamptz,
  declassed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  legacy_id    text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE places
  DROP CONSTRAINT IF EXISTS places_partner_fk,
  ADD CONSTRAINT places_partner_fk
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Signalements  (ex signalements-permanents.json + alertes locales)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind        text NOT NULL,
  permanent   boolean NOT NULL DEFAULT false,
  geom        geography(Point, 4326) NOT NULL,
  heading     double precision,
  speed_limit integer,
  created_by  uuid REFERENCES devices(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'removed', 'expired')),
  removed_at  timestamptz,
  expires_at  timestamptz,
  legacy_id   text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_geom_idx ON reports USING gist (geom);
CREATE INDEX IF NOT EXISTS reports_active_idx ON reports (status, kind) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS reports_expiry_idx ON reports (expires_at) WHERE status = 'active';

-- Un vote = une ligne. Dans la v82 c'etait un simple compteur, donc
-- impossible a auditer et impossible a annuler.
CREATE TABLE IF NOT EXISTS report_votes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  device_id  uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  vote       text NOT NULL CHECK (vote IN ('confirm', 'absent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, device_id, vote)
);
CREATE INDEX IF NOT EXISTS report_votes_report_idx ON report_votes (report_id, vote);

-- ---------------------------------------------------------------------------
-- Contributions et moderation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS corrections (            -- ex address-corrections.json
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id    uuid REFERENCES places(id) ON DELETE SET NULL,
  geom        geography(Point, 4326),
  message     text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected')),
  device_id   uuid REFERENCES devices(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  legacy_id   text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS corrections_status_idx ON corrections (status, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_leads (          -- ex partner-suggestions.json
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL,
  phone      text,
  email      text,
  city       text,
  message    text,
  status     text NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'contacted', 'converted', 'rejected')),
  device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
  legacy_id  text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moderation_log (         -- ex moderation-log.json
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type text NOT NULL,
  entity_id   uuid,
  action      text NOT NULL,
  before      jsonb,
  after       jsonb,
  admin_id    uuid REFERENCES admins(id) ON DELETE SET NULL,
  device_id   uuid REFERENCES devices(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_log_entity_idx ON moderation_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS moderation_log_date_idx ON moderation_log (created_at DESC);

CREATE TABLE IF NOT EXISTS contributors (           -- ex contributors.json
  device_id      uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  places_count   integer NOT NULL DEFAULT 0,
  reports_count  integer NOT NULL DEFAULT 0,
  confirms_count integer NOT NULL DEFAULT 0,
  score          integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contributors_score_idx ON contributors (score DESC);

-- ---------------------------------------------------------------------------
-- Tenue a jour de updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION win_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS places_touch ON places;
CREATE TRIGGER places_touch BEFORE UPDATE ON places
  FOR EACH ROW EXECUTE FUNCTION win_touch_updated_at();

DROP TRIGGER IF EXISTS reports_touch ON reports;
CREATE TRIGGER reports_touch BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION win_touch_updated_at();

DROP TRIGGER IF EXISTS partners_touch ON partners;
CREATE TRIGGER partners_touch BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION win_touch_updated_at();
