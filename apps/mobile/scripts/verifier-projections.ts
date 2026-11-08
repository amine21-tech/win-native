/**
 * Eprouve la PROJECTION DES SIGNALEMENTS SUR LE TRACE : exactitude, cache, et budget.
 *
 * POURQUOI CE SCRIPT. Le 8 novembre, en posant l'effacement des icones depassees (point 6),
 * j'ai appele `projeterSurTrace` dans un `useMemo` dependant de la liste des signalements. Le
 * code etait juste et le defaut invisible : projeter un signalement balaie TOUTE la geometrie du
 * trajet, et la liste change a chaque notification temps reel.
 *
 * Mesure du jour meme, sur un ordinateur de bureau :
 *
 *     10 signalements sur 8000 points : 106 ms
 *     30 signalements sur 8000 points : 294 ms
 *     60 signalements sur 8000 points : 546 ms
 *
 * Sur un telephone algerien, trois a cinq fois plus — en pleine navigation, a chaque fois qu'un
 * conducteur des environs signale quelque chose. Rien dans la relecture ne le montrait : il n'y
 * a ni boucle imbriquee visible, ni appel reseau, juste une fonction appelee une fois.
 *
 * CE QUE CE SCRIPT FIGE, donc, ce n'est pas seulement le resultat : c'est le COUT. Un futur
 * correctif qui reviendrait a tout recalculer casserait les controles de budget ci-dessous.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-projections.ts
 */
import { majProjections, projeterSurTrace, type TableProjection } from '../src/navigation/alerteApproche';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/* UN ALGER-ORAN : environ 420 km. Valhalla rend un point tous les quarante a quatre-vingts
 * metres sur ce genre d'axe, soit de l'ordre de huit mille points. C'est le cas qui compte :
 * c'est le trajet le plus long que fasse l'application, et celui ou le defaut mordait. */
const N = 8000;
const geometry: [number, number][] = [];
for (let i = 0; i < N; i += 1) geometry.push([3.06 - (i / N) * 2.5, 36.75 - (i / N) * 1.0]);
const cumulativeM: number[] = [0];
for (let i = 1; i < N; i += 1) cumulativeM.push(cumulativeM[i - 1]! + 52);
const route = { geometry, cumulativeM } as never;

/** `nb` signalements repartis le long du trace, donc tous dessus. */
const surLaRoute = (nb: number) =>
  Array.from({ length: nb }, (_, k) => ({
    id: String(k),
    lat: 36.75 - (k / nb) * 1.0,
    lon: 3.06 - (k / nb) * 2.5,
  }));

/* ------------------------------------------------------------------ */
console.log('\nLE RESULTAT EST LE MEME QU AVANT LE CACHE');

/**
 * LE CONTROLE QUI COMPTE LE PLUS. Tout le reste de ce fichier parle de vitesse ; celui-ci dit
 * que la vitesse n'a rien change au resultat. Une projection fausse efface une icone avant que
 * le conducteur l'ait depassee — c'est-a-dire qu'elle lui cache un danger.
 */
const trente = surLaRoute(30);
const reference = projeterSurTrace(route, trente);
const { table: cache } = majProjections(route, trente, null);

let ecarts = 0;
for (const r of trente) {
  const avant = reference.get(r.id)?.distanceDepuisDepart ?? null;
  const apres = cache.get(r.id)?.distanceDepuisDepart ?? null;
  if (avant !== apres) ecarts += 1;
}
verifier(
  'les 30 positions sont identiques, au metre pres',
  ecarts === 0,
  ecarts === 0 ? 'meme fonction de projection, seul le pilotage change' : `${ecarts} ecarts`,
);

console.log('\nCE QUI EST HORS DU TRACE EST MEMORISE COMME TEL');

/**
 * C'EST LA MOITIE DE L'INTERET DU CACHE, et elle est facile a perdre. Un signalement a deux
 * kilometres de l'itineraire n'est jamais retenu ; s'il etait simplement absent de la table, il
 * serait reprojete a chaque appel — et ce sont les plus nombreux, puisque les signalements sont
 * cherches dans un rayon autour du conducteur et non le long de sa route.
 */
const loin = { id: 'loin', lat: 35.0, lon: 0.5 };
const { table: avecLoin } = majProjections(route, [...trente, loin], null);
verifier(
  'un signalement a 200 km du trace vaut `null`, pas `undefined`',
  avecLoin.get('loin') === null && avecLoin.has('loin'),
  '`undefined` le ferait reprojeter a chaque notification',
);

console.log('\nLES SIGNALEMENTS DISPARUS QUITTENT LA TABLE');

/**
 * Un signalement expire, ou retire par vote, ne doit pas rester. Une table qui ne fait que
 * grossir garderait la moitie de l'Algerie au bout de six heures de route.
 */
const { table: reduite } = majProjections(route, trente.slice(0, 5), avecLoin);
verifier(
  'cinq signalements sur trente : la table en contient cinq',
  reduite.size === 5,
  `${reduite.size} entrees`,
);

