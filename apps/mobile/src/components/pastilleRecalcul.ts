/**
 * QUAND LA PASTILLE << RECALCUL EN COURS >> DOIT-ELLE RESTER A L'ECRAN ?
 *
 * CE FICHIER EXISTE PARCE QUE LA REPONSE TIENT DANS DEUX NOMBRES ET QUE JE L'AI RATEE.
 *
 * La regle du client (correction C4 du 11 novembre) : la pastille se voit DEUX SECONDES au
 * moins. Un recalcul Valhalla aboutit souvent en quatre cents millisecondes ; sans minimum,
 * elle apparait et disparait avant que l'oeil ne l'ait trouvee, et le conducteur voit son
 * itineraire changer sans savoir qu'un calcul a eu lieu.
 *
 * LE DEFAUT DU 14 NOVEMBRE. La version precedente tenait dans un `useEffect` :
 *
 *     useEffect(() => {
 *       if (!visible) return;                                   // (1)
 *       setProlonge(true);
 *       const t = setTimeout(() => setProlonge(false), 2000);   // (2)
 *       return () => clearTimeout(t);                           // (3)
 *     }, [visible]);
 *
 * Elle marche tant que le calcul dure plus de deux secondes. Quand il est PLUS RAPIDE — le cas
 * courant — `visible` retombe a faux avant l'echeance. React rejoue alors l'effet : le
 * nettoyage (3) ANNULE le minuteur, puis le corps sort immediatement par (1). Le `setProlonge
 * (false)` de (2) n'est jamais appele. `prolonge` reste vrai pour toujours, et la pastille ne
 * s'efface plus jamais.
 *
 * Elle collait donc d'autant plus surement que le calcul etait RAPIDE. C'est ce qu'arsanne a vu
 * en changeant de destination en pleine navigation : la pastille << Recalcul en cours >> restee
 * a l'ecran en permanence, alors que le nouvel itineraire, lui, etait bien arrive.
 *
 * CE QUE CE MODULE CHANGE. On ne retient plus un drapeau que quelqu'un doit penser a baisser,
 * mais une ECHEANCE — un instant au-dela duquel la pastille n'a plus de raison d'etre. Une
 * echeance depassee est vraie toute seule, sans que personne ait a faire quoi que ce soit, et
 * un nettoyage d'effet ne peut pas l'oublier.
 *
 * ET IL EST ISOLE DE REACT NATIVE pour etre reellement EPROUVE : aucun import, aucun composant.
 * Le controle (scripts/verifier-pastille-recalcul.ts) rejoue de vraies chronologies, dont celle
 * qui a casse, et constate ce qui se passe. Lire le code ne suffisait pas — je l'avais lu.
 */

/** Duree minimale d'affichage, en millisecondes. Valeur du document : deux secondes. */
export const DUREE_MINIMALE_MS = 2_000;

/**
 * Etat de la pastille. `jusqua` vaut 0 quand aucune echeance ne court.
 *
 * Il ne contient PAS << est-elle visible >> : cela se deduit, et un etat qui se deduit ne peut
 * pas se desynchroniser de ce dont il se deduit.
 */
export type EtatPastille = { jusqua: number };

export const PASTILLE_ETEINTE: EtatPastille = { jusqua: 0 };

/**
 * Nouvel etat quand le calcul est EN COURS ou vient de se terminer.
 *
 * `calculEnCours` est l'etat reel de la session ; `maintenant` est l'heure. Tant que le calcul
 * tourne, l'echeance est repoussee : la pastille ne peut pas s'effacer sous un calcul vivant.
 */
export function suivante(etat: EtatPastille, calculEnCours: boolean, maintenant: number): EtatPastille {
  if (calculEnCours) return { jusqua: maintenant + DUREE_MINIMALE_MS };
  /* LE CALCUL EST FINI, ET L'ECHEANCE SURVIT. C'est tout l'objet de ce module : la pastille
   * reste le temps qui lui restait, puis s'efface d'elle-meme. */
  return etat.jusqua > maintenant ? etat : PASTILLE_ETEINTE;
}

/** La pastille se voit-elle ? */
export function visible(etat: EtatPastille, calculEnCours: boolean, maintenant: number): boolean {
  return calculEnCours || etat.jusqua > maintenant;
}

/**
 * Dans combien de temps faut-il redessiner ? `null` quand il n'y a rien a attendre.
 *
 * C'est ce que le composant arme en `setTimeout`. Le rendre ici plutot que de le calculer dans
 * le composant permet de verifier qu'il ne vaut JAMAIS zero ni un nombre negatif — un minuteur
 * a zero se rearmerait en boucle a chaque image.
 */
export function prochainReveil(etat: EtatPastille, calculEnCours: boolean, maintenant: number): number | null {
  if (calculEnCours || etat.jusqua <= maintenant) return null;
  return etat.jusqua - maintenant;
}
