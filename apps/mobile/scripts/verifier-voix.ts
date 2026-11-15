/**
 * Eprouve la voix TAMAZIGHT : le bon clip pour la bonne phrase, et aucun clip qui mente.
 *
 * POURQUOI CE SCRIPT. Une voix faite d'enregistrements se trompe d'une facon qu'aucune autre
 * partie de l'application ne connait : elle peut dire quelque chose de parfaitement clair, et
 * de FAUX. Un clip << dans 500 metres >> joue a 300 m ne provoque aucune erreur, ne laisse
 * aucune trace, et envoie le conducteur chercher son virage deux cents metres trop loin.
 *
 * Et personne ne peut s'en apercevoir en relisant le code : il faudrait parler kabyle ET
 * comparer a ce que dit la voix francaise au meme instant. C'est exactement ce que ce script
 * fait — il verifie que les deux langues choisissent le MEME palier.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-voix.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { palierParleM, spokenDistance } from '../src/navigation/instructions';
import { CLES_VOIX, clipDistance, clipManoeuvre } from '../src/speech/voixKabRegles';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/* ------------------------------------------------------------------ */
console.log('\nLE CLIP DE DISTANCE DIT LA MEME CHOSE QUE LA VOIX FRANCAISE');

/**
 * Les clips de distance disponibles, et le palier qu'ils annoncent. Ecrits a la main : c'est
 * le point du test — si quelqu'un renomme un clip, la correspondance doit casser ici et non
 * en voiture.
 */
const ATTENDU: Record<string, number> = {
  d50m: 50,
  d100m: 100,
  d200m: 200,
  d300m: 300,
  /* 400, 600, 700 ET 800 SONT ARRIVES LE 16 NOVEMBRE avec le second envoi. Ils manquaient
   * alors que `palierParleM` les PRONONCE : la synthese francaise disait << dans 700
   * metres >> pendant que le kabyle se taisait, et c est la tranche qu on entend le plus,
   * la premiere annonce etant plafonnee a 800 m. */
  d400m: 400,
  d500m: 500,
  d600m: 600,
  d700m: 700,
  d800m: 800,
  d1km: 1000,
  d2km: 2000,
  d5km: 5000,
  d10km: 10000,
};

let desaccords = 0;
let avecClip = 0;
for (let m = 10; m <= 12000; m += 10) {
  const cle = clipDistance(m);
  if (!cle) continue;
  avecClip++;
  const annonce = ATTENDU[cle];
  if (annonce === undefined) {
    desaccords++;
    console.log(`        ${m} m : clip inconnu « ${cle} »`);
    continue;
  }
  /* LE PALIER QUE LA SYNTHESE PRONONCERAIT. Les deux doivent coincider exactement, sans quoi
   * la voix kabyle et la voix francaise diraient deux chiffres differents pour la meme
   * distance — et seul quelqu'un qui parle les deux langues pourrait le constater. */
  if (palierParleM(m) !== annonce) {
    desaccords++;
    if (desaccords <= 5) {
      console.log(`        ${m} m : clip « ${cle} » (${annonce}) contre « ${spokenDistance(m, 'fr')} »`);
    }
  }
}
verifier(
  `les deux voix s'accordent sur ${avecClip} distances testees`,
  desaccords === 0,
  desaccords === 0 ? 'de 10 m a 12 km, par pas de 10 m' : `${desaccords} desaccords`,
);

console.log('\nLES DISTANCES SANS ENREGISTREMENT SE TAISENT');
verifier(
  '2,3 km n\'a pas de clip : la synthese francaise dira le vrai chiffre',
  clipDistance(2300) === null,
  `la synthese dit « ${spokenDistance(2300, 'fr')} »`,
);
verifier('3,7 km non plus', clipDistance(3700) === null);
/* 700 M A SON CLIP DEPUIS LE 16 NOVEMBRE. Ce controle exigeait son silence ; il exige
 * maintenant qu'il parle, et qu'il dise le MEME chiffre que la synthese francaise. Les
 * distances qui se taisent encore sont celles que la synthese arrondit au cent metres SOUS
 * le kilometre — 2,3 km, 3,7 km — et pour lesquelles aucun clip n'existe ni n'existera. */
verifier(
  '700 m parle maintenant, et dit le bon palier',
  clipDistance(700) === 'd700m',
  `la synthese dit « ${spokenDistance(700, 'fr')} »`,
);
verifier(
  '800 m aussi, le palier le plus lointain qu\'une annonce atteigne',
  clipDistance(800) === 'd800m',
  'la premiere annonce est plafonnee a 800 m : au-dela, personne ne l\'entend',
);

