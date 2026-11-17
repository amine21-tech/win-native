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

console.log('\nLA FRONTIERE DES VINGT METRES');
verifier(`${MIN_SEGMENT_M - 1} m : refuse`, !signalementAutorise('block', true, MIN_SEGMENT_M - 1));
verifier(`${MIN_SEGMENT_M} m : accepte`, signalementAutorise('block', true, MIN_SEGMENT_M));
verifier('0 m — on vient de tourner : refuse', !signalementAutorise('block', true, 0));
verifier('300 m : accepte', signalementAutorise('block', true, 300));

console.log("\nSEULS LES SIGNALEMENTS QUI DETOURNENT SONT CONCERNES");
/* Les autres informent sans modifier le trajet des autres : un bouchon attache au mauvais
 * tronçon se corrige tout seul en quelques minutes, une route fermee a tort ne se corrige
 * pas. Les griser aussi couterait des signalements sans rien proteger. */
const bloques = REPORT_KINDS.filter((k) => !signalementAutorise(k as ReportKind, true, 0));
verifier(
  'route barree et barrage attendent, les douze autres non',
  bloques.length === 2 && bloques.includes('block') && bloques.includes('police'),
  bloques.join(', '),
);
for (const kind of ['jam', 'crash', 'radar', 'bump', 'waste'] as ReportKind[]) {
  verifier(`${kind} reste signalable a l instant`, signalementAutorise(kind, true, 0));
}

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
    ? '\nLe bouton attend vingt metres, et seulement quand cela protege quelque chose.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
