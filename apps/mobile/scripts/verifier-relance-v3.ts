/**
 * LA CHECKLIST DE LA RELANCE v3, REJOUEE — document << WIN_DZ_Correctif_Relance_v2_1.pdf >>,
 * page 7 : << CHECKLIST GLOBALE · 5 points · Tests obligatoires avant envoi APK >>.
 *
 * CE FICHIER NE DIT PAS << C'EST FAIT >>, IL LE MONTRE. Le client demande la confirmation que
 * les cinq points de sa synthese vivent dans l'application et que rien de ce qui marchait ne
 * s'est casse. Une reponse en prose ne vaut rien pour cela : elle est vraie le jour ou on
 * l'ecrit et fausse trois commits plus tard. Les seize cases de sa page 7 sont donc reprises
 * une par une, chacune lue dans le code qui la tient.
 *
 * CE QU'IL FAUT SAVOIR AVANT DE LE LIRE. Les cinq points ne sont pas tous nes ici : trois
 * etaient des RAPPELS, deja livres en v158, et ce fichier les re-eprouve plutot que de les
 * croire sur parole. Les deux URGENTS sont de la v159. Les controles d'origine existent
 * toujours et vivent a cote (verifier-fleches-synchro, verifier-chevauchements,
 * verifier-fiche-vip-premium, verifier-correctifs-24-novembre, verifier-suppression-vip) : ce
 * fichier-ci est la VUE DU CLIENT, dans l'ordre et les mots de son document.
 *
 * LES TROIS ECARTS ASSUMES SONT NOMMES ICI, ET AUCUN N'EST CACHE DERRIERE UN << ok >> :
 *
 *   1. LES BOUTONS DE LANGUE NE SONT PLUS CARRES. << Minimum 18sp >> et << meme carre >> sont
 *      incompatibles : << Tamazight >> a dix-huit points demande 91 points de large, un carre
 *      de 52 en offre 41. On a garde la lisibilite, qui est le reproche d'origine.
 *   2. LES PHOTOS SE COMPTENT, ELLES NE S'ALIGNENT PAS. Le document demande << 3 boutons
 *      camera + 2 boutons galerie >> ; l'application a UN bouton camera utilisable trois fois
 *      et UN bouton galerie utilisable deux fois, avec le compte affiche. Les quotas sont
 *      exactement ceux demandes ; la forme ne l'est pas.
 *   3. << alpha = 1.0 EN PERMANENCE >> ET << les fleches clignotent >> se contredisent dans le
 *      meme document. On a lu : aucune transparence PERMANENTE (c'etait le defaut : la petite
 *      fleche vivait a 85 %), et le clignotement qu'il demande par ailleurs reste.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-relance-v3.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANTICIPATION_AGGLO_M,
  ANTICIPATION_RASE_M,
  seuilClignotementM,
} from '../src/navigation/grandAxe';
import { estEnAgglomeration, preuvesAgglomeration, type TraitDeCarte } from '../src/navigation/agglomeration';
import { PALIERS_M } from '../src/navigation/alerteApproche';
import {
  ABSENT_VOTE_THRESHOLD,
  seuilDegagement,
  TEMPORARY_TTL_MINUTES,
  VOTES_DEGAGEMENT,
} from '../src/shared';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/* Les fins de ligne sont normalisees a la lecture : un aller-retour par git rend les fichiers
 * en CRLF sur Windows, et les motifs ecrits avec un saut de ligne cesseraient de correspondre.
 * Un verificateur qui depend de la facon dont le fichier a ete pose sur le disque ne verifie
 * rien. */
const lire = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const lireApi = (...p: string[]) =>
  readFileSync(join(__dirname, '..', '..', 'api', ...p), 'utf8').replace(/\r\n/g, '\n');
/** Le code sans ses commentaires : un correctif CITE souvent la ligne qu'il a retiree. */
const sansCommentaires = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const AGGLO = ANTICIPATION_AGGLO_M;
const RASE = ANTICIPATION_RASE_M;

