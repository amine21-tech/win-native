/**
 * Eprouve la regle du VIRAGE RATE (correctif du 8 novembre, point 3).
 *
 * POURQUOI CE SCRIPT. Le document donne le code a ecrire :
 *
 *     if (distancePastTurnPoint > 20.0) { triggerReroute(); }
 *
 * Applique tel quel, il recalcule l'itineraire a CHAQUE virage pris correctement : le point de
 * manoeuvre est au milieu du carrefour, et vingt metres plus loin on l'a depasse de vingt metres
 * — qu'on ait tourne ou non. Sur un trajet urbain, cela ferait un recalcul par carrefour.
 *
 * Le defaut est invisible a la relecture : la condition du document est juste, elle est seulement
 * INCOMPLETE, et rien dans son texte ne le laisse voir. Il ne se verrait qu'en voiture, sous la
 * forme d'une application qui recalcule sans arret alors qu'on suit exactement sa consigne.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-manoeuvre-ratee.ts
 */
import {
  EST_MANOEUVRE_RATABLE,
  EST_SORTIE,
  MANOEUVRE_RATEE_M,
  manoeuvreRatee,
} from '../src/navigation/manoeuvreRatee';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/** Tolerance typique a vitesse urbaine (voir DEVIATION_BANDS : 30 m sous 30 km/h). */
const TOLERANCE = 30;

/* ------------------------------------------------------------------ */
console.log('\nLE VIRAGE PRIS CORRECTEMENT NE DECLENCHE RIEN');

/**
 * C'EST LE CONTROLE QUI JUSTIFIE TOUT LE FICHIER. Un conducteur qui tourne depasse forcement le
 * point de manoeuvre : il reste simplement SUR le trace. Le seul seuil de distance du document
 * ne fait pas la difference ; la condition a deux termes, oui.
 */
for (const depassementM of [21, 40, 120, 600]) {
  verifier(
    `virage a droite pris, ${depassementM} m au-dela du point`,
    !manoeuvreRatee({ type: 10, depassementM, ecartM: 4, toleranceM: TOLERANCE }),
    'sur le trace a 4 m : on a tourne',
  );
}
verifier(
  'rond-point pris, 200 m au-dela',
  !manoeuvreRatee({ type: 26, depassementM: 200, ecartM: 9, toleranceM: TOLERANCE }),
  'un rond-point eloigne du point de manoeuvre sans jamais quitter le trace',
);

console.log('\nLE VIRAGE MANQUE DECLENCHE, AU-DELA DE 20 m ET HORS DU TRACE');
verifier(
  `a ${MANOEUVRE_RATEE_M + 1} m du point, 45 m hors du trace`,
  manoeuvreRatee({ type: 10, depassementM: 21, ecartM: 45, toleranceM: TOLERANCE }),
  'c est la situation du document : passe devant sans tourner',
);
verifier(
  'demi-tour manque',
  manoeuvreRatee({ type: 12, depassementM: 60, ecartM: 80, toleranceM: TOLERANCE }),
);
verifier(
  'sortie d autoroute manquee',
  manoeuvreRatee({ type: 20, depassementM: 25, ecartM: 35, toleranceM: 20 }),
  'a 110 km/h la tolerance descend a 20 m',
);

console.log('\nLE SEUIL EST BIEN A 20 m, PAS A 30');
verifier(
  '20 m pile : pas encore',
  !manoeuvreRatee({ type: 10, depassementM: 20, ecartM: 60, toleranceM: TOLERANCE }),
  'le document ecrit « > 20 », strictement',
);
verifier(
  '20,5 m : oui',
  manoeuvreRatee({ type: 10, depassementM: 20.5, ecartM: 60, toleranceM: TOLERANCE }),
  'il fallait 30 m jusqu au 8 novembre, et seulement pour les sorties',
);

/* ------------------------------------------------------------------ */
console.log('\n« CONTINUEZ TOUT DROIT » NE SE RATE PAS');

/**
 * Le trace d'un Alger-Oran compte des dizaines de manoeuvres de type 8. Chacune est depassee de
 * bien plus de vingt metres, par construction. Si elles comptaient, l'application recalculerait
 * en boucle des qu'un GPS derive de trente metres sur une route droite — c'est-a-dire tout le
 * temps, dans un tunnel ou entre deux immeubles.
 */
verifier(
  'tout droit, 500 m au-dela et 60 m hors du trace',
  !manoeuvreRatee({ type: 8, depassementM: 500, ecartM: 60, toleranceM: TOLERANCE }),
  'un GPS qui derive sur une ligne droite ne doit pas faire recalculer',
);
for (const [type, nom] of [
  [1, 'depart'],
  [2, 'depart a droite'],
  [3, 'depart a gauche'],
  [4, 'arrivee'],
  [5, 'destination a droite'],
  [6, 'destination a gauche'],
] as [number, string][]) {
  verifier(
    `${nom} (type ${type}) : jamais`,
    !manoeuvreRatee({ type, depassementM: 300, ecartM: 90, toleranceM: TOLERANCE }),
  );
}

/* ------------------------------------------------------------------ */
console.log('\nL ECART SEUL NE SUFFIT PAS NON PLUS');

/**
 * L'autre moitie du raisonnement. Un ecart au trace AVANT le virage est une deviation ordinaire,
 * qui a sa propre regle — avec un delai de confirmation, precisement pour ne pas recalculer sur
 * un saut de GPS. Si cette regle-ci s'y declenchait aussi, elle court-circuiterait ce delai.
 */
verifier(
  'hors du trace mais le virage est encore devant',
  !manoeuvreRatee({ type: 10, depassementM: -80, ecartM: 70, toleranceM: TOLERANCE }),
  'depassement negatif : on n a pas encore atteint le point',
);
verifier(
  'hors du trace, 10 m apres le point',
  !manoeuvreRatee({ type: 10, depassementM: 10, ecartM: 70, toleranceM: TOLERANCE }),
  'la deviation ordinaire s en charge, avec son delai de confirmation',
);
verifier(
  'juste a la tolerance : pas encore sorti',
  !manoeuvreRatee({ type: 10, depassementM: 50, ecartM: TOLERANCE, toleranceM: TOLERANCE }),
  'la tolerance suit la precision annoncee par le GPS',
);

/* ------------------------------------------------------------------ */
console.log('\nLES DEUX JEUX DE TYPES SE TIENNENT');

verifier(
  'toute sortie est une manoeuvre ratable',
  [...EST_SORTIE].every((t) => EST_MANOEUVRE_RATABLE.has(t)),
  'sinon la regle du 27 octobre aurait ete perdue en elargissant celle du 8 novembre',
);
verifier(
  'tout droit n est pas ratable',
  !EST_MANOEUVRE_RATABLE.has(8),
);
verifier(
  `${EST_MANOEUVRE_RATABLE.size} types ratables sur les 30 de Valhalla`,
  EST_MANOEUVRE_RATABLE.size === 18,
  [...EST_MANOEUVRE_RATABLE].join(', '),
);

console.log(
  fautes === 0
    ? '\nLe virage manque est repere a 20 m, et le virage pris ne declenche rien.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
