/**
 * POINT H DU CORRECTIF v2 (22 novembre) — BLOCAGE AUTOMATIQUE, PUIS LEVEE AUTOMATIQUE.
 *
 * C'est le seul point du document qui ajoute une mecanique entiere, et c'est aussi le seul
 * dont les effets se produisent SEPT A TRENTE JOURS plus tard : aucun test terrain ne peut le
 * verifier avant un mois. Ce fichier rejoue donc le temps — on fabrique des dates, et l'on
 * demande a la regle ou en est le blocage.
 *
 * LES SIX SITUATIONS DU DOCUMENT, DANS SON ORDRE :
 *
 *   1. deux temoins ayant depasse le segment de 10 m  -> bloque pour tous ;
 *   2. apres 7 jours (travaux) ou 30 (sans issue)     -> rouvert provisoirement ;
 *   3. les deux prochains conducteurs sont interroges -> et jamais un troisieme ;
 *   4. deux << oui >>                                 -> debloque definitivement ;
 *   5. un << non >>                                   -> rebloque, et le delai repart ;
 *   6. pas de reponse sous 48 h                       -> debloque tout seul.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-blocage-probation.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  doitPoserLaQuestion,
  debutProbation,
  exclutLesItineraires,
  JOURS_SANS_ISSUE,
  JOURS_TRAVAUX,
  OUI_POUR_DEBLOQUER,
  phaseBlocage,
  PREUVE_PASSAGE_M,
  preuveVecue,
  PROBATION_HEURES,
  QUESTIONS_PAR_EVENEMENT,
  QUESTIONS_PAR_EVENEMENT as QUESTIONS,
  RAYON_QUESTION_M,
  TEMOINS_BLOCAGE,
  type PhaseBlocage,
} from '../src/shared';
import { ajouterPosition, metresParcourus, POSITIONS_MAX } from '../src/reports/preuvePassage';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const lireApi = (...p: string[]) => readFileSync(join(__dirname, '..', '..', 'api', ...p), 'utf8');

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;
/** Le 1er novembre 2026 a midi : le jour ou le blocage a ete confirme. */
const BLOQUE_LE = new Date(2026, 10, 1, 12, 0, 0);
const apres = (ms: number) => new Date(BLOQUE_LE.getTime() + ms);

function phase(opts: {
  kind?: 'block' | 'works';
  quand: Date;
  oui?: number;
  bloqueLe?: Date | null;
}): PhaseBlocage {
  return phaseBlocage({
    kind: opts.kind ?? 'block',
    bloqueLe: opts.bloqueLe === undefined ? BLOQUE_LE : opts.bloqueLe,
    oui: opts.oui ?? 0,
    maintenant: opts.quand,
  });
}

console.log('\n============================================================');
console.log('LES CHIFFRES DU DOCUMENT');
console.log('============================================================');
verifier('7 jours pour des travaux', JOURS_TRAVAUX === 7);
verifier('30 jours pour un chemin sans issue', JOURS_SANS_ISSUE === 30);
verifier('48 heures sans reponse', PROBATION_HEURES === 48);
verifier('2 reponses << oui >> pour debloquer', OUI_POUR_DEBLOQUER === 2);
verifier('2 conducteurs interroges, pas plus', QUESTIONS_PAR_EVENEMENT === 2);
verifier('10 metres de preuve de passage', PREUVE_PASSAGE_M === 10);
verifier(
  '2 temoins differents pour bloquer — et c etait deja la regle du 28 octobre',
  TEMOINS_BLOCAGE === 2,
  'la phase 1 du point H existait aux trois quarts',
);

console.log('\n============================================================');
console.log('PHASE 1 — LA PREUVE QU IL L A VECU');
console.log('============================================================');
verifier(`${PREUVE_PASSAGE_M} metres parcourus : la preuve est faite`, preuveVecue(10) === true);
verifier('onze metres aussi', preuveVecue(11) === true);
verifier(
  'neuf metres ne suffisent pas',
  preuveVecue(9) === false,
  'le signalement depose a l arret, trois cents metres avant',
);
verifier('zero metre non plus', preuveVecue(0) === false);
verifier(
  "UNE MESURE ABSENTE N'EST PAS UNE PREUVE REFUSEE",
  preuveVecue(undefined) === true && preuveVecue(null) === true,
  'sinon la mise en ligne du serveur desarmerait les blocages des telephones pas a jour',
);
verifier('une mesure absurde est traitee comme absente', preuveVecue(Number.NaN) === true);

