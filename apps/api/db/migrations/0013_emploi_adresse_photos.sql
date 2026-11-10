-- ---------------------------------------------------------------------------
-- MODULE EMPLOI : une ADRESSE et des PHOTOS — demande d'arsanne, 10 novembre.
--
-- << Il manque une adresse, numero, ville, code postal pour voir la distance de
--    navigation, plus une photo, deux photos en option. >>
-- ---------------------------------------------------------------------------

-- 1. L'ADRESSE -------------------------------------------------------------
--
-- POURQUOI ELLE CHANGE LA DISTANCE, ET PAS SEULEMENT L'AFFICHAGE.
--
-- Jusqu'ici la position d'une annonce etait le GPS DE L'EMPLOYEUR AU MOMENT OU
-- IL PUBLIAIT (voir PublishJobSheet : `position` vient de useLiveLocation).
-- Un patron qui redige son annonce le soir chez lui geolocalisait donc son
-- offre a son domicile, et le chercheur lisait une distance qui ne menait nulle
-- part. C'est exactement ce que la demande veut corriger : << pour voir la
-- distance de navigation >>.
--
-- L'adresse saisie est donc GEOCODEE, et c'est elle qui fixe `geom`. Le GPS ne
-- sert plus que de repli quand l'adresse ne donne rien — mieux vaut une
-- position approchee qu'une annonce sans position, qui ne serait jamais servie.
--
-- LES QUATRE CHAMPS SONT FACULTATIFS EN BASE, et c'est voulu : des centaines
-- d'annonces existent deja sans adresse. Les rendre obligatoires ici ferait
-- echouer leur relecture. C'est le FORMULAIRE qui exige la ville a la saisie.

ALTER TABLE job_offers ADD COLUMN IF NOT EXISTS house_number text;
ALTER TABLE job_offers ADD COLUMN IF NOT EXISTS street       text;
ALTER TABLE job_offers ADD COLUMN IF NOT EXISTS city         text;
ALTER TABLE job_offers ADD COLUMN IF NOT EXISTS postcode     text;

COMMENT ON COLUMN job_offers.city IS
  'Ville du LIEU DE TRAVAIL. C''est elle qui est geocodee pour fixer geom, pas la position du telephone de l''employeur.';

-- 2. LES PHOTOS -------------------------------------------------------------
--
-- ON REUTILISE `place_photos` PLUTOT QUE D'EN CREER UNE AUTRE TABLE.
--
-- Toute la chaine est deja la et elle est eprouvee : l'envoi en multipart, la
-- rotation EXIF, le redimensionnement a 1600 px, la vignette a 320, le nommage
-- des fichiers sur disque (routes/photos.ts). Une table `job_offer_photos`
-- aurait oblige a dupliquer cette route entiere — donc a maintenir deux copies
-- d'un meme traitement d'image, qui finiraient par diverger sur le detail qui
-- compte, par exemple la limite de taille.
--
-- Le nom de la table devient un peu etroit, et c'est le prix. Il reste plus
-- honnete qu'une duplication : une photo est une photo, qu'elle montre une
-- pharmacie ou un chantier.
--
-- `place_id` ET `job_offer_id` SONT TOUS DEUX FACULTATIFS : une photo fraichement
-- envoyee n'est rattachee a rien, et c'est deliberement ainsi depuis le debut —
-- le rattachement se fait a l'enregistrement du formulaire, pour ne pas creer
-- une fiche a moitie saisie si l'utilisateur abandonne.

ALTER TABLE place_photos
  ADD COLUMN IF NOT EXISTS job_offer_id uuid REFERENCES job_offers(id) ON DELETE CASCADE;

-- La lecture est toujours << les photos de cette annonce, dans l'ordre >>.
CREATE INDEX IF NOT EXISTS place_photos_offre_idx
  ON place_photos (job_offer_id, position)
  WHERE job_offer_id IS NOT NULL;

-- UNE PHOTO N'APPARTIENT QU'A UNE SEULE CHOSE. Sans cette contrainte, une
-- erreur de rattachement ferait apparaitre la facade d'une pharmacie dans une
-- offre d'emploi, et personne ne saurait d'ou elle vient.
ALTER TABLE place_photos
  DROP CONSTRAINT IF EXISTS place_photos_un_seul_proprietaire;
ALTER TABLE place_photos
  ADD CONSTRAINT place_photos_un_seul_proprietaire
  CHECK (place_id IS NULL OR job_offer_id IS NULL);
