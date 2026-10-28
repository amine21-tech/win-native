/**
 * Eprouve le message de partage d'une position (point 19 du client, 29 octobre).
 *
 * POURQUOI CE SCRIPT. Un message de partage ne se verifie pas chez soi : il se verifie chez le
 * DESTINATAIRE, qui ne dira pas forcement que le lien n'a rien ouvert. C'est le genre de
 * defaut qui survit des mois — on croit avoir envoye sa position, l'autre croit l'avoir recue,
 * et personne ne rapproche les deux.
 *
 * Les cas ci-dessous verifient la forme exacte demandee par le document, le comportement quand
 * l'adresse est introuvable, et surtout que le lien produit est OUVRABLE.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-partage-gps.ts
 */
import { DECIMALES_PARTAGE, lienPosition, messagePartagePosition } from '../src/shared/geo';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/* Les coordonnees de l'exemple du client : Alger, rue Didouche Mourad. */
const LAT = 36.7538;
const LON = 3.0588;

const message = messagePartagePosition({
  titre: 'Position WIN DZ',
  libelleAdresse: 'Adresse :',
  adresse: 'Rue Didouche Mourad, Alger',
  lat: LAT,
  lon: LON,
});

console.log('\nLE MESSAGE, TEL QUE LE DESTINATAIRE LE RECOIT');
console.log(message.split('\n').map((l) => `    ${l}`).join('\n'));

const lignes = message.split('\n');

console.log('\nLA FORME DEMANDEE PAR LE DOCUMENT');
verifier('quatre lignes', lignes.length === 4, `${lignes.length}`);
verifier('1. le titre', lignes[0] === 'Position WIN DZ');
verifier('2. l\'adresse', lignes[1] === 'Adresse : Rue Didouche Mourad, Alger');
verifier('3. les coordonnees', /^Lat : [\d.]+ \/ Lon : [\d.]+$/.test(lignes[2] ?? ''), lignes[2]);
verifier('4. le lien', (lignes[3] ?? '').startsWith('https://'), lignes[3]);

console.log('\nLE LIEN DOIT ETRE OUVRABLE — c\'est tout l\'objet du partage');
const lien = lienPosition(LAT, LON);
verifier(
  'il ne pointe PAS vers maps.app.goo.gl',
  !lien.includes('maps.app.goo.gl'),
  'ce domaine est celui des liens courts de Google : il ignore ?q= et n\'ouvre rien',
);
verifier(
  'il utilise la forme documentee www.google.com/maps?q=',
  lien.startsWith('https://www.google.com/maps?q='),
  lien,
);
verifier(
  'les deux coordonnees y sont, separees par une virgule',
  /\?q=-?\d+\.\d+,-?\d+\.\d+$/.test(lien),
  lien,
);
/* Une URL mal formee passe souvent les tests de chaine et echoue a l'ouverture : on la fait
 * donc analyser par l'analyseur d'URL, qui est le meme que celui du telephone. */
let analysable = true;
try {
  const u = new URL(lien);
  analysable = u.protocol === 'https:' && u.searchParams.get('q') !== null;
} catch {
  analysable = false;
}
verifier('elle s\'analyse comme une vraie URL', analysable);

console.log('\nLA PRECISION DOIT SUFFIRE A TROUVER QUELQU\'UN');
verifier(
  `${DECIMALES_PARTAGE} decimales`,
  DECIMALES_PARTAGE >= 5,
  'quatre decimales laissent onze metres : la largeur d\'une route',
);
const [, apresQ] = lien.split('?q=');
const [latTexte] = (apresQ ?? '').split(',');
verifier(
  'le lien porte la meme precision que le texte',
  (latTexte ?? '').split('.')[1]?.length === DECIMALES_PARTAGE,
  latTexte,
);

console.log('\nQUAND L\'ADRESSE EST INTROUVABLE');
for (const [nom, adresse] of [['absente', null], ['vide', ''], ['espaces', '   ']] as const) {
  const m = messagePartagePosition({
    titre: 'Position WIN DZ',
    libelleAdresse: 'Adresse :',
    adresse,
    lat: LAT,
    lon: LON,
  });
  verifier(
    `adresse ${nom} : la ligne disparait au lieu de rester vide`,
    m.split('\n').length === 3 && !m.includes('Adresse :'),
    m.split('\n')[1],
  );
}

console.log('\nLE MESSAGE DOIT SURVIVRE A SON ENCODAGE');
/* Il part dans une URL (`wa.me/?text=`, `smsto:?body=`) : les retours a la ligne et les
 * accents doivent y survivre, sinon le destinataire recoit une bouillie. */
const encode = encodeURIComponent(message);
verifier('il se reencode a l\'identique', decodeURIComponent(encode) === message);
verifier('les retours a la ligne sont encodes', encode.includes('%0A'));

console.log(
  fautes === 0
    ? '\nLe partage de position envoie un message lisible et un lien qui ouvre.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
