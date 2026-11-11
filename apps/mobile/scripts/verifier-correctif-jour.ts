/**
 * Eprouve le CORRECTIF JOUR du 11 novembre — les neuf valeurs chiffrees de Monsieur Mansour.
 *
 * POURQUOI CE SCRIPT. Ce document ne demande presque aucune logique nouvelle : il demande des
 * NOMBRES. Trois opacites, une duree, une marge, un seuil de disparition, un degrade. Ce sont
 * exactement les choses qu'un correctif ulterieur ecrase sans y penser — on deplace un bloc, on
 * reprend une ancienne valeur dans un commentaire, et personne ne s'en apercoit parce que rien
 * ne casse. Il n'y a pas d'erreur a l'execution quand un halo brille 30 % trop fort.
 *
 * Chaque controle porte donc sur une valeur que le document ECRIT, et cite sa correction.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-correctif-jour.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

const lire = (chemin: string) => readFileSync(resolve(chemin), 'utf8');

const fleche = lire('apps/mobile/src/components/NavArrow.tsx');
const flecheImage = lire('apps/mobile/scripts/make-nav-arrow.py');
const alerte = lire('apps/mobile/src/components/AlerteApproche.tsx');
const panneau = lire('apps/mobile/src/components/NavDestinationPicker.tsx');
const session = lire('apps/mobile/src/navigation/useNavigationSession.ts');
const pastille = lire('apps/mobile/src/components/RecalcToast.tsx');
const ecran = lire('apps/mobile/app/index.tsx');
const voies = lire('apps/mobile/src/components/LaneGuidance.tsx');

/* ------------------------------------------------------------------ */
console.log("\nC1 — LE HALO PERD 30 % D INTENSITE, ET RIEN D AUTRE");

/**
 * Le document le repete trois fois : la TAILLE et l'ANIMATION ne changent pas. La facon evidente
 * de << reduire un halo >> serait de le retrecir, et ce n'est pas ce qui est demande.
 */
for (const [nom, avant, apres] of [
  ['ring1', '0.45', '0.32'],
  ['ring2', '0.28', '0.20'],
  ['ring3', '0.15', '0.11'],
] as [string, string, string][]) {
  verifier(
    `${nom} : ${avant} → ${apres}`,
    fleche.includes(`opacite: ${apres}`) && !fleche.includes(`opacite: ${avant}`),
    `${avant} × 0,70`,
  );
}
verifier(
  'les rayons sont INCHANGES',
  fleche.includes('rayon: 56') && fleche.includes('rayon: 40') && fleche.includes('rayon: 26'),
  'le document interdit de toucher a la taille',
);
verifier(
  "l'animation est INCHANGEE",
  fleche.includes('PULSE_MS = 1_200') && fleche.includes('PULSE_MIN = 0.15'),
  '1200 ms, aller-retour, sans fin',
);
verifier(
  "la fleche-image porte les memes trois opacites",
  /\(56, \(255, 220, 100\), 0\.11\)/.test(flecheImage) &&
    /\(40, \(212, 160, 23\), 0\.20\)/.test(flecheImage) &&
    /\(26, \(212, 160, 23\), 0\.32\)/.test(flecheImage),
  'les deux fleches ne s affichent jamais ensemble, mais ce doit etre la meme',
);

/* ------------------------------------------------------------------ */
console.log('\nC9 — LA FLECHE OPTION D');

verifier(
  'degrade blanc → jaune → or',
  /#FFFFFF/.test(fleche) && /#FFE566/.test(fleche) && /#D4A017/.test(fleche),
);
verifier(
  "l'ordre des arrets : blanc a la pointe, or a la base",
  /decalage: '0%', couleur: '#FFFFFF'[\s\S]{0,120}decalage: '100%', couleur: '#D4A017'/.test(fleche),
  "c'est la clarte, et non la forme, qui designe la direction",
);
verifier(
  'contour blanc',
  /CONTOUR_FLECHE = '#FFFFFF'/.test(fleche),
  'le vert fonce d avant disparaissait sur un parc',
);
verifier(
  'point GPS rouge #E53935',
  /POINT_GPS = '#E53935'/.test(fleche),
  'la fleche dit le cap ; le point dit la position exacte',
);
verifier(
  'la fleche-image porte le meme degrade',
  /\(0\.00, \(255, 255, 255\)\)/.test(flecheImage) && /\(1\.00, \(212, 160, 23\)\)/.test(flecheImage),
);

/* ------------------------------------------------------------------ */
console.log('\nC2 — LA BARRE DE RECHERCHE EN HAUT DU PANNEAU');

