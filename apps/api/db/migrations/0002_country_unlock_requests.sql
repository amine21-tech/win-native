-- ---------------------------------------------------------------------------
-- WIN — demandes de deblocage de la Tunisie (200 DA, acces a vie)
--
-- Le paiement se fait hors de l'application, par BaridiMob, vers le compte
-- enregistre dans payout_accounts. Le client saisit son numero de telephone,
-- qui sert de reference du virement ; un administrateur verifie la reception
-- puis valide la demande d'un clic. L'acces s'ouvre alors sur l'appareil.
--
-- Pas de code de deblocage a transmettre par SMS, contrairement a la v83 :
-- c'etait une etape manuelle de plus, et un code partage se revend.
-- ---------------------------------------------------------------------------

ALTER TABLE country_unlocks ADD COLUMN IF NOT EXISTS phone        text;
ALTER TABLE country_unlocks ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES admins(id);

CREATE INDEX IF NOT EXISTS country_unlocks_status_idx ON country_unlocks (status, created_at DESC);
