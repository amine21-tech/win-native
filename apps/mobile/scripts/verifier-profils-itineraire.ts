/**
 * Eprouve LES TROIS PROFILS D'ITINERAIRE ET LE MODE PIETON — point 5 du 21 novembre.
 *
 * POURQUOI CES NOMBRES MERITENT UN CONTROLE A EUX SEULS. Ils decident de la route que prend une
 * voiture, et ils echouent EN SILENCE : un `use_highways` laisse a 1 ne provoque aucune erreur,
 * ne ralentit rien, et ne se voit que sur la route. C'est exactement ce qui est arrive —
 * << le GPS affichait 10-11 km alors que le conducteur etait a 2 km >> — et personne, pas meme le
 * conducteur, ne pouvait relier le detour a un reglage. Un defaut de cette nature doit etre
 * attrape par une machine.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-profils-itineraire.ts
 */
import {
  optionsAuto,
  optionsBlocage,
  optionsPieton,
  PROFIL_DEFAUT,
  PROFILS,
  profilDe,
  type ProfilItineraire,
} from '../../api/src/lib/profilsItineraire';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

type Options = Record<string, unknown>;

console.log('\nLE DEFAUT EST << LE PLUS COURT >> — c est le correctif du detour de l aeroport');
verifier('le profil par defaut est court', PROFIL_DEFAUT === 'court', PROFIL_DEFAUT);
const court = optionsAuto('court') as Options;
/* CE CONTROLE A CHANGE DE CAMP — point G du correctif v2 : << "shortest": false // false=plus
 * rapide >>, << priorite = temps reel le plus court >>.
 *
 * ET C'EST UNE CORRECTION, PAS UN RECUL. `shortest: true` desactive, chez Valhalla, TOUS les
 * autres couts : les quatre reglages << routes carrossables >> de ce meme profil n'avaient donc
 * aucun effet, alors que le point G les redemande explicitement. Les deux ne pouvaient pas etre
 * vrais ensemble. C'est `use_highways: 0.5` qui ecarte le detour autoroutier — et lui, il est
 * desormais reellement applique. */
verifier(
  'court : shortest = false, le classement se fait par duree',
  court.shortest === false,
  '<< false = plus rapide >>, et les garde-fous carrossables reprennent effet',
);
verifier(
  'court : use_highways = 0.5, l autoroute est une option et non une priorite',
  court.use_highways === 0.5,
  'c est cette ligne qui repare le detour de l aeroport d Alger',
);
/* ET LES GARDE-FOUS QUE `shortest: true` ANNULAIT : ils sont la raison du changement, donc ils
 * doivent etre verifies ici et pas seulement ecrits dans le fichier. */
verifier(
  'court : les pistes et les dessertes restent penalisees',
  court.use_tracks === 0.1 && court.service_penalty === 120 && court.exclude_unpaved === true,
  '<< routes carrossables uniquement : exclure dirt / track / path >>',
);
verifier('court : use_highways = 0.5, ni cherchee ni fuie', court.use_highways === 0.5, String(court.use_highways));
verifier('court : use_tolls = 0.5', court.use_tolls === 0.5, String(court.use_tolls));

console.log('\nLES DEUX AUTRES BOUTONS FONT EXACTEMENT CE QUE LE DOCUMENT DECRIT');
/* << "Avec autoroute" -> use_highways = 1.0, shortest = false (rapide via autoroute) >>
 * << "Sans autoroute" -> use_highways = 0.0 (evite toutes les autoroutes) >> */
const avec = optionsAuto('autoroute') as Options;
verifier('avec autoroute : use_highways = 1 et shortest = false', avec.use_highways === 1 && avec.shortest === false);
const sans = optionsAuto('sansAutoroute') as Options;
verifier('sans autoroute : use_highways = 0', sans.use_highways === 0, String(sans.use_highways));
verifier('sans autoroute : plus de peage non plus', sans.use_tolls === 0, String(sans.use_tolls));
/* Le seul peage d'Algerie est sur l'autoroute Est-Ouest : refuser l'une, c'est refuser l'autre. */
verifier(
  'le peage suit toujours l autoroute, dans les trois profils',
  PROFILS.every((p) => {
    const o = optionsAuto(p) as Options;
    return o.use_tolls === (p === 'sansAutoroute' ? 0 : 0.5);
  }),
);

console.log('\nLES TROIS PROFILS SONT DISTINCTS, ET AUCUN N EST RESTE A MOITIE ECRIT');
/* Un profil qui rendrait les memes valeurs qu'un autre serait un bouton qui ne fait rien :
 * le conducteur appuie, l'itineraire ne change pas, et il conclut que l'application ment. */
const signatures = PROFILS.map((p) => JSON.stringify(optionsAuto(p)));
verifier('trois jeux de reglages differents', new Set(signatures).size === 3);
for (const p of PROFILS) {
  const o = optionsAuto(p) as Options;
  verifier(
    `${p} : les cinq reglages nommes par le document sont tous poses`,
    ['shortest', 'use_highways', 'use_tolls', 'use_ferry', 'exclude_unpaved'].every(
      (c) => o[c] !== undefined,
    ),
  );
}

console.log('\nPAS DE FERRY, ET DES ROUTES CARROSSABLES — dans les trois profils sans exception');
/* << "use_ferry" to 0.0, // pas de ferry en Algerie >> et << "exclude_unpaved" to true >>.
 * Valhalla accepte le ferry a 0,5 par defaut : sans cette ligne, il peut proposer une traversee. */
