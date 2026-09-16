-- ---------------------------------------------------------------------------
-- WIN — compte de reception des paiements (chantier "deblocage Tunisie")
--
-- Premiere brique du systeme de paiement qui remplace le mecanisme jamais
-- termine de la v83 (numero Baridimob et backend restes a l'etat de
-- placeholder "A COMPLETER" dans son code source). Un administrateur (compte
-- reel, jamais un code partage) indique ici le compte CCP ou bancaire sur
-- lequel les deblocages Tunisie doivent etre verses. Le paiement en ligne
-- lui-meme (fournisseur a confirmer) viendra ensuite s'appuyer dessus.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payout_accounts (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type           text NOT NULL CHECK (type IN ('ccp', 'bank')),
  account_number text NOT NULL,
  holder_name    text NOT NULL,
  updated_by     uuid REFERENCES admins(id),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Deblocages de la navigation transfrontaliere : un par appareil et par pays
-- cible. Le fournisseur de paiement n'etant pas encore choisi, les colonnes
-- restent generiques (provider/reference/status) plutot que specifiques a
-- une API precise.
CREATE TABLE IF NOT EXISTS country_unlocks (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id          uuid NOT NULL REFERENCES devices(id),
  country            text NOT NULL CHECK (country IN ('TN')),
  amount_da          integer NOT NULL,
  payment_provider   text,
  provider_reference text,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz,
  UNIQUE (device_id, country, status)
);
