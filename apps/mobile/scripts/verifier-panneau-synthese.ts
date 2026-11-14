/**
 * Verifie le PANNEAU DE SIGNALEMENT contre la page << panneau >> de la synthese du 13 novembre.
 *
 * CE QUE CETTE PAGE DEMANDE, carte par carte :
 *
 *   CIRCULATION    Bouchon (voiture + souffle)        Accident (gyrophare)
 *   ROUTE          Barrage (chevalet)                 Travaux (marteau)
 *                  Route barree (sens interdit)       Objet sur la route (carton)
 *                  + badge dore << MIS A JOUR >>
 *   ENVIRONNEMENT  Dechets sauvages (poubelle)
 *
 * POURQUOI UN SCRIPT PLUTOT QU'UNE RELECTURE. Six de ces sept symboles ont CHANGE le
 * 14 novembre, et quatre d'entre eux ont un jumeau dans la table de la carte — qui, lui, ne
 * change pas. Une table de douze lignes dont la moitie a un homonyme ailleurs est exactement
 * le genre d'endroit ou une correction se perd : on remplace l'emoji de la carte en croyant
 * corriger le menu, et les deux surfaces se mettent a mentir chacune de leur cote.
 *
 * LA VERIFICATION QUI COMPTE VRAIMENT est la derniere : qu'aucune surface ne montre deux fois
 * le meme symbole. C'est la raison d'etre de la divergence entre les deux pages de la synthese
 * (voir MENU_SPECIFIQUE), et c'est une propriete qu'aucune relecture ligne a ligne ne verifie.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-panneau-synthese.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  menuEmoji,
  REPORT_BADGE,
  REPORT_EMOJI,
  REPORT_MENU_ORDER,
  SECTIONS_MENU,
} from '../src/reports/kinds';
import { REPORT_KINDS, type ReportKind } from '../src/shared/constants';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/* LES SEPT CARTES DE LA MAQUETTE, dans son ordre, avec le symbole qu'elle montre.
 * Les cinq autres types de l'application n'y figurent pas : la maquette ne se prononce pas
 * sur eux, et ce script ne leur impose donc rien. */
const MAQUETTE: ReadonlyArray<readonly [ReportKind, string, string]> = [
  ['jam', '🚗💨', 'Bouchon'],
  ['crash', '🚨', 'Accident'],
  ['police', '🚧', 'Barrage'],
  ['works', '🔨', 'Travaux'],
  ['block', '⛔', 'Route barrée'],
  ['object', '📦', 'Objet sur la route'],
  ['waste', '🗑️', 'Déchets sauvages'],
];

console.log('\nLE MENU MONTRE LES SYMBOLES DE LA PAGE << PANNEAU >>');
for (const [kind, attendu, libelle] of MAQUETTE) {
  const rendu = menuEmoji(kind);
  verifier(`${libelle.padEnd(18)} ${kind}`, rendu === attendu, `${rendu} attendu ${attendu}`);
}

console.log('\nLA CARTE GARDE CEUX DE LA PAGE << 12 SYMBOLES >>');
/* Les quatre types ou les deux pages divergent. Si quelqu'un << harmonise >> les deux tables
 * un jour, c'est ici que cela se verra — et la note de MENU_SPECIFIQUE dit pourquoi il ne
 * faut pas : le chevalet appartient a Route barree SUR LA CARTE, ou aucun libelle ne vient
 * lever l'ambiguite. */
const CARTE: ReadonlyArray<readonly [ReportKind, string]> = [
  ['crash', '💥'],
  ['police', '🚓'],
  ['works', '🏗️'],
  ['block', '🚧'],
  ['object', '⚠️'],
];
for (const [kind, attendu] of CARTE) {
  verifier(`${kind.padEnd(10)} sur la carte`, REPORT_EMOJI[kind] === attendu, `${REPORT_EMOJI[kind]} attendu ${attendu}`);
}

