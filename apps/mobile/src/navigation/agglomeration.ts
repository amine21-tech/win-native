/**
 * << SOMMES-NOUS EN AGGLOMERATION ? >> — correctif Fleches, bug 1, puis relance v3.
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
 * porte deja les batiments, les zones d'habitation, les rues et les commerces, et nous
 * l'interrogeons deja sous le vehicule a chaque releve pour en lire le type de route (voir
 * useSpeedLimit). Demander a la meme lecture << y a-t-il une ville autour ? >> ne coute pas une
 * requete de plus, ne demande aucune donnee nouvelle, et repond par une mesure du terrain
 * plutot que par une supposition.
 *
 * ================================================================================
 * POURQUOI CE FICHIER A CHANGE — RELANCE v3, ET LA PHOTO D'AZEFFOUN
 * ================================================================================
 *
 * Le client renvoie le meme bug depuis une AUTRE ville : CW 158 a Azeffoun, taguee 100 km/h,
 * fleches a 500 m en pleine agglomeration. Son diagnostic est que le code regarde `maxSpeed`
 * AVANT `isUrban()`. Ce n'etait pas le cas — l'ordre etait deja le bon, a une exception pres
 * (voir grandAxe.ts) — donc l'inversion seule n'aurait rien corrige. La vraie panne est ICI :
 * `estEnAgglomeration` repondait NON a Azeffoun.
 *
 * SA CAPTURE D'ECRAN DIT POURQUOI. Autour du vehicule, la carte ne montre AUCUN batiment et
 * AUCUNE zone d'habitation — c'est-a-dire exactement les deux seuls signes que ce fichier
 * cherchait. OpenStreetMap, dans les petites villes algeriennes, n'a souvent ni le bati ni le
 * `landuse` ; ce qu'il a, et qu'on voit sur sa photo, ce sont LES SERVICES ET LES RUES : << Mairie
 * Azzefoune >>, << Bureau de poste de Azeffoun >>, un cafe, quelques rues de quartier.
 *
 * Une mairie et une poste ne se construisent pas en rase campagne. On ajoute donc deux signes a
 * ceux de la version precedente, SANS EN RETIRER AUCUN : un point d'interet qui porte un nom, et
 * une rue d'habitation qui porte un nom. Tout ce qui disait << ville >> le dit toujours.
 *
 * ================================================================================
 * LES CINQ SIGNES, ET POURQUOI ILS NE SE VALENT PAS
 * ================================================================================
 *
 * DECISIFS A EUX SEULS — ce sont les deux objets qu'OpenStreetMap pose SUR une agglomeration,
 * et non a cote :
 *
 *   UNE ZONE D'HABITATION (`landuse` de classe `residential`, `suburb`, `commercial`...) : y
 *   etre, c'est y etre. Les deux fonds d'OpenFreeMap la dessinent, de jour comme de nuit.
 *
 *   UN POINT DE LOCALITE (`place` de classe `city`, `town`, `village`, `suburb`, `hamlet`...) :
 *   ce noeud est au milieu du bourg. Le voir a cent cinquante metres, c'est y etre.
 *
 * COMPTES COMME PREUVES — il en faut TROIS (voir PREUVES_MIN) :
 *
 *   UNE RUE D'HABITATION QUI PORTE UN NOM vaut DEUX preuves. Un `highway=residential` est,
 *   par definition d'OpenStreetMap, une voie qui dessert des logements ; nommee, elle est
 *   relevee par quelqu'un qui est passe la. Deux d'entre elles suffisent donc.
 *   LE NOM EST EXIGE, et ce n'est pas un detail de confort : la classe `residential` seule ne
 *   peut pas servir, parce qu'elle designe aussi une zone d'occupation du sol et parce qu'une
 *   contre-allee de nationale la porte parfois. Le controle du 23 novembre qui refuse
 *   << trois routes residential >> sans nom reste donc vrai, et il le reste expres.
 *
 *   UN POINT D'INTERET QUI PORTE UN NOM vaut UNE preuve : la mairie, la poste, le cafe, l'ecole,
 *   la pharmacie, la station-service. Un seul ne fait pas une ville — une auberge isolee en
 *   porte un — mais trois a cent cinquante metres les uns des autres, c'est un bourg. Les points
 *   de la NATURE sont ecartes nommement (voir CLASSES_POINT_NATUREL) : un sommet, une source ou
 *   une plage portent un nom eux aussi, et ils disent le contraire d'une ville.
 *
 *   UN BATIMENT vaut UNE preuve, donc il en faut toujours TROIS comme avant le 25 novembre. Un
 *   seul batiment au bord d'une nationale est une ferme, un relais, un hangar — et le seuil de
 *   cinquante metres ne doit pas se declencher parce qu'on passe devant une maison isolee a cent
 *   kilometres de la premiere ville.
 *
 * CE QU'ON NE REGARDE PAS : le nom de la couche. La carte Android ne le renvoie pas
 * (`sourceLayer` absent) — c'est deja ce qui avait fait echouer la pastille de limitation en
 * novembre. On reconnait donc un batiment a ses CHAMPS (`render_height`, `render_min_height`,
 * que la couche `building` d'OpenMapTiles porte toujours), une zone a sa classe, et le reste a
 * la FORME de sa geometrie : `residential` est a la fois une classe de route (une ligne), une
 * classe d'occupation du sol (un polygone) et une classe de lieu (un point), et les trois ne
 * veulent pas dire la meme chose.
 *
 * ON NE PEUT PAS SE TROMPER DANS LES DEUX SENS AU MEME PRIX. Croire la ville absente alors
 * qu'elle est la — le bug du client — fait clignoter les fleches cinq cents metres trop tot,
 * donc devant le mauvais carrefour. Croire la ville presente en rase campagne fait clignoter
 * quatre cent cinquante metres trop tard. Les deux sont mauvais ; mais le premier se produit
 * DANS les villes, c'est-a-dire la ou il y a des carrefours a confondre.
 *
 * Aucun import de react-native : ce fichier s'execute sous `npx tsx`. Voir
 * scripts/verifier-fleches-synchro.ts.
 */

