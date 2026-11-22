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
import {
  ANTICIPATION_AGGLO_M,
  ANTICIPATION_RASE_M,
  distanceAnticipation,
  estNationale,
  LIMITE_AGGLO_KMH,
  surGrandAxe,
} from '../src/navigation/grandAxe';
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
  '\nLA DISTANCE D ANTICIPATION : 50 M EN VILLE, 500 M AILLEURS, 50 M QUAND ON NE SAIT PAS',
);
/* << Les fleches clignotent 500 m avant meme sur une RN en ville, avec des rues adjacentes.
 * Anticipation trop precoce en ville, confusion avec les autres carrefours. >>
 *
 * CE CONTROLE PORTE SUR LES DEUX BORDS DU SEUIL, et c'est la qu'une regle ecrite avec `<` au
 * lieu de `<=` se tromperait : cinquante kilometres-heure est la limite d'agglomeration
 * algerienne EXACTE, donc le cas le plus frequent de tous, et non un cas limite. */
verifier(
  'les trois valeurs sont celles du document',
  LIMITE_AGGLO_KMH === 50 && ANTICIPATION_AGGLO_M === 50 && ANTICIPATION_RASE_M === 500,
  `${LIMITE_AGGLO_KMH} km/h, ${ANTICIPATION_AGGLO_M} m, ${ANTICIPATION_RASE_M} m`,
);
verifier(
  'RN 12 traversant Draa El Mizan (50 km/h) : 50 m',
  distanceAnticipation(50) === ANTICIPATION_AGGLO_M,
  `${distanceAnticipation(50)} m — l exemple cite par le client`,
);
verifier(
  'rue de quartier (30 km/h) : 50 m',
  distanceAnticipation(30) === ANTICIPATION_AGGLO_M,
  `${distanceAnticipation(30)} m`,
);
verifier(
  'un seul km/h au-dessus (60) : on repasse a 500 m',
  distanceAnticipation(60) === ANTICIPATION_RASE_M,
  `${distanceAnticipation(60)} m`,
);
verifier(
  'RN hors agglomeration (100 km/h) : 500 m',
  distanceAnticipation(100) === ANTICIPATION_RASE_M,
  `${distanceAnticipation(100)} m`,
);
verifier(
  'autoroute (120 km/h) : 500 m',
  distanceAnticipation(120) === ANTICIPATION_RASE_M,
  `${distanceAnticipation(120)} m`,
);
/* LIMITE INCONNUE : 50 M — ET CE CONTROLE A CHANGE DE CAMP AU CORRECTIF v2.
 *
 * Il exigeait 500, par le defaut que le document du 22 novembre citait (`?: 90.0`). Le point E
 * du correctif v2 tranche dans l'autre sens, nommement : << Fallback : si maxSpeed = -1 ->
 * appliquer 50 m par defaut (agglomeration supposee). Mieux vaut clignoter a 50 m sur une route
 * nationale non taguee que ne pas clignoter du tout. >>
 *
 * CE QUI REND CE RENVERSEMENT SANS DANGER, et c'est une mesure et non un avis : `useSpeedLimit`
 * ne rend presque jamais `null`. Il interroge les tuiles Valhalla, et a defaut DEDUIT la limite
 * de la classe de route lue sur la carte — 120 sur autoroute, 100 sur nationale, 50 en ville.
 * Il ne rend `null` que si la carte n'est pas encore prete ou si le vehicule n'est sur aucune
 * route reconnue : deux situations ou l'on ne sait pas ou l'on est, et ou cinquante metres est
 * la valeur qui ne promet rien.
 *
 * LES QUATRE FACONS DE DIRE << JE NE SAIS PAS >> doivent toutes donner le meme resultat : le
 * `null` de notre code, l'`undefined` d'une propriete absente, le `-1` que le document cite, et
 * le NaN d'un calcul rate. */
verifier(
  'limite inconnue (null) : 50 m, agglomeration supposee',
  distanceAnticipation(null) === ANTICIPATION_AGGLO_M,
  `${distanceAnticipation(null)} m`,
);
verifier(
  'limite absente (undefined) : 50 m',
  distanceAnticipation(undefined) === ANTICIPATION_AGGLO_M,
);
verifier(
  'le -1 que le document cite : 50 m',
  distanceAnticipation(-1) === ANTICIPATION_AGGLO_M,
  '<< Valhalla retourne maxSpeed = -1 sur les segments non tagues >>',
);
verifier(
  'valeur aberrante (0 ou NaN) : 50 m elle aussi',
  distanceAnticipation(0) === ANTICIPATION_AGGLO_M &&
    distanceAnticipation(Number.NaN) === ANTICIPATION_AGGLO_M,
  'une donnee manquante se traite comme une donnee manquante, pas comme une route rapide',
);
/* ET LA PROPRIETE GENERALE : le seuil ne vaut JAMAIS autre chose que l'une des deux valeurs.
 * C'est ce qui resisterait a quelqu'un qui remplacerait la regle par une interpolation. */