console.log("\nAUCUNE SURFACE NE MONTRE DEUX FOIS LE MEME SYMBOLE");
/* LES TROIS FORCES SONT EXCLUES : elles designent le meme barrage et ne sont plus creables
 * depuis le 9 novembre — leur jumelage est voulu, pas subi. */
const FORCES: ReadonlyArray<ReportKind> = ['gendarmerie', 'armee'];
function collisions(table: (k: ReportKind) => string, types: ReadonlyArray<ReportKind>): string[] {
  const vus = new Map<string, ReportKind>();
  const trouvees: string[] = [];
  for (const kind of types) {
    if (FORCES.includes(kind)) continue;
    const symbole = table(kind);
    const deja = vus.get(symbole);
    if (deja) trouvees.push(`${deja} = ${kind} (${symbole})`);
    else vus.set(symbole, kind);
  }
  return trouvees;
}
const doublonsMenu = collisions(menuEmoji, REPORT_MENU_ORDER);
verifier(
  'dans le menu, douze cartes, douze dessins',
  doublonsMenu.length === 0,
  doublonsMenu.join(' · ') || `${REPORT_MENU_ORDER.length} cartes comparees`,
);
const doublonsCarte = collisions((k) => REPORT_EMOJI[k], REPORT_KINDS as ReadonlyArray<ReportKind>);
verifier(
  'sur la carte, douze marqueurs, douze dessins',
  doublonsCarte.length === 0,
  doublonsCarte.join(' · ') || 'le chevalet reste a Route barree',
);

console.log('\nLE BADGE DORE << MIS A JOUR >> EST SUR ROUTE BARREE');
verifier('Route barree le porte', REPORT_BADGE.block === 'misAJour');
verifier('Dechets sauvages garde << Nouveau >>', REPORT_BADGE.waste === 'nouveau');
verifier(
  'et personne d autre n en porte',
  Object.keys(REPORT_BADGE).length === 2,
  `${Object.keys(REPORT_BADGE).join(', ')} — deux badges sur douze cartes, sinon ils ne disent plus rien`,
);

/* LE LIBELLE DU BADGE EXISTE DANS LES CINQ LANGUES. Une cle absente ne plante pas : i18next
 * affiche la cle elle-meme, et la carte porterait << report.badge_misAJour >> en toutes
 * lettres. C'est le genre de defaut qui passe un build et se voit sur le telephone. */
console.log('\nSES LIBELLES EXISTENT DANS LES CINQ LANGUES');
for (const langue of ['fr', 'en', 'ar', 'dz', 'kab']) {
  const chemin = join(__dirname, '..', 'src', 'i18n', 'locales', `${langue}.json`);
  const dico = JSON.parse(readFileSync(chemin, 'utf8')) as { report?: Record<string, string> };
  const neuf = dico.report?.badge_nouveau;
  const maj = dico.report?.badge_misAJour;
  verifier(`${langue.padEnd(4)}`, Boolean(neuf) && Boolean(maj), `${neuf ?? '—'} / ${maj ?? '—'}`);
}

console.log('\nLES TROIS SECTIONS SONT CELLES DE LA MAQUETTE, DANS SON ORDRE');
verifier(
  'circulation, route, environnement',
  SECTIONS_MENU.map((s) => s.cle).join(',') === 'circulation,route,environnement',
  SECTIONS_MENU.map((s) => `${s.cle} (${s.types.length})`).join(' · '),
);
/* L'ORDRE INTERNE QUE LA MAQUETTE FIXE. Elle ne se prononce que sur ses sept cartes ; on
 * verifie donc que celles-ci se suivent dans son ordre, pas que la liste entiere lui soit
 * identique — les cinq types qu'elle ne montre pas gardent leur place. */
const positions = MAQUETTE.map(([k]) => REPORT_MENU_ORDER.indexOf(k));
verifier(
  'Bouchon, Accident, Barrage, Travaux, Route barree, Objet, Dechets',
  positions.every((p, i) => p >= 0 && (i === 0 || p > (positions[i - 1] ?? -1))),
  positions.join(' < '),
);

console.log(
  fautes === 0
    ? '\nLe panneau est celui de la synthese.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
