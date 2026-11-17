/**
 * Eprouve le REGROUPEMENT DES VOIES EN OPTIONS DE DIRECTION — correctif du 17 novembre.
 *
 * LE DOCUMENT EST CATEGORIQUE : << On N'affiche PAS une fleche par voie — impossible sur
 * petits ecrans. On affiche les OPTIONS DE DIRECTION (2-3 max) et la bonne clignote. >>
 *
 * POURQUOI CE CONTROLE EXISTE. Le regroupement est une regle de decision, pas un dessin : elle
 * decide CE QUE LE CONDUCTEUR VERRA a l'approche d'une sortie, a partir de ce que Valhalla
 * renvoie. Une erreur ici ne plante rien et ne se voit pas a la relecture — elle se voit en
 * ratant une sortie.
 *
 * LES CONFIGURATIONS SONT REELLES. Celle de l'A61 vient de la reponse mesuree le 16 novembre
 * sur le serveur : cinq voies, trois << gauche legere >> puis deux << droite legere >> dont
 * les deux dernieres actives. C'est elle qui montrait cinq timbres-poste dans le bandeau.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-options-voies.ts
 */
import { MAX_OPTIONS, optionsDeManoeuvre, optionsDeVoies } from '../src/navigation/optionsVoies';
import { LANE, type Lane } from '../src/navigation/voies';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/** Une voie : direction(s), et si elle mene la ou l'on va. */
const v = (directions: number, mene = false): Lane => ({
  directions,
  valid: mene ? directions : 0,
  active: mene ? directions : 0,
});

const resume = (lanes: readonly Lane[]) =>
  optionsDeVoies(lanes)
    .map((o) => `${o.geste}${o.voies > 1 ? `×${o.voies}` : ''}${o.aPrendre ? '*' : ''}`)
    .join(' | ');

console.log("\nL'A61, MESUREE SUR LE SERVEUR LE 16 NOVEMBRE");
/* [gauche legere ×3, droite legere ×2 actives] — cinq voies, deux choix. */
const a61 = [
  v(LANE.slightLeft),
  v(LANE.slightLeft),
  v(LANE.slightLeft),
  v(LANE.slightRight, true),
  v(LANE.slightRight, true),
];
const optionsA61 = optionsDeVoies(a61);
verifier(
  'cinq voies deviennent deux options',
  optionsA61.length === 2,
  resume(a61),
);
verifier(
  'et la seconde est celle a prendre',
  optionsA61[1]?.aPrendre === true && optionsA61[0]?.aPrendre === false,
  "trois files disaient la meme chose : les fondre ne perd rien",
);
verifier(
  'le nombre de files est retenu',
  optionsA61[0]?.voies === 3 && optionsA61[1]?.voies === 2,
);

console.log("\nLA RN 11, TROIS VOIES, DEUX CHOIX");
/* [tout droit ×2 actives, droite legere] — la sortie a droite qu'on ne prend pas. */
const rn11 = [v(LANE.through, true), v(LANE.through, true), v(LANE.slightRight)];
verifier('deux options', optionsDeVoies(rn11).length === 2, resume(rn11));
verifier(
  "c'est << tout droit >> qu'il faut prendre",
  optionsDeVoies(rn11)[0]?.aPrendre === true,
);

console.log('\nON NE DEPASSE JAMAIS TROIS OPTIONS');
/* Une chaussee improbable, pour pousser la regle : six directions distinctes. */
const six = [
  v(LANE.reverse),
  v(LANE.left),
  v(LANE.slightLeft),
  v(LANE.through, true),
  v(LANE.slightRight),
  v(LANE.right),
];
const optionsSix = optionsDeVoies(six);
verifier(
  'six directions se ramenent a trois',
  optionsSix.length === MAX_OPTIONS,
  resume(six),
);
verifier(
  "ET CELLE QU'IL FAUT PRENDRE SURVIT",
  optionsSix.some((o) => o.aPrendre),
  "tronquer les trois premieres l'aurait fait disparaitre : c'est tout l'interet de grouper",
);
/* LES VOISINES, ET NON LES PREMIERES. Une option voisine dit de quel cote se trouve celle
 * qu'on vise ; une option a l'autre bout de la chaussee n'apprend rien d'utilisable. */
const indexPris = optionsSix.findIndex((o) => o.aPrendre);
verifier(
  'elle est entouree de ses voisines',
  indexPris > 0 && indexPris < optionsSix.length - 1,
  `elle est en position ${indexPris + 1} sur ${optionsSix.length}`,
);

console.log("\nDEUX FILES IDENTIQUES SEPAREES NE SE FONDENT PAS");
/* [tout droit, gauche, tout droit] : trois options, pas deux. Les fondre deplacerait la
 * fleche et designerait la mauvaise file. */
const separees = [v(LANE.through), v(LANE.left, true), v(LANE.through)];
verifier(
  'elles restent deux options distinctes',
  optionsDeVoies(separees).length === 3,
  resume(separees),
);

console.log("\nL'ORDRE EST CELUI DE LA CHAUSSEE");
/* Le conducteur lit la rangee comme il voit les files devant lui. Trier par direction, ou
 * mettre la recommandee en tete, le ferait chercher a gauche ce qui est a droite. */
const ordre = [v(LANE.right, true), v(LANE.through), v(LANE.left)];
verifier(
  'la voie a prendre reste a sa place, meme en premiere position',
  optionsDeVoies(ordre)[0]?.aPrendre === true && optionsDeVoies(ordre).length === 3,
  resume(ordre),
);