/* ------------------------------------------------------------------ */
console.log('\nLE BUDGET EST RESPECTE');

const soixante = surLaRoute(60);
const { table: lot1, restants: reste1 } = majProjections(route, soixante, null, 8);
verifier(
  'un lot de 8 ne projette que 8 signalements',
  lot1.size === 8 && reste1 === 52,
  `${lot1.size} projetes, ${reste1} restants`,
);

/* ON DEROULE LES TOURS, comme le fait l'ecran de carte, et on verifie que ca converge. Une
 * boucle qui ne converge pas tournerait indefiniment en reprogrammant un minuteur a chaque
 * tour — un ecran qui travaille sans fin, sans rien afficher de faux, donc sans rien qui alerte. */
let table: TableProjection | null = null;
let restants = 1;
let tours = 0;
while (restants > 0 && tours < 100) {
  const r = majProjections(route, soixante, table, 8);
  table = r.table;
  restants = r.restants;
  tours += 1;
}
verifier(
  `les 60 signalements sont projetes en ${tours} tours`,
  restants === 0 && tours === 8 && table!.size === 60,
  '60 / 8 = 7,5, donc huit tours',
);
verifier(
  'et le resultat est complet',
  surLaRoute(60).every((r) => table!.get(r.id)?.distanceDepuisDepart !== undefined),
);

/* ------------------------------------------------------------------ */
console.log('\nLE COUT, MESURE');

function duree(f: () => void): number {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
}

const sansCache = duree(() => projeterSurTrace(route, soixante));
const premier = duree(() => majProjections(route, soixante, null));
const { table: pleine } = majProjections(route, soixante, null);
const unDePlus = duree(() =>
  majProjections(route, [...soixante, { id: 'neuf', lat: 36.3, lon: 2.4 }], pleine),
);
const rienDeNeuf = duree(() => majProjections(route, soixante, pleine));
const unLot = duree(() => majProjections(route, soixante, null, 8));

console.log('        (informatif : ces durees dependent de la charge de la machine)');
console.log(`        sans cache, a chaque notification : ${sansCache.toFixed(0)} ms`);
console.log(`        premier calcul entier            : ${premier.toFixed(0)} ms`);
console.log(`        un lot de 8                      : ${unLot.toFixed(0)} ms`);
console.log(`        un signalement de plus           : ${unDePlus.toFixed(1)} ms`);
console.log(`        rien de neuf                     : ${rienDeNeuf.toFixed(1)} ms`);

/**
 * CE QU'ON MESURE ET CE QU'ON AFFIRME NE SONT PAS LA MEME CHOSE, et la distinction a coute un
 * echec a ce fichier meme.
 *
 * Une premiere version comparait deux durees entre elles — << un lot doit tenir dans le quart du
 * calcul entier >>. C'etait juste sur une machine au repos et faux des que l'ordinateur
 * travaillait a autre chose : lance a la suite des vingt autres verificateurs, le controle est
 * tombe alors que RIEN n'avait change dans le code. Un test qui echoue selon la charge de la
 * machine ne dit plus rien, et on apprend a l'ignorer — ce qui est pire que de ne pas l'avoir.
 *
 * Les durees sont donc AFFICHEES, pour qu'on les lise, et les affirmations portent sur ce qui est
 * DETERMINISTE : le nombre de projections reellement faites. C'est lui qui cause le cout, et il
 * ne depend d'aucune horloge.
 *
 * Deux seuils de temps restent, en valeur absolue et tres larges : ils n'attrapent pas une
 * lenteur de dix pour cent, mais le RETOUR du recalcul complet, qui est d'un autre ordre.
 */
verifier(
  'un signalement de plus coute moins de 60 ms',
  unDePlus < 60,
  'au-dela, le cache ne sert plus a rien',
);
verifier(
  'rien de neuf ne coute presque rien',
  rienDeNeuf < 20,
  'une liste rafraichie a l identique ne doit RIEN recalculer',
);

/* LE CONTROLE DETERMINISTE DU COUT. `restants` dit combien de signalements attendent encore
 * d'etre projetes : il mesure donc exactement le travail NON fait. Un lot de huit sur soixante
 * doit en laisser cinquante-deux, et c'est vrai sur n'importe quelle machine. */
const { table: t8, restants: r8 } = majProjections(route, soixante, null, 8);
verifier(
  'un lot ne fait QUE huit projections sur soixante',
  t8.size === 8 && r8 === 52,
  'c est ce qui evite le gel au depart et apres chaque recalcul, independamment de l horloge',
);
const { restants: r0 } = majProjections(route, soixante, pleine, 8);
verifier(
  'une fois la table pleine, un lot ne projette plus RIEN',
  r0 === 0,
  'le budget ne s applique qu aux projections neuves',
);

console.log(
  fautes === 0
    ? '\nLes positions sont exactes, et ne sont calculees qu une fois.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
