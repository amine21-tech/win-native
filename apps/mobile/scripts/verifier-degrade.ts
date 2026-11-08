/**
 * Eprouve les paliers du degrade du trace.
 *
 * POURQUOI CE SCRIPT. Les paliers d'une interpolation MapLibre doivent croitre STRICTEMENT. Un
 * seul palier qui ne progresse pas fait rejeter la couche ENTIERE : le trace disparait, sans
 * message, sans erreur, sans rien dans la console. Le defaut ne se verrait qu'en navigation, sur
 * un telephone — c'est-a-dire trop tard, et chez le client.
 *
 * Les cas ci-dessous sont ceux qui FABRIQUENT des paliers egaux : une bande collee au depart,
 * une bande collee a l'arrivee, deux bandes qui se chevauchent, le vehicule pile sur un bord de
 * bande, une bande plus courte que la coupure. Chacun a ete choisi parce qu'il produit
 * naturellement deux bornes identiques.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-degrade.ts
 */
import {
  OPACITE_QUEUE,
  paliersDuTrace,
  QUEUE_COMETE,
  rgba,
  type BandeTrafic,
} from '../src/navigation/degradeTrace';

/* On encode l'opacite dans la couleur pour pouvoir la relire : le vrai `teinter` rend du
 * rgba(), illisible a l'oeil dans un test. */
const attenuer = (c: string, o: number) => `${c}@${o.toFixed(3)}`;

type Cas = { nom: string; fait: number; bandes: BandeTrafic[] };

const CAS: Cas[] = [
  { nom: 'rien : ni progression ni trafic', fait: 0, bandes: [] },
  { nom: 'progression seule, a mi-parcours', fait: 0.5, bandes: [] },
  { nom: 'progression a 0 pile', fait: 0, bandes: [{ debut: 0.2, fin: 0.3, couleur: '#E67E22' }] },
  { nom: 'progression a 1 pile', fait: 1, bandes: [{ debut: 0.2, fin: 0.3, couleur: '#E67E22' }] },
  { nom: 'bande collee au depart', fait: 0.1, bandes: [{ debut: 0, fin: 0.05, couleur: '#C0392B' }] },
  { nom: 'bande collee a l arrivee', fait: 0.1, bandes: [{ debut: 0.97, fin: 1, couleur: '#C0392B' }] },
  {
    nom: 'deux bandes qui se chevauchent',
    fait: 0.1,
    bandes: [
      { debut: 0.3, fin: 0.5, couleur: '#E67E22' },
      { debut: 0.4, fin: 0.6, couleur: '#C0392B' },
    ],
  },
  {
    nom: 'deux bandes collees bord a bord',
    fait: 0.1,
    bandes: [
      { debut: 0.3, fin: 0.4, couleur: '#E67E22' },
      { debut: 0.4, fin: 0.5, couleur: '#C0392B' },
    ],
  },
  {
    nom: 'vehicule pile sur le bord d une bande',
    fait: 0.3,
    bandes: [{ debut: 0.3, fin: 0.45, couleur: '#E67E22' }],
  },
  {
    nom: 'bande plus courte que la coupure',
    fait: 0.1,
    bandes: [{ debut: 0.5, fin: 0.5000001, couleur: '#E67E22' }],
  },
  {
    nom: 'bande de longueur nulle',
    fait: 0.1,
    bandes: [{ debut: 0.5, fin: 0.5, couleur: '#E67E22' }],
  },
  {
    nom: 'trajet couvert de bout en bout',
    fait: 0.4,
    bandes: [{ debut: 0, fin: 1, couleur: '#C0392B' }],
  },
  {
    nom: 'treize bandes, un trajet charge',
    fait: 0.22,
    bandes: Array.from({ length: 13 }, (_, i) => ({
      debut: i / 13,
      fin: i / 13 + 0.01,
      couleur: i % 2 === 0 ? '#E67E22' : '#C0392B',
    })),
  },
];

let fautes = 0;

for (const cas of CAS) {
  const paliers = paliersDuTrace('#PARCOURU', '#AVANT', cas.fait, cas.bandes, attenuer);

  const positions: number[] = [];
  for (let i = 0; i < paliers.length; i += 2) positions.push(paliers[i] as number);

  const problemes: string[] = [];

  if (paliers.length % 2 !== 0) problemes.push('nombre impair de valeurs');
  if (positions.length < 2) problemes.push('moins de deux paliers');

  for (let i = 1; i < positions.length; i += 1) {
    if (!(positions[i]! > positions[i - 1]!)) {
      problemes.push(`palier ${i} ne progresse pas : ${positions[i - 1]} puis ${positions[i]}`);
    }
  }
  for (const p of positions) {
    if (!Number.isFinite(p) || p < 0 || p > 1) problemes.push(`palier hors de [0,1] : ${p}`);
  }
  for (let i = 1; i < paliers.length; i += 2) {
    if (typeof paliers[i] !== 'string') problemes.push(`couleur manquante au rang ${i}`);
  }

  if (problemes.length > 0) {
    fautes += 1;
    console.log(`NON   ${cas.nom}`);
    for (const p of problemes) console.log(`        ${p}`);
    console.log(`        paliers : ${JSON.stringify(paliers)}`);
  } else {
    console.log(`OK    ${cas.nom} — ${positions.length} paliers`);
  }
}