for (const p of PROFILS) {
  const o = optionsAuto(p) as Options;
  verifier(`${p} : use_ferry = 0`, o.use_ferry === 0, String(o.use_ferry));
  verifier(`${p} : exclude_unpaved = true`, o.exclude_unpaved === true);
}
/* `exclude_unpaved` est une REGLE ; les anciens curseurs restent parce qu'un moteur plus ancien
 * ignore en silence une option qu'il ne connait pas, et qu'une voie de desserte goudronnee reste
 * un faux raccourci que le revetement ne filtre pas. */
verifier(
  'les penalites de desserte sont conservees a cote de la regle',
  PROFILS.every((p) => {
    const o = optionsAuto(p) as Options;
    return o.use_tracks === 0.1 && o.service_penalty === 120;
  }),
);

console.log('\nUNE APPLICATION DEJA INSTALLEE N A RIEN VU CHANGER — le defaut ne lui est pas applique');
/* C'est tout l'enjeu du « NE RIEN CASSER » ici : un defaut pose cote serveur aurait change
 * l'itineraire de tous les telephones en service, sans que personne ne mette a jour quoi que ce
 * soit. Une ancienne application n'envoie que `autoroute` ; elle garde donc son comportement. */
verifier("ancienne app, autoroute = true : profil autoroute", profilDe({ autoroute: true }) === 'autoroute');
verifier("ancienne app, autoroute = false : profil sansAutoroute", profilDe({ autoroute: false }) === 'sansAutoroute');
verifier(
  'le nouveau champ gagne quand il est present',
  profilDe({ autoroute: true, profil: 'court' }) === 'court' &&
    profilDe({ autoroute: false, profil: 'autoroute' }) === 'autoroute',
);
for (const p of PROFILS) {
  verifier(`profil ${p} transmis tel quel`, profilDe({ autoroute: true, profil: p }) === p);
}

console.log('\nLE CONTOURNEMENT D UNE ROUTE BLOQUEE GARDE SA HIERARCHIE — point 12, 28 octobre');
/* Ce profil IGNORE le choix du conducteur, sauf pour le peage : la route normale n'est plus
 * praticable, et le detour doit etre une route qu'une berline passe. */
for (const p of PROFILS) {
  const o = optionsBlocage(p) as Options;
  verifier(`blocage depuis ${p} : use_highways = 0.8, la valeur du client`, o.use_highways === 0.8);
  verifier(`blocage depuis ${p} : jamais de piste ni de voie residentielle`, o.use_tracks === 0 && o.use_living_streets === 0);
  verifier(`blocage depuis ${p} : dix minutes de detour fictif par desserte`, o.service_penalty === 600);
}
/* CONTRE-INTUITIF ET VOULU : `shortest` reste faux pour un detour impose. Un contournement par la
 * nationale est plus long en kilometres et plus court en minutes qu'un raccourci de terre. */
verifier(
  'le detour impose se juge au temps, pas a la distance',
  (optionsBlocage('court') as Options).shortest === undefined,
  'shortest absent = classement par duree, le defaut de Valhalla',
);

console.log('\nLE PIETON : LE CHEMIN LE PLUS COURT, SANS RESTRICTION — points 17 puis 5C');
const pieton = optionsPieton() as Options;
verifier('walking_speed = 5.0, la valeur du 21 novembre', pieton.walking_speed === 5.0, String(pieton.walking_speed));
verifier('shortest = true, le chemin le plus court absolu', pieton.shortest === true);
verifier('plus aucune penalite de ruelle ni d allee', pieton.alley_factor === 1 && pieton.driveway_factor === 1);
verifier('plus aucune penalite de marche', pieton.step_penalty === 0);
verifier('un trottoir plutot que le bord d une route', pieton.walkway_factor === 0.9);
/* `use_roads` est un curseur de VELO chez Valhalla : l'envoyer au pieton ne ferait rien, tout en
 * laissant croire que la question est reglee la. Voir le commentaire du module. */
verifier(
  "aucun reglage de voiture ne s est glisse dans le profil pieton",
  ['use_highways', 'use_tolls', 'exclude_unpaved'].every((c) => pieton[c] === undefined),
);

console.log('\nLES DEUX MODES RESTENT TOTALEMENT SEPARES — le principe fondateur du point 5');
/* << Les modes voiture et pieton restent totalement separes. >> Aucune cle commune ne doit les
 * relier par accident : une valeur partagee finirait par etre modifiee pour l'un des deux. */
const clesAuto = new Set(Object.keys(optionsAuto('court')));
const clesPieton = new Set(Object.keys(pieton));
const communes = [...clesAuto].filter((c) => clesPieton.has(c));
verifier(
  'seuls les reglages de desserte et shortest sont communs, et c est voulu',
  communes.every((c) => ['shortest', 'service_penalty', 'service_factor'].includes(c)),
  communes.join(', '),
);
/* Et ils ne portent PAS les memes valeurs : le pieton ne paie aucune penalite de desserte, la
 * voiture en paie. Si elles devenaient egales, c'est qu'on aurait fusionne les deux profils. */
verifier(
  'et ils ne portent pas les memes valeurs',
  pieton.service_penalty === 0 && (optionsAuto('court') as Options).service_penalty === 120,
);

console.log(
  fautes === 0
    ? '\nTrois profils distincts, le plus court par defaut, et un pieton que rien ne detourne.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
