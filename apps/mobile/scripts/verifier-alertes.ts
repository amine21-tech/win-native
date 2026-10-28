/**
 * Eprouve l'alerte d'approche des signalements : la voix et la carte « Toujours la ? ».
 *
 * POURQUOI CE SCRIPT. C'est une regle de SECURITE, et elle ne se verifie qu'en roulant vers un
 * vrai nid-de-poule, sur une vraie route, a vraie vitesse. Autant dire qu'elle ne se verifie
 * jamais : si l'annonce arrive trop tard, ou pas du tout, ou pour un danger pose sur la rue
 * parallele, personne ne s'en apercoit avant que ca compte.
 *
 * Les cas ci-dessous sont ceux qui FONT ECHOUER ce genre d'alerte dans la vraie vie :
 *   - le signalement est bien sur notre route          -> doit parler aux DEUX paliers
 *   - il est sur le bord de la chaussee (20 m)         -> doit parler : c'est notre route
 *   - il est sur la rue parallele (60 m)               -> doit se taire
 *   - il est derriere nous                             -> doit se taire
 *   - on roule vite (1 point GPS toutes les secondes)  -> aucun palier ne doit etre saute
 *   - il apparait alors qu'on est deja a 120 m         -> ne doit pas annoncer << 200 m >>
 *   - on fait demi-tour et on repasse                  -> doit reparler
 *   - on est a l'arret juste devant                    -> ne doit pas se repeter
 *   - l'itineraire n'est pas encore calcule            -> doit parler quand meme
 *
 * On ne reecrit PAS la regle ici : le script appelle les memes fonctions que l'application
 * (`projeterSurTrace`, `resteAvantSignalement`, `decisionAnnonce`) et la meme chaine de
 * projection que l'ecran de navigation (`locateOnRoute` puis `traveledMeters`).
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-alertes.ts
 */
import {
  PALIERS_M,
  decisionAnnonce,
  projeterSurTrace,
  resteAvantSignalement,
} from '../src/navigation/alerteApproche';
import {
  locateOnRoute,
  traveledMeters,
  type TraceMesurable,
} from '../src/navigation/traceGeometrie';

/** Ecart tolere entre le palier prononce et la distance reelle (voir TOLERANCE_M). */
const TOLERANCE_M = 50;

/* ------------------------------------------------------------------ */
/* Une route d'essai : droite, plein est, a la latitude d'Alger.        */
/* ------------------------------------------------------------------ */

const LAT = 36.75;
const METRES_PAR_DEGRE_LON = 111_320 * Math.cos((LAT * Math.PI) / 180);
const METRES_PAR_DEGRE_LAT = 110_540;

/** Longueur planaire d'un segment, comme `segmentLengthM` dans routing.ts. */
function longueurSegment(a: [number, number], b: [number, number]): number {
  const cos = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * 111_320 * cos, (b[1] - a[1]) * METRES_PAR_DEGRE_LAT);
}

/** Trace de `longueurM` metres, un point tous les `pasM` metres. */
function routeDroite(longueurM: number, pasM = 50): TraceMesurable {
  const geometry: [number, number][] = [];
  for (let d = 0; d <= longueurM; d += pasM) {
    geometry.push([3 + d / METRES_PAR_DEGRE_LON, LAT]);
  }
  const cumulativeM = [0];
  for (let i = 1; i < geometry.length; i++) {
    cumulativeM.push(cumulativeM[i - 1]! + longueurSegment(geometry[i - 1]!, geometry[i]!));
  }
  return { geometry, cumulativeM };
}

/** Point a `distanceM` du depart, decale de `ecartM` metres vers le nord. */
function surLaRoute(distanceM: number, ecartM = 0): { lat: number; lon: number } {
  return {
    lat: LAT + ecartM / METRES_PAR_DEGRE_LAT,
    lon: 3 + distanceM / METRES_PAR_DEGRE_LON,
  };
}

const route = routeDroite(3000);

/* ------------------------------------------------------------------ */
/* Les signalements poses sur le terrain d'essai.                       */
/* ------------------------------------------------------------------ */