console.log('');
if (fautes > 0) {
  console.log(`${fautes} cas sur ${CAS.length} produisent des paliers que MapLibre refuserait.`);
  process.exit(1);
}
console.log(`${CAS.length} cas : tous les paliers croissent strictement et restent dans [0,1].`);


/* ------------------------------------------------------------------ */
/* La forme de la COMETE                                               */
/* ------------------------------------------------------------------ */

/**
 * CE QUE LES TREIZE CAS CI-DESSUS NE VOIENT PAS. Ils verifient que MapLibre accepte les
 * paliers — qu'ils croissent, qu'ils restent dans [0,1]. Ils ne regardent pas les COULEURS, et
 * c'est pourtant la que vit l'effet demande le 3 novembre : opaque devant la fleche, efface
 * derriere.
 *
 * Un degrade qui palit aussi DEVANT reste parfaitement valide pour MapLibre. Il passerait les
 * treize cas sans rien dire — et c'est exactement le defaut que le client reproche :
 * << le degrade apparait aussi devant la fleche, trace flou et illisible >>.
 */
console.log('LA COMETE : OPAQUE DEVANT, EFFACEE DERRIERE');

let fautesComete = 0;
function comete(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautesComete++;
}

const FAIT = 0.5;
const paliersComete = paliersDuTrace('#VERT', '#VERT', FAIT, [], attenuer);
const lus: { x: number; opacite: number }[] = [];
for (let i = 0; i < paliersComete.length; i += 2) {
  const x = paliersComete[i] as number;
  const couleur = paliersComete[i + 1] as string;
  lus.push({ x, opacite: Number(couleur.split('@')[1]) });
}
console.log('  ' + lus.map((l) => `${l.x.toFixed(3)}->${l.opacite.toFixed(2)}`).join('  '));

const devant = lus.filter((l) => l.x > FAIT);
comete(
  'tout ce qui est DEVANT la fleche est opaque',
  devant.length > 0 && devant.every((l) => l.opacite === 1),
  'c est le reproche principal du client : le fondu ne doit jamais passer devant',
);
comete(
  'le depart du trajet est completement transparent',
  lus[0]!.opacite === 0,
  `${lus[0]!.opacite} a la position ${lus[0]!.x}`,
);
comete(
  'la trainee atteint son maximum JUSTE derriere la fleche',
  Math.abs((lus.find((l) => l.x === FAIT)?.opacite ?? -1) - OPACITE_QUEUE) < 1e-9,
  `${OPACITE_QUEUE} attendu`,
);
comete(
  'la trainee ne remonte jamais au-dela de son maximum',
  lus.filter((l) => l.x <= FAIT).every((l) => l.opacite <= OPACITE_QUEUE + 1e-9),
  'sinon on ne distinguerait plus le parcouru du restant',
);
comete(
  'elle ne couvre pas tout le trajet',
  (lus.find((l) => l.x > 0 && l.opacite === 0)?.x ?? 0) > 0,
  `queue de ${QUEUE_COMETE * 100} % du trajet`,
);

/* AU DEPART, LA QUEUE DEBORDERAIT AVANT LE DEBUT DU TRAJET. La borne negative doit etre
 * ramenee a 0 sans casser la croissance des paliers — c'est le cas limite qui ferait rejeter
 * la couche entiere. */
const auDepart = paliersDuTrace('#VERT', '#VERT', 0.01, [], attenuer);
comete(
  'juste apres le depart, les paliers restent valides',
  auDepart.filter((_, i) => i % 2 === 0).every((x, i, t) => i === 0 || (x as number) > (t[i - 1] as number)),
  JSON.stringify(auDepart.filter((_, i) => i % 2 === 0)),
);

console.log(
  fautesComete > 0
    ? '\n' + fautesComete + ' verification(s) de la comete en echec.'
    : '\nLa comete est pleine devant et s efface derriere.',
);


/* ------------------------------------------------------------------ */
/* LES VRAIES COULEURS, AVEC LE VRAI rgba()                            */
/* ------------------------------------------------------------------ */

