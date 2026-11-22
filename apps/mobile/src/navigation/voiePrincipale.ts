/**
 * << VIA A1 · AUTOROUTE >> — LA ROUTE PAR LAQUELLE UN ITINERAIRE PASSE — point D du correctif v2.
 *
 * CE QUE LE CLIENT DEMANDE, ET POURQUOI IL A RAISON DE LE DEMANDER.
 *
 *   << Ajouter une mention de route sous chaque alternative : Le plus rapide / 38 min / Via A1 ·
 *   Autoroute — Alternatif / 1 h / Via RN5 — Alternatif / 1 h 10 / Via CW. Meme logique que
 *   Waze / Google Maps. >>
 *
 * La fiche affichait trois alternatives decrites par leur seule duree : << 38 min >>, << 1 h >>,
 * << 1 h 10 >>. Un conducteur algerien ne choisit pas un trajet sur sa duree annoncee — il la
 * sait fausse des qu'il y a un barrage ou un marche — il le choisit sur la ROUTE. << Par la
 * nationale >> et << par l'autoroute >> ne sont pas deux fois le meme trajet a vingt minutes
 * pres : ce sont deux decisions differentes, et jusqu'ici l'ecran n'en disait rien.
 *
 * POURQUOI CE CALCUL VIT DANS UN MODULE SANS UNE LIGNE DE REACT NATIVE. C'est la raison de
 * toujours : une regle qui tranche entre plusieurs candidats a des cas limites qu'aucun essai
 * au doigt ne rencontre — un itineraire dont aucune route n'est nommee, un nom qui ne couvre
 * que deux cents metres du trajet, deux routes qui en couvrent autant l'une que l'autre. Ecrite
 * ici, elle s'eprouve par `scripts/verifier-voie-principale.ts` sans telephone.
 */

/** Ce dont le calcul a besoin d'une manoeuvre, et rien de plus. */
export type TronconNomme = {
  /** Nom de la voie tel que Valhalla le rend — souvent vide en Algerie. */
  streetName: string;
  /** Longueur du troncon, en metres. */
  distanceM: number;
  /** Valhalla marque les manoeuvres d'autoroute et de voie rapide. */
  surAutoroute?: boolean;
};

/**
 * PART MINIMALE DU TRAJET QU'UNE ROUTE DOIT COUVRIR POUR LUI DONNER SON NOM.
 *
 * Sans ce seuil, un trajet de cinquante kilometres dont une seule rue est nommee s'annoncerait
 * << Via rue des Freres Bouadou >> : c'est vrai, et c'est faux de tout ce qui compte. La rue du
 * depart est presque toujours nommee quand le reste de la route ne l'est pas, ce qui est
 * exactement le cas le plus trompeur.
 *
 * Un quart du trajet : c'est la part en dessous de laquelle une route n'est plus << par ou on
 * passe >> mais << par ou on commence >>. Au-dela, on prefere ne rien dire — une mention absente
 * laisse la duree parler, une mention fausse envoie choisir le mauvais trajet.
 */
export const PART_MINIMALE = 0.25;

/**
 * La route qui donne son nom a un itineraire, et si elle est une voie rapide.
 *
 * Rend un nom VIDE quand aucune route ne s'impose : c'est un resultat normal en Algerie, ou la
 * majorite des voies n'ont pas de nom dans OpenStreetMap, et l'affichage doit alors montrer la
 * duree seule plutot qu'une ligne vide.
 */
export function voiePrincipale(troncons: readonly TronconNomme[]): {
  nom: string;
  surAutoroute: boolean;
} {
  /* ON CUMULE PAR NOM, ON NE PREND PAS LE PLUS LONG TRONCON. Une nationale traversee par six
   * ronds-points arrive decoupee en sept manoeuvres de deux kilometres ; l'autoroute, elle,
   * tient en une seule manoeuvre de quinze. Comparer les troncons un a un couronnerait
   * l'autoroute meme quand les quarante-deux kilometres de nationale la depassent. */
  const parNom = new Map<string, { metres: number; autoroute: number }>();
  let total = 0;

  for (const t of troncons) {
    const metres = Number.isFinite(t.distanceM) && t.distanceM > 0 ? t.distanceM : 0;
    total += metres;
    const nom = t.streetName.trim();
    if (nom === '' || metres === 0) continue;
    const cumul = parNom.get(nom) ?? { metres: 0, autoroute: 0 };
    cumul.metres += metres;
    /* On retient les metres faits SUR voie rapide, et non un simple oui/non : un nom peut
     * couvrir une bretelle marquee autoroute et trente kilometres de nationale. */
    if (t.surAutoroute === true) cumul.autoroute += metres;
    parNom.set(nom, cumul);
  }

  if (total <= 0) return { nom: '', surAutoroute: false };

  let meilleur = '';
  let meilleurMetres = 0;
  let meilleurAutoroute = 0;
  for (const [nom, cumul] of parNom) {
    /* A EGALITE STRICTE, LE PREMIER RENCONTRE GAGNE (`>` et non `>=`), et c'est celui qui est
     * le plus proche du depart : entre deux routes qui se partagent le trajet a parts egales,
     * celle par laquelle on commence est celle que le conducteur reconnaitra. */
    if (cumul.metres > meilleurMetres) {
      meilleur = nom;
      meilleurMetres = cumul.metres;
      meilleurAutoroute = cumul.autoroute;
    }
  }

  if (meilleurMetres / total < PART_MINIMALE) return { nom: '', surAutoroute: false };
  /* << Via A1 · Autoroute >> : la mention ne s'ajoute que si la route EST une voie rapide sur
   * l'essentiel de ce qu'elle couvre, pas parce qu'on y a pris une bretelle. */
  return { nom: meilleur, surAutoroute: meilleurAutoroute * 2 > meilleurMetres };
}