const panneau = lire('src', 'components', 'PanneauDirection.tsx');
const rangee = lire('src', 'components', 'LaneGuidance.tsx');
const fleche = lire('src', 'components', 'FlecheManoeuvre.tsx');
const langue = lire('src', 'components', 'BoutonLangueNav.tsx');
const colonne = lire('src', 'components', 'NavigationOverlay.tsx');
const cycle = lire('src', 'i18n', 'cycleLangue.ts');
const formulaire = lire('src', 'components', 'AddPlaceSheet.tsx');
const codeFormulaire = sansCommentaires(formulaire);
const ficheLieu = lire('src', 'components', 'PlaceSheet.tsx');
const carrousel = lire('src', 'components', 'vip', 'CarouselPhotos.tsx');
const carte = lire('app', 'index.tsx');
const codeCarte = sansCommentaires(carte);
const routesReports = lireApi('src', 'routes', 'reports.ts');
const migration = lireApi('db', 'migrations', '0000_init.sql');

console.log('\n============================================================');
console.log('URGENT 1 — FLECHES  (page 7, quatre cases)');
console.log('============================================================');

/* LA CW 158 D'AZEFFOUN, TELLE QUE SA CAPTURE LA MONTRE : une route taguee 100 km/h, aucun
 * batiment, aucune zone d'habitation, et trois services nommes autour du vehicule. C'est le cas
 * exact du document, et c'est celui qui echouait. */
const azeffoun: TraitDeCarte[] = [
  { polygone: false, forme: 'ligne', proprietes: { class: 'primary', name: 'CW 158' } },
  { polygone: false, forme: 'point', proprietes: { class: 'town_hall', name: 'Mairie Azzefoune' } },
  { polygone: false, forme: 'point', proprietes: { class: 'post', name: 'Bureau de poste de Azeffoun' } },
  { polygone: false, forme: 'point', proprietes: { class: 'cafe', name: 'Cafe' } },
];
const vuDAzeffoun = estEnAgglomeration(azeffoun);
verifier(
  'la carte d Azeffoun se lit << agglomeration >>',
  vuDAzeffoun,
  `${preuvesAgglomeration(azeffoun)} preuves — c est ce qui repondait NON avant la v159`,
);
verifier(
  '<< CW 158 en agglomeration -> fleches clignotent a 50 m EXACTEMENT >>',
  seuilClignotementM({ limiteKmh: 100, classeRoute: 'primary', agglomeration: vuDAzeffoun }) === AGGLO,
  `${seuilClignotementM({ limiteKmh: 100, classeRoute: 'primary', agglomeration: vuDAzeffoun })} m`,
);
verifier(
  '<< RN traversant une ville (100 km/h OSM) -> 50 m >>',
  seuilClignotementM({ limiteKmh: 100, classeRoute: 'trunk', agglomeration: true }) === AGGLO &&
    seuilClignotementM({ limiteKmh: 100, classeRoute: 'primary', agglomeration: true }) === AGGLO,
  'la RN 68 de Jijel et la CW 158 d Azeffoun, meme cas',
);
verifier(
  '<< Hors agglomeration -> 500 m >>',
  seuilClignotementM({ limiteKmh: 100, classeRoute: 'primary', agglomeration: false }) === RASE &&
    seuilClignotementM({ limiteKmh: 120, classeRoute: 'motorway', agglomeration: false }) === RASE &&
    seuilClignotementM({ limiteKmh: null, classeRoute: 'trunk', agglomeration: false }) === RASE,
  'nationale taguee, autoroute taguee, autoroute NON taguee',
);
verifier(
  '<< if (step.isUrban()) return 50.0 >> est la PREMIERE question posee',
  /^[\s\S]{0,900}?troncon\.agglomeration === true/.test(
    sansCommentaires(lire('src', 'navigation', 'grandAxe.ts').split('export function seuilClignotementM')[1] ?? ''),
  ),
  'page 8 : << Mettre if (step.isUrban()) return 50.0 EN PREMIERE LIGNE >>',
);

