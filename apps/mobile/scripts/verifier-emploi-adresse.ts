/**
 * Eprouve l'ADRESSE et les PHOTOS du module Emploi — demande du 10 novembre.
 *
 * << Il manque une adresse, numero, ville, code postal pour voir la distance de navigation,
 *    plus une photo, deux photos en option. >>
 *
 * POURQUOI CE SCRIPT. Deux defauts vivent ici, et aucun ne provoque d'erreur.
 *
 * LE PREMIER EST D'AFFICHAGE. Toutes les annonces publiees avant le 10 novembre n'ont AUCUNE
 * adresse, et beaucoup des suivantes n'auront que la ville — c'est le seul champ que le
 * formulaire exige. Un assemblage naif afficherait alors << , Oran >>, ou << 12 , >> : une
 * ponctuation orpheline qui se lit comme un champ perdu. Rien ne plante, la carte s'affiche, et
 * elle a l'air cassee.
 *
 * LE SECOND EST LA RAISON MEME DE LA DEMANDE. La position d'une annonce etait celle du telephone
 * de l'employeur au moment de la redaction ; un patron qui ecrit chez lui le soir geolocalisait
 * son offre a son domicile. La distance etait exacte et menait au mauvais endroit — un defaut
 * qu'aucun test d'affichage ne peut voir, et que seul un chercheur d'emploi decouvre, sur place.
 * On verifie donc ici que le formulaire geocode bien l'adresse AVANT d'envoyer.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-emploi-adresse.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { adresseLisible, requeteGeocodage } from '../src/jobs/adresse';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/* ------------------------------------------------------------------ */
console.log("\nL ADRESSE COMPLETE SE LIT COMME UNE ADRESSE");

verifier(
  'les quatre champs',
  adresseLisible({ houseNumber: '12', street: 'Rue Didouche Mourad', postcode: '16000', city: 'Alger' }) ===
    '12 Rue Didouche Mourad, 16000 Alger',
  adresseLisible({ houseNumber: '12', street: 'Rue Didouche Mourad', postcode: '16000', city: 'Alger' }),
);
verifier(
  'une seule virgule : elle separe la voie de la localite',
  (adresseLisible({ houseNumber: '12', street: 'Rue X', postcode: '16000', city: 'Alger' }).match(/,/g) ?? [])
    .length === 1,
  'quatre virgules donneraient une liste, pas une adresse',
);

/* ------------------------------------------------------------------ */
console.log('\nLES CHAMPS ABSENTS NE LAISSENT PAS DE PONCTUATION ORPHELINE');

/**
 * C'EST LE CONTROLE QUI JUSTIFIE LE FICHIER. Chacun de ces cas existe en vrai : les annonces
 * d'avant le 10 novembre n'ont rien, celles saisies a la hate n'ont que la ville.
 */
for (const [nom, o, attendu] of [
  ['la ville seule', { city: 'Oran' }, 'Oran'],
  ['ville et code postal', { postcode: '31000', city: 'Oran' }, '31000 Oran'],
  ['la rue sans numero', { street: 'Boulevard Zabana', city: 'Oran' }, 'Boulevard Zabana, Oran'],
  ['le numero sans rue', { houseNumber: '12', city: 'Oran' }, '12, Oran'],
  ['la voie sans localite', { houseNumber: '12', street: 'Rue X' }, '12 Rue X'],
  ['rien du tout', {}, ''],
  ['tout a null', { houseNumber: null, street: null, postcode: null, city: null }, ''],
  ['des chaines vides', { houseNumber: '', street: '', postcode: '', city: '' }, ''],
] as [string, Parameters<typeof adresseLisible>[0], string][]) {
  verifier(`${nom} → « ${attendu} »`, adresseLisible(o) === attendu, `« ${adresseLisible(o)} »`);
}

verifier(
  'aucun cas ne commence ou ne finit par une virgule',
  [
    { city: 'Oran' },
    { houseNumber: '12' },
    { postcode: '31000' },
    { street: 'Rue X' },
    {},
  ].every((o) => !/^[,\s]|[,\s]$/.test(adresseLisible(o))),
  "c'est la forme exacte du defaut : « , Oran »",
);

/* ------------------------------------------------------------------ */
console.log("\nLA REQUETE DU GEOCODEUR N EST PAS CELLE DE L AFFICHAGE");

/**
 * Un geocodeur segmente sur les espaces et se sert du code postal comme d'un indice de
 * localite. La ponctuation ne lui apporte rien et peut le gener — d'ou deux fonctions plutot
 * qu'une seule qu'on nettoierait au passage.
 */