let autreValeur = '';
for (const v of [null, undefined, -10, 0, 5, 20, 30, 49, 50, 51, 70, 80, 90, 110, 130, 200]) {
  const d = distanceAnticipation(v as number | null | undefined);
  if (d !== ANTICIPATION_AGGLO_M && d !== ANTICIPATION_RASE_M) autreValeur = `${v} -> ${d}`;
}
verifier(
  'le seuil ne prend que les deux valeurs du document, jamais une troisieme',
  autreValeur === '',
  autreValeur === '' ? '16 limites eprouvees' : autreValeur,
);

/* LES DEUX RANGEES PARTAGENT LE MEME SEUIL, et c'est la consigne du 18 novembre : << les
 * petites fleches clignotent EN MEME TEMPS que la grande >>. Elles le partagent parce qu'elles
 * appellent la MEME fonction — on verifie ici que ni l'une ni l'autre n'a garde un 500 en dur,
 * et que le RYTHME, lui, est intact : << uniquement le seuil de declenchement est modifie >>. */
const panneau = readFileSync(
  resolve(__dirname, '..', 'src', 'components', 'PanneauDirection.tsx'),
  'utf8',
);
const rangeeVoies = readFileSync(
  resolve(__dirname, '..', 'src', 'components', 'LaneGuidance.tsx'),
  'utf8',
);
verifier(
  'la grande fleche calcule son seuil au lieu de l ecrire',
  panneau.includes('seuilClignotementM({') && !panneau.includes('CLIGNOTEMENT_M ='),
  'plus aucune constante de 500 m dans PanneauDirection',
);
/* << TOUTES LES DIRECTIONS DECLENCHENT LE CLIGNOTEMENT >> — point E du correctif v2, et c'est
 * le bug qu'il decrit : << pour certaines destinations la fleche clignote, pour d'autres non
 * (meme route) >>. La cause etait le filtre de grand axe, qui se decide en partie sur le NOM de
 * la voie : deux destinations sur la meme route donnent deux manoeuvres, l'une nommee << RN 12 >>
 * et l'autre pas nommee du tout — la plupart des voies algeriennes ne le sont pas. */
verifier(
  'et elle ne filtre plus sur le grand axe',
  !panneau.includes('surGrandAxe'),
  'un nom de rue manquant dans OpenStreetMap empechait le clignotement',
);
/* LA RANGEE DE VOIES L'A PERDU A SON TOUR — correctif Fleches, 23 novembre, bug 2.
 *
 * Ce controle exigeait l'inverse jusqu'a aujourd'hui, et citait la consigne du 3 novembre :
 * << elle NE s'active PAS sur les virages normaux en ville, les carrefours classiques, les
 * ronds-points >>. Le client est revenu sur cette consigne apres essai au volant, et sa liste
 * de controle ne laisse pas de place au doute : trois de ses sept cas sont en agglomeration,
 * pour les trois directions, et chacun exige que LES DEUX fleches clignotent. Le filtre faisait
 * que la petite restait absente la ou la grande clignotait — sur la route de l'aeroport, par
 * exemple, parce qu'il se decide en partie sur le NOM de la voie.
 *
 * ON LIT LE CODE SANS SES COMMENTAIRES, et c'est le piege que ce controle vient d'eviter :
 * LaneGuidance CITE la ligne retiree, pour que personne ne la remette. Un `includes` sur le
 * fichier entier trouvait donc la citation et restait vert alors que la ligne avait disparu. */
const codeRangee = rangeeVoies.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
verifier(
  'la rangee de voies ne filtre plus sur le grand axe non plus',
  !codeRangee.includes('surGrandAxe'),
  'les deux fleches clignotent ensemble, pour toute direction et toute destination',
);
verifier(
  'la rangee de voies calcule exactement le meme',
  codeRangee.includes('seuilClignotementM({'),
);
verifier(
  'le rythme du clignotement n a bouge dans aucun des deux',
  panneau.includes('CLIGNOTEMENT_MS = 500') &&
    panneau.includes('CLIGNOTEMENT_MIN = 0.2') &&
    rangeeVoies.includes('CLIGNOTEMENT_MS = 500') &&
    rangeeVoies.includes('CLIGNOTEMENT_MIN = 0.2'),
  'de 1,0 a 0,2 en 500 ms, comme depuis le 18 novembre',
);

console.log(
  fautes === 0
    ? '\nLes neuf fleches se distinguent, la nationale est reconnue, et le seuil suit la ville.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
