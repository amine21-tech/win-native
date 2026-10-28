-- Module Emploi : douze secteurs au lieu de sept (doc 196 v2.0, 29 octobre 2026)
--
-- La liste du client compte treize lignes, mais la premiere est << Tous >> : c'est le filtre
-- par defaut de l'ecran, pas un secteur. Douze secteurs reels, donc.
--
-- CE QUI DISPARAIT : << bureaux >>. Il n'existe pas dans la liste du client, et aucun de ses
-- douze ne le recouvre exactement. Les annonces deja deposees sous ce secteur basculent vers
-- << services >>, le plus proche : un poste de bureau est un service, la ou le classer sous
-- l'industrie ou le commerce serait franchement faux. Aucune annonce n'est perdue.
--
-- L'ORDRE DE CES DEUX OPERATIONS N'EST PAS INDIFFERENT. La contrainte est retiree AVANT la
-- bascule des lignes : l'inverse ferait echouer l'UPDATE sur l'ancienne contrainte, qui
-- n'autorise pas encore les nouveaux secteurs — et la transaction entiere serait annulee.

BEGIN;

ALTER TABLE job_offers DROP CONSTRAINT IF EXISTS job_offers_sector_check;

UPDATE job_offers SET sector = 'services' WHERE sector = 'bureaux';

ALTER TABLE job_offers
  ADD CONSTRAINT job_offers_sector_check
  CHECK (sector IN (
    'btp',            -- Batiment & Travaux Publics
    'commerce',       -- Commerce & Vente
    'transport',      -- Transport & Logistique
    'restauration',   -- Restauration & Hotellerie
    'agriculture',    -- Agriculture & Agroalimentaire
    'sante',          -- Sante & Paramedical
    'informatique',   -- Informatique & Telecoms
    'industrie',      -- Industrie & Mecanique
    'securite',       -- Securite & Gardiennage
    'artisanat',      -- Artisanat & Metiers manuels
    'education',      -- Education & Formation
    'services'        -- Services / Menage & Aide a domicile
  ));

-- INTERIM ET SAISONNIER rejoignent les types de contrat (doc 196, 5.2).
--
-- << mission >> est conserve : des annonces le portent deja, et le retirer de la contrainte
-- ferait echouer la migration elle-meme sur ces lignes. Il reste accepte en base sans etre
-- propose a la saisie — l'ancien et le nouveau coexistent sans qu'aucune donnee ne se perde.
ALTER TABLE job_offers DROP CONSTRAINT IF EXISTS job_offers_contract_check;

ALTER TABLE job_offers
  ADD CONSTRAINT job_offers_contract_check
  CHECK (contract IN ('cdi', 'cdd', 'interim', 'saisonnier', 'mission'));

COMMIT;
