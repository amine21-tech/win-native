-- FICHE VIP PREMIUM — synthese du 19 novembre 2026, M. Mansour.
--
-- Deux ajouts, et UNIQUEMENT des ajouts : le principe pose par le fondateur dans le document
-- est « ne rien casser ». Aucune colonne existante n'est touchee, aucune valeur par defaut ne
-- change pour les fiches deja en base, et un serveur plus ancien continuerait de tourner sur
-- ce schema sans rien remarquer.

-- 1. HORAIRES D'OUVERTURE (amelioration 4).
--
-- En JSONB et non dans une table dediee, parce que ces horaires ne sont jamais interroges :
-- on ne cherche pas « les commerces ouverts maintenant », on affiche les horaires DU lieu
-- qu'on regarde deja. Une table de sept lignes par fiche couterait une jointure sur chaque
-- recherche pour un gain nul. Le format est contrôle par le schema partage (`horaire`), qui
-- autorise plusieurs plages pour un meme jour — la coupure de midi.
ALTER TABLE places ADD COLUMN IF NOT EXISTS horaires jsonb;

COMMENT ON COLUMN places.horaires IS
  'Plages d''ouverture : [{jour:0..6 (0=dimanche), ouv:"08h00", ferm:"20h00"}]. Plusieurs plages par jour permises (coupure de midi). Une fermeture inferieure a l''ouverture franchit minuit.';

-- 2. AVIS (amelioration 5).
--
-- La note est AFFICHEE uniquement sur les fiches VIP, mais elle est STOCKEE pour tout le monde :
-- une fiche qui devient partenaire garde alors les avis deja deposes, au lieu de repartir de
-- zero le jour de l'abonnement. Le filtrage est une regle d'affichage, pas une regle de donnee.
CREATE TABLE IF NOT EXISTS place_reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id   uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  device_id  uuid,
  note       smallint NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- UN AVIS PAR TELEPHONE ET PAR LIEU. Sans cette contrainte, la note moyenne est decidee par
-- qui appuie le plus de fois, et le seuil de trois avis ne protege plus rien : un seul appareil
-- atteindrait trois avis en trois secondes. Le second depot du meme appareil REMPLACE le
-- premier (voir la route POST /places/:id/avis) : on change d'avis, on n'en ajoute pas un.
CREATE UNIQUE INDEX IF NOT EXISTS place_reviews_unique_device
  ON place_reviews (place_id, device_id)
  WHERE device_id IS NOT NULL;

-- La moyenne est lue a chaque affichage de fiche, toujours filtree sur un seul lieu.
CREATE INDEX IF NOT EXISTS place_reviews_place_idx ON place_reviews (place_id);
