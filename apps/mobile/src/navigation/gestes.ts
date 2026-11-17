/**
 * GESTES DE CONDUITE : quelle manoeuvre Valhalla correspond a quel mouvement du volant.
 *
 * POURQUOI CE FICHIER EXISTE A PART, sans React. La table vit ici pour pouvoir etre EPROUVEE
 * hors de l'application : importer le composant qui la dessine tire react-native-svg, puis
 * React Native, et aucun script ne peut plus la charger. Une fleche qui montre la mauvaise
 * direction est pourtant le defaut le plus grave d'une application de navigation — elle ne
 * plante pas, elle ne ralentit rien, elle est simplement fausse, et le conducteur la croit.
 *
 * Meme raison que alerteApproche.ts et traceGeometrie.ts.
 */

/** Les six gestes que la main connait. */
export type Geste = 'tout-droit' | 'gauche' | 'droite' | 'legere-gauche' | 'legere-droite' | 'demi-tour';

/**
 * Manoeuvre Valhalla -> geste.
 *
 * Les numeros viennent de DirectionsLeg_Maneuver_Type, le meme tableau que celui des phrases
 * (voir instructions.ts). Tout ce qui n'est pas enumere est un « tout droit » : c'est le geste
 * qui ne fait rien faire, donc le moins dangereux a montrer par erreur.
 */
const GESTES: Record<number, Geste> = {
  2: 'droite', // depart vers la droite
  3: 'gauche',
  /* LA DESTINATION A UN COTE, ET LA FLECHE L'IGNORAIT — trouve le 18 novembre en confrontant
   * la table des gestes a celle des phrases, type par type.
   *
   * Le bandeau disait << Votre destination est sur la droite >> en dessinant une fleche qui
   * MONTE. Les deux tableaux sont justes pris separement ; personne ne les avait compares, et
   * le defaut ne se voit qu'a l'arrivee, au moment ou l'on cherche ou se garer. C'est
   * exactement le defaut que le client decrit — une fleche qui contredit sa phrase. */
  5: 'droite', // destination a droite
  6: 'gauche',
  9: 'legere-droite',
  10: 'droite',
  11: 'droite', // droite serree
  12: 'demi-tour',
  13: 'demi-tour',
  14: 'gauche', // gauche serree
  15: 'gauche',
  16: 'legere-gauche',
  18: 'droite', // sortie a droite
  19: 'gauche',
  20: 'droite', // rester a droite
  21: 'gauche',
  23: 'droite',
  24: 'gauche',
  27: 'droite',
};

export function gesteDeManoeuvre(type: number): Geste {
  return GESTES[type] ?? 'tout-droit';
}
