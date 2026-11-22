/**
 * LE MODE HORS LIGNE AUTOMATIQUE — point I du correctif v2 (22 novembre).
 *
 * Le document demande le zoom 4 a 15 sur l'Algerie et la Tunisie, en telechargement silencieux.
 * Le zoom 15 demande cent soixante-trois gigaoctets, et ce fichier ne se contente pas de
 * l'affirmer : IL REFAIT LE CALCUL. C'est la seule facon de ne pas avoir a croire un commentaire
 * — et si quelqu'un remonte le plafond un jour, la ligne qui dit le cout suivra.
 *
 * ON EPROUVE AUSSI LA REGLE DE DECLENCHEMENT, parce que c'est elle qui protege le forfait de
 * l'utilisateur : pas de Wi-Fi, pas de telechargement, jamais.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-hors-ligne.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BORNES_DZ_TN,
  PAQUET_ETIQUETTE,
  ZOOM_MAX,
  ZOOM_MIN,
  doitTelecharger,
  limiteTuiles,
  poidsEstimeMo,
  tuilesDuZoom,
  tuilesTotales,
} from '../src/map/horsLigne';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

console.log('\n============================================================');
console.log('LE RECTANGLE : IL DOIT CONTENIR LES DEUX PAYS EN ENTIER');
console.log('============================================================');

const [ouest, sud, est, nord] = BORNES_DZ_TN;
/* Les quatre extremites de chaque pays, en degres. Ce ne sont pas des arrondis de confort :
 * une borne trop serree laisse une bande blanche sur la frontiere, et c'est exactement la ou
 * le reseau manque. */
const EXTREMES: readonly [string, number, number][] = [
  ['pointe ouest algerienne (Tindouf)', -8.67, 27.67],
  ['pointe est algerienne (El Oued/frontiere)', 11.99, 33.37],
  ['pointe sud algerienne (Tin Zaouatine)', 5.52, 18.97],
  ['pointe nord algerienne (Cap Rosa)', 8.25, 37.09],
  ['pointe nord tunisienne (Cap Angela)', 9.74, 37.35],
  ['pointe est tunisienne (Ras Kaboudia)', 11.6, 35.24],
  ['Tunis', 10.18, 36.8],
  ['Tamanrasset', 5.53, 22.79],
  ['Alger', 3.06, 36.75],
  ['Oran', -0.64, 35.7],
];
for (const [nom, lon, lat] of EXTREMES) {
  verifier(
    nom,
    lon >= ouest && lon <= est && lat >= sud && lat <= nord,
    `${lon}, ${lat}`,
  );
}
verifier(
  'et le rectangle ne descend pas inutilement au Niger ni au Mali',
  sud >= 18 && nord <= 38 && ouest >= -9.5 && est <= 12.5,
  'chaque degre de trop est du telechargement paye pour un pays qu on ne couvre pas',
);

console.log('\n============================================================');
console.log('LE CALCUL DES TUILES, REFAIT ICI');
console.log('============================================================');
/* La reference : une grille de Mercator a 2^z cases de cote. On recompte avec une formule
 * ecrite independamment de celle du module, sans quoi on ne verifierait que soi-meme. */
function tuilesReference(z: number): number {
  const cotes = 2 ** z;
  const colonne = (lon: number) => Math.floor(((lon + 180) / 360) * cotes);
  const ligne = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return Math.floor(y * cotes);
  };
  return (colonne(est) - colonne(ouest) + 1) * (ligne(sud) - ligne(nord) + 1);
}
for (const z of [4, 6, 8, 10, 11, 12, 15]) {
  verifier(
    `zoom ${z}`,
    tuilesDuZoom(z) === tuilesReference(z),
    `${tuilesDuZoom(z).toLocaleString('fr-FR')} tuiles`,
  );
}

