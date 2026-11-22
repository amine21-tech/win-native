-- ===========================================================================================
-- POINT H DU CORRECTIF v2 (22 novembre) — BLOCAGE AUTOMATIQUE, PUIS LEVEE AUTOMATIQUE.
--
-- La phase 1 du document existait aux trois quarts : deux temoins independants confirment un
-- blocage depuis le 28 octobre, et tout conducteur route par la recalcule en silence depuis le
-- 11 novembre. Cette migration apporte ce qui manquait :
--
--   1. la PREUVE DES 10 METRES, pour que compte seul le temoin qui a reellement roule la ;
--   2. la DATE DE CONFIRMATION, d'ou partent les sept ou trente jours de la phase 2 ;
--   3. les REPONSES a la question << cette route est-elle praticable ? >>.
--
-- RIEN N'EST SUPPRIME NI RENOMME : trois ajouts, et une table de plus. << NE PAS MODIFIER le
-- systeme de signalement existant — AJOUTER. >>
-- ===========================================================================================

-- 1. LA PREUVE DU PASSAGE.
--
-- Metres reellement parcourus par l'appareil juste avant le depot, mesures sur ses propres
-- positions GPS. NULL pour tout ce qui a ete depose avant cette version de l'application : une
-- preuve absente n'est pas une preuve refusee (voir `preuveVecue`), sans quoi la mise en ligne
-- du serveur desarmerait d'un coup tous les blocages des telephones pas encore mis a jour.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS parcourus_m real;

-- 1 bis. LA PREUVE DU PASSAGE SUIT AUSSI LE VOTE.
--
-- Un deuxieme conducteur qui appuie sur << route bloquee >> au meme endroit n'est pas enregistre
-- comme un second signalement : il est fusionne, a moins de quarante metres, en une
-- CONFIRMATION du premier. C'est pourtant lui le deuxieme temoin que la phase 1 attend. Sans
-- cette colonne, sa preuve serait jetee a l'instant precis ou elle compte.
ALTER TABLE report_votes ADD COLUMN IF NOT EXISTS parcourus_m real;

-- 2. L'INSTANT OU LE BLOCAGE A ETE CONFIRME.
--
-- C'est de cette date que partent les sept jours (travaux) ou les trente jours (chemin sans
-- issue) avant reouverture provisoire. Elle est REMISE A now() quand un conducteur repond
-- << non, ce n'est pas praticable >> : c'est ainsi que << 1 x Non -> re-bloque, delai repart >>
-- s'exprime, sans compteur de refus ni second chemin pour la meme situation.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS bloque_le timestamptz;

-- LES BLOCAGES DEJA EN BASE PRENNENT LEUR DATE DE DEPOT, et c'est le choix qui demande le plus
-- de reflexion de cette migration.
--
-- Laisser la colonne vide les aurait rendus eternels : `phaseBlocage` lit un depart absent
-- comme << bloque >>, donc aucun de ces blocages n'entrerait jamais en reouverture provisoire.
-- Or ce sont precisement eux que le point H vise — les signalements que personne n'est venu
-- lever parce que personne ne repasse par un cul-de-sac.
--
-- Avec leur date de depot, ceux qui ont plus de trente jours entrent en probation des la
-- premiere lecture : les deux prochains conducteurs seront interroges, et faute de reponse
-- sous quarante-huit heures le segment sera rendu a la circulation. C'est exactement ce que le
-- client demande, applique a l'existant.
UPDATE reports
   SET bloque_le = created_at
 WHERE bloque_le IS NULL
   AND kind IN ('block', 'works')
   AND status = 'active';

-- 3. LES REPONSES A LA QUESTION.
--
-- << Cette route est-elle praticable ? >> Oui / Non, posee en temps reel aux deux prochains
-- conducteurs qui empruntent le segment pendant sa reouverture provisoire.
CREATE TABLE IF NOT EXISTS report_praticable (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  device_id  uuid,
  praticable boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- UNE SEULE REPONSE PAR APPAREIL ET PAR SIGNALEMENT, POUR TOUJOURS.
--
-- << Maximum 1 question par utilisateur par evenement — jamais de relance. >> C'est la lecture
-- la plus stricte, et c'est la bonne : un appareil qui a repondu une fois ne sera plus jamais
-- interroge sur ce signalement, meme si le delai repart apres un << non >>. Une route coupee
-- est traversee par des dizaines de conducteurs ; il y aura toujours deux appareils qui n'ont
-- pas encore repondu, et jamais un conducteur qu'on harcele.
--
-- L'index porte aussi la garantie du compte : sans lui, un seul telephone debloquerait un
-- segment en repondant deux fois << oui >>.
CREATE UNIQUE INDEX IF NOT EXISTS report_praticable_once
  ON report_praticable (report_id, device_id)
  WHERE device_id IS NOT NULL;

-- Les reponses sont toujours lues pour un signalement a la fois, et bornees a celles qui
-- suivent `bloque_le` : l'index couvre les deux.
CREATE INDEX IF NOT EXISTS report_praticable_report_idx
  ON report_praticable (report_id, created_at);
