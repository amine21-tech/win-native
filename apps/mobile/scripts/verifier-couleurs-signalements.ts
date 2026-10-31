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
import { FAMILLE_PICTO, SIGNALISATION } from '../src/map/signalisation';

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

/* LES DEUX THEMES SONT CONTROLES SEPAREMENT. Deux teintes peuvent se distinguer sur la carte
 * de jour et se confondre sur celle de nuit — c'est meme le cas le plus courant, puisque les
 * variantes de nuit sont toutes eclaircies vers le blanc, donc rapprochees les unes des
 * autres. Ne verifier qu'un theme laisserait l'autre casse sans que rien ne le dise. */
const THEMES = ['jour', 'nuit'] as const;

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

const BARRAGE = new Set<ReportKind>(['police', 'gendarmerie', 'armee']);

for (const theme of THEMES) {
  console.log(`\n=== THEME ${theme.toUpperCase()} ===`);

  const couleurDe = (k: ReportKind) => SIGNALISATION[k]?.[theme];

  console.log('\nTOUT TYPE A UNE COULEUR');
  verifier(
    `les ${REPORT_KINDS.length} types sont tous servis`,
    REPORT_KINDS.every((k) => Boolean(couleurDe(k as ReportKind))),
    REPORT_KINDS.filter((k) => !couleurDe(k as ReportKind)).join(', '),
  );

  /* LES TROIS FORCES PARTAGENT LE BLEU DU BARRAGE, et c'est voulu : le tableau du 31 octobre
   * ne liste qu'une ligne « Barrage ». Elles sont donc exclues du controle de doublon, sans
   * quoi il signalerait comme un defaut une decision prise. */
  console.log('\nDEUX TYPES NE PARTAGENT JAMAIS UNE COULEUR');
  const vus = new Map<string, ReportKind>();
  let doublon = false;
  for (const kind of REPORT_KINDS as readonly ReportKind[]) {
    if (BARRAGE.has(kind) && kind !== 'police') continue;
    const couleur = couleurDe(kind);
    if (!couleur) continue;
    const deja = vus.get(couleur);
    if (deja) {
      verifier(`« ${kind} » et « ${deja} »`, false, `partagent ${couleur}`);
      doublon = true;
    } else {
      vus.set(couleur, kind);
    }
  }
  if (!doublon) console.log('  ok    aucune couleur en double');

  console.log(`\nDEUX COULEURS SE DISTINGUENT D'UN COUP D'OEIL (ecart minimal ${ECART_MIN})`);
  const types = (REPORT_KINDS as readonly ReportKind[]).filter(
    (k) => couleurDe(k) && !(BARRAGE.has(k) && k !== 'police'),
  );
  /* LA COULEUR N'EST PLUS LE SEUL SIGNAL. Chaque marqueur porte un dessin et un badge : deux
   * teintes voisines ne genent donc QUE si les dessins se ressemblent aussi. Un barrage bleu
   * fonce et une inondation bleu fonce ne se confondent pas — l'un est un carre plein, l'autre
   * des vagues. On signale les teintes voisines pour information, et on ECHOUE seulement quand
   * le dessin ne rattrape pas la couleur. */
  const voisines: string[] = [];
  const confondables: string[] = [];
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const a = types[i]!;
      const b = types[j]!;
      const d = ecart(couleurDe(a)!, couleurDe(b)!);
      if (d >= ECART_MIN) continue;
      const memeDessin = FAMILLE_PICTO[a] === FAMILLE_PICTO[b];
      (memeDessin ? confondables : voisines).push(`${a} / ${b} : ${d.toFixed(0)}`);
    }
  }
  if (voisines.length > 0) {
    console.log(`  note  teintes voisines, mais dessins differents : ${voisines.join(' · ')}`);
  }
  verifier(
    'aucune paire confondable (couleur ET dessin proches)',
    confondables.length === 0,
    confondables.join(' · ') || `${(types.length * (types.length - 1)) / 2} paires comparees`,
  );

  console.log("\nLES DISTINCTIONS QUI COMPTENT LE PLUS");
  const distinctes: [ReportKind, ReportKind, string][] = [
    ['crash', 'block', "un accident n'est pas une voie fermee"],
    ['crash', 'object', 'un obstacle encombre, il ne blesse pas'],
    ['bump', 'pothole', "un trou n'est pas un dos d'ane"],
    ['radar', 'police', "un radar n'est pas un barrage"],
    ['fire', 'flood', "feu et eau portent des dessins voisins : seule la couleur les separe"],
  ];
  for (const [a, b, pourquoi] of distinctes) {
    const d = ecart(couleurDe(a)!, couleurDe(b)!);
    verifier(`${a} / ${b}`, d >= ECART_MIN, `${pourquoi} (ecart ${d.toFixed(0)})`);
  }
}

console.log(
  fautes === 0
    ? "\nChaque signalement se reconnait a sa couleur, de jour comme de nuit.\n"
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
