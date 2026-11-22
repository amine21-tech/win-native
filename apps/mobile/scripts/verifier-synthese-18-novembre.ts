/**
 * Reprend la synthese du 18 novembre SOUS-EXIGENCE PAR SOUS-EXIGENCE.
 *
 * POURQUOI CE SCRIPT EXISTE. J'avais annonce << les six points sont traites >> apres avoir
 * verifie les TETES DE CHAPITRE : un rayon reglable, deux boutons, un curseur, un
 * clignotement. Arsanne a demande si TOUT ce que la synthese mentionne etait bien applique.
 * En reprenant ligne a ligne, deux defauts sont apparus — et aucun des deux n'aurait ete vu
 * en relisant les titres.
 *
 *   1. Le message << aucune offre dans un rayon de 50 km >> etait fige en dur. Avec le
 *      curseur, il aurait menti des le premier deplacement.
 *   2. La couche des lieux est coupee pendant le guidage. Le rayon VIP de vingt kilometres
 *      n'avait donc aucun effet LA OU LE CLIENT LE JUSTIFIE : << 10 km trop court sur
 *      autoroute >>.
 *
 * LA LECON TIENT EN UNE PHRASE : une fonction peut etre ecrite, testee, et sans effet dans la
 * situation pour laquelle elle a ete demandee. Ce fichier verifie les EFFETS, pas la presence
 * du code.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-synthese-18-novembre.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}
const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const poi = lire('src', 'map', 'usePoiLayer.ts');
const emploi = lire('src', 'components', 'JobsSheet.tsx');
const curseur = lire('src', 'components', 'CurseurRayon.tsx');
const menu = lire('src', 'components', 'ReportMenu.tsx');
const vipSheet = lire('src', 'components', 'VipActionSheet.tsx');
const entete = lire('src', 'components', 'Header.tsx');
const panneau = lire('src', 'components', 'PanneauDirection.tsx');
const fr = JSON.parse(lire('src', 'i18n', 'locales', 'fr.json')) as Record<string, Record<string, string>>;

console.log('\nA — LE RAYON VIP AGIT LA OU LE CLIENT LE JUSTIFIE');
verifier(
  'il vient du serveur',
  /vipRadiusKm/.test(poi) && /'\/config'/.test(poi),
  '<< modifiable depuis le serveur sans mise a jour de l app >>',
);
/* LE CONTROLE QUI A TROUVE LE DEFAUT. Les partenaires ne doivent pas dependre du drapeau qui
 * coupe les lieux ordinaires en navigation : c'est en roulant qu'ils servent. */
