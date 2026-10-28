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
 * DEUX PALIERS D'ANNONCE : 200 METRES, PUIS 100 METRES. Demande du client, 28 octobre.
 *
 * L'histoire de cette valeur : cinquante metres a l'origine, portee a cent le 23 octobre, puis
 * a cent cinquante le 27. Un palier unique oblige a choisir entre prevenir TOT et prevenir
 * JUSTE : a 150 m on a le temps d'agir, mais sept secondes plus tard on a oublie l'annonce et
 * l'on arrive sur l'obstacle sans rien. Deux paliers suppriment ce choix — le premier previent,
 * le second confirme au moment ou l'on arrive.
 *
 * DECROISSANTS, et l'ordre compte : le code s'appuie dessus pour choisir quel palier prononcer.
 *
 * La voix PRONONCE le palier atteint (<< dans 200 metres >>, puis << dans 100 metres >>) : la
 * valeur dite et la valeur testee sont la meme, elles ne peuvent pas diverger.
 */
export const PALIERS_M = [200, 100] as const;

/**
 * Ecart tolere entre le palier prononce et la distance reelle : la moitie de l'ecart entre deux
 * paliers.
 *
 * POURQUOI CETTE TOLERANCE EXISTE. Un signalement n'est pas toujours la depuis le depart : un
 * autre conducteur peut le poser alors qu'on est deja a 120 m. On n'a donc jamais FRANCHI le
 * palier des 200 m, et annoncer << dans 200 metres >> a 120 m serait faux — le conducteur
 * chercherait l'obstacle cent metres trop loin. Dans ce cas le palier des 200 m est abandonne
 * en silence, et la voix attend celui des 100 m, qui dira vrai.
 *
 * Cinquante metres, c'est-a-dire la moitie de l'ecart entre deux paliers : au-dela, un autre
 * palier decrit mieux la distance.
 */
const TOLERANCE_M = 50;

/**
 * Au-dela, le signalement se rearme — sinon un demi-tour ne redeclencherait jamais l'alerte.
 * L'ecart avec le premier palier evite qu'un GPS qui oscille autour du seuil ne repete
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

export type Decision = {
  quoi: 'annoncer' | 'rearmer' | 'rien';
  /** Palier a PRONONCER, quand on annonce. */
  palierM?: number;
  /** Paliers a retenir comme dits : celui qu'on annonce, et ceux devenus caducs. */
  consommes: readonly number[];
};

const RIEN: Decision = { quoi: 'rien', consommes: [] };

/**
 * Faut-il parler maintenant, et de quel palier ? Rearmer ? Ou se taire ?
 *
 * TROIS CAS, ET UN SEUL EST EVIDENT.
 *
 * 1. On franchit un palier : on l'annonce, et on le retient pour ne pas le repeter. Chaque
 *    palier parle une fois par passage — deux annonces par signalement, pas davantage.
 *
 * 2. Le signalement apparait DEJA dans la fenetre, pose a l'instant par un autre conducteur.
 *    Le palier le plus large n'a jamais ete franchi : le prononcer mentirait (voir
 *    TOLERANCE_M). On l'abandonne en silence et l'on attend le palier suivant.
 *
 * 3. On s'est vraiment eloigne : tout se rearme, pour qu'un demi-tour previenne a nouveau.
 *
 * `dejaDits` porte les paliers deja traites POUR CE SIGNALEMENT. Un Set par signalement, et
 * non un simple booleen : c'est ce qui permet au second palier de parler apres le premier.
 */
export function decisionAnnonce(
  restant: number | null,
  dejaDits: ReadonlySet<number>,
): Decision {
  if (restant == null) return RIEN;

  // On s'en est eloigne pour de bon : le signalement redevient neuf.
  if (restant > REARM_M) {
    return dejaDits.size > 0 ? { quoi: 'rearmer', consommes: [] } : RIEN;
  }

  // Derriere nous : on n'annonce pas ce qu'on vient de depasser.
  if (restant < 0) return RIEN;

  /* Les paliers sont decroissants : on les parcourt du plus large au plus serre et l'on
   * s'arrete au premier qu'on a franchi. Ceux qu'on depasse en chemin sont abandonnes en
   * silence — ils ne reviendront pas mentir plus tard. */
  const abandonnes: number[] = [];
  for (const palier of PALIERS_M) {
    if (dejaDits.has(palier)) continue;
    if (restant > palier) break; // pas encore franchi : les plus serres non plus
    if (palier - restant > TOLERANCE_M) {
      abandonnes.push(palier); // franchi sans qu'on le voie : il dirait faux
      continue;
    }
    return { quoi: 'annoncer', palierM: palier, consommes: [...abandonnes, palier] };
  }

  return abandonnes.length > 0 ? { quoi: 'rien', consommes: abandonnes } : RIEN;
}
