/**
 * CORRECTIF FLECHES (document du 23 novembre) — LES DEUX FLECHES, LE MEME SEUIL, LE MEME
 * INSTANT.
 *
 *   << REGLE — 2 fleches · meme seuil · meme instant · toute manoeuvre.
 *   50 m agglo · 500 m route nationale hors agglo + autoroute. >>
 *
 * Ce fichier rejoue les SEPT CAS de la liste de controle de la page 4, puis verifie que les
 * deux fleches appellent bien la meme fonction avec les memes arguments — parce que le defaut
 * que le client decrit n'est pas un mauvais calcul, c'est DEUX calculs.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-fleches-synchro.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANTICIPATION_AGGLO_M,
  ANTICIPATION_RASE_M,
  estVoieRapide,
  seuilClignotementM,
  type TronconCourant,
} from '../src/navigation/grandAxe';
import {
  BATIMENTS_MIN,
  estBatiment,
  estEnAgglomeration,
  estZoneHabitee,
  type TraitDeCarte,
} from '../src/navigation/agglomeration';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const AGGLO = ANTICIPATION_AGGLO_M;
const RASE = ANTICIPATION_RASE_M;

/** Un batiment tel que les tuiles d'OpenMapTiles le decrivent. */
const batiment = (): TraitDeCarte => ({
  polygone: true,
  proprietes: { render_height: 9, render_min_height: 0 },
});
/** La zone d'habitation qu'OpenStreetMap pose sur l'agglomeration. */
const zoneHabitee = (): TraitDeCarte => ({ polygone: true, proprietes: { class: 'residential' } });
/** Une route : une ligne, jamais un polygone. */
const route = (classe: string): TraitDeCarte => ({
  polygone: false,
  proprietes: { class: classe },
});

console.log('\n============================================================');
console.log('LES SEPT CAS DE LA LISTE DE CONTROLE — page 4 du document');
console.log('============================================================');

/* 1, 2 et 3 : LES TROIS DIRECTIONS EN AGGLOMERATION. Le document les separe parce que c'est la
 * qu'il a constate le bug ; pour le seuil ce sont trois fois le meme cas, et C'EST LA PREUVE
 * QU'ON CHERCHE : la fonction ne recoit AUCUNE direction. Il n'y a donc aucun endroit ou une
 * direction pourrait ne pas etre couverte — ce que le document appelle le bug 2. */
const rn68EnVille: TronconCourant = {
  limiteKmh: 100,
  classeRoute: 'primary',
  agglomeration: true,
};
verifier(
  'AGGLO · RN 68 · tourner a DROITE (Jijel)',
  seuilClignotementM(rn68EnVille) === AGGLO,
  `${seuilClignotementM(rn68EnVille)} m — OSM tague 100 km/h, mais il y a des maisons autour`,
);
verifier(
  'AGGLO · tourner a GAUCHE (aeroport)',
  seuilClignotementM({ limiteKmh: 80, classeRoute: 'secondary', agglomeration: true }) === AGGLO,
  'le cas ou le client ne voyait RIEN clignoter',
);
verifier(
  'AGGLO · continuer TOUT DROIT (intersection)',
  seuilClignotementM({ limiteKmh: 50, classeRoute: 'minor', agglomeration: true }) === AGGLO,
);
verifier(
  'LE SEUIL NE CONNAIT PAS LA DIRECTION — et ne peut donc en oublier aucune',
  !/droite|gauche|tout_droit|turnType|direction/i.test(
    lire('src', 'navigation', 'grandAxe.ts').split('export function seuilClignotementM')[1] ?? '',
  ),
  'le bug 2 etait un declenchement conditionnel selon la direction',
);

verifier(
  'HORS AGGLO · route nationale (100 km/h)',
  seuilClignotementM({ limiteKmh: 100, classeRoute: 'primary', agglomeration: false }) === RASE,
  'la meme RN, vingt kilometres plus loin : cinq cents metres',
);
verifier(
  'AUTOROUTE · sortie taguee (maxSpeed = 120)',
  seuilClignotementM({ limiteKmh: 120, classeRoute: 'motorway', agglomeration: false }) === RASE,
);
verifier(
  'AUTOROUTE · sortie NON taguee (maxSpeed = -1)',
  seuilClignotementM({ limiteKmh: null, classeRoute: 'motorway', agglomeration: false }) === RASE,
  'c est le bug 3 : la classe de route repond quand la limite se tait',
);
verifier(
  'SEGMENT inconnu (maxSpeed = -1) en ville',
  seuilClignotementM({ limiteKmh: null, classeRoute: null, agglomeration: true }) === AGGLO,
  'par prudence : on ne promet pas un carrefour a cinq cents metres',
);