/** La forme de la geometrie d'un trait, qui est ce qui le distingue vraiment. */
export type FormeTrait = 'point' | 'ligne' | 'polygone';

/**
 * Un trait de la carte, reduit a ce qui nous importe. `useSpeedLimit` traduit les objets de
 * MapLibre vers cette forme-la, ce qui permet de fabriquer des cas d'essai a la main.
 *
 * `forme` est facultatif pour que les cas d'essai ecrits avant le 25 novembre continuent de
 * dire ce qu'ils disaient : sans lui, un polygone reste un polygone et tout le reste est lu
 * comme une ligne — c'est-a-dire le comportement d'avant, ou les points ne comptaient pas.
 */
export type TraitDeCarte = {
  /** Vrai pour un polygone — un batiment, une zone ; faux pour une ligne — une route. */
  polygone: boolean;
  /** La forme exacte, quand on la connait. */
  forme?: FormeTrait;
  proprietes: Record<string, unknown>;
};

/** La forme d'un trait, deduite de `polygone` quand elle n'est pas donnee. */
export function formeDe(trait: TraitDeCarte): FormeTrait {
  if (trait.forme) return trait.forme;
  return trait.polygone ? 'polygone' : 'ligne';
}

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

/** Classes de LIEU : le point qu'OpenStreetMap pose au milieu d'une agglomeration. */
export const CLASSES_LOCALITE = [
  'city',
  'town',
  'village',
  'hamlet',
  'borough',
  'suburb',
  'neighbourhood',
  'neighborhood',
  'quarter',
] as const;