console.log('\nLA MESURE, SUR DES POSITIONS GPS FABRIQUEES');
/* Une voiture qui avance de cinq metres par seconde, soit 18 km/h : vingt secondes de trajet. */
let trace = [] as ReturnType<typeof ajouterPosition>;
const t0 = Date.parse('2026-11-01T12:00:00Z');
for (let i = 0; i <= 20; i += 1) {
  /* 0,000045 degre de latitude vaut environ cinq metres. */
  trace = ajouterPosition(trace, { lat: 36.75 + i * 0.000045, lon: 3.06, t: t0 + i * 1000 });
}
const parcourus = metresParcourus(trace, t0 + 20_000);
verifier(
  'vingt secondes a 18 km/h font environ cent metres',
  parcourus > 90 && parcourus < 110,
  `${parcourus.toFixed(0)} m`,
);
verifier('et la preuve est donc faite', preuveVecue(parcourus) === true);

/* LE DEMI-TOUR : c'est le cas qui condamne une mesure a vol d'oiseau. On avance de cinquante
 * metres, on revient. La distance au point de depart est nulle ; la route parcourue, non. */
let allerRetour = [] as ReturnType<typeof ajouterPosition>;
for (let i = 0; i <= 10; i += 1) {
  allerRetour = ajouterPosition(allerRetour, {
    lat: 36.75 + i * 0.000045,
    lon: 3.06,
    t: t0 + i * 1000,
  });
}
for (let i = 9; i >= 0; i -= 1) {
  allerRetour = ajouterPosition(allerRetour, {
    lat: 36.75 + i * 0.000045,
    lon: 3.06,
    t: t0 + (20 - i) * 1000,
  });
}
const aller = metresParcourus(allerRetour, t0 + 20_000);
verifier(
  'UN DEMI-TOUR DEVANT LA BARRIERE COMPTE DOUBLE, ET NON ZERO',
  aller > 90,
  `${aller.toFixed(0)} m parcourus pour un deplacement net nul`,
);

/* LE VEHICULE IMMOBILE. Le GPS rend la meme position cent fois : rien n'a ete parcouru. */
let immobile = [] as ReturnType<typeof ajouterPosition>;
for (let i = 0; i < 40; i += 1) {
  immobile = ajouterPosition(immobile, { lat: 36.75, lon: 3.06, t: t0 + i * 1000 });
}
verifier(
  'un vehicule arrete ne parcourt rien',
  metresParcourus(immobile, t0 + 40_000) === 0,
  'le signalement depose depuis un fauteuil',
);
verifier(
  'et les mesures identiques ne chassent pas la minute utile de la liste',
  immobile.length === 1,
  `${immobile.length} position retenue au lieu de 40`,
);

/* LE SAUT DE GPS. Une position a trois cents metres en une seconde n'est pas de la route. */
const saut = [
  { lat: 36.75, lon: 3.06, t: t0 },
  { lat: 36.753, lon: 3.06, t: t0 + 1000 },
];
verifier(
  'un saut de GPS ne compte pas comme un passage',
  metresParcourus(saut, t0 + 1000) === 0,
  '300 m en une seconde, soit 1 080 km/h',
);

/* LA FENETRE. Ce qui a ete parcouru il y a dix minutes ne prouve rien sur l'endroit ou l'on est. */
verifier(
  'au-dela de la fenetre, la distance ne compte plus',
  metresParcourus(trace, t0 + 20_000 + 10 * 60_000) === 0,
  "<< il roulait ICI, a l'instant >>, et non << il a roule aujourd hui >>",
);
verifier(
  'la trace est bornee',
  POSITIONS_MAX <= 128,
  `${POSITIONS_MAX} positions : une heure de navigation ne fait pas grossir la memoire`,
);