console.log('\nET LE CAS QUE LE DOCUMENT NE CITE PAS : UNE AUTOROUTE EN PLEINE VILLE');
verifier(
  "l'autoroute l'emporte sur le bati — rocade sud d'Alger, A1 a Birtouta",
  seuilClignotementM({ limiteKmh: 80, classeRoute: 'motorway', agglomeration: true }) === RASE &&
    seuilClignotementM({ limiteKmh: null, classeRoute: 'trunk', agglomeration: true }) === RASE,
  'a 110 km/h, cinquante metres font une seconde et demie',
);
verifier(
  'et la bretelle d autoroute vaut l autoroute',
  estVoieRapide(false, 'motorway') && estVoieRapide(false, 'trunk'),
  'useSpeedLimit retire deja le suffixe _link avant de nous la passer',
);
verifier(
  'le drapeau de Valhalla suffit aussi, seul',
  estVoieRapide(true, null) && !estVoieRapide(false, 'primary') && !estVoieRapide(null, null),
  'deux chemins independants : l un parle quand l autre se tait',
);

console.log('\nLES CAS LIMITES DU SEUIL');
verifier('50 km/h tague : ville', seuilClignotementM({ limiteKmh: 50 }) === AGGLO);
verifier('51 km/h sans bati : rase campagne', seuilClignotementM({ limiteKmh: 51 }) === RASE);
verifier(
  'aucune information du tout : cinquante metres',
  seuilClignotementM({}) === AGGLO && seuilClignotementM({ limiteKmh: -1 }) === AGGLO,
  'le -1 que le document cite, le null et l absence sont le meme cas',
);
verifier(
  'un NaN ne devient pas une autoroute',
  seuilClignotementM({ limiteKmh: Number.NaN, agglomeration: false }) === AGGLO,
);
verifier(
  'les deux seuils sont ceux du document',
  AGGLO === 50 && RASE === 500,
  `${AGGLO} m et ${RASE} m`,
);

console.log('\n============================================================');
console.log('<< SOMMES-NOUS EN VILLE ? >> — ce que la carte montre autour');
console.log('============================================================');
verifier(
  'une zone d habitation suffit a elle seule',
  estEnAgglomeration([zoneHabitee()]),
  "c est le polygone qu'OpenStreetMap pose SUR l'agglomeration",
);
verifier(
  `il faut ${BATIMENTS_MIN} batiments, et deux ne suffisent pas`,
  !estEnAgglomeration([batiment(), batiment()]) &&
    estEnAgglomeration([batiment(), batiment(), batiment()]),
  'un batiment isole au bord d une nationale est une ferme, pas une ville',
);
verifier(
  'UNE RUE NOMMEE << residential >> N EST PAS UNE ZONE D HABITATION',
  !estEnAgglomeration([route('residential'), route('residential'), route('residential')]),
  'la classe existe pour les routes ET pour les zones, mais la zone est un polygone',
);
verifier(
  'la rase campagne ne renvoie rien',
  !estEnAgglomeration([route('primary'), { polygone: true, proprietes: { class: 'farmland' } }]),
);
verifier('une lecture vide ne dit pas << ville >>', !estEnAgglomeration([]));
verifier(
  'un batiment se reconnait a ses champs, pas au nom de sa couche',
  estBatiment(batiment()) &&
    estBatiment({ polygone: true, proprietes: { render_min_height: 0 } }) &&
    !estBatiment({ polygone: false, proprietes: { render_height: 9 } }),
  'la carte Android ne renvoie pas le nom de la couche — lecon de la pastille de novembre',
);
verifier(
  'les zones commercantes et industrielles comptent aussi',
  estZoneHabitee({ polygone: true, proprietes: { class: 'commercial' } }) &&
    estZoneHabitee({ polygone: true, proprietes: { class: 'industrial' } }),
  'une zone d activite se traverse a trente a l heure, comme une rue',
);
verifier(
  'aucun import de react-native : la regle est eprouvable',
  !/from 'react-native'/.test(lire('src', 'navigation', 'agglomeration.ts')),
);