/** Classes de ROUTE qui desservent des logements. */
export const CLASSES_RUE = ['residential', 'living_street', 'pedestrian'] as const;

/**
 * Points qui portent un nom mais qui disent LE CONTRAIRE d'une ville.
 *
 * Un sommet, une source, une plage, une ferme isolee sont nommes dans OpenStreetMap, et un
 * fond de carte les affiche au meme titre qu'une pharmacie. Sans cette liste, la route de
 * montagne la plus vide d'Algerie serait lue comme une agglomeration.
 */
export const CLASSES_POINT_NATUREL = [
  'peak',
  'volcano',
  'saddle',
  'ridge',
  'valley',
  'waterfall',
  'spring',
  'cave_entrance',
  'beach',
  'bay',
  'strait',
  'cape',
  'island',
  'islet',
  'wood',
  'forest',
  'glacier',
  'desert',
  'dune',
  'sea',
  'ocean',
  'lake',
  'river',
  'stream',
  'dam',
  'farm',
  'isolated_dwelling',
  'locality',
  'region',
  'state',
  'province',
  'country',
  'continent',
] as const;

/** Champs que la couche `building` d'OpenMapTiles porte, et qu'elle seule porte. */
export const CHAMPS_BATIMENT = ['render_height', 'render_min_height'] as const;

/** Champs ou peut se trouver le nom d'un trait, selon la couche et la langue servie. */
export const CHAMPS_NOM = ['name', 'name:latin', 'name:fr', 'name_en', 'name:ar'] as const;

/** Champs ou peut se trouver la classe d'un trait. */
export const CHAMPS_CLASSE = ['class', 'subclass', 'highway', 'place', 'amenity', 'shop'] as const;

/** Combien de preuves font une agglomeration. */
export const PREUVES_MIN = 3;
/** Ce que vaut une rue d'habitation nommee : deux suffisent donc. */
export const PREUVE_RUE = 2;
/** Ce que vaut un batiment — d'ou les TROIS batiments d'avant le 25 novembre. */
export const PREUVE_BATIMENT = 1;
/** Ce que vaut un point d'interet nomme. */
export const PREUVE_POINT_INTERET = 1;

/**
 * Combien de batiments font une rue plutot qu'une ferme isolee.
 *
 * Reste exporte, et reste a trois : un batiment vaut une preuve, il en faut `PREUVES_MIN`. Le
 * chiffre du 23 novembre n'a donc pas bouge, il est seulement devenu un cas particulier.
 */
export const BATIMENTS_MIN = PREUVES_MIN / PREUVE_BATIMENT;

/** La premiere valeur de texte non vide parmi ces champs, en minuscules. */
function texte(proprietes: Record<string, unknown>, champs: readonly string[]): string {
  for (const champ of champs) {
    const valeur = proprietes[champ];
    if (typeof valeur === 'string' && valeur.trim() !== '') return valeur.trim().toLowerCase();
  }
  return '';
}

/** Toutes les classes que porte un trait : les tuiles n'utilisent pas toujours le meme champ. */
function classesDe(proprietes: Record<string, unknown>): string[] {
  const vues: string[] = [];
  for (const champ of CHAMPS_CLASSE) {
    const valeur = proprietes[champ];
    if (typeof valeur !== 'string') continue;
    /* Les bretelles arrivent en << motorway_link >>, les rues parfois en << residential_link >>. */
    const classe = valeur.trim().toLowerCase().replace(/_link$/, '');
    if (classe !== '') vues.push(classe);
  }
  return vues;
}

const dans = (liste: readonly string[], valeurs: readonly string[]): boolean =>
  valeurs.some((valeur) => liste.includes(valeur));

/** Ce trait porte-t-il un nom ? */
export function porteUnNom(trait: TraitDeCarte): boolean {
  return texte(trait.proprietes, CHAMPS_NOM) !== '';
}

