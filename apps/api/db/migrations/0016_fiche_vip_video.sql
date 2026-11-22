-- LA VIDEO DE PRESENTATION D'UNE FICHE VIP — document du 24 novembre, priorite 2.
--
--   « 1 VIDEO 30 SECONDES MAX — enregistree en direct OU importee depuis la galerie, duree
--   maximum stricte : 30 secondes. »
--
-- UNIQUEMENT UN AJOUT, comme pour les horaires et les avis : le principe pose par le fondateur
-- est « ne rien casser ». Aucune colonne existante n'est touchee, et un serveur plus ancien
-- continuerait de tourner sur ce schema sans rien remarquer — il ignorerait simplement cette
-- table.

-- UNE TABLE, ET NON UNE COLONNE `video_key` SUR `places`, pour une raison de calendrier : la
-- video est envoyee AVANT que le lieu n'existe. Le formulaire d'ajout televerse pendant que le
-- contributeur finit de taper le nom, et le lieu n'est cree qu'a l'appui final — c'est deja
-- exactement ce que fait `place_photos`, et pour la meme raison. Une colonne obligerait a
-- creer le lieu d'abord, donc a laisser des fiches a moitie saisies en base quand quelqu'un
-- abandonne.
CREATE TABLE IF NOT EXISTS place_videos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL tant que la video n'est rattachee a aucun lieu : elle vient d'etre envoyee.
  place_id    uuid REFERENCES places(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  bytes       integer,
  -- Duree annoncee par le telephone, en secondes. Indicative : elle sert a expliquer un refus
  -- ou a afficher « 0:28 », jamais a decider seule — c'est l'application qui borne a 30 s a la
  -- prise de vue, et le serveur qui borne le POIDS a l'envoi.
  duree_s     numeric(5, 2),
  uploaded_by uuid REFERENCES devices(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- UNE SEULE VIDEO PAR LIEU, et c'est la base qui le garantit — pas la route.
--
-- Le document dit « 1 video ». Sans cet index, une fiche corrigee trois fois porterait trois
-- videos : la fiche en afficherait une au hasard (celle que la jointure renvoie en premier) et
-- les deux autres occuperaient le disque pour toujours, invisibles. La route remplace donc
-- explicitement l'ancienne video, et cet index est le filet qui le prouve.
--
-- Partiel sur `place_id IS NOT NULL` : les videos en attente de rattachement sont toutes a
-- NULL, et un index complet les ferait se refuser l'une l'autre.
CREATE UNIQUE INDEX IF NOT EXISTS place_videos_un_par_lieu
  ON place_videos (place_id)
  WHERE place_id IS NOT NULL;
