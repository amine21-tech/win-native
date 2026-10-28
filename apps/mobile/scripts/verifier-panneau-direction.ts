/**
 * Eprouve la correspondance entre les manoeuvres de Valhalla et les fleches dessinees.
 *
 * POURQUOI CE SCRIPT. Une fleche qui montre la mauvaise direction est le pire defaut possible
 * dans une application de navigation : elle ne plante pas, elle ne ralentit rien, elle est
 * simplement FAUSSE — et le conducteur la croit. Elle ne se decouvre qu'en roulant, a
 * l'intersection, une seule fois, et presque personne ne la signale ensuite tant elle parait
 * improbable.
 *
 * Le tableau des gestes est une trentaine de lignes de chiffres recopies du protocole de
 * Valhalla (DirectionsLeg_Maneuver_Type). Une ligne mal recopiee est invisible a la relecture :
 * rien dans `19: 'gauche'` ne dit si 19 est bien une manoeuvre vers la gauche.
 *
 * Ce script compare donc le tableau des GESTES au tableau des PHRASES, qui est rempli
 * independamment et dans quatre langues. Deux erreurs identiques dans deux tableaux remplis
 * separement sont bien moins probables qu'une erreur dans un seul.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-panneau-direction.ts
 */
import { gesteDeManoeuvre, type Geste } from '../src/navigation/gestes';
import { localizedInstruction } from '../src/navigation/instructions';
import type { Maneuver } from '../src/navigation/routing';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/** Une manoeuvre minimale, suffisante pour obtenir sa phrase francaise. */
function manoeuvre(type: number): Maneuver {
  return {
    type,
    instructionFrEn: '',
    narration: 'ar',
    streetName: '',
    startM: 0,
    distanceM: 0,
    durationS: 0,
    lat: 0,
    lon: 0,
    lanes: [],
  } as unknown as Maneuver;
}

/** Le cote qu'annonce la PHRASE, independamment du tableau des gestes. */
function coteDitParLaPhrase(type: number): 'gauche' | 'droite' | 'demi-tour' | 'autre' {
  const phrase = localizedInstruction(manoeuvre(type), 'fr').toLowerCase();
  if (phrase.includes('demi-tour')) return 'demi-tour';
  if (phrase.includes('gauche')) return 'gauche';
  if (phrase.includes('droite')) return 'droite';
  return 'autre';
}

/** Le cote que montre la FLECHE. */
function coteDeLaFleche(geste: Geste): 'gauche' | 'droite' | 'demi-tour' | 'autre' {
  if (geste === 'demi-tour') return 'demi-tour';
  if (geste.includes('gauche')) return 'gauche';
  if (geste.includes('droite')) return 'droite';
  return 'autre';
}

console.log('\nLA FLECHE MONTRE LE COTE QUE LA PHRASE ANNONCE');
/* Valhalla numerote ses manoeuvres de 0 a 29. On les parcourt toutes : une manoeuvre oubliee
 * tombe sur le « tout droit » par defaut, ce qui est sans danger — mais une manoeuvre a
 * GAUCHE qui tomberait sur une fleche a DROITE ne l'est pas du tout. */
/* LES ARRIVEES SONT EXCLUES, et il a fallu que ce script les signale pour que je le voie.
 *
 * Les types 4, 5 et 6 sont « vous etes arrive », « votre destination est sur la droite » et
 * « ... sur la gauche ». Leur phrase contient bien « droite » ou « gauche », mais elle ne
 * decrit pas un MOUVEMENT : elle dit de quel cote regarder en s'arretant. Leur montrer une
 * fleche de virage serait faux — le conducteur ne tourne pas, il se gare. Elles gardent donc
 * la fleche droite, et c'est le texte qui porte le cote. */
const ARRIVEES = new Set([4, 5, 6]);

const desaccords: string[] = [];
for (let type = 0; type <= 29; type++) {
  if (ARRIVEES.has(type)) continue;
  const parLaPhrase = coteDitParLaPhrase(type);
  const parLaFleche = coteDeLaFleche(gesteDeManoeuvre(type));

  // Le defaut « tout droit » est acceptable la ou la phrase ne designe aucun cote.
  if (parLaPhrase === 'autre') continue;
  // Une phrase qui designe un cote DOIT avoir une fleche du meme cote.
  if (parLaPhrase !== parLaFleche) {
    desaccords.push(`type ${type} : la phrase dit « ${parLaPhrase} », la fleche montre « ${parLaFleche} »`);
  }
}
verifier(
  'aucun desaccord entre la phrase et la fleche',
  desaccords.length === 0,
  desaccords.join(' · ') || '30 manoeuvres comparees',
);

console.log('\nLES CAS QUI COMPTENT LE PLUS');
const ATTENDUS: [number, Geste, string][] = [
  [10, 'droite', 'tourner a droite'],
  [15, 'gauche', 'tourner a gauche'],
  [12, 'demi-tour', 'demi-tour a droite'],
  [13, 'demi-tour', 'demi-tour a gauche'],
  [9, 'legere-droite', 'legere a droite'],
  [16, 'legere-gauche', 'legere a gauche'],
  [8, 'tout-droit', 'continuer'],
  [18, 'droite', 'sortie a droite'],
  [19, 'gauche', 'sortie a gauche'],
];
for (const [type, attendu, quoi] of ATTENDUS) {
  const obtenu = gesteDeManoeuvre(type);
  verifier(`${quoi} (type ${type}) -> ${attendu}`, obtenu === attendu, obtenu);
}

console.log('\nUNE MANOEUVRE INCONNUE NE DOIT PAS INVENTER UN VIRAGE');
for (const type of [99, -1, 1000]) {
  verifier(
    `type ${type} -> tout droit`,
    gesteDeManoeuvre(type) === 'tout-droit',
    'le geste qui ne fait rien faire est le moins dangereux a montrer par erreur',
  );
}

console.log(
  fautes === 0
    ? '\nChaque fleche montre la direction qu\'annonce la voix.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