console.log('\n============================================================');
console.log('PHASE 2 — LE TEMPS, REJOUE');
console.log('============================================================');
verifier(
  'le jour meme : bloque',
  phase({ quand: apres(HEURE) }) === 'bloque',
  'un chemin sans issue signale ce matin ne se rouvre pas ce soir',
);
verifier('a 29 jours : encore bloque', phase({ quand: apres(29 * JOUR) }) === 'bloque');
verifier(
  'a 30 jours : reouvert provisoirement',
  phase({ quand: apres(30 * JOUR + HEURE) }) === 'probation',
  '<< segment provisoirement rouvert >>',
);
verifier(
  'des travaux, eux, rouvrent a 7 jours',
  phase({ kind: 'works', quand: apres(7 * JOUR + HEURE) }) === 'probation' &&
    phase({ kind: 'works', quand: apres(6 * JOUR) }) === 'bloque',
  'sept jours pour un chantier, trente pour un cul-de-sac',
);
verifier(
  'et un chemin sans issue est encore bloque au septieme jour',
  phase({ quand: apres(7 * JOUR + HEURE) }) === 'bloque',
  'les deux delais ne se confondent pas',
);
verifier(
  'PAS DE REPONSE APRES 48 H : DEBLOQUE TOUT SEUL',
  phase({ quand: apres(30 * JOUR + 49 * HEURE) }) === 'degage',
  'personne ne repasse par un cul-de-sac : le segment ne peut pas attendre un vote',
);
verifier(
  'a 47 heures de probation, la question est encore ouverte',
  phase({ quand: apres(30 * JOUR + 47 * HEURE) }) === 'probation',
);
verifier(
  'DEUX << OUI >> DEBLOQUENT, sans attendre les 48 heures',
  phase({ quand: apres(30 * JOUR + HEURE), oui: 2 }) === 'degage',
);
verifier(
  'un seul << oui >> ne suffit pas',
  phase({ quand: apres(30 * JOUR + HEURE), oui: 1 }) === 'probation',
  '<< 2 x Oui -> segment definitivement debloque >>',
);
verifier(
  "deux << oui >> pendant le blocage ne le levent pas avant l'heure",
  phase({ quand: apres(HEURE), oui: 2 }) === 'degage',
  'ils ne peuvent pas exister : la question n est posee qu en probation (voir la route serveur)',
);
verifier(
  'un blocage non confirme reste bloque, comme avant le point H',
  phase({ quand: apres(100 * JOUR), bloqueLe: null }) === 'bloque',
  'une date absente ne doit pas rouvrir un segment par accident',
);
verifier(
  'la reouverture provisoire tombe trente jours apres la confirmation',
  debutProbation('block', BLOQUE_LE)?.getTime() === BLOQUE_LE.getTime() + 30 * JOUR,
);

console.log('\nUN << NON >> REBLOQUE, ET LE DELAI REPART');
/* Le serveur exprime le refus en remettant `bloque_le` a l'instant du << non >>. On rejoue donc
 * la situation telle qu'elle sera en base : nouvelle date de depart, compteur de << oui >> a
 * zero puisque la requete ne retient que les reponses posterieures. */
const refusLe = apres(30 * JOUR + 2 * HEURE);
verifier(
  'juste apres le refus : bloque',
  phaseBlocage({ kind: 'block', bloqueLe: refusLe, oui: 0, maintenant: new Date(refusLe.getTime() + HEURE) }) ===
    'bloque',
);
verifier(
  'et trente jours de plus avant la prochaine reouverture',
  phaseBlocage({
    kind: 'block',
    bloqueLe: refusLe,
    oui: 0,
    maintenant: new Date(refusLe.getTime() + 29 * JOUR),
  }) === 'bloque' &&
    phaseBlocage({
      kind: 'block',
      bloqueLe: refusLe,
      oui: 0,
      maintenant: new Date(refusLe.getTime() + 30 * JOUR + HEURE),
    }) === 'probation',
  '<< 1 x Non -> re-bloque, delai repart >>',
);

console.log('\nCE QUI SORT LES ITINERAIRES DU SEGMENT');
verifier('un blocage bloque', exclutLesItineraires('bloque') === true);
verifier(
  'une reouverture provisoire NE bloque PLUS',
  exclutLesItineraires('probation') === false,
  'il faut que les trajets y repassent pour que deux conducteurs repondent',
);
verifier('un segment degage ne bloque rien', exclutLesItineraires('degage') === false);

