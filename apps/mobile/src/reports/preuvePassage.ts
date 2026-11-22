import { haversine } from '../shared';

/**
 * LA PREUVE QU'ON A VECU LE SEGMENT — point H du correctif v2, phase 1.
 *
 *   « Condition : chaque utilisateur a dépassé le segment de 10 m (preuve qu'il l'a vécu). »
 *
 * Le telephone ne peut pas prouver qu'un conducteur a VU une barriere. Il peut prouver qu'il a
 * ROULE la, et c'est ce que le client demande : un signalement de route coupee depose par
 * quelqu'un qui n'a pas bouge n'est pas un temoignage, c'est une opinion.
 *
 * ON MESURE LA DISTANCE REELLEMENT PARCOURUE SUR LES DERNIERES POSITIONS, et non la distance
 * entre la premiere et la derniere : devant une barriere on fait demi-tour, et un aller-retour
 * de cinquante metres ramene a quinze metres du depart. A vol d'oiseau, ce conducteur-la aurait
 * << moins roule >> que celui qui ne s'est pas arrete — l'inverse de la verite.
 *
 * LA FENETRE EST COURTE, SOIXANTE SECONDES, et c'est ce qui donne son sens a la mesure : elle
 * doit dire << il roulait ICI, a l'instant >>, et non << il a roule aujourd'hui >>. Un
 * conducteur arrete depuis cinq minutes devant un portail ferme ne depasse donc pas le seuil,
 * et c'est volontaire : il n'a rien vecu de la route, il la regarde.
 *
 * CE FICHIER N'IMPORTE NI REACT NI REACT NATIVE : la regle se rejoue dans un terminal avec une
 * liste de positions fabriquee a la main, ce qui est la seule facon d'eprouver un calcul qui
 * depend du GPS.
 */

/** Une position horodatee du telephone, telle que le suivi GPS la produit. */
export type PositionDatee = { lat: number; lon: number; t: number };

/** Duree sur laquelle on cumule la distance, en millisecondes. */
export const FENETRE_MS = 60_000;

/**
 * Nombre de positions retenues.
 *
 * Le suivi GPS rend une position par seconde au mieux : soixante suffisent a couvrir la
 * fenetre, et borner la liste est ce qui empeche une heure de navigation de faire grossir la
 * memoire d'un tableau dont on n'utilise que la derniere minute.
 */
export const POSITIONS_MAX = 64;

/**
 * Ajoute une position a la trace, en retirant les plus anciennes.
 *
 * ON NE MUTE PAS LA LISTE RECUE : la trace vit dans une reference de React, et une liste mutee
 * sur place rendrait invisible toute comparaison ulterieure. Elle est de toute facon minuscule.
 */
export function ajouterPosition(
  trace: readonly PositionDatee[],
  position: PositionDatee,
): PositionDatee[] {
  /* UNE POSITION IDENTIQUE A LA PRECEDENTE N'EST PAS AJOUTEE. A l'arret, le GPS rend la meme
   * position plusieurs fois par seconde : sans ce filtre, soixante-quatre mesures d'un vehicule
   * immobile chasseraient de la liste la minute pendant laquelle il roulait. */
  const derniere = trace[trace.length - 1];
  if (derniere && derniere.lat === position.lat && derniere.lon === position.lon) {
    return [...trace.slice(0, -1), position];
  }
  const suite = [...trace, position];
  return suite.length > POSITIONS_MAX ? suite.slice(suite.length - POSITIONS_MAX) : suite;
}

/**
 * METRES PARCOURUS DANS LA DERNIERE MINUTE, cumules segment par segment.
 *
 * LES SAUTS DE GPS SONT ECARTES. Un telephone qui sort d'un tunnel peut rendre deux positions
 * consecutives a trois cents metres l'une de l'autre, en une seconde : ce n'est pas de la route
 * parcourue, c'est une erreur de mesure. On ignore donc tout segment qui supposerait plus de
 * cinquante metres par seconde, soit 180 km/h — au-dela, ce n'est plus une voiture algerienne.
 */
export function metresParcourus(
  trace: readonly PositionDatee[],
  maintenant: number,
  fenetreMs: number = FENETRE_MS,
): number {
  const recentes = trace.filter((p) => maintenant - p.t <= fenetreMs);
  let total = 0;
  for (let i = 1; i < recentes.length; i += 1) {
    const a = recentes[i - 1]!;
    const b = recentes[i]!;
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d)) continue;
    const secondes = Math.max(0.001, (b.t - a.t) / 1000);
    if (d / secondes > 50) continue;
    total += d;
  }
  return total;
}