/** Ce trait est-il un batiment ? */
export function estBatiment(trait: TraitDeCarte): boolean {
  if (formeDe(trait) !== 'polygone') return false;
  return CHAMPS_BATIMENT.some((champ) => trait.proprietes[champ] !== undefined);
}

/** Ce trait est-il une zone habitee ? */
export function estZoneHabitee(trait: TraitDeCarte): boolean {
  if (formeDe(trait) !== 'polygone') return false;
  const classe = String(trait.proprietes['class'] ?? '').toLowerCase();
  return (CLASSES_HABITEES as readonly string[]).includes(classe);
}

/** Ce trait est-il le point qu'OpenStreetMap pose au milieu d'une agglomeration ? */
export function estLocalite(trait: TraitDeCarte): boolean {
  if (formeDe(trait) !== 'point') return false;
  return dans(CLASSES_LOCALITE as readonly string[], classesDe(trait.proprietes));
}

/** Ce trait est-il une rue d'habitation relevee et nommee ? */
export function estRueHabitee(trait: TraitDeCarte): boolean {
  if (formeDe(trait) !== 'ligne') return false;
  if (!porteUnNom(trait)) return false;
  return dans(CLASSES_RUE as readonly string[], classesDe(trait.proprietes));
}

/** Ce trait est-il un service nomme — mairie, poste, cafe, ecole, pharmacie ? */
export function estPointInteret(trait: TraitDeCarte): boolean {
  if (formeDe(trait) !== 'point') return false;
  if (estLocalite(trait)) return false;
  if (!porteUnNom(trait)) return false;
  const classes = classesDe(trait.proprietes);
  if (classes.length === 0) return false;
  /* UN SEUL CHAMP NATUREL SUFFIT A ECARTER LE POINT. On refuse des que l'une de ses classes
   * parle de nature, plutot que d'exiger qu'elles en parlent toutes : un sommet nomme ne doit
   * pas passer parce qu'un second champ porte autre chose. */
  return !dans(CLASSES_POINT_NATUREL as readonly string[], classes);
}

/** Ce trait suffit-il a lui seul ? */
export function signeDecisif(trait: TraitDeCarte): boolean {
  return estZoneHabitee(trait) || estLocalite(trait);
}

/**
 * COMBIEN DE PREUVES D'AGGLOMERATION la carte montre-t-elle autour du vehicule ?
 *
 * Rendu separement d'`estEnAgglomeration` pour pouvoir etre LU : quand le client dit << ca
 * clignote encore a cinq cents metres a tel endroit >>, c'est ce chiffre qu'il faut regarder, et
 * non un booleen qui ne dit pas pourquoi.
 *
 * Un signe decisif rend `PREUVES_MIN` et arrete le comptage : il n'y a rien a ajouter a << nous
 * sommes dans le polygone de la ville >>.
 */
export function preuvesAgglomeration(traits: readonly TraitDeCarte[]): number {
  let total = 0;
  for (const trait of traits) {
    if (signeDecisif(trait)) return PREUVES_MIN;
    if (estBatiment(trait)) {
      total += PREUVE_BATIMENT;
      continue;
    }
    if (estRueHabitee(trait)) {
      total += PREUVE_RUE;
      continue;
    }
    if (estPointInteret(trait)) {
      total += PREUVE_POINT_INTERET;
      continue;
    }
  }
  return total;
}

/**
 * Le vehicule est-il en agglomeration, d'apres ce que la carte montre autour de lui ?
 *
 * On rend `false` quand on ne voit rien, et non `null` : l'absence de tout bati, de toute rue
 * nommee et de tout service n'est pas une ignorance, c'est le dehors. Le cas << je ne sais pas
 * ou je suis >> est deja traite ailleurs, par la limite inconnue qui ramene a cinquante metres —
 * voir `seuilClignotementM`.
 */
export function estEnAgglomeration(traits: readonly TraitDeCarte[]): boolean {
  return preuvesAgglomeration(traits) >= PREUVES_MIN;
}