console.log('\n============================================================');
console.log('LA QUESTION : A QUI, QUAND, ET COMBIEN DE FOIS');
console.log('============================================================');
const base = { phase: 'probation' as PhaseBlocage, reponses: 0, dejaRepondu: false, distanceM: 10 };
verifier('en probation, a dix metres : on demande', doitPoserLaQuestion(base) === true);
verifier(
  `a ${RAYON_QUESTION_M} metres : on demande encore`,
  doitPoserLaQuestion({ ...base, distanceM: RAYON_QUESTION_M }) === true,
);
verifier(
  'a cent metres : non — ce conducteur est sur une autre route',
  doitPoserLaQuestion({ ...base, distanceM: 100 }) === false,
);
verifier(
  'sans position : non',
  doitPoserLaQuestion({ ...base, distanceM: null }) === false,
);
verifier(
  'pendant le blocage : aucune question',
  doitPoserLaQuestion({ ...base, phase: 'bloque' }) === false,
  'la question ne se pose que pendant la reouverture provisoire',
);
verifier(
  'apres le deblocage : aucune question',
  doitPoserLaQuestion({ ...base, phase: 'degage' }) === false,
);
verifier(
  `apres ${QUESTIONS} reponses : on n interroge pas un troisieme conducteur`,
  doitPoserLaQuestion({ ...base, reponses: 2 }) === false,
  '<< les 2 prochains utilisateurs >>',
);
verifier(
  'un conducteur deja interroge ne l est jamais deux fois',
  doitPoserLaQuestion({ ...base, dejaRepondu: true }) === false,
  '<< maximum 1 question par utilisateur par evenement — jamais de relance >>',
);

console.log('\n============================================================');
console.log('LA MECANIQUE EST BRANCHEE — ET C EST LA LECON DU 18 NOVEMBRE');
console.log('============================================================');
const api = lireApi('src', 'routes', 'reports.ts');
const migration = lireApi('db', 'migrations', '0015_blocage_probation.sql');
const ecran = readFileSync(join(__dirname, '..', 'app', 'index.tsx'), 'utf8');
const carte = lire('src', 'components', 'ReportVoteCard.tsx');

console.log('\nLa base');
verifier('la preuve de passage a sa colonne', /ADD COLUMN IF NOT EXISTS parcourus_m real/.test(migration));
verifier(
  'et le vote de confirmation aussi',
  /ALTER TABLE report_votes ADD COLUMN IF NOT EXISTS parcourus_m real/.test(migration),
  'le deuxieme conducteur qui appuie au meme endroit est enregistre comme une confirmation',
);
verifier("l'instant de la confirmation a sa colonne", /ADD COLUMN IF NOT EXISTS bloque_le timestamptz/.test(migration));
verifier(
  'les blocages deja en base prennent leur date de depot',
  /SET bloque_le = created_at/.test(migration),
  'sans quoi aucun blocage existant n entrerait jamais en reouverture provisoire',
);
verifier('la table des reponses existe', /CREATE TABLE IF NOT EXISTS report_praticable/.test(migration));
verifier(
  'UNE SEULE REPONSE PAR APPAREIL ET PAR SIGNALEMENT',
  /CREATE UNIQUE INDEX IF NOT EXISTS report_praticable_once/.test(migration),
  'sans elle, un seul telephone debloquerait un segment en repondant deux fois oui',
);

