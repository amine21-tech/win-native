/**
 * LE DOCUMENT COMPLET DU 24 NOVEMBRE, POINT PAR POINT — « Correctifs & Spécifications ».
 *
 * Neuf pages, quatre priorites et un rappel, et une checklist de vingt-quatre verifications a
 * la fin. Ce fichier rejoue cette checklist : les seuils de clignotement sur les dix cas de la
 * page 8, les quotas de medias, la regle des quinze metres, les deux lignes des boutons de
 * langue, et les deux votes des symboles.
 *
 * LE PRINCIPE QUI OUVRE ET QUI FERME LE DOCUMENT : « NE RIEN CASSER du travail accompli ·
 * AJOUTER / CORRIGER uniquement les 5 points ci-dessus. » Chaque chapitre porte donc, a cote
 * de ce qui est NOUVEAU, la preuve de ce qui N'A PAS BOUGE.
 *
 * ON LIT LE CODE SANS SES COMMENTAIRES. Un correctif qui retire une regle en CITE la ligne
 * retiree pour expliquer pourquoi : un simple `includes()` sur le fichier entier resterait
 * alors vert pour toujours. Trois faux verts ont ete pris de cette facon en novembre.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-correctifs-24-novembre.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANTICIPATION_AGGLO_M,
  ANTICIPATION_RASE_M,
  seuilClignotementM,
} from '../src/navigation/grandAxe';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/* Fins de ligne normalisees : un aller-retour par git rend les fichiers en CRLF sur Windows,
 * et tout motif ecrit avec un saut de ligne cesserait de correspondre sans que rien n'ait
 * change dans le code. Un verificateur qui depend de cela ne verifie rien. */
const sansCR = (s: string) => s.replace(/\r\n/g, '\n');
const lire = (...p: string[]) => sansCR(readFileSync(join(__dirname, '..', ...p), 'utf8'));
const lireRacine = (...p: string[]) =>
  sansCR(readFileSync(join(__dirname, '..', '..', '..', ...p), 'utf8'));
/** Le code sans ses commentaires : un correctif CITE ce qu'il a retire. */
const sansCommentaires = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const LANGUES = ['fr', 'en', 'ar', 'dz', 'kab'] as const;
const traductions = Object.fromEntries(
  LANGUES.map((l) => [l, JSON.parse(lire('src', 'i18n', 'locales', `${l}.json`)) as Record<string, Record<string, string>>]),
) as Record<(typeof LANGUES)[number], Record<string, Record<string, string>>>;

/** Toutes les langues portent la clef, et aucune ne l'a laissee vide. */
function cinqLangues(groupe: string, clef: string): boolean {
  return LANGUES.every((l) => typeof traductions[l][groupe]?.[clef] === 'string' && traductions[l][groupe][clef].length > 0);
}

console.log('\n============================================================');
console.log('PRIORITE 1 — LES FLECHES : BLANCHES, ET 50 m / 500 m');
console.log('============================================================');

/* LE TABLEAU DES SEUILS DE LA PAGE 2, LIGNE PAR LIGNE.
 *
 * Les limites viennent de useSpeedLimit : une classe de route connue porte TOUJOURS une limite
 * (motorway 120, primary 100, tertiary 80, minor 50...). Le cas « limite inconnue » n'arrive
 * donc que lorsque la carte elle-meme ne sait pas dire sur quoi l'on roule — et c'est bien la
 * derniere ligne du tableau : « Toute route non reconnue ». */
