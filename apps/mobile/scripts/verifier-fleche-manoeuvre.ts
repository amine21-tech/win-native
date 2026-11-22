/**
 * LA FLECHE DU BANDEAU DIT-ELLE LA MEME CHOSE QUE LA PHRASE ?
 *
 * LE BUG RAPPORTE LE 18 NOVEMBRE, en voiture sur la RN 68 : << la fleche MONTAIT (tout droit)
 * alors que l'instruction etait "Tournez a droite". Toutes les directions affichaient la meme
 * fleche droite. >>
 *
 * POURQUOI CE DEFAUT EST LE PLUS GRAVE DE TOUS. Il ne plante pas, il ne ralentit rien, il
 * n'apparait dans aucun journal. Il est simplement FAUX — et le conducteur le croit, parce
 * qu'une fleche se lit plus vite qu'une phrase et qu'au volant on regarde la fleche.
 *
 * CE QUE CE SCRIPT FAIT, ET QUI N'AVAIT JAMAIS ETE FAIT. La table des gestes
 * (navigation/gestes.ts) et la table des phrases (navigation/instructions.ts) sont deux
 * tableaux separes, indexes par le meme numero de manoeuvre Valhalla. Chacun est juste pris
 * seul ; rien ne les compare. Ce script les confronte type par type : si la phrase dit
 * << droite >> et que le geste dessine autre chose, il le dit.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-fleche-manoeuvre.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gesteDeManoeuvre, type Geste } from '../src/navigation/gestes';
import { localizedInstruction } from '../src/navigation/instructions';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/** Le cote qu'une phrase annonce, lu dans son texte francais. */
function coteDeLaPhrase(phrase: string): 'gauche' | 'droite' | 'aucun' {
  const p = phrase.toLowerCase();
  const gauche = /\bgauche\b/.test(p);
  const droite = /\bdroite\b/.test(p);
  if (gauche && !droite) return 'gauche';
  if (droite && !gauche) return 'droite';
  return 'aucun';
}

/** Le cote qu'un geste dessine. */
function coteDuGeste(geste: Geste): 'gauche' | 'droite' | 'aucun' {
  if (geste.includes('gauche')) return 'gauche';
  if (geste.includes('droite')) return 'droite';
  return 'aucun';
}

/* LES TRENTE TYPES DE VALHALLA, de kNone a kFerryExit. On les parcourt tous plutot que de
 * choisir ceux qu'on croit importants : le defaut rapporte est precisement celui d'un type
 * qu'on n'avait pas regarde. */
console.log('\nCHAQUE MANOEUVRE : LA PHRASE ET LA FLECHE DISENT-ELLES LE MEME COTE ?');

const desaccords: string[] = [];
for (let type = 0; type <= 29; type += 1) {
  const phrase = localizedInstruction(
    { type, streetName: null, instruction: '', length: 0, lanes: [], surAutoroute: false } as never,
    'fr',
  );
  const geste = gesteDeManoeuvre(type);
  const cotePhrase = coteDeLaPhrase(phrase);
  const coteGeste = coteDuGeste(geste);

  /* ON NE COMPARE QUE LORSQUE LA PHRASE SE PRONONCE. Une phrase sans cote — << continuez >>,
   * << vous etes arrive >> — n'impose rien a la fleche : c'est le cas inverse qui est grave,
   * une phrase qui dit un cote et une fleche qui n'en montre aucun.
   *
   * LE DEMI-TOUR EST LA SEULE EXCEPTION, et elle est assumee. Valhalla distingue << par la
   * droite >> et << par la gauche >> ; la fleche, elle, dit << reviens sur tes pas >>, ce qui
   * est le geste. Dessiner deux demi-tours miroir obligerait a les comparer pour voir la
   * difference, et le texte porte deja la nuance. C'est le meme raisonnement que les six
   * formes pour trente manoeuvres — voir FlecheManoeuvre. */
  const demiTour = geste === 'demi-tour';
  const accord = demiTour || cotePhrase === 'aucun' || cotePhrase === coteGeste;
  const ligne = `type ${String(type).padStart(2)} · ${geste.padEnd(14)} · ${phrase}`;
  if (!accord) desaccords.push(ligne);
  console.log(`        ${accord ? '  ' : '!!'} ${ligne}`);
}

verifier(
  'aucune fleche ne contredit sa phrase',
  desaccords.length === 0,
  desaccords.length ? desaccords.join(' / ') : '30 types compares, de kNone a kFerryExit',
);