console.log('\n<< Grande fleche + petite fleche BLANCHES en permanence (alpha=1.0) >>');
verifier(
  'la fleche est blanche par defaut, et la petite l est explicitement',
  /couleur = '#FFFFFF'/.test(fleche) && /couleur="#FFFFFF"/.test(panneau),
  'la petite vivait a 85 % : rgba(255,255,255,0.85)',
);
verifier(
  'plus aucune transparence PERMANENTE dans le bandeau ni dans la rangee',
  !/couleur="rgba\(255,\s*255,\s*255,\s*0\./.test(panneau) &&
    !/couleur="rgba\(255,\s*255,\s*255,\s*0\./.test(rangee),
);
/* L'ECART ASSUME N° 3, ET IL EST DANS LE DOCUMENT LUI-MEME : il demande alpha = 1.0 en
 * permanence ET un clignotement. On garde le clignotement — il est l'objet de l'URGENT 1 — mais
 * l'animation d'opacite est CONDITIONNELLE : hors de la fenetre des 50 ou 500 metres, la vue
 * est rendue sans aucune animation, donc a 1,0 exactement. */
verifier(
  "l'opacite n'est animee QUE dans la fenetre de clignotement",
  (panneau.match(/clignoter \? \{ opacity: clignote \} : undefined/g) ?? []).length === 2,
  'hors fenetre : << la meme vue, sans animation visible >>',
);
verifier(
  'et la rangee de voies ne fait clignoter que le FOND, jamais la fleche',
  /styles\.fond, \{ backgroundColor: FOND_RECOMMANDE, opacity: clignote \}/.test(rangee),
);

console.log('\n============================================================');
console.log('URGENT 2 — TAMAZIGHT  (page 7, trois cases)');
console.log('============================================================');
verifier(
  '<< Carre Tamazight visible EN DESSOUS de Derija >>',
  0 < langue.indexOf("langue: 'dz'") && langue.indexOf("langue: 'dz'") < langue.indexOf("langue: 'kab'"),
  'les deux boutons sont dans une seule liste, dans cet ordre',
);
verifier(
  '<< ⵜⴰⵎⴰⵣⵉⵖⵜ en Tifinagh >>, copie exacte',
  langue.includes('ⵜⴰⵎⴰⵣⵉⵖⵜ') && langue.includes("latin: 'Tamazight'"),
  'ligne 1 phonetique latine, ligne 2 tifinagh',
);
verifier(
  'les deux boutons existent vraiment a l ecran, et non derriere un appui',
  /BOUTONS\.map/.test(langue) && !/libelleProchain/.test(langue),
  'le bouton qui TOURNAIT affichait << Derija >> sur sa capture : voila pourquoi le carre manquait',
);
verifier(
  '<< Clic -> active voix + texte + bienvenue en Tamazight >>',
  /jouerClips\(\['bienvenue'\]\)/.test(langue) &&
    /changeLanguage\(langue\)/.test(langue) &&
    /i18n\.t\('app\.bienvenue', \{ lng: langue \}\)/.test(langue),
  'voix enregistree, langue des textes, message de bienvenue',
);
verifier(
  '<< Carre Derija inchange >> : son mot, son ecriture, sa couleur verte',
  langue.includes("latin: 'Derija'") && langue.includes('دارجة') && langue.includes('#0A4A24'),
  'vert WIN, texte dore — point 1 du 22 novembre',
);
verifier(
  "l'appui long coupe toujours la voix, sur les DEUX boutons",
  /onLongPress=\{appuiLong\}/.test(langue) && /basculerVoix\(\)/.test(langue) && /arreterClips\(\)/.test(langue),
  'point 6 du 21 novembre : rien de ce qui marchait ne doit disparaitre',
);
verifier(
  'et le chemin du retour au francais existe encore',
  /appuiDirect/.test(langue) && /etat\.avant \?\? 'fr'/.test(cycle),
  "sans lui, personne ne revient au francais pendant un trajet",
);
verifier(
  'le cycle d origine est CONSERVE, non supprime',
  /export function appuiLangue/.test(cycle) && /export function appuiDirect/.test(cycle),
  '<< TOUJOURS AJOUTER, JAMAIS REMPLACER SANS VALIDATION >>',
);
/* L'ECART ASSUME N° 1 : la taille. On verifie que le minimum du document est tenu ET que le
 * mot entre, ce que le carre ne permettait pas. L'arithmetique complete est refaite par
 * scripts/verifier-chevauchements.py, qui mesure aussi la colonne entiere. */
