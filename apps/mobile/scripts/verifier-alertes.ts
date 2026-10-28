/**
 * Eprouve l'alerte d'approche des signalements : la voix et la carte « Toujours la ? ».
 *
 * POURQUOI CE SCRIPT. C'est une regle de SECURITE, et elle ne se verifie qu'en roulant vers un
 * vrai nid-de-poule, sur une vraie route, a vraie vitesse. Autant dire qu'elle ne se verifie
 * jamais : si l'annonce arrive trop tard, ou pas du tout, ou pour un danger pose sur la rue
 * parallele, personne ne s'en apercoit avant que ca compte.
 *
 * Les cas ci-dessous sont ceux qui FONT ECHOUER ce genre d'alerte dans la vraie vie :
 *   - le signalement est bien sur notre route          -> doit parler, et UNE SEULE FOIS
 *   - il est sur le bord de la chaussee (20 m)         -> doit parler : c'est notre route
 *   - il est sur la rue parallele (60 m)               -> doit se taire
 *   - il est derriere nous                             -> doit se taire
 *   - on roule vite (1 point GPS toutes les secondes)  -> la fenetre ne doit pas etre sautee
 *   - on fait demi-tour et on repasse                  -> doit reparler
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
  ANNONCE_M,
  decisionAnnonce,
  projeterSurTrace,
  resteAvantSignalement,
} from '../src/navigation/alerteApproche';
import {
  locateOnRoute,
  traveledMeters,
  type TraceMesurable,
} from '../src/navigation/traceGeometrie';

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

type Annonce = { id: string; restantM: number; avanceM: number };

/**
 * Fait rouler le vehicule de `departM` a `arriveeM` par pas de `pasM`, en appelant la vraie
 * chaine de l'application a chaque point GPS, et rend la liste des annonces declenchees.
 */
function rouler(opts: {
  departM: number;
  arriveeM: number;
  pasM: number;
  surTrace: Map<string, { id: string; distanceDepuisDepart: number }>;
  dejaDits: Set<string>;
  avecItineraire: boolean;
}): Annonce[] {
  const { departM, arriveeM, pasM, surTrace, dejaDits, avecItineraire } = opts;
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
      const decision = decisionAnnonce(restant, dejaDits.has(s.id));
      if (decision === 'annoncer') {
        dejaDits.add(s.id);
        annonces.push({ id: s.id, restantM: restant!, avanceM: avance });
      } else if (decision === 'rearmer') {
        dejaDits.delete(s.id);
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

console.log(`\nDistance d'annonce configuree : ${ANNONCE_M} m\n`);

const surTrace = projeterSurTrace(route, [...SIGNALEMENTS]);

console.log('PROJECTION SUR L\'ITINERAIRE');
verifier(
  'le signalement pose sur la route est retenu',
  surTrace.has('sur-la-route'),
);
verifier(
  'celui du bord de chaussee (20 m) est retenu',
  surTrace.has('bord-de-chaussee'),
);
verifier(
  'celui de la rue parallele (60 m) est ECARTE',
  !surTrace.has('rue-parallele'),
);
verifier(
  'la distance depuis le depart est juste a 2 m pres',
  Math.abs((surTrace.get('sur-la-route')?.distanceDepuisDepart ?? 0) - 1000) < 2,
  `${surTrace.get('sur-la-route')?.distanceDepuisDepart.toFixed(1)} m pour 1000 m`,
);

/* 120 km/h = 33 m par seconde, et la position est cadencee a 1 Hz en navigation. C'est le pas
 * le plus large que l'application puisse voir : si la fenetre d'annonce etait sautee, ce
 * serait a cette vitesse. */
console.log('\nON ROULE A 120 km/h, UN POINT GPS PAR SECONDE (pas de 33 m)');
const dejaDits = new Set<string>();
const annonces = rouler({
  departM: 500,
  arriveeM: 2800,
  pasM: 33,
  surTrace,
  dejaDits,
  avecItineraire: true,
});

for (const s of SIGNALEMENTS) {
  const miennes = annonces.filter((a) => a.id === s.id);
  if (s.attendu === 'parle') {
    verifier(
      `« ${s.id} » annonce une seule fois`,
      miennes.length === 1,
      `${miennes.length} annonce(s)`,
    );
    const a = miennes[0];
    if (a) {
      verifier(
        `  ... et assez tot : il restait ${a.restantM.toFixed(0)} m`,
        a.restantM > 0 && a.restantM <= ANNONCE_M,
      );
      verifier(
        '  ... et pas trop tot : la fenetre n\'est pas annoncee avant son entree',
        a.restantM > ANNONCE_M - 34,
        `${a.restantM.toFixed(0)} m, un pas de 33 m avant le seuil de ${ANNONCE_M} m`,
      );
    }
  } else {
    verifier(`« ${s.id} » reste muet`, miennes.length === 0, `${miennes.length} annonce(s)`);
  }
}

/* DEMI-TOUR. Le rearmement demande de s'etre VRAIMENT eloigne : plus de 300 m en amont du
 * signalement. C'est voulu — un GPS qui oscille autour du seuil de 150 m ne doit pas repeter
 * l'annonce en boucle. On revient donc 500 m avant le signalement, puis on repart vers lui. */
console.log('\nDEMI-TOUR : ON REPASSE SUR UN SIGNALEMENT DEJA ANNONCE');
const retour = rouler({
  departM: 2800,
  arriveeM: 500,
  pasM: 33,
  surTrace,
  dejaDits,
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
  dejaDits,
  avecItineraire: true,
});
verifier(
  'il reparle au passage suivant, une fois rearme',
  repassage.some((a) => a.id === 'sur-la-route'),
);

console.log('\nA L\'ARRET, LE SIGNALEMENT NE DOIT PAS SE REPETER');
const arret = rouler({
  departM: 920,
  arriveeM: 920,
  pasM: 1,
  surTrace,
  dejaDits: new Set(['sur-la-route']),
  avecItineraire: true,
});
verifier('aucune repetition sur place', arret.length === 0, `${arret.length} annonce(s)`);

console.log('\nSANS ITINERAIRE (il se calcule encore) : DISTANCE DIRECTE');
const sansRoute = rouler({
  departM: 880,
  arriveeM: 880,
  pasM: 1,
  surTrace: new Map(),
  dejaDits: new Set(),
  avecItineraire: false,
});
verifier(
  'le signalement a 120 m parle quand meme',
  sansRoute.some((a) => a.id === 'sur-la-route'),
);

console.log(
  fautes === 0
    ? '\nL\'alerte d\'approche se comporte comme prevu.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
