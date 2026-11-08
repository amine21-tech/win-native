/**
 * Eprouve le GUIDAGE DE VOIE : les neuf fleches, le demi-tour, et la nationale.
 *
 * POURQUOI CE SCRIPT. Deux defauts vivaient ici, et aucun des deux ne se voit en relisant.
 *
 * LE PREMIER : onze directions pour six caracteres. << Tournez a gauche >> et << serrez
 * franchement a gauche >> partageaient ↰. Le code etait parfaitement correct — la table
 * associait bien chaque direction a un signe — mais deux mouvements differents recevaient le
 * MEME dessin, et sur une bifurcation d'autoroute ils menent a deux routes. Une table de
 * correspondance ne peut pas se tromper : elle peut seulement etre trop pauvre.
 *
 * LE SECOND : la priorite. Une voie porte souvent plusieurs directions peintes, et c'est le
 * mouvement le plus MARQUE qu'il faut montrer. L'ordre du tableau porte cette regle, et un
 * reordonnancement innocent — ranger les bits par valeur croissante, par exemple — la
 * defairait sans rien casser visiblement.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-voies.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { gesteDeVoie, rabattementAGauche, type GesteVoie } from '../src/navigation/voiesRegles';
import { estNationale, surGrandAxe } from '../src/navigation/grandAxe';
import { LANE, type Lane } from '../src/navigation/voies';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/** Une voie dont `directions` est le masque donne, sans direction active. */
const voie = (directions: number, active = 0): Lane => ({ directions, valid: 0, active });

/* ------------------------------------------------------------------ */
console.log('\nCHAQUE DIRECTION A SA PROPRE FLECHE');

const ATTENDU: [number, string, GesteVoie][] = [
  [LANE.reverse, 'demi-tour', 'demi-tour'],
  [LANE.sharpLeft, 'serree a gauche', 'serree-gauche'],
  [LANE.left, 'a gauche', 'gauche'],
  [LANE.slightLeft, 'legere a gauche', 'legere-gauche'],
  [LANE.through, 'tout droit', 'tout-droit'],
  [LANE.slightRight, 'legere a droite', 'legere-droite'],
  [LANE.right, 'a droite', 'droite'],
  [LANE.sharpRight, 'serree a droite', 'serree-droite'],
  [LANE.mergeToLeft, 'rabattement a gauche', 'rabattement'],
  [LANE.mergeToRight, 'rabattement a droite', 'rabattement'],
];
for (const [bit, nom, geste] of ATTENDU) {
  verifier(`${nom} → ${geste}`, gesteDeVoie(voie(bit)) === geste);
}

/**
 * LE CONTROLE QUI NOMME LE DEFAUT CORRIGE. Les six paires ci-dessous recevaient le MEME
 * caractere avant le 8 novembre. Qu'elles diffèrent desormais est tout l'objet du point 4.
 */
console.log('\nLES PAIRES QUI SE CONFONDAIENT AVANT LE 8 NOVEMBRE');
const PAIRES: [number, number, string][] = [
  [LANE.left, LANE.sharpLeft, 'a gauche / serree a gauche (etaient ↰ tous les deux)'],
  [LANE.right, LANE.sharpRight, 'a droite / serree a droite (etaient ↱ tous les deux)'],
  [LANE.slightLeft, LANE.mergeToLeft, 'legere a gauche / rabattement (etaient ↖)'],
  [LANE.slightRight, LANE.mergeToRight, 'legere a droite / rabattement (etaient ↗)'],
];
for (const [a, b, nom] of PAIRES) {
  verifier(nom, gesteDeVoie(voie(a)) !== gesteDeVoie(voie(b)));
}

console.log('\nLE RABATTEMENT SE RETOURNE, IL NE SE REDESSINE PAS');
verifier('vers la gauche : trace retourne', rabattementAGauche(voie(LANE.mergeToLeft)));
verifier('vers la droite : trace d origine', !rabattementAGauche(voie(LANE.mergeToRight)));
verifier(
  'les deux cotes peints : pas de retournement',
  !rabattementAGauche(voie(LANE.mergeToLeft | LANE.mergeToRight)),
  'retourner un dessin symetrique ne changerait rien, mais le choix doit etre deterministe',
);

/* ------------------------------------------------------------------ */
console.log('\nLA DIRECTION ACTIVE L EMPORTE SUR CE QUI EST PEINT');

/**
 * `active` est le mouvement A FAIRE depuis cette voie ; `directions` est tout ce qui y est
 * peint. Quand les deux existent, c'est le premier qui compte — sinon on montrerait au
 * conducteur une direction possible au lieu de la sienne.
 */