/* LE DEFAUT QUE CE SCRIPT A TROUVE, ET QUI NE CONCERNAIT PAS LE KABYLE.
 *
 * L'echelle des paliers s'arretait a 300 m : toute distance superieure a 250 m etait annoncee
 * « dans 300 metres », y compris 800. Et c'est atteignable — la premiere annonce se declenche
 * dix-huit secondes avant la manoeuvre, plafonnees a 800 m, ce qu'on atteint a vitesse
 * d'autoroute. La voix disait donc 300 pour une sortie a 800.
 *
 * Il n'a ete vu qu'en comparant le palier prononce au clip choisi : personne ne relit une
 * interpolation de chaine en se demandant ce qu'elle donne a 800 metres. */
console.log('\nLA VOIX FRANCAISE DIT LA BONNE DISTANCE AU-DELA DE 400 m');
for (const [m, attendu] of [
  [400, 'Dans 400 metres'],
  [500, 'Dans 500 metres'],
  [650, 'Dans 700 metres'],
  [800, 'Dans 800 metres'],
] as [number, string][]) {
  verifier(`${m} m`, spokenDistance(m, 'fr') === attendu, spokenDistance(m, 'fr'));
}
verifier(
  '500 m a desormais son clip tamazight',
  clipDistance(500) === 'd500m',
  'il etait inatteignable tant que 500 m etait annonce « 300 »',
);

console.log('\nLES PALIERS PROCHES DU VIRAGE, CEUX QUI COMPTENT');
for (const [m, attendu] of [
  [300, 'd300m'],
  [280, 'd300m'],
  [250, 'd300m'],
  [200, 'd200m'],
  [150, 'd200m'],
  [100, 'd100m'],
  [80, 'd100m'],
  [50, 'd50m'],
  [20, 'd50m'],
] as [number, string][]) {
  verifier(`${m} m → ${attendu}`, clipDistance(m) === attendu, `« ${spokenDistance(m, 'fr')} »`);
}

/* ------------------------------------------------------------------ */
console.log('\nLES MANOEUVRES ENREGISTREES');

const CONNUES: [number, string, string][] = [
  [10, 'tournerDroite', 'Tournez a droite'],
  [15, 'tournerGauche', 'Tournez a gauche'],
  [8, 'toutDroit', 'Continuez tout droit'],
  [12, 'demiTour', 'Demi-tour par la droite'],
  [13, 'demiTour', 'Demi-tour par la gauche'],
  [23, 'resterDroite', 'Restez a droite'],
  [24, 'resterGauche', 'Restez a gauche'],
  [26, 'rondPoint', 'Entrez dans le rond-point'],
  [4, 'arrivee', 'Vous etes arrive'],
  [5, 'destinationDroite', 'Destination a droite'],
  [6, 'destinationGauche', 'Destination a gauche'],
];
for (const [type, cle, libelle] of CONNUES) {
  verifier(`${libelle} (type ${type}) → ${cle}`, clipManoeuvre(type) === cle);
}

/* ------------------------------------------------------------------ */
console.log('\nLES MANOEUVRES FINES PARLENT DEPUIS LE SECOND ENVOI');

/**
 * CE CONTROLE A CHANGE DE SENS LE 16 NOVEMBRE, ET C'EST UNE BONNE NOUVELLE.
 *
 * Il verrouillait jusque-la le SILENCE de neuf manoeuvres : serrez legerement, tournez
 * franchement, les trois bretelles, l'insertion. C'etait le controle le plus important du
 * fichier, parce que la tentation, quand un clip manque, est de jouer le voisin — et sur une
 * bifurcation d'autoroute, << tournez a droite >> et << serrez legerement a droite >> menent a
 * deux routes differentes sans que le conducteur puisse savoir qu'on a approxime.
 *
 * Le second envoi du locuteur les a toutes enregistrees. Le controle verifie donc maintenant
 * que chacune dit SA phrase, et non celle d'a cote : une erreur de cablage entre `serrerDroite`
 * et `serrerGauche` serait exactement le genre de faute que ce fichier existe pour attraper,
 * et elle ne se verrait a l'usage qu'en kabyle, au volant, trop tard.
 */
const FINES: [number, string, string][] = [
  [9, 'serrerDroite', 'Serrez legerement a droite'],
  [16, 'serrerGauche', 'Serrez legerement a gauche'],
  [11, 'tournerFranchementDroite', 'Tournez franchement a droite'],
  [14, 'tournerFranchementGauche', 'Tournez franchement a gauche'],
  [17, 'bretelle', 'Prenez la bretelle'],
  [18, 'bretelleDroite', 'Bretelle a droite'],
  [19, 'bretelleGauche', 'Bretelle a gauche'],
  [25, 'insertion', 'Inserez-vous'],
  [28, 'ferryEntree', 'Prenez le ferry'],
  [29, 'ferrySortie', 'Quittez le ferry'],
];
for (const [type, cle, libelle] of FINES) {
  verifier(`${libelle} (type ${type}) → ${cle}`, clipManoeuvre(type) === cle);
}

