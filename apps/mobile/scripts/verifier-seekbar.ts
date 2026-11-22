/**
 * Eprouve l'arithmetique de la barre de navigation audio — point 4 du 22 novembre.
 *
 * CE QUE CE CONTROLE ATTRAPE, ET QU'UN ESSAI AU DOIGT NE TROUVE PAS. Les quatre fonctions de
 * `quran/seekbar` ont toutes des bords, et ce sont les bords qui cassent une barre audio :
 * reculer de dix secondes a la deuxieme, avancer de dix a la derniere, poser le doigt a un pixel
 * du bord, ou toucher la barre avant que le lecteur ait annonce la duree — elle vaut alors zero,
 * et une division par zero donne `NaN`, qui se dessine comme une barre vide et un temps
 * << NaN:aN >>. Chacun de ces cas demande une manipulation precise sur un fichier precis ;
 * ensemble ils prennent une seconde ici.
 *
 * ET IL ATTRAPE AL-BAQARA : deux heures de recitation, donc un format d'heure que la formule du
 * document (`s/60 + ":" + s%60`) n'ecrit pas — elle afficherait << 127:43 >>.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-seekbar.ts
 */
import {
  bornerPosition,
  decalerPosition,
  formaterTemps,
  PAS_S,
  partRemplie,
  positionDepuisToucher,
} from '../src/quran/seekbar';

const fautes: string[] = [];