verifier(
  '<< taille de police plus grande (minimum 18sp) >> pour la ligne latine',
  /const TAILLE_LATIN = (1[89]|[2-9][0-9]);/.test(langue) && /fontSize: TAILLE_LATIN/.test(langue),
  'ce minimum est ce qui a fait perdre au bouton sa forme carree',
);
verifier(
  "l'ecriture native est en dessous, a 14 points",
  /const TAILLE_NATIVE = 14;/.test(langue) && /fontSize: TAILLE_NATIVE/.test(langue),
);
verifier(
  'les deux boutons font la MEME taille',
  langue.match(/width: LARGEUR/g)?.length === 1 && langue.match(/height: HAUTEUR/g)?.length === 1,
  '<< Meme taille que btnDerija >>',
);
verifier(
  'et le message d echec d itineraire se range derriere la colonne elargie',
  /LARGEUR_COLONNE/.test(colonne) && /left: spacing\.md \+ LARGEUR_COLONNE/.test(colonne),
  'sinon il passerait PAR-DESSUS les deux boutons',
);

console.log('\n============================================================');
console.log('RAPPEL 3 — VIP + MEDIAS  (page 7, trois cases)');
console.log('============================================================');
verifier(
  '<< Design valide : bordure doree >>',
  /BORDURE DOREE DE LA CARTE VIP/.test(ficheLieu) && /colors\.goldDeep/.test(ficheLieu),
);
verifier(
  '<< carrousel >>',
  /<CarouselPhotos/.test(ficheLieu) && /vignettes="droite"/.test(ficheLieu),
);
verifier(
  '<< badge VIP >>',
  /badgeVipLigne/.test(ficheLieu),
);
verifier(
  '<< 3 boutons camera >> : le quota est de trois prises sur place',
  /const MAX_PHOTOS_CAMERA = 3;/.test(formulaire) && /launchCameraAsync/.test(codeFormulaire),
  'ECART DE FORME : un bouton utilisable trois fois, et le compte est affiche',
);
verifier(
  '<< 2 boutons galerie >> : le quota est de deux imports',
  /const MAX_PHOTOS_GALERIE = 2;/.test(formulaire) && /launchImageLibraryAsync/.test(codeFormulaire),
  'meme ecart de forme, meme quota',
);
verifier(
  'les deux quotas se comptent SEPAREMENT, et le compte se lit a l ecran',
  /placeRestante\('camera'\)/.test(codeFormulaire) &&
    /placeRestante\('galerie'\)/.test(codeFormulaire) &&
    /\{MAX_PHOTOS_CAMERA\}/.test(formulaire) &&
    /\{MAX_PHOTOS_GALERIE\}/.test(formulaire),
  'trois prises sur place ne doivent pas fermer l acces a la galerie',
);
verifier(
  '<< 1 bouton video 30s >> — EXTRA_DURATION_LIMIT = 30',
  /const VIDEO_MAX_S = 30;/.test(formulaire) && /videoMaxDuration: VIDEO_MAX_S/.test(codeFormulaire),
  'la camera se coupe seule a trente secondes',
);
verifier(
  'et une video IMPORTEE trop longue est refusee, elle aussi',
  /dureeS > VIDEO_MAX_S \+ VIDEO_TOLERANCE_S/.test(codeFormulaire),
  '`videoMaxDuration` ne peut rien contre un fichier deja enregistre',
);
verifier(
  '<< Medias optionnels (non bloquants pour valider la fiche) >>',
  /nameRequired/.test(codeFormulaire) &&
    !/photoRequired|videoRequired/.test(codeFormulaire) &&
    !/photos\.length === 0\)\s*\{\s*setError/.test(codeFormulaire),
  'seul le NOM est exige : aucune photo, aucune video ne bloque l enregistrement',
);
verifier(
  'la video arrive jusqu a la fiche, et le carrousel sait la montrer',
  /videoUrl/.test(codeCarte) && /video\?: string \| null/.test(carrousel),
  'sans cela le bouton existerait et la video ne se verrait nulle part',
);

