/**
 * << SOMMES-NOUS EN AGGLOMERATION ? >> — correctif Fleches, bug 1.
 *
 *   << BUG 1 — En agglomeration : clignotement a 100 m au lieu de 50 m. Ex: RN 68 direction
 *   Jijel — les 2 fleches clignotent a 100 m. OSM tag le segment a 100 km/h (tag national)
 *   mais on est en ville. >>
 *
 * LE CLIENT A RAISON, ET LE DIAGNOSTIC EST LE SIEN : la RN 68 traverse la ville, OpenStreetMap
 * la tague a 100 km/h sur toute sa longueur, et notre seuil se calcule depuis cette seule
 * limite — 100 km/h se lit donc << rase campagne >> au milieu des maisons. Sa correction
 * demande un `step.isUrban()` qui, chez nous, n'existait pas.
 *
 * CE FICHIER EST CE isUrban(), ET IL NE DEVINE RIEN : il REGARDE. La carte affichee a l'ecran
 * porte deja les batiments et les zones d'habitation, et nous l'interrogeons deja sous le
 * vehicule a chaque releve pour en lire le type de route (voir useSpeedLimit). Demander a la
 * meme lecture << y a-t-il du bati autour ? >> ne coute pas une requete de plus, ne demande
 * aucune donnee nouvelle, et repond par une mesure du terrain plutot que par une supposition.
 *
 * LES DEUX SIGNES QU'ON Y CHERCHE, et pourquoi ils ne se valent pas :
 *
 *   UNE ZONE D'HABITATION (`landuse` de classe `residential`) suffit a elle seule. C'est le
 *   polygone qu'OpenStreetMap pose SUR l'agglomeration : y etre, c'est y etre. Les deux fonds
 *   d'OpenFreeMap la dessinent, de jour comme de nuit (couche `landuse_residential`).
 *
 *   DES BATIMENTS, il en faut TROIS. Un seul batiment au bord d'une nationale est une ferme,
 *   un relais, un hangar — et le seuil de cinquante metres ne doit pas se declencher parce
 *   qu'on passe devant une maison isolee a cent kilometres de la premiere ville. Trois
 *   batiments dans une fenetre de quatre-vingt-dix points d'ecran, en revanche, c'est une rue.
 *   Les batiments apparaissent a partir du zoom 13 (12 sur le fond de nuit) et la navigation
 *   travaille a 17,5 : ils sont la quand on en a besoin.
 *
 * CE QU'ON NE REGARDE PAS : le nom de la couche. La carte Android ne le renvoie pas
 * (`sourceLayer` absent) — c'est deja ce qui avait fait echouer la pastille de limitation en
 * novembre. On reconnait donc un batiment a ses CHAMPS (`render_height`, `render_min_height`,
 * que la couche `building` d'OpenMapTiles porte toujours) et une zone a sa classe, en exigeant
 * dans les deux cas un POLYGONE : `residential` est aussi une classe de ROUTE, et une rue de
 * quartier est une ligne.
 *
 * Aucun import de react-native : ce fichier s'execute sous `npx tsx`. Voir
 * scripts/verifier-fleches-synchro.ts.
 */

/**
 * Un trait de la carte, reduit a ce qui nous importe. `useSpeedLimit` traduit les objets de
 * MapLibre vers cette forme-la, ce qui permet de fabriquer des cas d'essai a la main.
 */
export type TraitDeCarte = {
  /** Vrai pour un polygone — un batiment, une zone ; faux pour une ligne — une route. */
  polygone: boolean;
  proprietes: Record<string, unknown>;
};

/** Classes d'occupation du sol qui disent << on habite ici >>. */
export const CLASSES_HABITEES = [
  'residential',
  'suburb',
  'neighbourhood',
  'quarter',
  'commercial',
  'retail',
  'industrial',
] as const;

/** Champs que la couche `building` d'OpenMapTiles porte, et qu'elle seule porte. */
export const CHAMPS_BATIMENT = ['render_height', 'render_min_height'] as const;

/** Combien de batiments font une rue plutot qu'une ferme isolee. */
export const BATIMENTS_MIN = 3;

/** Ce trait est-il un batiment ? */
export function estBatiment(trait: TraitDeCarte): boolean {
  if (!trait.polygone) return false;
  return CHAMPS_BATIMENT.some((champ) => trait.proprietes[champ] !== undefined);
}

/** Ce trait est-il une zone habitee ? */
export function estZoneHabitee(trait: TraitDeCarte): boolean {
  if (!trait.polygone) return false;
  const classe = String(trait.proprietes['class'] ?? '').toLowerCase();
  return (CLASSES_HABITEES as readonly string[]).includes(classe);
}

/**
 * Le vehicule est-il en agglomeration, d'apres ce que la carte montre autour de lui ?
 *
 * On rend `false` quand on ne voit rien, et non `null` : l'absence de bati n'est pas une
 * ignorance, c'est le dehors. Le cas << je ne sais pas ou je suis >> est deja traite ailleurs,
 * par la limite inconnue qui ramene a cinquante metres — voir `seuilClignotementM`.
 */
export function estEnAgglomeration(traits: readonly TraitDeCarte[]): boolean {
  let batiments = 0;
  for (const trait of traits) {
    if (estZoneHabitee(trait)) return true;
    if (estBatiment(trait)) {
      batiments += 1;
      if (batiments >= BATIMENTS_MIN) return true;
    }
  }
  return false;
}