verifier(
  'elle ne contient aucune virgule',
  !requeteGeocodage({ houseNumber: '12', street: 'Rue X', postcode: '16000', city: 'Alger' }).includes(','),
  requeteGeocodage({ houseNumber: '12', street: 'Rue X', postcode: '16000', city: 'Alger' }),
);
verifier(
  'elle garde l ordre numero, rue, code postal, ville',
  requeteGeocodage({ houseNumber: '12', street: 'Rue X', postcode: '16000', city: 'Alger' }) ===
    '12 Rue X 16000 Alger',
);
verifier(
  'les champs vides ne laissent pas de double espace',
  requeteGeocodage({ street: 'Rue X', city: 'Alger' }) === 'Rue X Alger',
  requeteGeocodage({ street: 'Rue X', city: 'Alger' }),
);
verifier(
  'les espaces autour des saisies sont retires',
  requeteGeocodage({ city: '  Alger  ' }) === 'Alger',
  "un champ tape au pouce finit souvent par un espace",
);

/* ------------------------------------------------------------------ */
console.log("\nLE FORMULAIRE GEOCODE L ADRESSE AVANT D ENVOYER");

/**
 * LE CONTROLE PORTE SUR LE TEXTE, et c'est volontaire : la regle n'est pas dans une fonction
 * qu'on pourrait appeler, elle est dans l'enchainement du formulaire. Un futur correctif qui
 * simplifierait en renvoyant `position.lat` directement remettrait l'annonce au domicile de
 * l'employeur, sans qu'aucun test de donnees ne s'en apercoive.
 */
const form = readFileSync(resolve('apps/mobile/src/components/PublishJobSheet.tsx'), 'utf8');

verifier(
  "l'adresse est geocodee",
  /fetchPhoton\(adresse/.test(form),
  "sans cela, la distance affichee mene la ou l'employeur a redige son annonce",
);
verifier(
  "c'est le resultat du geocodage qui part au serveur",
  /lat: lieu\.lat/.test(form) && /lon: lieu\.lon/.test(form),
  'et non position.lat / position.lon',
);
verifier(
  'le GPS reste en repli si le geocodeur ne trouve rien',
  /let lieu = \{ lat: position\.lat, lon: position\.lon \}/.test(form),
  'une annonce payee ne doit pas etre perdue parce qu un service tiers n a pas repondu',
);
verifier(
  'la ville est exigee a la saisie',
  /ville\.trim\(\)\.length < 2/.test(form),
  'sans elle, il n y a rien a geocoder',
);

console.log('\nLES PHOTOS : DEUX AU PLUS, ET FACULTATIVES');
verifier(
  'le maximum est de deux',
  /const PHOTOS_MAX = 2;/.test(form),
  '« une photo, deux photos en option »',
);
verifier(
  'aucune photo n est exigee pour publier',
  !/photos\.length === 0|photos\.length < 1/.test(form),
  'le module est payant : refuser une annonce sans photo, c est refuser l offre et l argent',
);
verifier(
  'un envoi de photo rate n annule pas l annonce',
  /for \(const uri of photos\)[\s\S]{0,200}?catch/.test(form),
  "l'annonce vaut sans photo ; la photo ne vaut rien sans l'annonce",
);

const api = readFileSync(resolve('apps/api/src/routes/jobs.ts'), 'utf8');
verifier(
  'le serveur refuse au-dela de deux photos',
  /photoIds: z\.array\(uuid\)\.max\(2\)/.test(api),
  'le controle du telephone ne suffit pas : la route est publique',
);
verifier(
  'il ne rattache que des photos orphelines et celles de l appareil',
  /p\.place_id IS NULL/.test(api) &&
    /p\.job_offer_id IS NULL/.test(api) &&
    /p\.uploaded_by = \$\{req\.deviceId!\}/.test(api),
  'sinon un identifiant devine permettrait de s approprier la photo d un autre',
);

console.log("\nL APPLICATION SURVIT A UN SERVEUR PAS ENCORE DEPLOYE");

/**
 * L'ORDRE HABITUEL ICI EST L'INVERSE DE L'ORDRE LOGIQUE. L'APK arrive sur le telephone par un
 * lien, et le serveur se met a jour apres — parfois le lendemain. Pendant ce temps, l'ancienne
 * API ne connait ni `photos` ni les champs d'adresse.
 *
 * `offre.photos.length` sur un champ absent ferait planter la liste ENTIERE des annonces : le
 * module Emploi deviendrait un ecran blanc, et le lien avec le deploiement ne sauterait aux yeux
 * de personne.
 */
const carte = readFileSync(resolve('apps/mobile/src/components/JobsSheet.tsx'), 'utf8');
verifier(
  'les photos sont lues avec precaution',
  /offre\.photos && offre\.photos\.length > 0/.test(carte),
  'une ancienne API ne renvoie pas ce champ',
);
verifier(
  'le type les declare facultatives',
  /photos\?: \{ url: string; thumbUrl: string \}\[\] \| null;/.test(carte),
  "sinon le compilateur laisserait ecrire offre.photos.length sans garde",
);
verifier(
  'les quatre champs d adresse aussi',
  /houseNumber\?: string \| null;/.test(carte) && /city\?: string \| null;/.test(carte),
);

console.log(
  fautes === 0
    ? "\nL adresse se lit, et c est elle qui situe l annonce.\n"
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