const SIGNALEMENTS = [
  { id: 'sur-la-route', ...surLaRoute(1000), attendu: 'parle' },
  { id: 'bord-de-chaussee', ...surLaRoute(1500, 20), attendu: 'parle' },
  { id: 'rue-parallele', ...surLaRoute(2000, 60), attendu: 'muet' },
  { id: 'derriere-nous', ...surLaRoute(100), attendu: 'muet' },
] as const;

/** Un GPS n'est jamais pile sur l'axe : on decale la position d'essai de huit metres. */
const JITTER_M = 8;

type Annonce = { id: string; palierM: number; restantM: number };

/** Paliers deja dits, par signalement — exactement l'etat que tient le hook. */
type Memoire = Map<string, Set<number>>;

/**
 * Fait rouler le vehicule de `departM` a `arriveeM` par pas de `pasM`, en appelant la vraie
 * chaine de l'application a chaque point GPS, et rend la liste des annonces declenchees.
 */
function rouler(opts: {
  departM: number;
  arriveeM: number;
  pasM: number;
  surTrace: Map<string, { id: string; distanceDepuisDepart: number }>;
  memoire: Memoire;
  avecItineraire: boolean;
}): Annonce[] {
  const { departM, arriveeM, pasM, surTrace, memoire, avecItineraire } = opts;
  const annonces: Annonce[] = [];
  const sens = arriveeM >= departM ? 1 : -1;

  for (let d = departM; sens > 0 ? d <= arriveeM : d >= arriveeM; d += sens * pasM) {
    const position = surLaRoute(d, JITTER_M);
    // Exactement ce que fait l'ecran de navigation : projeter, puis mesurer le parcouru.
    const avance = traveledMeters(route, locateOnRoute([position.lon, position.lat], route.geometry));

    for (const s of SIGNALEMENTS) {
      const restant = resteAvantSignalement({
        report: s,
        route: avecItineraire ? route : null,
        surTrace,
        traveledM: avance,
        position,
      });

      // Le hook ne fait rien d'autre que ceci, a la voix et a la carte pres.
      const dejaDits = memoire.get(s.id) ?? new Set<number>();
      const decision = decisionAnnonce(restant, dejaDits);
      if (decision.quoi === 'rearmer') {
        memoire.delete(s.id);
        continue;
      }
      if (decision.consommes.length > 0) {
        for (const palier of decision.consommes) dejaDits.add(palier);
        memoire.set(s.id, dejaDits);
      }
      if (decision.quoi === 'annoncer') {
        annonces.push({ id: s.id, palierM: decision.palierM!, restantM: restant! });
      }
    }
  }
  return annonces;
}

/* ------------------------------------------------------------------ */
/* Les verifications.                                                   */
/* ------------------------------------------------------------------ */

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

console.log(`\nPaliers d'annonce configures : ${PALIERS_M.join(' m, puis ')} m\n`);

const surTrace = projeterSurTrace(route, [...SIGNALEMENTS]);

console.log('PROJECTION SUR L\'ITINERAIRE');
verifier('le signalement pose sur la route est retenu', surTrace.has('sur-la-route'));
verifier('celui du bord de chaussee (20 m) est retenu', surTrace.has('bord-de-chaussee'));
verifier('celui de la rue parallele (60 m) est ECARTE', !surTrace.has('rue-parallele'));
verifier(
  'la distance depuis le depart est juste a 2 m pres',
  Math.abs((surTrace.get('sur-la-route')?.distanceDepuisDepart ?? 0) - 1000) < 2,
  `${surTrace.get('sur-la-route')?.distanceDepuisDepart.toFixed(1)} m pour 1000 m`,
);

/* 120 km/h = 33 m par seconde, et la position est cadencee a 1 Hz en navigation. C'est le pas
 * le plus large que l'application puisse voir : si un palier etait saute, ce serait a cette
 * vitesse. */
console.log('\nON ROULE A 120 km/h, UN POINT GPS PAR SECONDE (pas de 33 m)');
const memoire: Memoire = new Map();
const annonces = rouler({
  departM: 500,
  arriveeM: 2800,
  pasM: 33,
  surTrace,
  memoire,
  avecItineraire: true,
});