const CAS: { nom: string; troncon: Parameters<typeof seuilClignotementM>[0]; attendu: number }[] = [
  {
    nom: 'Route nationale HORS agglomeration (100 km/h)',
    troncon: { limiteKmh: 100, classeRoute: 'primary', agglomeration: false },
    attendu: ANTICIPATION_RASE_M,
  },
  {
    nom: 'Autoroute, sortie taguee (120 km/h)',
    troncon: { limiteKmh: 120, classeRoute: 'motorway', agglomeration: false },
    attendu: ANTICIPATION_RASE_M,
  },
  {
    nom: 'Autoroute, sortie NON taguee (OSM vide)',
    troncon: { limiteKmh: null, classeRoute: 'motorway', agglomeration: false },
    attendu: ANTICIPATION_RASE_M,
  },
  {
    nom: 'Route nationale EN agglomeration (traverse une ville)',
    troncon: { limiteKmh: 100, classeRoute: 'primary', agglomeration: true },
    attendu: ANTICIPATION_AGGLO_M,
  },
  {
    nom: 'Route secondaire EN agglomeration',
    troncon: { limiteKmh: 100, classeRoute: 'secondary', agglomeration: true },
    attendu: ANTICIPATION_AGGLO_M,
  },
  {
    nom: 'Route tertiaire EN agglomeration',
    troncon: { limiteKmh: 80, classeRoute: 'tertiary', agglomeration: true },
    attendu: ANTICIPATION_AGGLO_M,
  },
  {
    nom: 'Rue de quartier (50 km/h)',
    troncon: { limiteKmh: 50, classeRoute: 'minor', agglomeration: true },
    attendu: ANTICIPATION_AGGLO_M,
  },
  {
    nom: 'Toute route NON RECONNUE — defaut prudent',
    troncon: { limiteKmh: null, classeRoute: null, agglomeration: false },
    attendu: ANTICIPATION_AGGLO_M,
  },
];

verifier('les deux seuils du document sont bien 50 et 500', ANTICIPATION_AGGLO_M === 50 && ANTICIPATION_RASE_M === 500);
for (const cas of CAS) {
  const obtenu = seuilClignotementM(cas.troncon);
  verifier(`${cas.nom} -> ${cas.attendu} m`, obtenu === cas.attendu, obtenu === cas.attendu ? '' : `rendu : ${obtenu} m`);
}

/* L'ECART ASSUME AVEC LE PSEUDO-CODE DU DOCUMENT, ET POURQUOI IL EST DANS CE SENS.
 *
 * La page 3 teste `isUrban()` AVANT la classe de route. Une autoroute urbaine — la rocade sud
 * d'Alger, par exemple — clignoterait donc a 50 m, soit une seconde et demie a 110 km/h. La
 * checklist de la page 8 demande elle-meme 500 m sur autoroute dans DEUX cas sur dix, taguee
 * ou non. On teste donc la voie rapide EN PREMIER. */
console.log('\nL ECART ASSUME : une autoroute reste a 500 m, meme entouree de bati');
verifier(
  'autoroute urbaine : 500 m et non 50',
  seuilClignotementM({ limiteKmh: null, classeRoute: 'motorway', agglomeration: true }) === ANTICIPATION_RASE_M,
  'une seconde et demie d avance a 110 km/h ne previent personne',
);

console.log('\nAUCUNE FLECHE NE NAIT TRANSPARENTE');
const panneau = sansCommentaires(lire('src', 'components', 'PanneauDirection.tsx'));
const rangee = sansCommentaires(lire('src', 'components', 'LaneGuidance.tsx'));
verifier(
  'plus une seule fleche sous 100 % d opacite dans le bandeau',
  !/couleur="rgba\(255,\s*255,\s*255,\s*0\./.test(panneau) && /couleur="#FFFFFF"/.test(panneau),
  'la fleche << puis >> etait a 85 % — le dernier endroit du document',
);
verifier(
  "l'opacite animee n'est posee que DANS la zone de clignotement",
  /clignoter \? \{ opacity: clignote \} : undefined/.test(panneau),
  'hors zone le style est retire, donc l opacite revient a 1 toute seule',
);
verifier(
  'dans la rangee de voies, c est le FOND qui clignote, jamais la fleche',
  /styles\.fond, \{ backgroundColor: FOND_RECOMMANDE, opacity: clignote \}/.test(rangee),
  'l opacite d une vue s applique a ses enfants : la fleche palirait avec elle',
);
verifier(
  'LES DEUX FLECHES APPELLENT LE MEME SEUIL, MOT POUR MOT',
  (() => {
    const APPEL = /seuilClignotementM\(\{[^}]*\}\)/;
    const a = panneau.match(APPEL)?.[0];
    const b = rangee.match(APPEL)?.[0];
    return !!a && a === b;
  })(),
  '<< les DEUX clignotent au MEME instant, avec la MEME direction >>',
);