function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? '  - ' + detail : ''}`);
  if (!ok) fautes.push(nom);
}

console.log('\nLE TEMPS LISIBLE, Y COMPRIS SUR DEUX HEURES DE RECITATION');
verifier("zero s'ecrit 0:00", formaterTemps(0) === '0:00', formaterTemps(0));
verifier('les secondes gardent deux chiffres', formaterTemps(8) === '0:08', formaterTemps(8));
verifier('une minute juste', formaterTemps(60) === '1:00', formaterTemps(60));
verifier('deux minutes cinq', formaterTemps(125) === '2:05', formaterTemps(125));
verifier(
  'quarante-cinq minutes (Al-Kahf) restent en minutes',
  formaterTemps(45 * 60) === '45:00',
  formaterTemps(45 * 60),
);
/* L'HEURE EST LE CAS QUE LE DOCUMENT NE COUVRE PAS. Al-Baqara dure environ deux heures : la
 * formule citee donnerait << 127:43 >>, qui ne se lit pas comme un temps. */
verifier(
  "deux heures sept (Al-Baqara) s'ecrivent en heures",
  formaterTemps(7663) === '2:07:43',
  formaterTemps(7663),
);
verifier('une heure juste', formaterTemps(3600) === '1:00:00', formaterTemps(3600));
verifier(
  'les minutes aussi gardent deux chiffres apres une heure',
  formaterTemps(3600 + 5 * 60 + 2) === '1:05:02',
  formaterTemps(3600 + 5 * 60 + 2),
);
/* Les valeurs impossibles ne doivent JAMAIS produire de texte absurde : le lecteur annonce
 * `duration: 0` avant d'avoir lu l'entete, et une position peut revenir legerement negative
 * apres un saut. */
verifier('une position negative vaut zero', formaterTemps(-5) === '0:00', formaterTemps(-5));
verifier('NaN vaut zero', formaterTemps(Number.NaN) === '0:00', formaterTemps(Number.NaN));
verifier(
  'l infini vaut zero plutot que du texte',
  formaterTemps(Number.POSITIVE_INFINITY) === '0:00',
  formaterTemps(Number.POSITIVE_INFINITY),
);

console.log('\nUNE POSITION NE SORT JAMAIS DU FICHIER');
verifier('au milieu, elle ne change pas', bornerPosition(30, 100) === 30);
verifier('au-dela de la fin, elle revient a la fin', bornerPosition(140, 100) === 100);
verifier('avant le debut, elle revient a zero', bornerPosition(-3, 100) === 0);
verifier('la fin exacte est atteignable', bornerPosition(100, 100) === 100);
/* DUREE INCONNUE = ZERO, et non la position demandee : sans cette regle, un doigt pose pendant
 * le chargement enverrait le lecteur a une position qu'on ne peut pas borner. */
verifier('duree inconnue : zero', bornerPosition(42, 0) === 0, String(bornerPosition(42, 0)));
verifier('duree negative : zero', bornerPosition(42, -10) === 0);
verifier('duree NaN : zero', bornerPosition(42, Number.NaN) === 0);
verifier('position NaN : zero', bornerPosition(Number.NaN, 100) === 0);

console.log('\nLES DEUX BOUTONS DE DIX SECONDES NE DEBORDENT DANS AUCUN SENS');
verifier('le pas est bien celui du document', PAS_S === 10, String(PAS_S));
verifier('avancer au milieu', decalerPosition(30, PAS_S, 100) === 40);
verifier('reculer au milieu', decalerPosition(30, -PAS_S, 100) === 20);
/* LE CAS QUE LE DOCUMENT NE TRAITE PAS, et le plus facile a rencontrer : on lance une sourate,
 * on appuie sur << -10s >> dans les deux premieres secondes. */
verifier(
  'reculer a la deuxieme seconde ramene au debut, pas a moins huit',
  decalerPosition(2, -PAS_S, 100) === 0,
  String(decalerPosition(2, -PAS_S, 100)),
);
verifier('reculer au tout debut ne bouge pas', decalerPosition(0, -PAS_S, 100) === 0);
/* ET L'AUTRE BOUT : avancer au-dela de la fin declencherait `didJustFinish`, donc, pour les
 * trois protectrices, le saut a la sourate suivante — un bouton << +10s >> qui change de
 * sourate serait incomprehensible. */
verifier(
  'avancer a cinq secondes de la fin s arrete sur la fin',
  decalerPosition(95, PAS_S, 100) === 100,
  String(decalerPosition(95, PAS_S, 100)),
);
verifier('avancer a la fin ne bouge pas', decalerPosition(100, PAS_S, 100) === 100);
verifier('duree inconnue : les deux boutons rendent zero', decalerPosition(0, PAS_S, 0) === 0);
/* La propriete GENERALE, sur toute la longueur d'Al-Baqara : quelle que soit la position et le
 * sens, le resultat reste dans le fichier. C'est ce qui resisterait a une reecriture. */
let horsBornes = '';
for (let p = 0; p <= 7663; p += 7) {
  for (const delta of [PAS_S, -PAS_S]) {
    const r = decalerPosition(p, delta, 7663);
    if (!(r >= 0 && r <= 7663)) horsBornes = `${p} ${delta} -> ${r}`;
  }
}
verifier(
  'sur les deux heures d Al-Baqara, aucun decalage ne sort du fichier',
  horsBornes === '',
  horsBornes === '' ? '2190 positions eprouvees' : horsBornes,
);

console.log('\nLE DOIGT SUR LA BARRE');
verifier('au milieu d une piste de 200 points', positionDepuisToucher(100, 200, 100) === 50);
verifier('au tout debut', positionDepuisToucher(0, 200, 100) === 0);
verifier('au tout bout', positionDepuisToucher(200, 200, 100) === 100);
/* Le doigt peut depasser la piste pendant un glissement : `locationX` devient alors superieur a
 * la largeur, ou negatif. Les deux doivent se ranger sur un bord, pas sortir. */
verifier('au-dela du bord droit, on reste a la fin', positionDepuisToucher(260, 200, 100) === 100);
verifier('a gauche du bord, on reste au debut', positionDepuisToucher(-15, 200, 100) === 0);
/* LARGEUR NON MESUREE = ZERO. La vue n'a pas encore ete posee a l'ecran, donc aucun doigt ne
 * peut l'avoir touchee — et diviser par cette largeur donnerait l'infini. */
verifier('piste non mesuree : zero', positionDepuisToucher(100, 0, 100) === 0);
verifier('largeur NaN : zero', positionDepuisToucher(100, Number.NaN, 100) === 0);
verifier('duree inconnue : zero', positionDepuisToucher(100, 200, 0) === 0);

console.log('\nLA PART REMPLIE, C EST-A-DIRE CE QUI SE DESSINE');
verifier('rien d ecoute : barre vide', partRemplie(0, 100) === 0);
verifier('la moitie', partRemplie(50, 100) === 0.5);
verifier('tout : barre pleine', partRemplie(100, 100) === 1);
/* LA BARRE EST VIDE TANT QUE LA DUREE EST INCONNUE, et non pleine : une barre pleine sur une
 * sourate qui n'a pas commence dirait qu'elle est finie. Et surtout, ce n'est pas `NaN` — une
 * largeur `NaN%` ne dessine rien du tout en React Native. */
verifier('duree inconnue : barre vide, et pas NaN', partRemplie(10, 0) === 0, String(partRemplie(10, 0)));
let horsUn = '';
for (let p = -50; p <= 150; p += 1) {
  const part = partRemplie(p, 100);
  if (!(part >= 0 && part <= 1)) horsUn = `${p} -> ${part}`;
}
verifier(
  'la part reste toujours entre 0 et 1, meme hors du fichier',
  horsUn === '',
  horsUn === '' ? '201 positions eprouvees' : horsUn,
);

console.log('');
if (fautes.length > 0) {
  console.log(`A CORRIGER : ${fautes.length} verification(s) en echec.\n`);
  process.exit(1);
}
console.log(
  'La barre tient ses deux bords, affiche les heures d Al-Baqara, et ne dessine jamais de NaN.\n',
);
