import type { ReportKind } from '../shared';

/**
 * MARQUEURS DE SIGNALISATION SUR LA CARTE — correction C1 du 31 octobre.
 *
 * CE QUI MANQUAIT VRAIMENT. Le client ecrit « marqueurs absents de la carte ». Ils n'etaient
 * pas absents du code : trois couches les dessinaient. Mais la derniere demandait
 * `text-field: emoji`, et la police servie avec les tuiles ne contient AUCUN emoji — ce champ
 * n'a donc jamais rien affiche. Il ne restait qu'un point de sept pixels, sans pictogramme ni
 * libelle, c'est-a-dire rien d'identifiable. Le client a raison de le dire absent.
 *
 * Le meme defaut avait deja ete corrige pour l'epingle de destination, par une image. On fait
 * pareil : le pictogramme devient une image (voir scripts/make-report-glyphs.py), tandis que le
 * disque et l'anneau restent dessines par la carte, avec des couleurs qui viennent de la
 * donnee. La bascule jour/nuit ne coute alors rien.
 *
 * DEUX TEINTES PAR TYPE, et le sens de la paire demande une explication. Le tableau du client
 * s'intitule « Couleur dark / light ». Prise au pied de la lettre, cette lecture donnerait une
 * teinte SOMBRE sur une carte sombre, ce qui ne se voit pas. La maquette tranche : elle est
 * presentee sur fond noir et montre les teintes CLAIRES. On lit donc la paire comme « la
 * variante sombre, la variante claire » — la sombre sur la carte de jour, la claire sur celle
 * de nuit, qui est la seule facon d'etre lisible dans les deux cas.
 *
 * LES TROIS FORCES PARTAGENT LE BLEU DU BARRAGE. Le tableau du 31 octobre ne liste qu'une
 * ligne « Barrage — Police / Gendarmerie / Armee », la ou un document anterieur leur donnait a
 * chacune sa couleur institutionnelle. Sur la CARTE, elles prennent donc le meme bleu : c'est
 * la demande la plus recente, et trois bleus voisins ne se distingueraient de toute facon pas
 * sur un disque de vingt points. La distinction reste entiere la ou elle sert — la carte
 * d'alerte et le menu de signalement montrent toujours l'ecusson et le nom de chaque force.
 */

export type TeinteSignalisation = {
  /** Sur la carte de JOUR, dont le fond est clair. */
  jour: string;
  /** Sur la carte de NUIT, dont le fond est sombre. */
  nuit: string;
  /** Cle du badge affiche sous le marqueur : « Trafic dense », « Collision »... */
  badge: string;
};

export const SIGNALISATION: Record<ReportKind, TeinteSignalisation> = {
  jam: { jour: '#D63B2F', nuit: '#FF6B5B', badge: 'jam' },
  crash: { jour: '#B71C1C', nuit: '#EF5350', badge: 'crash' },
  police: { jour: '#0D47A1', nuit: '#42A5F5', badge: 'police' },
  gendarmerie: { jour: '#0D47A1', nuit: '#42A5F5', badge: 'police' },
  armee: { jour: '#0D47A1', nuit: '#42A5F5', badge: 'police' },
  block: { jour: '#4E342E', nuit: '#A1887F', badge: 'block' },
  works: { jour: '#F57F17', nuit: '#FFD54F', badge: 'works' },
  bump: { jour: '#E65100', nuit: '#FF8A65', badge: 'bump' },
  radar: { jour: '#37474F', nuit: '#90A4AE', badge: 'radar' },
  object: { jour: '#F9A825', nuit: '#FFE082', badge: 'object' },
  pothole: { jour: '#5D4037', nuit: '#BCAAA4', badge: 'pothole' },
  flood: { jour: '#01579B', nuit: '#4FC3F7', badge: 'flood' },
  fire: { jour: '#BF360C', nuit: '#FF7043', badge: 'fire' },
};

/**
 * L'or de l'anneau, repris de la maquette.
 *
 * Il entoure TOUS les marqueurs, quelle que soit leur couleur : c'est lui qui les fait
 * reconnaitre comme venant de WIN plutot que du fond de carte, et c'est aussi ce qui les
 * detache d'une route jaune ou d'un parc vert, ou un disque seul se fondrait.
 */
export const OR_MARQUEUR = '#D4A017';

/** Nom de l'image du pictogramme, generee par scripts/make-report-glyphs.py. */
export function pictoSignalisation(kind: ReportKind): string {
  return `sig-${kind}`;
}

/**
 * FAMILLE DE PICTOGRAMME, pour savoir quand deux couleurs voisines sont reellement genantes.
 *
 * La couleur n'est plus le seul signal depuis que chaque marqueur porte un dessin et un badge.
 * Deux teintes proches ne sont donc un probleme QUE si les dessins se ressemblent aussi : un
 * barrage bleu fonce et une inondation bleu fonce ne se confondent pas, puisque l'un est un
 * carre plein et l'autre des vagues.
 *
 * C'est ce qui a permis de garder la table du client telle quelle. Elle contient huit paires de
 * teintes voisines — trois de jour, cinq de nuit — et une seule posait vraiment probleme : le
 * dos d'ane et le bouchon, corail tous les deux ET ondules tous les deux. Le dos d'ane porte
 * desormais une bosse sur une ligne de sol, qui ne ressemble a rien d'autre.
 */
export const FAMILLE_PICTO: Record<ReportKind, string> = {
  jam: 'vagues',
  crash: 'croix',
  police: 'carre',
  gendarmerie: 'carre',
  armee: 'carre',
  block: 'croix',
  works: 'marteau',
  bump: 'ressaut',
  radar: 'anneau-plein',
  object: 'triangle',
  pothole: 'anneau',
  flood: 'vagues',
  fire: 'flamme',
};