/**
 * CETTE SECTION EXISTE A CAUSE D'UN DEFAUT QUE TOUT LE RESTE DE CE FICHIER A LAISSE PASSER.
 *
 * Pendant trois versions, la trainee derriere le vehicule etait NOIRE. L'ecran passait a
 * `paliersDuTrace` une couleur deja au format `rgba(...)` ; le vrai compositeur la redilue avec
 * `parseInt(hex.slice(1), 16)`, obtient NaN, et NaN decale a droite vaut zero. Toute la trainee
 * sortait en `rgba(0, 0, 0, o)`.
 *
 * POURQUOI LES CONTROLES CI-DESSUS NE POUVAIENT PAS LE VOIR : ils fournissent leur propre
 * `teinter` de test, `attenuer`, qui colle simplement « @0.600 » au bout du nom de la couleur.
 * Pratique pour relire une opacite, mais c'est un faux — il ne compose aucun rgba() et ne peut
 * donc pas se tromper comme le vrai. Un test qui remplace la piece suspecte par une piece saine
 * ne prouve rien sur la piece suspecte.
 *
 * On eprouve donc ici le VRAI `rgba`, avec les VRAIES constantes de l'ecran, et on regarde la
 * chaine produite. Un canal a zero sur un vert est un noir : c'est la signature exacte du
 * defaut, et elle est desormais lisible par une machine.
 */
console.log('\nLES COULEURS SORTENT VERTES, ET NON NOIRES');

let fautesCouleur = 0;
function couleur(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautesCouleur++;
}

/* Les valeurs exactes de ROUTE_COLORS, recopiees a la main : si l'ecran change de vert, ce test
 * doit etre relu, et non suivre en silence. Jour ET nuit, parce que les deux etaient cassees. */
const TRACE = {
  jour: { main: '#0D6E4F', parcouru: '#B4E6D2' },
  nuit: { main: '#2EE6A6', parcouru: '#1B4D3E' },
} as const;

for (const [mode, c] of Object.entries(TRACE)) {
  const paliers = paliersDuTrace(c.parcouru, c.main, 0.5, [], rgba);
  const couleurs: string[] = [];
  for (let i = 1; i < paliers.length; i += 2) couleurs.push(paliers[i] as string);

  const malformees = couleurs.filter((t) => !/^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(t));
  couleur(
    `${mode} : les ${couleurs.length} couleurs sont des rgba() valides`,
    malformees.length === 0,
    malformees.slice(0, 2).join(' · ') || couleurs[couleurs.length - 1]!,
  );

  const noires = couleurs.filter((t) => /^rgba\(0, 0, 0,/.test(t));
  couleur(
    `${mode} : aucune n'est noire`,
    noires.length === 0,
    noires.length > 0
      ? `${noires.length} palier(s) en ${noires[0]} — c'est LE defaut de la v116 a la v119`
      : 'le defaut de la v116 : rgba() appliquee deux fois de suite',
  );

  /* ON VERIFIE QUE LE VERT EST LE BON, et pas seulement qu'il n'est pas noir. Une couleur
   * decalee d'un octet — un `slice(0)` au lieu d'un `slice(1)` — produirait un rgba() valide,
   * non noir, et completement faux. */
  const n = parseInt(c.main.slice(1), 16);
  const attendu = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 1)`;
  couleur(
    `${mode} : devant la fleche, c'est bien ${c.main}`,
    couleurs[couleurs.length - 1] === attendu,
    `${couleurs[couleurs.length - 1]} (attendu ${attendu})`,
  );

  /* ET DERRIERE, LE VERT CLAIR DU DOCUMENT — pas le meme vert attenue. C'est la demande du
   * 8 novembre : << vert fonce DEVANT, vert clair DERRIERE >>. Deux teintes distinctes se
   * distinguent a l'oeil bien mieux que deux opacites de la meme teinte. */
  const nq = parseInt(c.parcouru.slice(1), 16);
  const teteTrainee = couleurs[Math.floor((couleurs.length - 1) / 2)];
  couleur(
    `${mode} : derriere la fleche, c'est bien ${c.parcouru}`,
    (teteTrainee ?? '').startsWith(`rgba(${(nq >> 16) & 255}, ${(nq >> 8) & 255}, ${nq & 255},`),
    `${teteTrainee}`,
  );
}

/**
 * LE CONTROLE QUI AURAIT ATTRAPE LE DEFAUT A L'EPOQUE. On refait la faute exacte de l'ecran —
 * passer une couleur deja diluee — et on exige que ca eclate. Tant que ce controle passe, la
 * meme erreur ne peut plus produire du noir en silence : elle produit un message.
 */
let aEclate = false;
try {
  rgba('rgba(13, 110, 79, 1)', 0.6);
} catch {
  aEclate = true;
}
couleur(
  'une couleur deja diluee est REFUSEE, au lieu de devenir noire',
  aEclate,
  'c est la faute exacte commise le 3 novembre',
);

console.log(
  fautesCouleur === 0
    ? '\nLe trace sort vert, devant comme derriere.\n'
    : `\nA CORRIGER : ${fautesCouleur} verification(s) de couleur en echec.\n`,
);

if (fautesComete > 0 || fautesCouleur > 0) process.exit(1);