verifier(
  'voie peinte « tout droit + a droite », active « a droite »',
  gesteDeVoie(voie(LANE.through | LANE.right, LANE.right)) === 'droite',
  'montrer « tout droit » ici ferait manquer la sortie',
);
verifier(
  'sans direction active, le mouvement le plus marque',
  gesteDeVoie(voie(LANE.through | LANE.right)) === 'droite',
  'se tromper vers le virage fait hesiter ; se tromper vers tout droit fait rater',
);
verifier(
  'une voie sans rien de peint va tout droit',
  gesteDeVoie(voie(LANE.none)) === 'tout-droit',
);
verifier(
  'un masque vide aussi, plutot que rien',
  gesteDeVoie(voie(0)) === 'tout-droit',
  'une case vide dans la rangee ferait perdre le compte des files',
);

/* ------------------------------------------------------------------ */
console.log('\nLE DEMI-TOUR POINTE VERS LE BAS');

/**
 * EXIGENCE EXPLICITE DU DOCUMENT : << arc en U CONTINU, tete de fleche pointant VERS LE BAS >>.
 * On lit le trace : la pointe est faite de deux segments qui partent d'un meme point, et ce
 * point doit etre PLUS BAS que le sommet de l'arc. Le caractere ↩ dessinait l'inverse — une
 * pointe tournee vers la gauche, qui se lisait comme un virage serre.
 */
const source = readFileSync(resolve('apps/mobile/src/navigation/voiesRegles.ts'), 'utf8');
const traceU = /'demi-tour': '([^']+)'/.exec(source)?.[1] ?? '';
const pointeU = /M(\d+) (\d+) L\d+ \d+ M\d+ \d+ L\d+ \d+$/.exec(traceU);
verifier(
  'le trace du demi-tour existe et finit par une pointe',
  pointeU !== null,
  traceU || 'introuvable',
);
if (pointeU) {
  const yPointe = Number(pointeU[2]);
  /* Le sommet de l'arc : la plus petite ordonnee du trace. En SVG, y croit vers le BAS — une
   * pointe plus bas que l'arc a donc une ordonnee PLUS GRANDE.
   *
   * ON LIT TOUS LES NOMBRES PAR PAIRES, sans se fier a la lettre de commande. Une premiere
   * version ne cherchait que les `M x y` et `L x y` separes par un espace : le trace commence
   * par << M68 92 >>, sans espace, et ses courbes sont des `Q` a deux points. Le minimum
   * valait donc l'infini et le controle passait pour une raison fausse. */
  const nombres = [...traceU.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const yMin = Math.min(...nombres.filter((_, k) => k % 2 === 1));
  verifier(
    'la pointe est plus basse que le sommet de l arc',
    yPointe > yMin + 30,
    `pointe a y=${yPointe}, sommet a y=${yMin}`,
  );
}
verifier(
  'aucun caractere fleche ne subsiste dans le guidage de voie',
  !/['"][↩↰↱↖↗↑]/.test(readFileSync(resolve('apps/mobile/src/components/LaneGuidance.tsx'), 'utf8')),
  'un caractere absent de la police s affiche en carre vide',
);

/* ------------------------------------------------------------------ */
console.log('\nLA NATIONALE EST RECONNUE, LA RUE NE L EST PAS');

for (const nom of [
  'RN 12',
  'RN12',
  'N5',
  'N 5',
  'Route Nationale 24',
  'RN 12 A',
  'Autoroute Est-Ouest / RN 5',
  'الطريق الوطني 12',
]) {
  verifier(`« ${nom} »`, estNationale(nom));
}

/**
 * LES DEUX PIEGES, et ils sont tous deux courants en Algerie. << Rue Nationale >> est un nom de
 * rue ordinaire : sans numero, ce n'est pas une nationale. Et un nom qui commence par N suivi
 * d'une lettre — << Nord >>, << Nouvelle Ville >> — ne doit pas passer non plus, d'ou le
 * chiffre obligatoire.
 */
for (const nom of [
  'Rue Nationale',
  'Avenue de la Nation',
  'Boulevard Nord',
  'Nouvelle Ville',
  'Rue Didouche Mourad',
  'Cite 1200 Logements',
  '',
]) {
  verifier(`« ${nom || '(vide)'} » n est pas une nationale`, !estNationale(nom));
}
verifier('un nom absent non plus', !estNationale(null) && !estNationale(undefined));

console.log('\nLE GUIDAGE S AFFICHE SUR LES DEUX');
verifier(
  'autoroute marquee par Valhalla',
  surGrandAxe(true, 'Autoroute Est-Ouest'),
);
verifier(
  'nationale NON marquee par Valhalla, reconnue par son nom',
  surGrandAxe(false, 'RN 12'),
  'Valhalla ne pose son drapeau que sur motorway et trunk ; beaucoup de RN sont en primary',
);
verifier(
  'une rue de ville : rien',
  !surGrandAxe(false, 'Rue Didouche Mourad'),
  'en ville les voies changent a chaque carrefour : l affichage clignoterait sans rien apprendre',
);

console.log(
  fautes === 0
    ? '\nLes neuf fleches se distinguent, et la nationale est reconnue.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