console.log('\n============================================================');
console.log('PRIORITE 2 — LA CARTE VIP : 3 CAMERA + 2 GALERIE + 1 VIDEO 30 s');
console.log('============================================================');
const formulaire = lire('src', 'components', 'AddPlaceSheet.tsx');
const codeFormulaire = sansCommentaires(formulaire);
const carousel = sansCommentaires(lire('src', 'components', 'vip', 'CarouselPhotos.tsx'));
const fiche = sansCommentaires(lire('src', 'components', 'PlaceSheet.tsx'));

verifier(
  'trois photos prises sur place, deux tirees du telephone',
  /const MAX_PHOTOS_CAMERA = 3;/.test(codeFormulaire) && /const MAX_PHOTOS_GALERIE = 2;/.test(codeFormulaire),
);
verifier(
  'et les deux colonnes sont comptees SEPAREMENT',
  /garderSousQuota/.test(codeFormulaire) &&
    /ajoutee\.source === 'camera' \? MAX_PHOTOS_CAMERA : MAX_PHOTOS_GALERIE/.test(codeFormulaire),
  'un seul compteur de cinq laisserait remplir la fiche d images trouvees ailleurs',
);
verifier(
  "l'origine est gardee avec chaque photo",
  /source: 'camera' \| 'galerie'/.test(codeFormulaire),
  'sinon retirer une photo rendrait son emplacement a la mauvaise colonne',
);
verifier(
  'chaque moitie du bouton disparait quand SA colonne est pleine',
  /placeRestante\('camera'\) > 0/.test(codeFormulaire) && /placeRestante\('galerie'\) > 0/.test(codeFormulaire),
  'trois photos sur place ne doivent pas fermer l acces a la galerie',
);
verifier(
  'la camera est toujours la camera, la galerie toujours la galerie',
  /launchCameraAsync\(\{ quality: 0\.7, exif: false \}\)/.test(codeFormulaire) &&
    /addPhoto\(picked, 'camera'\)/.test(codeFormulaire) &&
    /addPhoto\(picked, 'galerie'\)/.test(codeFormulaire),
  'checklist P2 : << ouvre l appareil photo directement >> / << le selecteur de fichiers >>',
);

