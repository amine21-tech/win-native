/**
 * Verifie que CHAQUE type de signalement se distingue des autres sur la carte.
 *
 * POURQUOI CE SCRIPT EXISTE. Avant la synthese du 29 octobre, QUATRE types portaient
 * exactement la meme couleur — accident, objet sur la route, route bloquee et incendie etaient
 * tous `#D64545` ; dos d'ane et trou partageaient le meme ambre. Six types, trois teintes.
 *
 * Sur la carte, deux pastilles identiques ne disent rien de plus qu'une seule. Le conducteur
 * qui en apercoit une au loin ne sait pas s'il doit ralentir, changer de file ou faire
 * demi-tour — et c'est precisement la decision que la couleur devrait lui permettre de prendre
 * avant d'avoir lu quoi que ce soit.
 *
 * Le defaut est invisible a la relecture : chaque ligne du tableau est juste prise seule, et
 * rien dans le code ne rapproche deux types qui se ressemblent. Il faut comparer la table a
 * elle-meme, ce que personne ne fait a l'oeil sur treize entrees.
 *
 * CE QUI EST VERIFIE :
 *   - tout type connu a une couleur ;
 *   - deux types differents n'ont jamais la meme, a une exception assumee pres ;
 *   - les couleurs sont assez eloignees les unes des autres pour se distinguer d'un coup
 *     d'oeil, et pas seulement differentes d'un point de teinte.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-couleurs-signalements.ts
 */
import { REPORT_KINDS, type ReportKind } from '../src/shared/constants';
import { REPORT_COLORS } from '../src/map/style';

/**
 * Ecart minimal admis entre deux couleurs, en distance euclidienne dans l'espace RVB.
 *
 * Quarante est volontairement bas : il ne pretend pas mesurer la perception, seulement
 * attraper les quasi-doublons — deux teintes si proches qu'elles se confondent sur une
 * pastille de quinze points, vue depuis un pare-brise, en plein soleil.
 */
const ECART_MIN = 40;

function rvb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function ecart(a: string, b: string): number {
  const [r1, v1, b1] = rvb(a);
  const [r2, v2, b2] = rvb(b);
  return Math.hypot(r1 - r2, v1 - v2, b1 - b2);
}

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

console.log('\nTOUT TYPE A UNE COULEUR');
for (const kind of REPORT_KINDS) {
  const couleur = REPORT_COLORS[kind];
  if (!couleur) verifier(`« ${kind} » a une couleur`, false, 'absente de REPORT_COLORS');
}
verifier(
  `les ${REPORT_KINDS.length} types sont tous servis`,
  REPORT_KINDS.every((k) => Boolean(REPORT_COLORS[k])),
);

console.log('\nDEUX TYPES NE PARTAGENT JAMAIS UNE COULEUR');
const vus = new Map<string, ReportKind>();
for (const kind of REPORT_KINDS) {
  const couleur = REPORT_COLORS[kind];
  if (!couleur) continue;
  const deja = vus.get(couleur);
  if (deja) {
    verifier(`« ${kind} » et « ${deja} »`, false, `partagent ${couleur}`);
  } else {
    vus.set(couleur, kind);
  }
}
if (fautes === 0) console.log('  ok    aucune couleur en double');

console.log(`\nDEUX COULEURS SE DISTINGUENT D'UN COUP D'OEIL (ecart minimal ${ECART_MIN})`);
const proches: string[] = [];
const types = REPORT_KINDS.filter((k) => REPORT_COLORS[k]);
for (let i = 0; i < types.length; i++) {
  for (let j = i + 1; j < types.length; j++) {
    const a = types[i]!;
    const b = types[j]!;
    const d = ecart(REPORT_COLORS[a]!, REPORT_COLORS[b]!);
    if (d < ECART_MIN) proches.push(`${a} / ${b} : ${d.toFixed(0)}`);
  }
}
verifier(
  'aucune paire trop proche',
  proches.length === 0,
  proches.join(' · ') || `${(types.length * (types.length - 1)) / 2} paires comparees`,
);

/* Les familles du client : ce qui blesse, ce qui ferme, ce qui encombre, l'eau et l'autorite.
 * Ce controle ne juge pas la teinte exacte — il verifie seulement que l'intention du tableau
 * du 29 octobre n'a pas ete perdue en route lors d'une retouche ulterieure. */
console.log('\nLES DISTINCTIONS QUE LE CLIENT A DEMANDEES');
const distinctes: [ReportKind, ReportKind, string][] = [
  ['crash', 'block', 'un accident n\'est pas une voie fermee'],
  ['crash', 'object', 'un obstacle encombre, il ne blesse pas'],
  ['bump', 'pothole', 'un trou n\'est pas un dos d\'ane'],
  ['radar', 'police', 'un radar n\'est pas un barrage'],
];
for (const [a, b, pourquoi] of distinctes) {
  const d = ecart(REPORT_COLORS[a]!, REPORT_COLORS[b]!);
  verifier(`${a} ≠ ${b}`, d >= ECART_MIN, `${pourquoi} (ecart ${d.toFixed(0)})`);
}

console.log(
  fautes === 0
    ? '\nChaque signalement se reconnait a sa couleur.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
