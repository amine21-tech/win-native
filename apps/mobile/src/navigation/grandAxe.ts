/**
 * << SOMMES-NOUS SUR UN GRAND AXE ? >> — correctif du 8 novembre, point 4.
 *
 * Le document demande que la voie recommandee clignote << sur autoroute ET ROUTE NATIONALE >>.
 * Le guidage de voie, lui, ne s'affichait que sur autoroute depuis le 3 novembre.
 *
 * LE PROBLEME : VALHALLA NE DIT PAS << NATIONALE >>. Il pose un seul drapeau de classe de
 * route, `highway`, qui couvre les `motorway` et les `trunk` d'OpenStreetMap. Beaucoup de
 * nationales algeriennes sont bien taguees `trunk` et entrent donc dedans — mais une large part
 * est taguee `primary`, et pour celles-la le drapeau est faux. Aucun autre champ de la reponse
 * ne porte la classe de la route.
 *
 * CE QU'IL DIT, EN REVANCHE, C'EST LE NOM. Et en Algerie le nom d'une nationale EST son
 * numero : << RN 12 >>, << N5 >>, << RN24 >>. C'est la seule information disponible, elle est
 * dans la reponse qu'on recoit deja, et elle est fiable dans le sens qui compte : un nom qui
 * ressemble a << RN 12 >> est une nationale a coup sur. L'inverse n'est pas vrai — une
 * nationale sans numero dans son nom ne sera pas reconnue — et c'est le bon sens de l'erreur :
 * on n'affiche pas un guidage de voie la ou on n'est pas sur, plutot que d'en afficher un
 * faux sur une rue de lotissement.
 *
 * Separe de l'ecran pour pouvoir etre eprouve : voir scripts/verifier-grand-axe.ts.
 */

/**
 * Noms de nationale algerienne, et uniquement eux.
 *
 * ACCEPTE : << RN 12 >>, << RN12 >>, << N 5 >>, << N5 >>, << Route Nationale 24 >>, et la
 * meme chose en arabe (<< الطريق الوطني 12 >>), avec un suffixe de direction eventuel
 * (<< RN 12 A >>).
 *
 * REFUSE : tout le reste, et notamment les deux pieges. << Rue Nationale >> sans numero n'est
 * pas une nationale — c'est un nom de rue courant en Algerie. Et << N >> seul suivi d'une
 * lettre (<< Nord >>, << Nouvelle ville >>) ne doit pas passer : d'ou le chiffre OBLIGATOIRE.
 */
const NATIONALE = /(^|[\s(,-])(rn|n|route\s+nationale|الطريق\s+الوطني)\s*-?\s*\d{1,3}([\sa-z]|$)/i;

/** Ce nom de voie designe-t-il une route nationale algerienne ? */
export function estNationale(nom: string | null | undefined): boolean {
  if (!nom) return false;
  return NATIONALE.test(nom.trim());
}

/**
 * La manoeuvre se fait-elle sur un GRAND AXE — autoroute, voie rapide ou nationale ?
 *
 * `surAutoroute` vient du drapeau `highway` de Valhalla ; `nomVoie` sert de second chemin pour
 * les nationales qu'il ne marque pas. Les deux sont volontairement independants : si Valhalla
 * se met un jour a marquer les `primary`, le premier suffira et le second ne genera pas.
 */
export function surGrandAxe(surAutoroute: boolean, nomVoie: string | null | undefined): boolean {
  return surAutoroute || estNationale(nomVoie);
}

/**
 * A QUELLE DISTANCE LA FLECHE DOIT COMMENCER A CLIGNOTER — point 6 du 22 novembre.
 *
 * << Probleme constate : les fleches clignotent 500 m avant meme sur une RN en ville, avec des
 * rues adjacentes. Resultat : anticipation trop precoce en ville, confusion avec les autres
 * carrefours. >>
 *
 *   RN en agglomeration  (maxspeed <= 50)   50 m
 *   RN hors agglomeration                  500 m
 *   Autoroute                              500 m
 *
 * LE CLIENT A RAISON, ET SON EXEMPLE LE MONTRE MIEUX QUE LA REGLE : la RN 12 traverse Draa El
 * Mizan. Cinq cents metres avant la sortie, on est encore au milieu du bourg, devant six ou
 * sept intersections — et la fleche qui clignote semble designer la premiere. Une fleche qui
 * annonce le mauvais carrefour est pire qu'une fleche fixe.
 *
 * D'OU VIENT LA VITESSE MAXIMALE, ET POURQUOI CE POINT EST FAISABLE ALORS QU'IL N'EN AVAIT PAS
 * L'AIR. La reponse `/route` de Valhalla ne porte ni `maxspeed` ni `urban` : j'avais d'abord
 * conclu que la source citee par le document n'existait pas chez nous. Elle existe, mais
 * ailleurs — `useSpeedLimit` la lit DEJA, par `GET /routing/speed-limit` sur les tuiles
 * Valhalla, et c'est elle qui alimente la pastille rouge de la colonne de gauche. Le chiffre
 * demande est donc a l'ecran depuis le 79e correctif ; il n'avait simplement jamais servi a
 * autre chose qu'a etre affiche.
 *
 * ET QUAND ELLE EST INCONNUE, ON GARDE 500. C'est le defaut du document lui-meme
 * (`?: 90.0 km/h`), et c'est le bon sens de l'erreur : annoncer trop tot une manoeuvre sur une
 * route de campagne fait perdre un peu d'attention, l'annoncer trop tard fait rater la sortie.
 * `useSpeedLimit` ne devine jamais — pas de limite connue, pas de pastille — si bien que
 * `null` arrive reellement, et souvent.
 *
 * CE QUI N'EST PAS TOUCHE : le clignotement lui-meme (son rythme, son opacite, les fleches qui
 * s'y synchronisent) et la condition de GRAND AXE. << uniquement le seuil de declenchement est
 * modifie, pas la logique de clignotement. >> Cette fonction ne rend qu'un nombre de metres.
 */

/** Au-dessus de ce chiffre, on est hors agglomeration. Valeur du document. */
export const LIMITE_AGGLO_KMH = 50;
/** Les deux seuils d'anticipation, en metres. Valeurs du document. */
export const ANTICIPATION_AGGLO_M = 50;
export const ANTICIPATION_RASE_M = 500;

export function distanceAnticipation(limiteKmh: number | null | undefined): number {
  if (typeof limiteKmh !== 'number' || !Number.isFinite(limiteKmh) || limiteKmh <= 0) {
    return ANTICIPATION_RASE_M;
  }
  return limiteKmh <= LIMITE_AGGLO_KMH ? ANTICIPATION_AGGLO_M : ANTICIPATION_RASE_M;
}