/* LA GAUCHE ET LA DROITE NE SE CONFONDENT PAS. Dix cles, dix clips distincts : si deux types
 * pointaient vers le meme enregistrement, la verification ligne a ligne ci-dessus passerait
 * quand meme tant que chaque ligne est juste prise seule. */
const clesFines = FINES.map(([type]) => clipManoeuvre(type));
verifier(
  'dix manoeuvres, dix clips differents',
  new Set(clesFines).size === FINES.length,
  `${new Set(clesFines).size} clips distincts sur ${FINES.length} manoeuvres`,
);

/* ------------------------------------------------------------------ */
console.log("\nCE QUI N'A TOUJOURS PAS ETE ENREGISTRE SE TAIT, PLUTOT QUE D'APPROXIMER");

/**
 * Il reste le depart. << Demarrez >> n'a pas de clip, et n'en a pas besoin : la consigne de
 * depart est suivie immediatement de la premiere manoeuvre, qui, elle, parle. La regle de fond
 * ne bouge pas — un clip manquant se tait, il n'emprunte pas celui du voisin.
 */
const MUETTES: [number, string][] = [
  [1, 'Demarrez'],
  [2, 'Depart a droite'],
  [3, 'Depart a gauche'],
];
for (const [type, libelle] of MUETTES) {
  verifier(`${libelle} (type ${type}) : aucun clip`, clipManoeuvre(type) === null);
}

/* ------------------------------------------------------------------ */
console.log('\nLA SORTIE DE ROND-POINT A BESOIN DE SON NUMERO');

verifier('premiere sortie', clipManoeuvre(27, 1) === 'sortie1');
verifier('deuxieme sortie', clipManoeuvre(27, 2) === 'sortie2');
verifier('troisieme sortie', clipManoeuvre(27, 3) === 'sortie3');
verifier('quatrieme sortie', clipManoeuvre(27, 4) === 'sortie4');
verifier(
  'cinquieme sortie : aucun clip, la synthese dira le bon numero',
  clipManoeuvre(27, 5) === null,
  'dire « premiere sortie » a la cinquieme ferait sortir quatre fois trop tot',
);
verifier(
  'numero inconnu : aucun clip',
  clipManoeuvre(27, null) === null,
  '« sortez du rond-point » sans dire laquelle ne sert a rien',
);

/* ------------------------------------------------------------------ */
console.log('\nTOUTES LES CLES CITEES EXISTENT');

const toutes = new Set<string>(CLES_VOIX);
const citees = new Set<string>();
for (let m = 10; m <= 12000; m += 10) {
  const c = clipDistance(m);
  if (c) citees.add(c);
}
for (let t = 0; t <= 29; t++) {
  const c = clipManoeuvre(t);
  if (c) citees.add(c);
}
for (let n = 1; n <= 6; n++) {
  const c = clipManoeuvre(27, n);
  if (c) citees.add(c);
}
const inconnues = [...citees].filter((c) => !toutes.has(c));
verifier(
  `les ${citees.size} cles citees par les regles existent toutes`,
  inconnues.length === 0,
  inconnues.join(', ') || `sur ${toutes.size} enregistrements`,
);

/* ------------------------------------------------------------------ */
console.log('\nEN TAMAZIGHT, LES ENREGISTREMENTS OU RIEN');

/**
 * LE CONTROLE PORTE SUR LE TEXTE DE voice.ts, et c'est volontaire. La regle n'est pas dans les
 * regles de choix de clip — elle est dans la branche qui decide de parler ou non, et aucune
 * fonction ne la rend observable. Un futur correctif qui remettrait la synthese francaise
 * << pour que le conducteur soit toujours averti >> partirait d'une bonne intention et
 * defairait une decision prise au volant.
 *
 * Le client a essaye les deux. Une phrase francaise au milieu d'un guidage kabyle casse plus
 * qu'elle n'aide : on l'entend arriver, on ne la comprend pas tout de suite, et le temps de
 * s'y reprendre la manoeuvre est passee.
 */
const voiceTs = readFileSync(resolve('apps/mobile/src/speech/voice.ts'), 'utf8');
const brancheKab = voiceTs.slice(voiceTs.indexOf("if (lang === 'kab')"), voiceTs.indexOf('if (!text) return;'));
verifier(
  'la branche tamazight se termine par un retour, sans synthese',
  /return;\s*\}/.test(brancheKab) && !brancheKab.includes('Speech.speak'),
  'aucune phrase francaise ne doit sortir quand la langue est le tamazight',
);
verifier(
  'elle coupe aussi ce qui parlait',
  brancheKab.includes('Speech.stop()') && brancheKab.includes('arreterClips()'),
  'sinon une annonce francaise en cours continuerait par-dessus le clip',
);

console.log(
  fautes === 0
    ? '\nLa voix tamazight dit ce qu\'elle doit dire, et se tait quand elle ne sait pas.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