console.log('\n============================================================');
console.log('UNE SEULE FONCTION, DEUX FLECHES — << meme seuil, meme instant >>');
console.log('============================================================');
const grande = lire('src', 'components', 'PanneauDirection.tsx');
const petite = lire('src', 'components', 'LaneGuidance.tsx');
const limite = lire('src', 'navigation', 'useSpeedLimit.ts');
const bandeau = lire('src', 'components', 'NavigationOverlay.tsx');
const ecran = readFileSync(join(__dirname, '..', 'app', 'index.tsx'), 'utf8');

/**
 * LE CODE SANS SES COMMENTAIRES.
 *
 * Les deux fleches CITENT la ligne qu'on vient de leur retirer, parce qu'un correctif qui ne
 * dit pas ce qu'il a enleve se refait six mois plus tard. Un verificateur qui cherche
 * << surGrandAxe >> dans le fichier entier trouve donc la citation et croit le bug intact.
 * Ce qu'on veut eprouver est ce qui S'EXECUTE.
 */
const sansCommentaires = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const codeGrande = sansCommentaires(grande);
const codePetite = sansCommentaires(petite);

const APPEL = /seuilClignotementM\(\{[^}]*\}\)/;
const appelGrande = codeGrande.match(APPEL)?.[0] ?? '';
const appelPetite = codePetite.match(APPEL)?.[0] ?? '';
verifier(
  'LES DEUX APPELS SONT LE MEME, CARACTERE POUR CARACTERE',
  appelGrande !== '' && appelGrande === appelPetite,
  appelGrande || 'appel absent dans l une des deux fleches',
);
verifier(
  'aucune valeur de distance ecrite a la main dans les deux fleches',
  !/\b(?:blinkDistance|triggerDist)\b/.test(codeGrande + codePetite) &&
    !/distanceM\s*(?:<=|<)\s*\d/.test(codeGrande + codePetite),
  '<< Supprimer toute valeur hardcodee : 80 / 100 / autre >>',
);
verifier(
  'LE FILTRE DE GRAND AXE A QUITTE LES DEUX FLECHES (bug 2)',
  !/surGrandAxe/.test(codeGrande) && !/surGrandAxe/.test(codePetite),
  'la petite fleche le gardait : elle restait invisible la ou la grande clignotait',
);
verifier(
  'et la rangee de voies ne recoit plus ni nom de voie ni drapeau d autoroute',
  !/nomVoie=|surAutoroute=/.test(sansCommentaires(bandeau)),
);
verifier(
  'le clignotement lui-meme n a pas bouge',
  /CLIGNOTEMENT_MS/.test(codeGrande) && /CLIGNOTEMENT_MS/.test(codePetite),
  '<< Ne PAS modifier le design, les couleurs, l animation — seulement le seuil >>',
);

console.log('\nLA LECTURE DE LA CARTE');
verifier(
  'le hook rend les trois valeurs d une seule lecture',
  /limiteKmh: number \| null;/.test(limite) &&
    /classeRoute: string \| null;/.test(limite) &&
    /agglomeration: boolean;/.test(limite),
);
verifier(
  'DEUX FENETRES, ET NON UNE SEULE ELARGIE',
  /PROBE_RADIUS/.test(limite) && /PROBE_AGGLO/.test(limite),
  'chercher la route a quatre-vingt-dix points ramasserait l autoroute d a cote',
);
verifier(
  'la fenetre du bati est la plus large',
  Number(limite.match(/const PROBE_AGGLO = (\d+)/)?.[1] ?? 0) >
    Number(limite.match(/const PROBE_RADIUS = (\d+)/)?.[1] ?? 0),
);
verifier(
  'un objet neuf seulement si quelque chose a change',
  /setEtat\(\(prev\) =>/.test(limite) && /\? prev/.test(limite),
  "sans quoi l'ecran de navigation se redessinerait toutes les trois secondes",
);
verifier(
  'les trois valeurs descendent du meme endroit jusqu aux deux fleches',
  /limiteKmh: speedLimit, agglomeration, classeRoute \} = useSpeedLimit/.test(ecran) &&
    /agglomeration=\{agglomeration\}/.test(ecran) &&
    (bandeau.match(/agglomeration=\{agglomeration\}/g) ?? []).length === 2 &&
    (bandeau.match(/classeRoute=\{classeRoute\}/g) ?? []).length === 2,
);

console.log(
  fautes === 0
    ? '\nLes deux fleches clignotent au meme instant, pour toute direction et toute destination.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