console.log('\n============================================================');
console.log('RAPPEL 4 — ENREGISTREMENT LIEU  (page 7, trois cases)');
console.log('============================================================');
verifier(
  '<< Enregistrement bloque si distance > 15 m >>',
  /const MAX_DISTANCE_M = 15;/.test(formulaire) && /ecart > MAX_DISTANCE_M/.test(codeFormulaire),
  'le defaut constate : << Garder tel quel actif a 33 km >>',
);
verifier(
  'la distance est MESUREE au moment du geste, depuis le GPS',
  /getCurrentPositionAsync/.test(codeFormulaire) && /haversine\(ici\.lat, ici\.lon/.test(codeFormulaire),
  'equivalent de Location.distanceBetween()',
);
verifier(
  'un GPS muet n invente pas une distance',
  /ici = null/.test(codeFormulaire) && /if \(ici\)/.test(codeFormulaire),
  'sans fix on laisse passer : refuser sur une mesure absente bloquerait tout le monde',
);
verifier(
  '<< Bouton "Garder tel quel" masque (View.GONE) si trop loin >>',
  /vipCode \|\| verifyM === null \|\| verifyM <= VERIFY_SUSPICIOUS_M \? \(/.test(codeFormulaire),
  'masque, et non grise : le document dit View.GONE',
);
verifier(
  '<< Message d erreur + distance reelle affiches >>',
  /addPlace\.tooFar', \{ d: formatDistance\(tropLoinM\) \}/.test(formulaire) &&
    /addPlace\.tooFarWhy', \{ m: MAX_DISTANCE_M \}/.test(formulaire),
  'la distance mesuree, puis la regle qui l a refusee',
);
verifier(
  '<< Proposer de remplacer par la position GPS actuelle >>',
  /addPlace\.moveHere/.test(formulaire),
  'le document le demande dans le meme bloc que le refus',
);

console.log('\n============================================================');
console.log('RAPPEL 5 — SYMBOLES SIGNALISATION  (page 7, trois cases)');
console.log('============================================================');
verifier(
  '<< Symbole visible 150 m avant >>',
  PALIERS_M.length === 1 && PALIERS_M[0] === 150,
  `palier d annonce : ${PALIERS_M.join(', ')} m`,
);
verifier(
  'et il reste visible AU-DELA de 150 m, ce qui est plus que demande',
  !/filtreNonDepasse/.test(codeCarte) && !/surTraceM/.test(codeCarte),
  'point 3 du 24 novembre : plus aucun filtre de distance sur la couche',
);
verifier(
  '<< Notification audio discrete >> a 150 m',
  /onApproach/.test(codeCarte),
  'la voix annonce le palier atteint : << dans 150 metres >>',
);
verifier(
  '<< Desactivable par l utilisateur dans les reglages >>',
  /voiceGuidanceEnabled/.test(lire('src', 'store', 'session.ts')) &&
    /toggleVoiceGuidance/.test(lire('src', 'store', 'session.ts')),
  'le meme interrupteur que l appui long du bouton de langue',
);
verifier(
  '<< Quand 2 utilisateurs DIFFERENTS signalent "a disparu" -> symbole supprime >>',
  ABSENT_VOTE_THRESHOLD === 2 &&
    /after\.absentCount >= seuil/.test(routesReports) &&
    /SET status = 'removed'/.test(routesReports),
  `seuil = ${ABSENT_VOTE_THRESHOLD}`,
);
verifier(
  'deux votes pour TOUS les types de symboles — point J du correctif v2',
  seuilDegagement('block') === 2 &&
    seuilDegagement('radar') === 2 &&
    seuilDegagement('bump') === 2 &&
    seuilDegagement('pothole') === 2 &&
    VOTES_DEGAGEMENT === 2,
  '<< s applique a TOUS les symboles et signalisations de la carte >>',
);
verifier(
  '<< Un meme user ne compte pas 2 fois >> — garanti par la base, pas par l ecran',
  /UNIQUE \(report_id, device_id, vote\)/.test(migration) && /deja_vote/.test(routesReports),
  'un telephone peut appeler la route directement : l unicite doit tenir plus bas',
);
verifier(
  '<< 1 seul vote : symbole conserve >>',
  /if \(after\.absentCount >= seuil\) \{/.test(routesReports) &&
    /return \{ removed: false, threshold: seuil, report: after \};/.test(routesReports),
  'un seul << disparu >> ne retire rien, et le symbole est re-emis tel quel',
);
verifier(
  '<< Aucune suppression automatique sans 2 votes distincts >>',
  ['radar', 'bump', 'pothole', 'police', 'block', 'waste'].every(
    (k) => TEMPORARY_TTL_MINUTES[k as keyof typeof TEMPORARY_TTL_MINUTES] === 0,
  ),
  'les symboles permanents n ont aucune echeance : seul le vote les retire',
);
/* ET CE QUI N'EST PAS PERMANENT, LUI, S'EFFACE TOUJOURS SEUL — c'est dit ici parce que c'est le
 * seul endroit du document avec lequel l'application est en desaccord, et que le client doit le
 * savoir. Un bouchon s'efface au bout d'une heure, un accident de deux heures, un objet de
 * trente minutes : ce sont des evenements qui cessent, et les garder jusqu'a un vote ferait
 * annoncer un bouchon dissous la veille. La phrase << aucune suppression automatique >> est
 * tenue pour les SYMBOLES (radar, dos d'ane, trou, barrage, route barree, dechets) et non pour
 * les evenements temporaires. */
verifier(
  'les evenements temporaires, eux, gardent une echeance — ecart documente',
  TEMPORARY_TTL_MINUTES.jam === 60 &&
    TEMPORARY_TTL_MINUTES.crash === 120 &&
    TEMPORARY_TTL_MINUTES.object === 30,
  'un bouchon dissous la veille ne doit pas attendre deux votes pour disparaitre',
);

console.log('\n============================================================');
console.log('LE PRINCIPE FONDATEUR — page 8');
console.log('============================================================');
verifier(
  'aucune regle de navigation n a ete remplacee : elles ont ete AJOUTEES',
  /export function distanceAnticipation/.test(lire('src', 'navigation', 'grandAxe.ts')) &&
    /export function estNationale/.test(lire('src', 'navigation', 'grandAxe.ts')) &&
    /export function estVoieRapide/.test(lire('src', 'navigation', 'grandAxe.ts')),
  'les fonctions des correctifs precedents sont toutes encore la',
);
verifier(
  'la detection d agglomeration n a RIEN retire a sa version precedente',
  /export const CLASSES_HABITEES/.test(lire('src', 'navigation', 'agglomeration.ts')) &&
    /export const BATIMENTS_MIN/.test(lire('src', 'navigation', 'agglomeration.ts')) &&
    /export function estBatiment/.test(lire('src', 'navigation', 'agglomeration.ts')) &&
    /export function estZoneHabitee/.test(lire('src', 'navigation', 'agglomeration.ts')),
  'les deux signes du 23 novembre comptent toujours, a l identique',
);
verifier(
  'et la regle du module reste eprouvable sans telephone',
  !/from 'react-native'/.test(lire('src', 'navigation', 'agglomeration.ts')) &&
    !/from 'react-native'/.test(lire('src', 'navigation', 'grandAxe.ts')),
  'aucun import de react-native : c est ce qui permet a ce fichier de les appeler',
);

console.log('');
console.log(
  fautes === 0
    ? 'Les cinq points de la relance v3 sont dans l application, et les trois ecarts sont nommes.\n'
    : `A CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
