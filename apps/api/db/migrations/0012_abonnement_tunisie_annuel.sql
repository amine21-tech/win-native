-- ABONNEMENT TUNISIE : 200 DA PAR AN, ET NON PLUS A VIE
--
-- Correctif du 8 novembre, point 9 : << Tap sur TN -> affiche un cadre d'abonnement : 200 DA/an,
-- paiement CIB ou BaridiMob >>. Le deblocage etait un paiement UNIQUE donnant un acces illimite
-- a vie, et c'est ce que le panneau de paiement annonce depuis le debut.

-- 1. L'ECHEANCE -----------------------------------------------------------------------------
--
-- `expires_at` NULL VEUT DIRE << A VIE >>, ET C'EST DELIBERE.
--
-- Les clients qui ont deja paye l'ont fait pour un acces a vie : c'est le texte qu'ils ont lu
-- avant de virer l'argent. Leur poser une date d'expiration revient a leur retirer ce qu'ils ont
-- achete, et aucune consigne de ce document ne demande cela — il decrit la nouvelle offre, pas
-- une renegociation des anciennes. Les lignes existantes gardent donc NULL, et seuls les
-- paiements valides A PARTIR DE MAINTENANT recoivent une echeance.
--
-- Cette migration AJOUTE une colonne vide et ne touche a aucune ligne. Un `UPDATE` qui aurait
-- pose `now() + 1 an` sur les abonnements existants aurait transforme un acces a vie en acces
-- d'un an, de facon irreversible.

ALTER TABLE country_unlocks ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN country_unlocks.expires_at IS
  'Fin de l''abonnement. NULL = acces a vie (clients d''avant le 8 novembre 2025).';

-- 2. LA CONTRAINTE QUI EMPECHAIT LE RENOUVELLEMENT -------------------------------------------
--
-- CECI EST LA VRAIE DIFFICULTE DE CE POINT, et elle ne se voit pas en lisant le document.
--
-- La table portait `UNIQUE (device_id, country, status)` : un appareil ne pouvait avoir qu'UNE
-- ligne par etat. C'etait juste tant qu'un paiement valait a vie — il n'y avait jamais qu'un
-- abonnement par appareil, et jamais de second.
--
-- Avec un abonnement annuel, il y en a un par an. Le deuxieme paiement valide aurait heurte
-- cette contrainte, et il aurait echoue de la pire facon : l'administrateur voit une erreur de
-- base de donnees, le client a deja vire son argent, et personne ne comprend. Le defaut ne se
-- serait manifeste qu'un AN apres la mise en service.
--
-- On garde donc l'unicite uniquement la ou elle a un sens : UNE SEULE DEMANDE EN ATTENTE par
-- appareil. Les lignes payees, elles, s'empilent — et c'est ce qu'on veut : elles deviennent
-- l'historique des paiements recus, que `expirationFor` lit en prenant la plus lointaine.
--
-- L'index est PARTIEL (`WHERE status = 'pending'`), ce qui le rend aussi utilisable par le
-- `ON CONFLICT` de la route de demande : Postgres sait inferer un index partiel quand on lui
-- redonne son predicat.

ALTER TABLE country_unlocks
  DROP CONSTRAINT IF EXISTS country_unlocks_device_id_country_status_key;

CREATE UNIQUE INDEX IF NOT EXISTS country_unlocks_demande_unique_idx
  ON country_unlocks (device_id, country)
  WHERE status = 'pending';

-- 3. LES LECTURES ----------------------------------------------------------------------------
--
-- Toutes cherchent << cet appareil, ce pays, encore valide >>.

CREATE INDEX IF NOT EXISTS country_unlocks_validite_idx
  ON country_unlocks (device_id, country, status, expires_at);
