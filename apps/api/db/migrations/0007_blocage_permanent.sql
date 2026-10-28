-- Route bloquee : duree indeterminee (point 12 du client, 28 octobre 2026)
--
-- POURQUOI CETTE MIGRATION EXISTE. Le changement de duree de vie est dans le code
-- (PERMANENT_KINDS, TEMPORARY_TTL_MINUTES), mais le code ne regarde `expires_at` qu'a la
-- CREATION : les blocages deja en base gardent l'echeance de quatre heures qu'ils ont recue au
-- depot. Sans cette migration, les routes bloquees signalees avant la mise a jour continueraient
-- a s'effacer toutes seules — exactement le defaut que le client decrit apres son test terrain
-- du 28 octobre, entre Tizi Ouzou et Draa El Mizan.
--
-- On ne touche QUE les blocages encore actifs. Ceux qui sont deja expires ou retires restent
-- tels quels : les ressusciter reouvrirait des signalements que plus personne ne confirme, et
-- l'historique doit rester lisible.

BEGIN;

UPDATE reports
   SET permanent  = true,
       expires_at = NULL
 WHERE kind = 'block'
   AND status = 'active'
   AND (expires_at IS NULL OR expires_at > now());

-- Les blocages deja expires sont clos proprement, plutot que laisses en 'active' avec une
-- echeance passee : la lecture les excluait deja, mais un etat qui se contredit finit toujours
-- par surprendre quelqu'un.
UPDATE reports
   SET status     = 'removed',
       removed_at = COALESCE(removed_at, expires_at)
 WHERE kind = 'block'
   AND status = 'active'
   AND expires_at IS NOT NULL
   AND expires_at <= now();

COMMIT;
