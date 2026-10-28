/**
 * ALERTE D'APPROCHE D'UN SIGNALEMENT : les trois regles, sans React.
 *
 * POURQUOI CE FICHIER EXISTE A PART. C'est une regle de SECURITE : a quelle distance la voix
 * previent, quels signalements la concernent, et quand elle se rearme. Tant qu'elle vivait dans
 * le hook, l'eprouver demandait de faire tourner l'application — donc de rouler vers un vrai
 * nid-de-poule. Autant dire jamais. Ici, les trois regles sont des fonctions pures et
 * `scripts/verifier-alertes.ts` les fait rouler a 120 km/h en une seconde, sur un ordinateur.
 *
 * Meme raison que degradeTrace.ts et traceGeometrie.ts.
 */
import { haversine } from '../shared/geo';
import { locateOnRoute, traveledMeters, type TraceMesurable } from './traceGeometrie';

type Coords = { lat: number; lon: number };

/**
 * DISTANCE D'ANNONCE : 100 METRES, ET LA VOIX LE DIT.
 *
 * Elle etait a cinquante. Le client le signale comme un defaut de securite, et il a raison :
 * a 80 km/h, cinquante metres sont deux secondes et demie — le temps de l'entendre, pas celui
 * de lever le pied, de regarder dans le retroviseur et de se rabattre. Cent metres en donnent
 * cinq, ce qui change la nature de l'information : elle cesse d'etre un constat pour redevenir
 * un avertissement.
 *
 * La valeur est aussi celle que la voix PRONONCE (<< dans 100 metres >>). Les deux ne doivent
 * pas pouvoir diverger, d'ou une seule constante pour les deux usages.
 */
/* 150 depuis le 27 octobre. Le client demandait « 50 → 150 » : la valeur de depart n'etait
 * deja plus cinquante mais cent, portee la le 23 octobre pour la raison ci-dessus. Cent
 * cinquante metres font sept secondes a 80 km/h — de quoi lever le pied, regarder et se
 * rabattre sans hate. C'est le dernier palier raisonnable : au-dela, l'annonce arrive si tot
 * qu'on l'a oubliee en arrivant sur l'obstacle. */
export const ANNONCE_M = 150;

/**
 * Au-dela, le signalement se rearme — sinon un demi-tour ne redeclencherait jamais l'alerte.
 * L'ecart avec la distance d'annonce evite qu'un GPS qui oscille autour du seuil ne repete
 * l'annonce : il faut vraiment s'en eloigner pour qu'elle puisse revenir.
 */
const REARM_M = 300;

/**
 * Ecart maximal entre un signalement et le trace pour qu'il nous concerne.
 *
 * C'est la contrepartie indispensable du passage a cent metres. A cinquante, un signalement
 * pose sur la rue parallele etait rarement assez proche pour parler ; a cent, il l'est presque
 * toujours — et le conducteur entendrait << accident dans 100 metres >> pour un accident qui
 * n'est pas sur sa route. Trente-cinq metres couvrent une chaussee large et ses abords, sans
 * attraper la voie d'a cote.
 */
const SUR_LA_ROUTE_M = 35;

/** Position d'un signalement le long de l'itineraire, calculee une fois pour toutes. */
export type SurTrace = { id: string; distanceDepuisDepart: number };

/**
 * Projette les signalements sur l'itineraire et ecarte ceux qui ne sont pas sur notre route.
 *
 * Sortie de la boucle du composant pour pouvoir etre EPROUVEE hors de l'application (voir
 * scripts/verifier-alertes.ts), comme on l'a fait pour les paliers du trace : une regle de
 * securite qui ne se verifie qu'en roulant ne se verifie jamais.
 */
export function projeterSurTrace(
  route: TraceMesurable | null,
  reports: { id: string; lat: number; lon: number }[],
): Map<string, SurTrace> {
  const table = new Map<string, SurTrace>();
  if (!route) return table;
  for (const r of reports) {
    const projection = locateOnRoute([r.lon, r.lat], route.geometry);
    if (projection.distanceM > SUR_LA_ROUTE_M) continue; // il n'est pas sur notre route
    table.set(r.id, { id: r.id, distanceDepuisDepart: traveledMeters(route, projection) });
  }
  return table;
}

/**
 * Ce qui reste a parcourir jusqu'a un signalement, ou `null` s'il ne nous concerne pas.
 *
 * AVEC itineraire : on ne garde que ce qui est pose SUR notre route (la table ne contient
 * qu'eux) et la distance se compte le long de la chaussee. Un signalement absent de la table
 * est sur une autre rue : il ne nous concerne pas.
 *
 * SANS itineraire : on retombe sur la distance directe. C'est approximatif, mais le conducteur
 * roule quand meme et merite d'etre prevenu.
 *
 * Un signalement DERRIERE nous donne un reste negatif ; c'est `decisionAnnonce` qui l'ecarte.
 */
export function resteAvantSignalement(opts: {
  report: { id: string; lat: number; lon: number };
  route: TraceMesurable | null;
  surTrace: Map<string, SurTrace>;
  traveledM: number;
  position: Coords;
}): number | null {
  const { report, route, surTrace, traveledM, position } = opts;
  if (route) {
    const place = surTrace.get(report.id);
    if (!place) return null;
    return place.distanceDepuisDepart - traveledM;
  }
  return haversine(position.lat, position.lon, report.lat, report.lon);
}

/**
 * Faut-il parler maintenant, rearmer, ou se taire ?
 *
 * `annoncer` des l'entree dans la fenetre [0 ; ANNONCE_M] et une seule fois ; `rearmer` quand
 * on s'en est vraiment eloigne, pour qu'un demi-tour redeclenche l'alerte.
 */
export function decisionAnnonce(
  restant: number | null,
  dejaDit: boolean,
): 'annoncer' | 'rearmer' | 'rien' {
  if (restant == null) return 'rien';
  if (restant >= 0 && restant <= ANNONCE_M && !dejaDit) return 'annoncer';
  if (restant > REARM_M && dejaDit) return 'rearmer';
  return 'rien';
}