console.log('\nLES TOTAUX CUMULES, ET CE QU ILS PESENT');
const CAS: readonly [number, number, number][] = [
  [10, 5_056, 173],
  [11, 19_693, 673],
  [12, 77_277, 2_641],
  [15, 4_895_718, 167_334],
];
for (const [zmax, tuiles, mo] of CAS) {
  const t = tuilesTotales(4, zmax);
  const poids = poidsEstimeMo(4, zmax);
  verifier(
    `zoom 4 a ${zmax}`,
    t === tuiles && Math.abs(poids - mo) < 1,
    `${t.toLocaleString('fr-FR')} tuiles, ${Math.round(poids).toLocaleString('fr-FR')} Mo`,
  );
}
/* LE CHIFFRE QUI JUSTIFIE L ECART AU DOCUMENT. Si un jour il cesse d'etre vrai — tuiles plus
 * legeres, pays plus petit — cette ligne le dira avant qu'on refuse le zoom 15 par habitude. */
verifier(
  'LE ZOOM 15 DU DOCUMENT PESE PLUS DE CENT GIGAOCTETS',
  poidsEstimeMo(4, 15) > 100 * 1024,
  `${(poidsEstimeMo(4, 15) / 1024).toFixed(0)} Go : aucun telephone ne les stocke`,
);
verifier(
  'et meme a dix kilo-octets la tuile il resterait plus de quarante gigaoctets',
  (tuilesTotales(4, 15) * 10 * 1024) / 1024 ** 3 > 40,
  "l'ecart ne vient pas d'une estimation pessimiste",
);
verifier(
  'ce qu on telecharge tient sous deux cents megaoctets',
  poidsEstimeMo() < 200,
  `${Math.round(poidsEstimeMo())} Mo au zoom ${ZOOM_MIN} a ${ZOOM_MAX}`,
);
verifier(
  'le zoom de depart est celui de la vue d ouverture',
  ZOOM_MIN === 4,
  "l'application ouvre a 4,6 : un paquet qui commence a 5 laisserait la premiere vue vide",
);

console.log('\nLA LIMITE DE TUILES SUIT LE PAQUET, ET NE LE BRIDE PAS');
verifier(
  'elle couvre le paquet entier, marge comprise',
  limiteTuiles() >= tuilesTotales(),
  `${limiteTuiles().toLocaleString('fr-FR')} autorisees pour ${tuilesTotales().toLocaleString('fr-FR')} demandees`,
);
verifier(
  'et elle se recalcule si le plafond de zoom change',
  /tuilesTotales\(\) \* 1\.1/.test(lire('src', 'map', 'horsLigne.ts')),
  'une limite ecrite en dur se heurterait aux 6 000 tuiles par defaut sans rien dire',
);

console.log('\n============================================================');
console.log('LA REGLE DE DECLENCHEMENT : LE WI-FI N EST PAS NEGOCIABLE');
console.log('============================================================');
verifier(
  'Wi-Fi joignable, rien en base : on telecharge',
  doitTelecharger({ wifi: true, joignable: true }, 'absent') === true,
);
verifier(
  'Wi-Fi joignable, paquet interrompu : on reprend',
  doitTelecharger({ wifi: true, joignable: true }, 'partiel') === true,
  'on quitte la maison au milieu du telechargement : c est le cas ordinaire',
);
verifier(
  'paquet complet : on ne fait rien, meme en Wi-Fi',
  doitTelecharger({ wifi: true, joignable: true }, 'complet') === false,
);
verifier(
  'DONNEES MOBILES : ON NE TELECHARGE PAS, meme si rien n est en base',
  doitTelecharger({ wifi: false, joignable: true }, 'absent') === false,
  'cent soixante-treize megaoctets preleves en silence sur un forfait algerien seraient un degat',
);
verifier(
  'donnees mobiles et paquet partiel : on ne reprend pas non plus',
  doitTelecharger({ wifi: false, joignable: true }, 'partiel') === false,
  'un paquet a moitie fait ne justifie pas de finir au prix du forfait',
);
verifier(
  "Wi-Fi sans sortie Internet : on n'essaie pas",
  doitTelecharger({ wifi: true, joignable: false }, 'absent') === false,
  'un Wi-Fi d hotel captif userait la batterie pour des requetes qui n arrivent nulle part',
);
verifier(
  'aucun reseau : on ne fait rien',
  doitTelecharger({ wifi: false, joignable: false }, 'absent') === false,
);