console.log('\nLES CAS QUE LE CLIENT A NOMMES');
/* Les numeros du document sont ceux de Mapbox, pas de Valhalla : il donne kTurnRight = 7,
 * alors que 7 est kBecomes et que << tourner a droite >> est 10. On verifie donc les VRAIS
 * types, ceux que notre serveur renvoie — c'est ce que la table doit suivre. */
const ATTENDUS: [number, Geste, string][] = [
  [10, 'droite', 'Tournez a droite'],
  [15, 'gauche', 'Tournez a gauche'],
  [9, 'legere-droite', 'Legerement a droite'],
  [16, 'legere-gauche', 'Legerement a gauche'],
  [18, 'droite', 'Bretelle a droite'],
  [19, 'gauche', 'Bretelle a gauche'],
  [20, 'droite', 'Sortie a droite'],
  [21, 'gauche', 'Sortie a gauche'],
  [23, 'droite', 'Rester a droite'],
  [24, 'gauche', 'Rester a gauche'],
  [12, 'demi-tour', 'Demi-tour a droite'],
  [13, 'demi-tour', 'Demi-tour a gauche'],
  [11, 'droite', 'Droite serree'],
  [14, 'gauche', 'Gauche serree'],
];
for (const [type, geste, libelle] of ATTENDUS) {
  verifier(`${libelle} (type ${type}) → ${geste}`, gesteDeManoeuvre(type) === geste);
}

console.log('\nET TOUTES LES FLECHES NE SONT PAS LA MEME');
/* Le client ecrit : << Toutes les directions affichaient la meme fleche droite >>. Si la table
 * perdait son index — un `type` indefini, par exemple — tout retomberait sur le defaut
 * << tout-droit >>. Ce controle le verrait. */
const gestes = new Set(ATTENDUS.map(([type]) => gesteDeManoeuvre(type)));
verifier(
  'les quatorze manoeuvres donnent plusieurs gestes distincts',
  gestes.size >= 5,
  [...gestes].join(', '),
);
verifier(
  "et aucune d'elles ne retombe sur << tout droit >>",
  !ATTENDUS.some(([type]) => gesteDeManoeuvre(type) === 'tout-droit'),
  'le defaut de la table : ce que l on voit quand le type est perdu',
);

console.log("\nLA FLECHE DU BANDEAU CLIGNOTE AU SEUIL D ANTICIPATION, SUR GRAND AXE");

/* POINT F.2 du 18 novembre : << La fleche doit clignoter 500 m avant chaque manoeuvre,
 * UNIQUEMENT sur autoroute et route nationale. >>
 *
 * CE N'ETAIT PAS LA RANGEE DE VOIES qui manquait — elle clignotait deja. C'etait la GRANDE
 * fleche de la consigne, celle de quatre-vingts points, celle qu'on regarde vraiment. */
const panneau = readFileSync(
  join(__dirname, '..', 'src', 'components', 'PanneauDirection.tsx'),
  'utf8',
);
verifier(
  'elle porte une opacite animee',
  /opacity: clignote/.test(panneau) && /Animated\.loop/.test(panneau),
);
verifier(
  'aux memes valeurs que la rangee de voies',
  /CLIGNOTEMENT_MS = 500/.test(panneau) && /CLIGNOTEMENT_MIN = 0\.2/.test(panneau),
  'deux objets qui clignotent cote a cote a des rythmes differents se disputent le regard',
);
/* CINQ CENTS METRES N'EST PLUS UN CHIFFRE ECRIT ICI — point 6 du 22 novembre : 50 m en
 * agglomeration, 500 m ailleurs, et c'est `distanceAnticipation` qui tranche d'apres la limite
 * reglementaire du troncon. Le controle porte donc sur le fait que le seuil soit CALCULE, et
 * que la comparaison l'utilise — pas sur sa valeur, qui est eprouvee dans verifier-voies. */
verifier(
  'a partir du seuil calcule, et non d un 500 en dur',
  /distanceAnticipation\(limiteKmh\)/.test(panneau) && /distanceM <= seuilM/.test(panneau),
);
verifier(
  'et sur grand axe seulement',
  /surGrandAxe\(surAutoroute, nomVoie\)/.test(panneau),
  'en ville, une fleche qui clignote a chaque carrefour cesse d alerter',
);

console.log(
  fautes === 0
    ? '\nLa fleche du bandeau montre ce que la phrase annonce.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
