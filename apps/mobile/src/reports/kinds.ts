import type { ReportKind } from '../shared';

/**
 * Ordre et emoji du menu de signalement, repris de la grille `.am-grid` en
 * v83 (jam, crash, block, police, flood, fire, bump, object, radar, pothole).
 * Aucun equivalent emoji exact n'existe pour radar/dos d'ane/trou (des icones
 * dessinees a la main en v83) : choix les plus lisibles au premier coup d'oeil.
 */
export const REPORT_MENU_ORDER: ReportKind[] = [
  'jam',
  'crash',
  // Les trois forces se suivent : on les choisit l'une pour l'autre, jamais l'une pour un
  // bouchon. Les garder cote a cote evite de parcourir la grille a chaque fois.
  'police',
  'gendarmerie',
  'armee',
  'works',
  'block',
  'flood',
  'fire',
  'bump',
  'object',
  'radar',
  'pothole',
];

/**
 * Famille d'un signalement, qui decide de sa teinte dans le menu.
 *
 * Quatre familles, et la couleur n'est pas decorative : au volant, on choisit dans ce menu en
 * une seconde, sans lire. Le rouge appelle ce qui met en danger, l'ambre ce qui ralentit, le
 * bleu ce qui se contourne ou s'anticipe. `nouveau` ne dure que le temps qu'une fonction cesse
 * d'etre une nouveaute.
 */
export type ReportFamille = 'danger' | 'ralentit' | 'info' | 'nouveau';

export const REPORT_FAMILLE: Record<ReportKind, ReportFamille> = {
  crash: 'danger',
  fire: 'danger',
  object: 'danger',
  block: 'danger',
  flood: 'danger',
  jam: 'ralentit',
  bump: 'ralentit',
  pothole: 'ralentit',
  works: 'nouveau',
  police: 'info',
  gendarmerie: 'info',
  armee: 'info',
  radar: 'info',
};

export const REPORT_EMOJI: Record<ReportKind, string> = {
  jam: '🚗',
  crash: '💥',
  block: '🚧',
  police: '👮',
  flood: '🌊',
  fire: '🔥',
  bump: '〰️',
  object: '⚠️',
  radar: '📷',
  pothole: '🕳️',
  // Les trois forces se distinguent au premier regard : casquette, beret, tenue de combat.
  gendarmerie: '🪖',
  armee: '🎖️',
  works: '🚧',
};

/**
 * Pictogramme du MENU, quand il doit differer de celui de la carte.
 *
 * Sur la carte, chaque signalement tient dans une pastille de quinze points : un seul glyphe y
 * entre, et trois voitures cote a cote n'y formeraient qu'une tache. Dans le menu, la pastille
 * fait toute la largeur d'une demi-colonne — c'est la que la file de voitures demandee par le
 * client dit ce qu'un vehicule seul ne disait pas : un bouchon, et non une voiture a l'arret.
 */
const MENU_SPECIFIQUE: Partial<Record<ReportKind, string>> = {
  jam: '🚗🚙🚕',
};

export function menuEmoji(kind: ReportKind): string {
  return MENU_SPECIFIQUE[kind] ?? REPORT_EMOJI[kind];
}
