-- Module Emploi : trois formules, deux durees (doc 196 v2.0, 29 octobre 2026)
--
--   ESSENTIEL   500 DA / semaine   1 500 DA / mois    50 km
--   STANDARD  1 000 DA / semaine   3 000 DA / mois   100 km   badge MIS EN AVANT
--   PREMIUM   1 500 DA / semaine   5 000 DA / mois   Algerie entiere, en tete de liste
--
-- LE RAYON EST UNE COLONNE CALCULEE, ET C'EST LE POINT IMPORTANT DE CETTE MIGRATION.
--
-- Il aurait ete plus simple de le stocker a cote de la formule et de le remplir a l'insertion.
-- C'est exactement ainsi qu'on fabrique une divergence : il aurait suffi d'un changement de
-- formule par l'administrateur, ou d'une route d'API qui oublie de recalculer, pour qu'une
-- annonce Essentiel garde une portee Premium — et personne ne l'aurait vu, puisque rien a
-- l'ecran ne montre le rayon d'une annonce.
--
-- `GENERATED ALWAYS AS ... STORED` rend la chose impossible : PostgreSQL recalcule la portee a
-- chaque ecriture de `formule`, et refuse qu'on l'ecrive a la main. La formule est la seule
-- chose qu'on choisit ; le rayon n'est plus une donnee, c'est une consequence.
--
-- NULL veut dire ALGERIE ENTIERE : aucune limite de distance, et non pas un rayon inconnu.
-- Le serveur le traduit par l'absence de condition geographique.

BEGIN;

ALTER TABLE job_offers
  ADD COLUMN IF NOT EXISTS formule text NOT NULL DEFAULT 'essentiel'
    CHECK (formule IN ('essentiel', 'standard', 'premium')),
  ADD COLUMN IF NOT EXISTS duree text NOT NULL DEFAULT 'mois'
    CHECK (duree IN ('semaine', 'mois'));

ALTER TABLE job_offers
  ADD COLUMN IF NOT EXISTS portee_m integer
    GENERATED ALWAYS AS (
      CASE formule
        WHEN 'premium' THEN NULL
        WHEN 'standard' THEN 100000
        ELSE 50000
      END
    ) STORED;

-- Les annonces deja deposees l'ont ete au tarif unique de 1 500 DA pour 30 jours et 50 km,
-- ce qui est trait pour trait la formule ESSENTIEL au mois. Les valeurs par defaut ci-dessus
-- les y rangent donc exactement : aucun employeur ne gagne ni ne perd de visibilite.

-- Les annonces PREMIUM remontent en tete de liste : l'index porte donc la formule, pour que le
-- tri ne relise pas la table entiere quand elles seront nombreuses.
CREATE INDEX IF NOT EXISTS job_offers_actives_formule_idx
  ON job_offers (formule, expires_at)
  WHERE status = 'active';

COMMIT;