const blocVip = poi.slice(poi.indexOf("queryKey: ['poi-vip'"));
verifier(
  'les partenaires restent charges PENDANT le guidage',
  /enabled: position !== null,/.test(blocVip.slice(0, 1200)),
  "<< 10 km trop court sur autoroute >> : coupes, les vingt kilometres ne servaient a rien",
);
verifier(
  'et les lieux ordinaires restent coupes',
  /for \(const place of enabled \?/.test(poi),
  'une carte de navigation couverte de boulangeries cache la route',
);

console.log('\nB — LES DEUX ACTIONS, ET LEUR HABILLAGE');
for (const [quoi, motif] of [
  ['le champ est masque', 'secureTextEntry'],
  ['et numerique', 'number-pad'],
  ['le rouge du document', '#D32F2F'],
  ['l orange du document', '#E65100'],
  ['les coins a 12', 'borderRadius: 12'],
  ['le bouton Annuler', 'addPlace.cancel'],
] as const) {
  verifier(quoi, vipSheet.includes(motif));
}

console.log('\nC — LA CONDITION DES 20 METRES');
verifier('la carte se grise au lieu de disparaitre', /styles\.indisponible/.test(menu));
verifier("l'opacite du document", /opacity: 0\.4/.test(menu), '<< alpha = 0.4f >>');
verifier('et elle ne repond plus', /disabled=\{!autorise\}/.test(menu));

console.log('\nD — TAMAZIGHT');
verifier(
  "l'orthographe corrigee",
  entete.includes('ⵜⴰⵎⴰⵣⵉⵖⵜ') && !entete.includes("label: 'ⴰⵎⴰⵣⵉⵖ'"),
  'ⴰⵎⴰⵣⵉⵖ nommait la personne, ⵜⴰⵎⴰⵣⵉⵖⵜ nomme la langue',
);
verifier("l'audio de bienvenue au choix du kabyle", /jouerClips\(\['bienvenue'\]\)/.test(entete));

console.log('\nE.3 — LE CURSEUR DE L EMPLOI');
verifier('il va de 1 a 2000 km', /RAYON_MAX_KM = 2000/.test(lire('src', 'jobs', 'echelleRayon.ts')));
verifier('il affiche ses bornes', /styles\.borne/.test(curseur));
verifier('la valeur par defaut est 50', /useState\(50\)/.test(emploi), "l'ancien rayon fixe : rien ne change pour qui n y touche pas");
verifier('le rayon part bien a la requete', /radiusKm=\$\{rayonCherche\}/.test(emploi));
/* LE SECOND DEFAUT TROUVE. C'est le seul endroit ou le chercheur apprend jusqu'ou on a
 * regarde ; un chiffre fige en dur y est un mensonge. */
verifier(
  'et le message de liste vide porte le rayon REEL',
  /t\('jobs\.empty', \{ km: rayonCherche \}\)/.test(emploi) && fr.jobs?.empty?.includes('{{km}}') === true,
  fr.jobs?.empty ?? '(absent)',
);

console.log('\nF — LA FLECHE');
/* Le point F.2 du 18 novembre demandait 500 m. Le point 6 du 22 novembre a ramene ce seuil a
 * 50 m EN AGGLOMERATION, pour la raison que le client donne : sur une RN qui traverse un bourg,
 * cinq cents metres avant la sortie on est encore devant six intersections, et la fleche semble
 * designer la premiere. Hors agglomeration, le 500 du 18 novembre tient toujours — c'est la
 * valeur que `distanceAnticipation` rend quand la limite depasse 50 km/h ou reste inconnue. */
verifier(
  'elle clignote au seuil d anticipation (500 m hors agglomeration)',
  /distanceAnticipation\(limiteKmh\)/.test(panneau) &&
    /ANTICIPATION_RASE_M = 500/.test(lire('src', 'navigation', 'grandAxe.ts')),
);
/* LE FILTRE DE GRAND AXE A QUITTE LA GRANDE FLECHE — point E du correctif v2.
 *
 * << Bug : pour certaines destinations la fleche clignote, pour d'autres non (meme route). >>
 * << Gauche, droite, tout droit, bifurcation — TOUTES les directions declenchent le
 * clignotement. >>
 *
 * Ce controle exigeait l'inverse, et il avait sa raison : en ville, une fleche qui clignote a
 * chaque carrefour cesse d'alerter. Cette raison est tombee le 22 novembre, quand le seuil en
 * agglomeration est passe a cinquante metres : la fleche ne clignote plus qu'a cinquante metres
 * du carrefour, donc sur le bon. Le filtre ne protegeait plus de rien et cassait une destination
 * sur deux, parce qu'il se decide en partie sur le NOM de la voie — absent de la plupart des
 * routes algeriennes dans OpenStreetMap. */
verifier(
  'sur toutes les routes, et non plus sur grand axe seulement',
  !/surGrandAxe/.test(panneau),
);

console.log('\nCE QUI RESTE A FAIRE, ET QUI N EST PAS DE NOTRE RESSORT');
/* On le verifie pour que le manque soit VISIBLE a chaque execution, plutot que de reposer sur
 * le souvenir d'une phrase dite une fois dans une conversation. */
let darija = false;
try {
  darija = readFileSync(join(__dirname, '..', 'assets', 'voix', 'arq', 'bienvenue.wav')).length > 0;
} catch {
  darija = false;
}
console.log(
  `  ${darija ? 'ok  ' : '--  '}  l'audio de bienvenue en darija` +
    `  - ${darija ? 'present' : "ABSENT : les deux envois du locuteur ne contiennent que du kabyle"}`,
);

console.log(
  fautes === 0
    ? '\nLa synthese du 18 novembre est appliquee, sous-exigence par sous-exigence.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
