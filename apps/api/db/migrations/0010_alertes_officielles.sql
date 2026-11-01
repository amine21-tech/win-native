-- Alertes officielles : vigilance foret, vigilance meteo, fetes et commemorations
-- (cahier des charges du 1er novembre 2026)
--
-- UNE SEULE TABLE POUR LES TROIS TYPES, ET C'EST VOULU. Une vigilance foret, une vigilance
-- meteo et une fete du 1er novembre n'ont pas les memes champs — la meteo seule a des
-- phenomenes, la fete seule a un identifiant de catalogue. La tentation serait trois tables.
--
-- Mais ce que l'application demande, c'est << qu'est-ce qui est actif en ce moment ? >>, et
-- cette question-la ne connait pas les types : elle veut UNE liste, ordonnee, en une requete,
-- a l'ouverture de l'application, en moins de six secondes. Trois tables donneraient trois
-- requetes a reunir, et surtout trois endroits ou oublier de filtrer les expirees.
--
-- Les champs inutilises restent donc NULL, ce qui se lit tres bien : une ligne 'event' sans
-- phenomene n'est pas une ligne incomplete, c'est une fete.
--
-- LES QUATORZE LIGNES SONT CREEES VIDES ET NE SONT JAMAIS SUPPRIMEES. Deux vigilances et
-- douze fetes : le catalogue est fixe, seul `active` bouge. Le panneau administrateur a
-- besoin de montrer les douze fetes ETEINTES — une table ou l'on inserait a l'activation ne
-- saurait pas quoi afficher avant la premiere activation.
--
-- TOUTES ETEINTES AU DEPART. C'est la regle la plus importante du cahier des charges : rien
-- ne s'affiche chez personne tant que le fondateur n'a rien allume. Une migration qui
-- activerait quoi que ce soit ferait apparaitre une banniere chez tous les utilisateurs au
-- redemarrage du serveur.

BEGIN;

CREATE TABLE IF NOT EXISTS alertes_officielles (
  -- 'fire' et 'weather' : une seule ligne chacun. 'event' : une ligne par fete du catalogue.
  type text NOT NULL CHECK (type IN ('fire', 'weather', 'event')),

  -- Identifiant du catalogue pour les fetes ('nov1', 'fitr'...), chaine vide pour les deux
  -- vigilances. Chaine vide et non NULL : une cle primaire ne supporte pas le NULL, et on veut
  -- que la base elle-meme interdise deux lignes 'fire'.
  id text NOT NULL DEFAULT '',

  active boolean NOT NULL DEFAULT false,

  -- Meteo seulement : 'rain', 'wind', 'sand'. Au moins un pour pouvoir activer — la regle est
  -- appliquee par l'API, qui peut l'expliquer, et non par une contrainte qui dirait seulement
  -- << violation >>.
  phenomena text[] NOT NULL DEFAULT '{}',

  -- Vigilances seulement. Tableau VIDE = toute l'Algerie, et non pas << aucune zone >>.
  wilayas text[] NOT NULL DEFAULT '{}',

  -- Texte reecrit par le fondateur, par langue. NULL = le texte standard du cahier des
  -- charges, ecrit dans l'application : il suit alors la langue choisie par l'utilisateur
  -- sans que le serveur ait a connaitre les cinq traductions.
  message jsonb,

  -- Arret automatique. NULL = pas d'arret. C'est une DATE et non un horodatage : l'arret vaut
  -- pour la fin de la journee indiquee, pas pour l'instant ou on l'a ecrite.
  until date,

  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Qui a change quoi, et quand. Le cahier des charges le propose (amelioration E) parce que
  -- le code a quatre chiffres peut etre partage : sans cela, on ne saurait pas qui a allume.
  updated_by text,

  PRIMARY KEY (type, id)
);

-- L'application ne demande que les actives, plusieurs fois par jour, a chaque ouverture.
CREATE INDEX IF NOT EXISTS alertes_officielles_actives_idx
  ON alertes_officielles (type) WHERE active;

-- Les deux vigilances.
INSERT INTO alertes_officielles (type, id) VALUES ('fire', ''), ('weather', '')
  ON CONFLICT (type, id) DO NOTHING;

-- Les douze fetes du catalogue, dans l'ordre du tableau du client. Les identifiants sont ceux
-- de packages/shared/src/alertes.ts : les deux listes doivent rester identiques, et
-- verifier-alertes-officielles.ts echoue si elles divergent.
INSERT INTO alertes_officielles (type, id) VALUES
  ('event', 'chahid'),
  ('event', 'victoire'),
  ('event', 'memoire'),
  ('event', 'jul5'),
  ('event', 'soummam'),
  ('event', 'emigration'),
  ('event', 'nov1'),
  ('event', 'fitr'),
  ('event', 'adha'),
  ('event', 'mawlid'),
  ('event', 'moharram'),
  ('event', 'achoura')
  ON CONFLICT (type, id) DO NOTHING;

-- JOURNAL DES ACTIVATIONS (amelioration E du cahier des charges).
--
-- POURQUOI IL N'EST PAS FACULTATIF. Le code a quatre chiffres est unique et le fondateur peut
-- le donner a un administrateur. Le jour ou une banniere apparait sans que personne ne
-- reconnaisse l'avoir allumee, c'est la seule chose qui permettra de repondre — et il sera
-- trop tard pour commencer a journaliser.
CREATE TABLE IF NOT EXISTS alertes_journal (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  alerte_id text NOT NULL DEFAULT '',
  active boolean NOT NULL,
  wilayas text[] NOT NULL DEFAULT '{}',
  phenomena text[] NOT NULL DEFAULT '{}',
  -- Adresse de l'appareil qui a publie. Pas d'identite : il n'y a qu'un code, partage.
  ip text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alertes_journal_at_idx ON alertes_journal (at DESC);

COMMIT;