/**
 * ON COMPARE DES POSITIONS DANS LE FICHIER, et c'est la seule facon de verifier un ORDRE
 * d'affichage sans faire tourner l'application. La barre doit venir AVANT la grille des
 * categories, qui vient avant les resultats.
 */
const posBarre = panneau.indexOf('<SearchBar');
const posGrille = panneau.indexOf('styles.grid');
const posResultats = panneau.indexOf('<SearchResults');
verifier(
  'la barre est AVANT la grille des categories',
  posBarre > 0 && posGrille > 0 && posBarre < posGrille,
  'elle etait en bas du panneau : hors ecran sur un telephone court',
);
verifier(
  'la grille reste avant les resultats',
  posGrille < posResultats,
  "l'ordre du reste du panneau ne bouge pas",
);
verifier(
  'le micro est branche sur la dictee de la carte',
  /onMicPressIn={onMicPressIn}/.test(panneau) && /onMicPressOut={onMicPressOut}/.test(panneau),
  'ses deux rappels etaient vides : un bouton qui ne faisait rien',
);
verifier(
  "l'ecran lui passe les memes rappels que le micro de la carte",
  /listening={voice\.listening}[\s\S]{0,160}onMicPressIn={\(\) => void voice\.start\(\)}/.test(ecran),
  '« reutiliser exactement le meme code »',
);

/* ------------------------------------------------------------------ */
console.log('\nC3 — LE RECALCUL PROACTIF EST SILENCIEUX');

verifier(
  'le recalcul de blocage ne parle plus',
  !/speakGuidance\(phraseRouteBloquee/.test(session),
  '« pas de banniere, pas de popup, pas de son »',
);
verifier(
  'il demande explicitement le mode silencieux',
  /void loadRoute\(from, false, true\)/.test(session),
);
verifier(
  "il ne touche pas a l'etat qui affiche la pastille",
  /if \(!silencieux\) \{\s*setRecalculating\(true\);/.test(session),
  'sinon le bandeau clignoterait sans explication',
);

console.log('\nC4 — LA PASTILLE DE RECALCUL RESTE 2 SECONDES');
verifier(
  'la duree minimale est de 2000 ms',
  /DUREE_MINIMALE_MS = 2_000/.test(pastille),
  '« 2 secondes · ne pas modifier sans validation »',
);
verifier(
  "elle survit a la fin du calcul",
  /if \(!visible && !prolonge\) return null;/.test(pastille),
  'un recalcul de 400 ms la faisait disparaitre avant qu on la voie',
);

/* ------------------------------------------------------------------ */
console.log('\nC5 — LA CROIX NE TOUCHE PLUS RIEN');

verifier('marge de 10 points', /CROIX_MARGE = 10/.test(alerte));
verifier('taille de 24 points, inchangee', /CROIX_TAILLE = 24/.test(alerte));
verifier(
  'sa place est RESERVEE dans le contenu',
  /paddingRight: CROIX_MARGE \+ CROIX_TAILLE \+ 6/.test(alerte),
  "ecarter la croix du bord la rapproche du texte : la marge seule ne suffit pas",
);

/* ------------------------------------------------------------------ */
console.log("\nC6 — L ICONE DISPARAIT 20 m APRES LE PASSAGE");

verifier(
  'le seuil est de 20 metres',
  /DEPASSEMENT_EFFACEMENT_M = 20/.test(ecran),
  'il etait de quarante',
);
verifier(
  'le filtre se sert de cette constante',
  /avanceSurTraceM - DEPASSEMENT_EFFACEMENT_M/.test(ecran),
  'une valeur en dur ici et une constante la-bas finiraient par diverger',
);
verifier(
  'le libelle sous le marqueur existe toujours',
  /id="reports-label"/.test(ecran) && /'text-field': \['get', 'libelle'\]/.test(ecran),
  '« icone + libelle en petit »',
);

/* ------------------------------------------------------------------ */
console.log('\nC8 — LE CLIGNOTEMENT DE LA VOIE RECOMMANDEE');

/* Deja livre en v121, aux memes valeurs. Ce controle existe pour qu'il le reste. */
verifier('de 1,0 a 0,2', /CLIGNOTEMENT_MIN = 0\.2/.test(voies));
verifier('en 500 ms', /CLIGNOTEMENT_MS = 500/.test(voies));
verifier(
  'seul le fond clignote, pas la fleche',
  /styles\.fond,\s*\{ backgroundColor: FOND_RECOMMANDE, opacity: clignote \}/.test(voies),
  "l'opacite d'une vue s'applique a ses enfants : la fleche palissait avec",
);

console.log(
  fautes === 0
    ? '\nLes neuf corrections du 11 novembre portent les valeurs du document.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
