-- ---------------------------------------------------------------------------
-- WIN — l'enregistrement de lieux devient reserve aux contributeurs
--
-- Jusqu'ici, n'importe quel utilisateur pouvait creer une fiche. Le client a
-- tranche autrement, et il a raison : la qualite d'une carte depend de qui
-- peut y ecrire. Un lieu mal nomme, mal orthographie ou mal place reste des
-- mois sur la carte et se voit par tout le monde.
--
-- Le droit est porte par l'APPAREIL, et non par le code qui l'a ouvert. La
-- difference compte : un code finit toujours par circuler, et sans cette
-- colonne il n'y aurait aucun moyen de retirer le droit a celui qui en abuse
-- sans le retirer a tout le monde en changeant le code.
--
-- `granted_at` sert aux deux questions qu'on se posera un jour : depuis quand
-- cette personne contribue-t-elle, et qui a ete promu le mois dernier.
-- ---------------------------------------------------------------------------

ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_contributor      boolean NOT NULL DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS contributor_granted_at timestamptz;

-- Le tableau de bord liste les contributeurs du plus recent au plus ancien.
CREATE INDEX IF NOT EXISTS devices_contributor_idx
  ON devices (contributor_granted_at DESC)
  WHERE is_contributor;