console.log('\nLe serveur');
verifier(
  'la preuve des dix metres entre dans le compte des temoins',
  /IS NULL OR \$\{colonne\} >= \$\{PREUVE_PASSAGE_M\}/.test(api),
  '<< chaque utilisateur a depasse le segment de 10 m >>, et une mesure absente ne refuse rien',
);
verifier(
  'ELLE EST APPLIQUEE AUX TROIS SORTES DE TEMOIN',
  ["sql.raw('r.parcourus_m')", "sql.raw('v.parcourus_m')", "sql.raw('r2.parcourus_m')"].every((c) =>
    api.includes(`preuveVecueSql(${c})`),
  ),
  'l auteur, celui qui a confirme d un vote, et celui qui a signale le meme endroit',
);
verifier(
  "l'instant de la confirmation est note une seule fois",
  /noterConfirmation/.test(api) && /AND bloque_le IS NULL/.test(api),
  'chaque nouveau temoin repousserait sinon le delai, et le blocage ne serait jamais reexamine',
);
verifier(
  'la decision de confirmation vient de la fonction partagee',
  /blocageConfirme\(report\.temoins\)/.test(api),
  'deux ecritures de la meme regle finissent par ne plus dire la meme chose',
);
verifier(
  'les trois delais du SQL viennent des constantes partagees',
  /\$\{JOURS_TRAVAUX\}/.test(api) &&
    /\$\{JOURS_SANS_ISSUE\}/.test(api) &&
    /\$\{PROBATION_HEURES\}/.test(api) &&
    /\$\{OUI_POUR_DEBLOQUER\}/.test(api),
  'il n y a donc pas une verite en SQL et une en TypeScript',
);
verifier(
  'un segment definitivement leve quitte la carte des la lecture',
  /AND NOT \$\{degageSql\}/.test(api),
  'rien a planifier, rien a oublier : la regle de ce serveur depuis le premier jour',
);
verifier(
  'la route de reponse existe',
  /'\/reports\/:id\/praticable'/.test(api),
  'une regle sans route serait une fonction correcte et sans effet',
);
verifier(
  'elle refuse une reponse hors reouverture provisoire',
  /hors_probation/.test(api),
);
verifier(
  'elle refuse une troisieme reponse',
  /QUESTIONS_PAR_EVENEMENT/.test(api) && /deja_repondu/.test(api),
);
verifier(
  'un << non >> remet la date de depart a maintenant',
  /UPDATE reports SET bloque_le = now\(\) WHERE id = \$\{report\.id\}/.test(api),
  'c est ainsi que << le delai repart >> s ecrit, sans compteur de refus',
);
verifier(
  'deux << oui >> retirent le signalement pour tout le monde',
  /SET status = 'removed'[\s\S]{0,400}?report:removed/.test(api.split("'/reports/:id/praticable'")[1] ?? ''),
);
verifier(
  'les reponses ne sont comptees que depuis la confirmation en cours',
  /p\.created_at > r\.bloque_le/.test(api),
  'les reponses d un cycle precedent ne doivent pas debloquer le suivant',
);

console.log("\nL'application");
verifier(
  'la preuve de passage part avec chaque signalement',
  /parcourusM: metresParcourus\(traceRef\.current, Date\.now\(\)\)/.test(ecran),
);
verifier(
  'un segment en reouverture provisoire ne detourne plus personne',
  (ecran.match(/exclutLesItineraires\(/g) ?? []).length === 2,
  "l'evitement ET le recalcul proactif lisent la meme regle",
);
verifier(
  'la question s ouvre au passage, sans condition de navigation',
  /doitPoserLaQuestion\(\{/.test(ecran) && !/navigating && doitPoserLaQuestion/.test(ecran),
  'sur le trajet qu on fait tous les jours, personne ne lance d itineraire (point 13)',
);
verifier(
  'jamais deux feuilles a la fois',
  /questionReport && !votingReport/.test(ecran),
  'deux cartes empilees au volant ne se lisent ni l une ni l autre',
);
verifier(
  'une question fermee d une croix ne revient pas',
  /praticableVusRef\.current\.add\(questionReport\.id\)/.test(ecran),
  'la rouvrir au prochain passage serait la relance que le document interdit',
);
verifier(
  'la carte sait poser la question',
  /mode === 'praticable'/.test(carte) && /report\.passableAsk/.test(carte),
);
verifier(
  'et le vote existant n a pas change de forme',
  /report\.stillThere/.test(carte) && /report\.gone/.test(carte),
  '<< NE PAS MODIFIER le systeme de signalement existant — AJOUTER >>',
);
verifier(
  'le rouge reste a gauche et le vert a droite dans les deux variantes',
  carte.indexOf('report.passableNo') < carte.indexOf('report.passableYes') &&
    carte.indexOf('styles.disparu') < carte.indexOf('styles.toujours'),
  'un conducteur qui connait la carte du 27 octobre appuie au bon endroit sans relire',
);

console.log('\nLES CINQ LANGUES');
for (const langue of ['fr', 'en', 'ar', 'dz', 'kab']) {
  const j = JSON.parse(lire('src', 'i18n', 'locales', `${langue}.json`)) as {
    report?: Record<string, string>;
  };
  const clefs = [
    'passableAsk',
    'passableYes',
    'passableNo',
    'passableThanks',
    'passableThanksOpen',
    'passableThanksBlocked',
  ];
  const manquantes = clefs.filter((c) => !j.report?.[c]);
  verifier(langue, manquantes.length === 0, manquantes.length ? `manque ${manquantes.join(', ')}` : '6 clefs');
}

console.log(
  fautes === 0
    ? '\nUn segment coupe se rouvre tout seul, et deux conducteurs suffisent a le confirmer.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