console.log("\nQUAND VALHALLA N'A PAS D'AVIS");
/* Aucune voie active ni valide : on garde les trois premieres, faute de mieux. La rangee
 * reste au moins fidele au bord gauche de la chaussee. */
const sansAvis = [v(LANE.left), v(LANE.through), v(LANE.slightRight), v(LANE.right)];
const optionsSansAvis = optionsDeVoies(sansAvis);
verifier(
  'trois options, aucune designee',
  optionsSansAvis.length === MAX_OPTIONS && !optionsSansAvis.some((o) => o.aPrendre),
  resume(sansAvis),
);

console.log('\nUNE SEULE DIRECTION NE FAIT QU UNE OPTION');
const toutes = [v(LANE.through, true), v(LANE.through, true), v(LANE.through, true)];
verifier(
  'trois files tout droit = une tuile',
  optionsDeVoies(toutes).length === 1 && optionsDeVoies(toutes)[0]?.voies === 3,
  resume(toutes),
);
/* LaneGuidance exige au moins deux voies AVANT de grouper : une rangee d'une seule tuile ne
 * dit pas ou se placer. Ce controle constate seulement que le groupement, lui, ne ment pas. */

console.log("\nSANS MARQUAGE AU SOL, LA MANOEUVRE SUFFIT");

/* LA CORRECTION DU CLIENT, 17 novembre : << Les donnees Valhalla (maneuver.type +
 * maneuver.highway + maneuver.length) sont suffisantes. On ne demande pas une fleche par voie
 * physique — on demande que la fleche directionnelle recommandee clignote. >>
 *
 * POURQUOI CELA CHANGE TOUT EN ALGERIE. La rangee exigeait `lanes.length >= 2`, c'est-a-dire
 * le marquage au sol d'OpenStreetMap. Comptage Overpass du 15 novembre : CENT DOUZE tronçons
 * le portent dans toute la region d'Alger. La fonction etait donc ecrite, testee, et
 * invisible. */
const SORTIES: [number, string, string][] = [
  [20, 'Sortie a droite', 'legere-droite'],
  [21, 'Sortie a gauche', 'legere-gauche'],
  [10, 'Tournez a droite', 'droite'],
  [15, 'Tournez a gauche', 'gauche'],
  [9, 'Legerement a droite', 'legere-droite'],
  [16, 'Legerement a gauche', 'legere-gauche'],
  [12, 'Demi-tour', 'demi-tour'],
  [25, 'Inserez-vous', 'rabattement'],
];
for (const [type, libelle, geste] of SORTIES) {
  const opts = optionsDeManoeuvre(type);
  const pris = opts?.find((o) => o.aPrendre);
  verifier(
    `${libelle} (type ${type}) → ${geste}`,
    pris?.geste === geste,
    opts ? opts.map((o) => `${o.geste}${o.aPrendre ? '*' : ''}`).join(' | ') : 'aucune option',
  );
}

console.log("\nLA RANGEE SUIT LA CHAUSSEE : la direction se pose de SON cote");
/* Sans cela, le conducteur chercherait a gauche ce qui est a droite, et la rangee lui
 * couterait du temps au lieu de lui en faire gagner. */
const droite = optionsDeManoeuvre(20);
verifier(
  'une sortie a droite se pose a droite',
  droite?.[0]?.geste === 'tout-droit' && droite?.[1]?.aPrendre === true,
  droite?.map((o) => o.geste).join(' | '),
);
const gauche = optionsDeManoeuvre(21);
verifier(
  'une sortie a gauche se pose a gauche',
  gauche?.[0]?.aPrendre === true && gauche?.[1]?.geste === 'tout-droit',
  gauche?.map((o) => o.geste).join(' | '),
);

console.log("\nDEUX TUILES, JAMAIS PLUS, ET UNE SEULE CLIGNOTE");
for (const [type] of SORTIES) {
  const opts = optionsDeManoeuvre(type) ?? [];
  if (opts.length !== 2 || opts.filter((o) => o.aPrendre).length !== 1) {
    verifier(`type ${type} : deux tuiles dont une a prendre`, false, `${opts.length} tuiles`);
  }
}
verifier(
  'les huit manoeuvres donnent deux tuiles dont une seule designee',
  SORTIES.every(([type]) => {
    const o = optionsDeManoeuvre(type) ?? [];
    return o.length === 2 && o.filter((x) => x.aPrendre).length === 1;
  }),
  'la rangee dit de quel cote se placer, elle ne decrit pas la chaussee',
);

console.log("\nUNE MANOEUVRE TOUT DROIT NE MONTRE RIEN");
/* La rangee existe pour dire DE QUEL COTE se placer. Quand il n'y a rien a choisir, deux
 * fleches identiques n'apprennent rien et occupent le bandeau. La maquette montre bien un cas
 * << restez voie principale >>, mais il suppose de savoir qu'une sortie existe — ce que seul
 * le marquage au sol dit. L'inventer reviendrait a dessiner une route qu'on ne connait pas. */
for (const type of [0, 7, 8, 22]) {
  verifier(`type ${type} : aucune rangee`, optionsDeManoeuvre(type) === null);
}

console.log(
  fautes === 0
    ? '\nLa rangee montre des CHOIX, et jamais plus de trois.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