for (const s of SIGNALEMENTS) {
  const miennes = annonces.filter((a) => a.id === s.id);

  if (s.attendu === 'muet') {
    verifier(`« ${s.id} » reste muet`, miennes.length === 0, `${miennes.length} annonce(s)`);
    continue;
  }

  verifier(
    `« ${s.id} » parle aux DEUX paliers, et pas une fois de plus`,
    miennes.length === 2,
    miennes.map((a) => `${a.palierM} m a ${a.restantM.toFixed(0)} m`).join(' puis ') || 'rien',
  );
  verifier(
    '  ... dans le bon ordre : 200 m d\'abord, 100 m ensuite',
    miennes.length === 2 && miennes[0]!.palierM === 200 && miennes[1]!.palierM === 100,
  );
  for (const a of miennes) {
    verifier(
      `  ... le palier de ${a.palierM} m dit vrai (annonce a ${a.restantM.toFixed(0)} m)`,
      a.restantM > 0 && a.restantM <= a.palierM && a.palierM - a.restantM <= TOLERANCE_M,
      `ecart de ${(a.palierM - a.restantM).toFixed(0)} m, tolerance ${TOLERANCE_M} m`,
    );
  }
}

/* LE CAS QUI FAIT MENTIR UNE ALERTE A DEUX PALIERS. Un autre conducteur pose le signalement
 * alors qu'on est deja a 120 m : le palier des 200 m n'a jamais ete franchi. L'annoncer
 * enverrait chercher l'obstacle cent metres trop loin. */
console.log('\nLE SIGNALEMENT APPARAIT ALORS QU\'ON EST DEJA A 120 m');
const tardif = rouler({
  departM: 880,
  arriveeM: 1000,
  pasM: 33,
  surTrace,
  memoire: new Map(),
  avecItineraire: true,
});
const tardives = tardif.filter((a) => a.id === 'sur-la-route');
verifier(
  'une seule annonce, pas deux',
  tardives.length === 1,
  tardives.map((a) => `${a.palierM} m`).join(', ') || 'aucune',
);
verifier(
  'et c\'est celle des 100 m : jamais << dans 200 metres >> a 120 m',
  tardives.every((a) => a.palierM === 100),
);

/* DEMI-TOUR. Le rearmement demande de s'etre VRAIMENT eloigne : plus de 300 m en amont du
 * signalement. C'est voulu — un GPS qui oscille autour d'un palier ne doit pas repeter
 * l'annonce en boucle. On revient donc 500 m avant le signalement, puis on repart vers lui. */
console.log('\nDEMI-TOUR : ON REPASSE SUR UN SIGNALEMENT DEJA ANNONCE');
const retour = rouler({
  departM: 2800,
  arriveeM: 500,
  pasM: 33,
  surTrace,
  memoire,
  avecItineraire: true,
});
verifier(
  'il ne parle pas pendant qu\'on s\'en eloigne',
  !retour.some((a) => a.id === 'sur-la-route'),
  `${retour.length} annonce(s) au retour`,
);
const repassage = rouler({
  departM: 500,
  arriveeM: 1100,
  pasM: 33,
  surTrace,
  memoire,
  avecItineraire: true,
});
const reparle = repassage.filter((a) => a.id === 'sur-la-route');
verifier(
  'il reparle au passage suivant, aux deux paliers',
  reparle.length === 2,
  reparle.map((a) => `${a.palierM} m`).join(' puis ') || 'rien',
);

console.log('\nA L\'ARRET JUSTE DEVANT, RIEN NE DOIT SE REPETER');
const arret = rouler({
  departM: 950,
  arriveeM: 950,
  pasM: 1,
  surTrace,
  memoire: new Map([['sur-la-route', new Set(PALIERS_M)]]),
  avecItineraire: true,
});
verifier('aucune repetition sur place', arret.length === 0, `${arret.length} annonce(s)`);

console.log('\nSANS ITINERAIRE (il se calcule encore) : DISTANCE DIRECTE');
const sansRoute = rouler({
  departM: 830,
  arriveeM: 830,
  pasM: 1,
  surTrace: new Map(),
  memoire: new Map(),
  avecItineraire: false,
});
verifier(
  'le signalement a 170 m parle quand meme, au palier des 200 m',
  sansRoute.some((a) => a.id === 'sur-la-route' && a.palierM === 200),
  sansRoute.map((a) => `${a.id} a ${a.palierM} m`).join(', ') || 'rien',
);

console.log(
  fautes === 0
    ? '\nL\'alerte d\'approche se comporte comme prevu.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
