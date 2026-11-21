import type { ReportKind } from '../shared';

/**
 * QUAND PEUT-ON SIGNALER UNE ROUTE BARREE ? — point C du 18 novembre.
 *
 * << Pour eviter les faux signalements a une intersection, le bouton "Route barree" et
 * "Chemin sans issue" est DESACTIVE jusqu'a ce que l'utilisateur ait parcouru au minimum
 * 20 metres dans le segment de navigation. >>
 *
 * POURQUOI CETTE CONDITION, ET POURQUOI ELLE NE VAUT QUE POUR CES BOUTONS-LA.
 *
 * Un signalement de blocage ne fait pas qu'afficher une icone : confirme par un second
 * temoin, il SORT LE TRONÇON des calculs d'itineraire, pour tout le monde. C'est le seul type
 * de signalement qui modifie le trajet des autres conducteurs.
 *
 * Or au moment precis ou l'on franchit une intersection, l'application ne sait pas encore
 * laquelle des routes on a prise — le calage sur le trace a une precision de l'ordre de la
 * dizaine de metres. Un appui a cet instant attache le blocage au mauvais tronçon, et peut
 * fermer une route parfaitement ouverte. Vingt metres suffisent a lever le doute.
 *
 * LES AUTRES BOUTONS RESTENT ACTIFS — bouchon, accident, radar, dos d'ane. Ils informent sans
 * detourner : un bouchon attache au mauvais tronçon se corrige tout seul en quelques minutes,
 * une route fermee a tort ne se corrige pas.
 *
 * SEPARE POUR ETRE EPROUVE : ce module ne connait ni React ni l'ecran. Voir
 * scripts/verifier-signalement-blocage.ts.
 */

/** Distance minimale a parcourir dans le segment. Valeur du document. */
export const MIN_SEGMENT_M = 20;

/**
 * Distance deja parcourue dans le segment de navigation en cours, en metres.
 *
 * Valhalla donne la LONGUEUR de chaque manoeuvre — la distance qu'on parcourt en la suivant —
 * et le suivi donne ce qu'il en RESTE. La difference est ce qu'on a deja fait.
 *
 * `null` quand on ne navigue pas, ou quand l'une des deux valeurs manque : on ne devine pas.
 */
export function avanceDansSegmentM(
  longueurSegmentM: number | null | undefined,
  resteM: number | null | undefined,
): number | null {
  if (longueurSegmentM == null || resteM == null) return null;
  /* LE RESTE PEUT DEPASSER LA LONGUEUR d'un metre ou deux, le temps que le suivi se cale sur
   * un nouveau segment. On borne a zero plutot que de rendre un nombre negatif, qui ferait
   * passer le bouton pour actif a l'instant meme ou il doit etre bloque. */
  return Math.max(0, longueurSegmentM - resteM);
}

/**
 * LES TYPES ENCORE SOUMIS A LA CONDITION DES VINGT METRES — vide depuis le 21 novembre.
 *
 * LE CLIENT A RETIRE LES DEUX SEULS QUI Y ETAIENT, ET IL FAUT DIRE LAQUELLE DE SES DEUX
 * DEMANDES L'EMPORTE.
 *
 * Le 18 novembre, point C : << le bouton "Route barree" et "Chemin sans issue" est DESACTIVE
 * jusqu'a ce que l'utilisateur ait parcouru au minimum 20 metres dans le segment >>.
 *
 * Le 21 novembre, point 2 : << Ces deux signalements sont grises et non cliquables pendant la
 * navigation active — alors qu'ils devraient rester disponibles. [...] Pourtant c'est
 * precisement pendant la navigation qu'on tombe sur un barrage et veut le signaler. >> Et la
 * consigne est nominative : << On retire uniquement Barrage et Route barree de cette
 * exclusion. >>
 *
 * CE QUE CELA ANNULE EXACTEMENT, ET C'EST PLUS QUE CE QUE LE DOCUMENT CROIT. Le document
 * suppose que d'autres cartes sont grisees et demande de n'en liberer que deux. Dans cette
 * application, les types qui attendaient vingt metres etaient EXACTEMENT ceux-la — `block`
 * (route barree) et `police` (barrage) : voir KINDS_BLOQUANTS. Il n'existe pas de carte
 * << chemin sans issue >>. Liberer ces deux-la supprime donc la condition ENTIEREMENT.
 *
 * CE QUI PROTEGE ENCORE DES FAUX SIGNALEMENTS. La condition des vingt metres n'etait pas la
 * seule garde, et ce n'etait meme pas la principale : un blocage ne sort un tronçon des
 * itineraires qu'apres DEUX signalements d'appareils DIFFERENTS. Un appui mal place a une
 * intersection n'a donc jamais ferme une route a lui seul — il attendait un second temoin au
 * meme endroit, ce qui est improbable pour une route ouverte. Le client arbitre entre une
 * protection partielle et un bouton qui refuse de repondre au moment ou le conducteur en a
 * besoin ; sa demande est coherente avec la facon dont le reste du dispositif est construit.
 *
 * LA LISTE RESTE, VIDE ET NOMMEE. Y remettre `'block'` suffirait a retablir la regle du
 * 18 novembre, et le reste du module — la mesure de l'avance, les tests — n'a pas bouge. C'est
 * ce qui permet de revenir sur la decision sans la reconstruire.
 */
export const KINDS_SOUS_CONDITION: readonly ReportKind[] = [];

/**
 * Ce type de signalement peut-il etre pose maintenant ?
 *
 * HORS NAVIGATION, TOUT EST PERMIS, et ce n'est pas un oubli : la condition protege d'une
 * confusion entre deux tronçons d'un ITINERAIRE. Sans itineraire il n'y a pas de confusion
 * possible — un conducteur arrete devant une route barree doit pouvoir la signaler.
 */
export function signalementAutorise(
  kind: ReportKind,
  enNavigation: boolean,
  avanceM: number | null,
): boolean {
  if (!KINDS_SOUS_CONDITION.includes(kind)) return true;
  if (!enNavigation) return true;
  /* AVANCE INCONNUE : on autorise. Un bouton grise sans raison visible, sur une donnee qu'on
   * n'a pas su lire, est pire qu'un signalement douteux — le conducteur croit l'application
   * cassee et cesse de signaler. */
  if (avanceM == null) return true;
  return avanceM >= MIN_SEGMENT_M;
}
