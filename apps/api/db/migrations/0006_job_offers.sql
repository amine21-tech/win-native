-- ---------------------------------------------------------------------------
-- WIN — Module Emploi : offres geolocalisees dans un rayon de 50 km
--
-- Demande du client du 27 octobre 2026, point 11, classee V2 dans son propre
-- document. Un employeur publie une annonce payante (1 500 DA, 30 jours) ;
-- les conducteurs voient celles qui sont autour d'eux et contactent
-- directement par telephone, WhatsApp, Viber ou courriel.
--
-- POURQUOI UNE ANNONCE N'EST PAS VISIBLE DES SA CREATION.
--
-- Le paiement se fait HORS de l'application — virement CCP/CPA/BNA/BEA, ou
-- BaridiMob — exactement comme le deblocage de la Tunisie (voir
-- 0002_country_unlock_requests.sql). Personne ne peut donc verifier
-- automatiquement qu'une annonce a ete payee : un administrateur rapproche le
-- versement recu et l'active. Une annonce vit donc trois etats, et l'ordre
-- compte : `pending` tant que rien n'est verse, `active` une fois le paiement
-- constate, `rejected` si le versement n'arrive jamais.
--
-- L'EXPIRATION EST UNE DATE, PAS UN DRAPEAU. Trente jours apres l'activation,
-- l'annonce cesse d'etre servie sans que rien n'ait a passer la nettoyer : la
-- requete de lecture compare simplement `expires_at` a l'heure courante. Un
-- drapeau aurait demande une tache de fond, et une tache de fond qui ne tourne
-- pas laisse des annonces mortes a l'ecran.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_offers (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Les sept secteurs de la maquette. Liste FERMEE : un secteur inconnu
  -- n'aurait ni pictogramme ni filtre, et l'annonce serait invisible.
  sector         text NOT NULL CHECK (sector IN (
                   'btp', 'commerce', 'transport', 'restauration',
                   'industrie', 'bureaux', 'services')),

  title          text NOT NULL,
  company        text,
  contract       text NOT NULL DEFAULT 'cdi' CHECK (contract IN ('cdi', 'cdd', 'mission')),
  -- Salaire libre : « 45 000 DA », « a negocier », « selon profil ». Un entier
  -- aurait oblige a mentir quand le montant n'est pas fixe, ce qui est le cas
  -- le plus courant des annonces algeriennes.
  salary         text,
  description    text,

  -- CONTACT : le telephone est obligatoire, les trois autres facultatifs.
  -- C'est la regle du client, et elle correspond a l'usage : une annonce sans
  -- numero ne sert a personne, un employeur sans Viber reste joignable.
  phone          text NOT NULL,
  whatsapp       text,
  viber          text,
  email          text,

  -- Position de l'employeur. C'est d'elle que part le rayon de 50 km, pas de
  -- la wilaya : deux communes voisines de wilayas differentes sont proches, et
  -- deux communes d'une meme wilaya peuvent etre a 200 km.
  geom           geography(Point, 4326) NOT NULL,
  wilaya         text,

  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'rejected')),
  -- Ce que l'employeur declare avoir verse, pour que l'administrateur puisse
  -- rapprocher. Jamais un numero de compte : voir la note ci-dessous.
  payment_method text CHECK (payment_method IN ('baridimob', 'virement', 'email')),
  payment_ref    text,

  created_by     uuid REFERENCES devices(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  activated_by   uuid REFERENCES admins(id) ON DELETE SET NULL,
  activated_at   timestamptz,
  expires_at     timestamptz
);

-- La lecture est TOUJOURS la meme : les annonces actives, non expirees, triees
-- par distance a l'utilisateur. L'index geographique porte donc exactement sur
-- ce sous-ensemble et reste petit meme quand la table aura des annees.
CREATE INDEX IF NOT EXISTS job_offers_actives_idx
  ON job_offers USING GIST (geom)
  WHERE status = 'active';

-- L'espace admin liste ce qui attend une verification de paiement.
CREATE INDEX IF NOT EXISTS job_offers_attente_idx
  ON job_offers (created_at DESC)
  WHERE status = 'pending';

-- Le filtre par secteur s'applique apres le rayon : index combine.
CREATE INDEX IF NOT EXISTS job_offers_secteur_idx
  ON job_offers (sector)
  WHERE status = 'active';