console.log('\n============================================================');
console.log('<< 0 BOUTON, 0 ACTION UTILISATEUR >> — ET L INTERFACE NE CHANGE PAS');
console.log('============================================================');
const crochet = lire('src', 'map', 'useTuilesHorsLigne.ts');
const ecran = readFileSync(join(__dirname, '..', 'app', 'index.tsx'), 'utf8');

verifier(
  'le crochet ne rend rien du tout',
  /\): void \{/.test(crochet) && !/from 'react-native'/.test(crochet),
  'pas de vue, pas de bouton, pas de barre de progression : le document l interdit',
);
/* LE CONTROLE QUI VAUT VRAIMENT : un module qui n'importe aucun composant ne peut rien
 * dessiner. On cherche donc les trois briques dont toute vue a besoin, plutot qu'une balise
 * dans un fichier qui ecrit par ailleurs des types generiques comme <OfflinePack | null>. */
verifier(
  'et il ne connait aucun composant',
  !/View|Text|Pressable|Modal/.test(crochet),
  "<< NE PAS MODIFIER l'interface existante >>",
);
verifier(
  "il n'y a aucun texte a traduire",
  !/useTranslation|t\('/.test(crochet),
  "un message suppose un ecran, et l'utilisateur n'a rien demande",
);
verifier(
  'le reseau est lu avant toute chose',
  /Network\.getNetworkStateAsync\(\)/.test(crochet) && /NetworkStateType\.WIFI/.test(crochet),
  '<< au premier lancement en Wi-Fi >>',
);
verifier(
  'la decision vient du module eprouvable, pas du crochet',
  /doitTelecharger\(etatReseau, etatPaquet\)/.test(crochet) &&
    !/type === 'wifi'/.test(crochet.split('const etatReseau')[0] ?? ''),
  'la regle doit pouvoir etre rejouee sans telephone',
);
verifier(
  'un paquet deja present est RETROUVE, et non recree',
  new RegExp(`metadata\\?\\.etiquette === PAQUET_ETIQUETTE`).test(crochet),
  `etiquette << ${PAQUET_ETIQUETTE} >> : sinon un paquet de plus a chaque lancement`,
);
verifier(
  'un paquet partiel est repris la ou il en etait',
  /existant\.resume\(\)/.test(crochet),
  'recreer ferait retelecharger ce qui est deja sur le telephone',
);
verifier(
  'tout echec est avale en silence',
  /\} catch \{/.test(crochet),
  'plus de place, serveur qui refuse, module absent : l application continue comme avant',
);
verifier(
  "l'ecouteur de progression est detache quand c'est fini",
  /removeListener\(paquet\.id\)/.test(crochet),
  'sinon il reste accroche pour la vie de l application',
);
verifier(
  'le crochet est appele par l ecran de la carte',
  /useTuilesHorsLigne\(MAP_STYLES\.day\)/.test(ecran),
  'un module jamais appele est le defaut du 18 novembre',
);
verifier(
  'avec le style de JOUR, meme la nuit',
  !/useTuilesHorsLigne\(mapStyle\)/.test(ecran),
  'les deux fonds partagent la meme source : un seul paquet sert aux deux themes',
);
verifier(
  'et aucune bascule n est ecrite a la main',
  !/NetworkManager\.setConnected/.test(ecran) && !/NetworkManager/.test(crochet),
  'MapLibre sert deja une tuile presente en base : un aiguillage n ajouterait qu une erreur possible',
);

console.log(
  fautes === 0
    ? '\nLe mode hors ligne est automatique, silencieux, et limite a ce qui tient dans un telephone.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
