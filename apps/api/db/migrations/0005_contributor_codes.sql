-- ---------------------------------------------------------------------------
-- WIN — un code de contributeur par personne, cree depuis l'espace admin
--
-- CE QUE CE CODE DONNE, ET CE QU'IL NE DONNE PLUS.
--
-- Il ouvrait autrefois le droit de corriger et de retirer une fiche. Le client
-- a ouvert ces deux gestes a tout le monde le 19 octobre 2026, puis a confirme
-- le 22 que le code ne devait plus etre qu'un TITRE : le badge
-- << contributeur >>, le nom au classement, le compteur de lieux. Rien de plus.
-- Personne n'est donc bloque par l'absence de code, et le revoquer ne retire
-- aucune capacite — seulement la reconnaissance.
--
-- POURQUOI UNE TABLE PLUTOT QU'UNE VARIABLE.
--
-- Il n'existait qu'UN code, ecrit dans le fichier de configuration du serveur.
-- Trois consequences : tout le monde partageait le meme, on ne savait pas qui
-- s'en etait servi, et le changer le retirait a tous d'un coup. Un code par
-- personne regle les trois — on sait a qui on l'a donne, qui l'a utilise et
-- quand, et on peut en retirer un seul.
--
-- CHAQUE CODE NE SERT QU'UNE FOIS. Il se lie au premier appareil qui le
-- presente. Un code qui circulerait ensuite ne promeut plus personne : c'est ce
-- qui distingue << donner un titre a quelqu'un >> de << publier un mot de
-- passe >>.
--
-- Le code lui-meme est garde en clair, et c'est assume : ce n'est pas un secret
-- d'authentification mais une invitation nominative, que l'administrateur doit
-- pouvoir relire pour la transmettre a la personne concernee.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contributor_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Le code remis a la personne. Unique : deux invitations ne peuvent pas se
  -- confondre, et la contrainte evite qu'un tirage au sort malchanceux ne
  -- fabrique un doublon silencieux.
  code         text NOT NULL UNIQUE,

  -- Pour qui. C'est la raison d'etre de la table : sans ce libelle on saurait
  -- qu'un code existe sans savoir a qui on l'a donne.
  label        text NOT NULL,

  created_by   uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- L'appareil qui s'en est servi, et quand. Vides tant que le code n'a pas
  -- ete presente.
  used_by      text REFERENCES devices(id) ON DELETE SET NULL,
  used_at      timestamptz,

  -- Revocation : on ne SUPPRIME pas une ligne, on la date. L'historique de qui
  -- a ete promu, par qui et jusqu'a quand est precisement ce qu'on voudra
  -- relire le jour ou une question se posera.
  revoked_at   timestamptz
);

-- L'espace admin liste les codes du plus recent au plus ancien.
CREATE INDEX IF NOT EXISTS contributor_codes_created_idx
  ON contributor_codes (created_at DESC);

-- La verification d'un code presente par un telephone cherche un code ACTIF et
-- JAMAIS UTILISE. L'index partiel ne porte que sur ceux-la : il reste minuscule
-- meme quand la table aura des annees.
CREATE INDEX IF NOT EXISTS contributor_codes_utilisables_idx
  ON contributor_codes (code)
  WHERE used_at IS NULL AND revoked_at IS NULL;
