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
 * ET QUAND ELLE EST INCONNUE, ON APPLIQUE 50 — CORRECTION DU POINT E DU CORRECTIF v2, qui
 * renverse ce qui etait ecrit ici le 22 novembre.
 *
 *   << Cause : Valhalla retourne maxSpeed = -1 sur les segments non tagues -> le clignotement ne
 *   se declenche pas. Fallback : si maxSpeed = -1 -> appliquer 50 m par defaut (agglomeration
 *   supposee). Mieux vaut clignoter a 50 m sur une route nationale non taguee que ne pas
 *   clignoter du tout. >>
 *
 * On avait choisi 500, et le raisonnement etait : annoncer trop tot fait perdre un peu
 * d'attention, annoncer trop tard fait rater la sortie. Le client tranche dans l'autre sens, et
 * ce qui fait pencher la balance est une mesure, pas une preference : CE CAS EST RARE CHEZ NOUS.
 * `useSpeedLimit` interroge d'abord les tuiles Valhalla, et a defaut DEDUIT la limite de la
 * classe de la route lue sur la carte (motorway 120, trunk et primary 100, tertiary 80,
 * residential et minor 50...). Il ne rend donc `null` que dans deux situations : la carte n'est
 * pas encore prete, ou le vehicule n'est sur aucune route reconnue. Dans les deux, << on ne sait
 * pas ou l'on est >> — et 50 m est alors la valeur prudente, celle qui ne promet rien.
 *
 * (La ligne du 22 novembre qui disait ici que `useSpeedLimit` << ne devine jamais >> etait
 * fausse : la deduction par classe de route existe depuis le 79e correctif. C'est elle qui rend
 * ce renversement sans danger.)
 *
 * CE QUI N'EST PAS TOUCHE : le clignotement lui-meme — son rythme, son opacite, les fleches qui
 * s'y synchronisent. << NE PAS MODIFIER la logique de clignotement existante. >> Cette fonction
 * ne rend qu'un nombre de metres.
 *
 * LA CONDITION DE GRAND AXE, ELLE, A QUITTE LA GRANDE FLECHE au correctif v2 : voir
 * PanneauDirection.tsx, qui porte la raison. Elle reste sur la rangee de voies.
 */

/** Au-dessus de ce chiffre, on est hors agglomeration. Valeur du document. */
export const LIMITE_AGGLO_KMH = 50;
/** Les deux seuils d'anticipation, en metres. Valeurs du document. */
export const ANTICIPATION_AGGLO_M = 50;
export const ANTICIPATION_RASE_M = 500;

export function distanceAnticipation(limiteKmh: number | null | undefined): number {
  /* LIMITE INCONNUE : 50 M, << AGGLOMERATION SUPPOSEE >> (point E du correctif v2). Un `null`,
   * un `undefined`, un NaN et le `-1` que le document cite passent tous par ici — ce sont
   * quatre facons de dire la meme chose, et aucune ne doit se lire comme une route rapide. */
  if (typeof limiteKmh !== 'number' || !Number.isFinite(limiteKmh) || limiteKmh <= 0) {
    return ANTICIPATION_AGGLO_M;
  }
  return limiteKmh <= LIMITE_AGGLO_KMH ? ANTICIPATION_AGGLO_M : ANTICIPATION_RASE_M;
}