console.log('\nLA VIDEO : TRENTE SECONDES, FILMEE OU IMPORTEE');
verifier('la borne est de trente secondes', /const VIDEO_MAX_S = 30;/.test(codeFormulaire));
verifier(
  'la camera se coupe toute seule a trente secondes',
  /videoMaxDuration: VIDEO_MAX_S/.test(codeFormulaire),
);
verifier(
  "et une video IMPORTEE est mesuree a l'arrivee",
  /dureeS > VIDEO_MAX_S \+ VIDEO_TOLERANCE_S/.test(codeFormulaire),
  '`videoMaxDuration` ne peut rien contre un fichier deja enregistre',
);
verifier(
  'les deux chemins existent : filmer ET importer',
  /choisirVideo\(true\)/.test(codeFormulaire) && /choisirVideo\(false\)/.test(codeFormulaire),
  '<< enregistree en direct OU importee depuis la galerie >>',
);
verifier(
  "un echec d'envoi de la video ne fait pas perdre le lieu",
  /let videoId: string \| undefined;/.test(codeFormulaire) && /catch \(e\) \{\s*photoProblem =/.test(codeFormulaire),
  'le lieu tient en deux cents octets, la video en vingt megaoctets',
);

console.log('\nELLE EST LA DIAPOSITIVE PRINCIPALE DU CAROUSEL');
verifier(
  'la video passe DEVANT les photos',
  /\.\.\.\(video \? \[\{ cle: video, video: true \}\] : \[\]\),/.test(carousel),
  '<< 1 video — slide principal du carousel >>',
);
verifier(
  'pastilles, compteur et miniatures comptent la video avec les photos',
  /const visibles: \{ cle: string; video: boolean \}\[\]/.test(carousel),
  'un compte tenu a part se serait desynchronise a la premiere correction',
);
verifier(
  'la fiche partenaire la transmet',
  /video=\{place\.videoUrl\}/.test(fiche),
);
verifier(
  'et une fiche partenaire SANS photo mais AVEC video ouvre quand meme le carousel',
  /place\.isPartner && \(gallery\.length > 0 \|\| place\.videoUrl\)/.test(fiche),
);

console.log('\nLE CHEMIN DE LA VIDEO, DU TELEPHONE AU DISQUE');
const routeVideo = lireRacine('apps', 'api', 'src', 'routes', 'videos.ts');
const routePlaces = lireRacine('apps', 'api', 'src', 'routes', 'places.ts');
const partage = lireRacine('packages', 'shared', 'src', 'schemas.ts');
const copiePartage = lire('src', 'shared', 'schemas.ts');
const migration = lireRacine('apps', 'api', 'db', 'migrations', '0016_fiche_vip_video.sql');

verifier('la route refuse ce qui n est pas une video', /file\.mimetype\.startsWith\('video\/'\)/.test(routeVideo));
verifier(
  'et elle refuse une video COUPEE au lieu de l enregistrer',
  /file\.file\.truncated/.test(routeVideo),
  '`toBuffer()` rend sans erreur ce qu il a pu lire : une video tronquee, illisible',
);
verifier(
  "l'extension vient du type MIME, pas du nom envoye par le telephone",
  /const ext = file\.mimetype\.includes/.test(routeVideo) && !/file\.filename/.test(routeVideo),
  'un nom de fichier est choisi par le client — il peut contenir des << .. >>',
);
verifier(
  'une seule video par lieu, et c est la BASE qui le garantit',
  /CREATE UNIQUE INDEX IF NOT EXISTS place_videos_un_par_lieu/.test(migration),
  'sans cet index, une fiche corrigee trois fois porterait trois videos',
);
verifier(
  'la migration n ALTERE aucune table existante',
  !/ALTER TABLE places/.test(migration) && /CREATE TABLE IF NOT EXISTS place_videos/.test(migration),
  '<< ne rien casser >> : un serveur plus ancien tournerait sur ce schema sans rien remarquer',
);
verifier(
  'le rattachement interdit de prendre la video d un autre lieu',
  (routePlaces.match(/WHERE id = \$\{input\.videoId\}::uuid AND place_id IS NULL/g) ?? []).length === 2,
  'a la creation comme a la correction',
);
verifier(
  "une correction qui ne parle pas de video n'y touche pas",
  /if \(input\.videoId\) \{/.test(routePlaces),
  'corriger un telephone ne doit pas effacer la video d un partenaire',
);
verifier(
  'la video remonte avec la fiche, et sa jointure accompagne les photos',
  (routePlaces.match(/\$\{videoJoin\}/g) ?? []).length ===
    (routePlaces.match(/\$\{photosJoin\}/g) ?? []).length,
  'une requete qui lit `vi.url` sans la jointure echouerait',
);
verifier(
  'le champ partage est FACULTATIF des deux cotes',
  /videoUrl: z\.string\(\)\.nullable\(\)\.optional\(\)/.test(partage),
  'un serveur sans la migration 0016 ne renvoie pas ce champ du tout',
);
verifier(
  'ET LA COPIE DE L APPLICATION EST A JOUR',
  /videoUrl: z\.string\(\)\.nullable\(\)\.optional\(\)/.test(copiePartage),
  'GitHub Actions ne recopie PAS packages/shared : c est cette copie qui part dans l APK',
);

console.log('\n============================================================');
console.log('PRIORITE 3 — UN LIEU S ENREGISTRE SUR PLACE, A 15 m AU PLUS');
console.log('============================================================');
verifier('la distance maximale est de quinze metres', /const MAX_DISTANCE_M = 15;/.test(codeFormulaire));
verifier(
  'elle est mesuree AVANT l enregistrement, avec un releve FRAIS',
  /accuracy: Location\.Accuracy\.BestForNavigation/.test(codeFormulaire) &&
    /if \(ecart > MAX_DISTANCE_M\) \{\s*setTropLoinM\(ecart\);\s*return;/.test(codeFormulaire),
  'reutiliser le releve du formulaire reviendrait a comparer une erreur avec elle-meme',
);
verifier(
  '<< GARDER TEL QUEL >> NE PARAIT PLUS POUR UN UTILISATEUR ORDINAIRE',
  /\{vipCode \|\| verifyM === null \|\| verifyM <= VERIFY_SUSPICIOUS_M \?/.test(codeFormulaire),
  'la capture du client : << a 33 km de votre position >>, et un bouton pour garder',
);
verifier(
  'le refus n est jamais un cul-de-sac',
  /placerSurMaPosition/.test(codeFormulaire) && /addPlace\.moveHere/.test(codeFormulaire),
  'un appui replace le point sur la position reelle, et l enregistrement passe',
);
verifier(
  'un GPS muet ne bloque personne',
  /\} catch \{\s*\/\/ GPS muet[\s\S]{0,80}ici = null;/.test(formulaire),
  'on ne reproche pas a un contributeur un recepteur qui ne repond pas',
);
verifier(
  'le code WIN reste au-dessus de la regle',
  /if \(!vipCode\) \{/.test(codeFormulaire),
  '<< pour tout utilisateur NORMAL >> : une fiche partenaire se saisit au bureau',
);
verifier(
  'le refus de distance repart a zero a chaque ouverture',
  /setTropLoinM\(null\);/.test(codeFormulaire) && /setVideo\(null\);/.test(codeFormulaire),
  'sinon il barre le formulaire suivant — le defaut deja vu avec l ecran de verification',
);
for (const clef of ['tooFar', 'tooFarWhy']) {
  verifier(`addPlace.${clef} existe dans les cinq langues`, cinqLangues('addPlace', clef));
}

console.log('\n============================================================');
console.log('PRIORITE 4 — DERIJA ET TAMAZIRT : DEUX LIGNES, ET LA BIENVENUE');
console.log('============================================================');
const entete = lire('src', 'components', 'Header.tsx');
const codeEntete = sansCommentaires(entete);
verifier(
  'Derija : nom phonetique en haut, ecriture arabe en bas',
  /\{ code: 'dz', label: 'Derija', sous: 'دارجة', pret: true \}/.test(codeEntete),
);
verifier(
  'Tamazirt : nom phonetique en haut, Tifinagh en bas',
  /\{ code: 'kab', label: 'Tamazirt', sous: 'ⵜⴰⵎⴰⵣⵉⵖⵜ', pret: true \}/.test(codeEntete),
  'les symboles Tifinagh deja presents dans WIN — rien n a ete reimporte',
);
verifier(
  'LES CINQ LANGUES SONT TOUJOURS LA',
  ["'fr'", "'dz'", "'kab'", "'ar'", "'en'"].every((c) => codeEntete.includes(`{ code: ${c},`)),
  '<< Ne pas supprimer FR / عربي / EN existants >>',
);
verifier(
  'et les cinq boutons gardent la MEME taille',
  /alignItems: 'stretch'/.test(codeEntete) && /justifyContent: 'center',/.test(codeEntete),
  'les pastilles d une seule ligne prennent la hauteur de celles qui en ont deux',
);
verifier(
  "l'espace sous la rangee a suivi la seconde ligne",
  /const HEADER_HEIGHT = 105;/.test(sansCommentaires(lire('app', 'index.tsx'))),
  'sinon la rangee des langues revient se coller a la barre de recherche',
);
/* TROIS POINTS SEULEMENT, ET C'EST LA COLONNE DE DIX BOUTONS QUI L'A DECIDE. Une premiere
 * version avait pose 114 — douze points, le cout brut de la seconde ligne. La colonne de
 * droite se calcule sur ce qui reste sous l'en-tete : elle debordait de huit points sur un
 * Android de 640, et le dixieme bouton sortait de l'ecran. La seconde ligne a donc ete serree
 * (hauteur de ligne fixe, marge des pastilles de six a trois) jusqu'a ne plus couter que
 * quatre points, dont trois repris ici. C'est verifier-colonne-fab.py qui tient ce budget. */
verifier(
  'et la seconde ligne a ete serree pour que les dix boutons tiennent',
  /lineHeight: 10/.test(codeEntete) && /paddingVertical: 3,/.test(codeEntete),
  'une hauteur de ligne libre coute 13 points la ou 10 suffisent',
);
verifier(
  'un clic affiche le message de bienvenue DANS LA LANGUE CHOISIE',
  /ToastAndroid\.show\(i18n\.t\('app\.bienvenue', \{ lng: lang \}\)/.test(codeEntete),
  '`t` du rendu courant porterait encore l ANCIENNE langue',
);
verifier("app.bienvenue existe dans les cinq langues", cinqLangues('app', 'bienvenue'));
verifier(
  'le clip de bienvenue en tamazight n a pas ete touche',
  /if \(lang === 'kab'\) jouerClips\(\['bienvenue'\]\);/.test(codeEntete),
  'les enregistrements ou rien, regle du 9 novembre',
);
verifier(
  'le bouton actif est toujours mis en surbrillance',
  /on && \{ backgroundColor: colors\.accent \}/.test(codeEntete),
  '<< bordure ou fond plus clair >>',
);

console.log('\n============================================================');
console.log('RAPPEL — LES SYMBOLES : 150 m, VOIX COUPABLE, DEUX VOTES');
console.log('============================================================');
const alerte = lire('src', 'navigation', 'alerteApproche.ts');
const boutonVoix = sansCommentaires(lire('src', 'components', 'BoutonLangueNav.tsx'));
const routeReports = lireRacine('apps', 'api', 'src', 'routes', 'reports.ts');
verifier(
  "un seul palier d'annonce, a 150 m",
  /export const PALIERS_M = \[150\] as const;/.test(alerte),
  '<< Signal 150 m AVANT le symbole >>',
);
verifier(
  'la voix se coupe sans faire disparaitre le symbole',
  /arreterClips\(\)/.test(boutonVoix) && /nav\.audioCoupe/.test(boutonVoix),
  '<< desactive le vocal uniquement — le symbole reste visible sur la carte >>',
);
verifier(
  'DEUX appareils DIFFERENTS pour effacer un symbole',
  /COUNT\(DISTINCT/.test(routeReports) || /device_id/.test(routeReports),
  '<< un seul utilisateur "A disparu" ne suffit pas >>',
);
verifier(
  "le passage devant un symbole ne l'efface plus tout seul",
  !/DEPASSEMENT_EFFACEMENT_M/.test(sansCommentaires(lire('app', 'index.tsx'))),
  'c etait la regle du 11 novembre, remplacee par les deux votes le 22',
);

console.log(
  fautes === 0
    ? '\nLes quatre priorites du 24 novembre sont appliquees, et le rappel tient toujours.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
