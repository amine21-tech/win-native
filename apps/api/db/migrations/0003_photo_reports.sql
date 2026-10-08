-- ---------------------------------------------------------------------------
-- WIN — signalement d'une photo incorrecte
--
-- Une photo de lieu est publiee par un contributeur et vue par tous. Jusqu'ici,
-- rien ne permettait de dire qu'elle montrait la mauvaise facade, le mauvais
-- endroit, ou qu'elle etait inexploitable : il fallait nous ecrire. Le
-- signalement arrive desormais au tableau de bord, comme les corrections
-- d'adresse, et un moderateur tranche.
--
-- La photo n'est PAS retiree automatiquement, meme apres plusieurs
-- signalements : une photo exacte qui deplait se ferait effacer par quelques
-- clics mal intentionnes. La decision reste humaine.
--
-- `ON DELETE CASCADE` sur la photo : si elle disparait, le signalement n'a plus
-- d'objet. Sur l'appareil, en revanche, `SET NULL` — un signalement garde sa
-- valeur meme quand son auteur a desinstalle l'application.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS photo_reports (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_id   uuid NOT NULL REFERENCES place_photos(id) ON DELETE CASCADE,
  place_id   uuid REFERENCES places(id) ON DELETE CASCADE,
  -- 'wrong_place' | 'wrong_facade' | 'poor_quality' | 'inappropriate' | 'other'
  reason     text NOT NULL,
  message    text,
  device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
  -- 'pending' | 'accepted' | 'rejected'
  status     text NOT NULL DEFAULT 'pending',
  handled_by uuid REFERENCES admins(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Le tableau de bord ouvre toujours sur les signalements en attente, du plus
-- recent au plus ancien : c'est cet ordre que l'index sert.
CREATE INDEX IF NOT EXISTS photo_reports_status_idx ON photo_reports (status, created_at DESC);

-- Un meme appareil ne signale qu'une fois la meme photo. Sans cette contrainte,
-- un seul utilisateur pourrait faire monter un compteur a lui tout seul.
CREATE UNIQUE INDEX IF NOT EXISTS photo_reports_once ON photo_reports (photo_id, device_id);
