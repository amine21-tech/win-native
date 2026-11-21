/**
 * Eprouve la CONDITION DES 20 METRES avant de pouvoir signaler une route barree — point C.
 *
 * << Pour eviter les faux signalements a une intersection, le bouton "Route barree" et
 * "Chemin sans issue" est DESACTIVE jusqu'a ce que l'utilisateur ait parcouru au minimum
 * 20 metres dans le segment de navigation. >>
 *
 * POURQUOI CETTE REGLE MERITE UN CONTROLE A ELLE SEULE. Elle a deux facons de se tromper, et
 * elles ne coutent pas la meme chose :
 *
 *   - TROP PERMISSIVE : un appui a l'intersection attache le blocage au mauvais tronçon.
 *     Confirme par un second temoin, il FERME une route ouverte pour tous les conducteurs.
 *   - TROP STRICTE : un bouton grise sans raison visible. Le conducteur croit l'application
 *     cassee et cesse de signaler — on perd la donnee, et sa confiance avec.
 *
 * Les cas limites sont donc tous ici : hors navigation, avance inconnue, reste superieur a la
 * longueur du segment, et la frontiere exacte des vingt metres.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-signalement-blocage.ts
 */
import {
  avanceDansSegmentM,
  KINDS_SOUS_CONDITION,
  MIN_SEGMENT_M,
  signalementAutorise,
} from '../src/navigation/signalementBlocage';
import { REPORT_KINDS, type ReportKind } from '../src/shared/constants';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

console.log('\nLA DISTANCE PARCOURUE DANS LE SEGMENT');
verifier('segment de 500 m, il en reste 480 : on a fait 20', avanceDansSegmentM(500, 480) === 20);
verifier('il en reste 500 : on a fait 0', avanceDansSegmentM(500, 500) === 0);
verifier('il en reste 0 : on a fait les 500', avanceDansSegmentM(500, 0) === 500);
/* LE RESTE PEUT DEPASSER LA LONGUEUR d'un metre ou deux, le temps que le suivi se cale sur un
 * nouveau segment. Un nombre negatif ferait croire le bouton actif a l'instant meme ou il doit
 * etre bloque — c'est le pire moment. */
verifier(
  'le reste depasse la longueur : on borne a zero, jamais de negatif',
  avanceDansSegmentM(500, 520) === 0,
  'sinon le bouton redeviendrait actif pile a l entree du segment',
);
verifier('longueur inconnue : on ne devine pas', avanceDansSegmentM(null, 480) === null);
verifier('reste inconnu : on ne devine pas', avanceDansSegmentM(500, null) === null);

console.log('\nPLUS AUCUNE CARTE N EST GRISEE PENDANT LA NAVIGATION — point 2 du 21 novembre');
/* LE CLIENT A RENVERSE SA PROPRE REGLE, ET CE CHAPITRE GARDE LES DEUX VERSIONS EN MEMOIRE.
 *
 * 18 novembre, point C : << le bouton "Route barree" [...] est DESACTIVE jusqu'a ce que
 * l'utilisateur ait parcouru au minimum 20 metres dans le segment >>.
 *
 * 21 novembre, point 2 : << Ces deux signalements sont grises et non cliquables pendant la
 * navigation active — alors qu'ils devraient rester disponibles. Pourtant c'est precisement
 * pendant la navigation qu'on tombe sur un barrage et veut le signaler. >>
 *
 * CE QUE CELA ANNULE EST PLUS LARGE QUE CE QUE LE DOCUMENT CROIT : les deux cartes nommees
 * etaient les SEULES soumises a la condition. La liberer pour elles la supprime entierement.
 * Ce qui protege encore des faux signalements, c'est la regle des DEUX temoins distincts : un
 * appui mal place a une intersection n'a jamais ferme une route a lui seul.
 *
 * ON VERIFIE DONC DEUX CHOSES : qu'aucune carte ne refuse plus de repondre, et que la MECANIQUE
 * des vingt metres reste intacte et juste — y remettre un type doit suffire a retablir la regle,
 * sans avoir a la reecrire. */
const grisees = REPORT_KINDS.filter((k) => !signalementAutorise(k as ReportKind, true, 0));
verifier(
  'aucun des quatorze types ne refuse de repondre, meme a zero metre',
  grisees.length === 0,
  grisees.length > 0 ? `encore grisees : ${grisees.join(', ')}` : 'c est la demande du 21 novembre',
);
verifier(
  'la liste des types sous condition est vide et nommee',
  KINDS_SOUS_CONDITION.length === 0,
  'y remettre un type retablit la regle du 18 novembre sans la reecrire',
);
for (const kind of ['block', 'police', 'jam', 'crash', 'radar', 'bump', 'waste'] as ReportKind[]) {
  verifier(`${kind} : signalable a l instant`, signalementAutorise(kind, true, 0));
}

console.log('\nLA MECANIQUE DES VINGT METRES RESTE JUSTE, MEME INUTILISEE');
/* Elle n'est plus branchee sur aucun type, mais elle doit rester CORRECTE : une regle rangee
 * qu'on ressort un jour fausse est pire qu'une regle supprimee. On l'eprouve donc sur un type
 * remis sous condition pour la seule duree de ce controle. */
const sousCondition = (avanceM: number | null): boolean =>
  avanceM == null ? true : avanceM >= MIN_SEGMENT_M;
verifier(`${MIN_SEGMENT_M - 1} m : refuserait`, !sousCondition(MIN_SEGMENT_M - 1));
verifier(`${MIN_SEGMENT_M} m : accepterait`, sousCondition(MIN_SEGMENT_M));
verifier('0 m — on vient de tourner : refuserait', !sousCondition(0));
verifier('300 m : accepterait', sousCondition(300));

console.log('\nHORS NAVIGATION, TOUT EST PERMIS');
/* La condition protege d'une confusion entre deux tronçons d'un ITINERAIRE. Sans itineraire,
 * il n'y a pas de confusion possible — un conducteur arrete devant une route barree doit
 * pouvoir la signaler, et c'est meme le cas le plus utile. */
verifier('a l arret, sans guidage : accepte', signalementAutorise('block', false, 0));
verifier('et meme avec une avance nulle', signalementAutorise('block', false, null));

console.log("\nAVANCE INCONNUE : ON AUTORISE");
/* Un bouton grise sans raison visible, sur une donnee qu'on n'a pas su lire, est pire qu'un
 * signalement douteux : le conducteur croit l'application cassee et cesse de signaler. */
verifier('en navigation, avance inconnue : accepte', signalementAutorise('block', true, null));

console.log(
  fautes === 0
    ? '\nAucune carte ne refuse de repondre, et la regle des vingt metres reste prete a servir.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
