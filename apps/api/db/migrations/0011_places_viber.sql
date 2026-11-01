-- Viber sur les fiches de lieu (demande du 2 novembre)
--
-- POURQUOI VIBER A COTE DE WHATSAPP. Le client demande que les fiches VIP affichent les deux.
-- Ce n'est pas une redondance : en Algerie, Viber reste tres utilise pour les appels vers
-- l'etranger, la ou WhatsApp domine les echanges du quotidien. Un commercant qui donne les
-- deux numeros ne vise pas la meme clientele avec chacun.
--
-- LE CHAMP EXISTAIT DEJA SUR LES OFFRES D'EMPLOI (migration 0006) et nulle part ailleurs. On
-- reprend donc exactement son type, `text` sans contrainte : un numero Viber s'ecrit comme un
-- numero de telephone, avec ou sans indicatif, et la validation se fait a l'entree — la base
-- n'a pas a refuser un format que l'API accepte.
--
-- IL N'EST PAS RESERVE AUX FICHES VIP, et c'est voulu. Le reserver demanderait une contrainte
-- liee a `is_vip`, donc une regle a maintenir des deux cotes ; or une fiche ordinaire qui
-- porte un numero Viber ne gene personne, et une fiche qui PERD son statut VIP n'aurait aucune
-- raison de perdre le numero de son proprietaire. Ce sont les fiches VIP qui le remplissent,
-- pas la base qui l'impose.

BEGIN;

ALTER TABLE places ADD COLUMN IF NOT EXISTS viber text;

COMMIT;
