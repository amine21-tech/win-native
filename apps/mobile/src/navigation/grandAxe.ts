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

/**
 * LE SEUIL DE CLIGNOTEMENT DES DEUX FLECHES — correctif Fleches (document du 23 novembre).
 *
 *   << REGLE FINALE — Non negociable. Grande fleche + Petite fleche = meme fonction
 *   getBlinkThreshold(). Fonctionne pour TOUTE direction : gauche, droite, tout droit — TOUTE
 *   destination. 50 m agglo · 500 m route nationale hors agglo + autoroute. Supprimer toute
 *   valeur hardcodee. >>
 *
 * `distanceAnticipation`, juste au-dessus, ne connait que la limite de vitesse. Elle a tenu
 * tant que la limite disait ou l'on est — et les trois bugs du document sont trois cas ou elle
 * ne le dit pas :
 *
 *   BUG 1  RN 68 en ville, taguee 100 km/h dans OpenStreetMap. La limite dit << rase
 *          campagne >> au milieu des maisons. C'est `agglomeration` qui tranche, en regardant
 *          le bati autour du vehicule — voir agglomeration.ts.
 *   BUG 3  Sortie d'autoroute sans `maxspeed` : la limite est inconnue, et le repli prudent de
 *          cinquante metres est ici le pire des choix. C'est `classeRoute` qui tranche.
 *
 * (Le bug 2 — << certaines destinations : aucun clignotement, petite fleche absente >> — ne se
 * corrige pas ici : il venait d'un filtre de grand axe qui restait sur la rangee de voies.
 * Voir LaneGuidance.tsx.)
 *
 * ================================================================================
 * L'ORDRE DES QUESTIONS EST CELUI DU DOCUMENT — RELANCE v3, 25 NOVEMBRE
 * ================================================================================
 *
 *   << isUrban() = true -> 50 m IMMEDIATEMENT · Peu importe maxSpeed, peu importe roadClass. >>
 *   << if (step.isUrban()) return 50.0 doit etre la PREMIERE ligne de getBlinkThreshold(). >>
 *
 * CET ORDRE EST DESORMAIS APPLIQUE A LA LETTRE, et il faut dire ce que cela change et ce que
 * cela coute, parce que c'est un renversement.
 *
 * L'AUTOROUTE PASSAIT EN PREMIER JUSQU'ICI, ET LA RAISON ETAIT CELLE-CI : une autoroute qui
 * traverse une ville — l'A1 a Birtouta, la rocade sud d'Alger — clignote maintenant a cinquante
 * metres. A cent dix kilometres a l'heure, cinquante metres font une seconde et demie : ni le
 * temps de se rabattre, ni celui de lire la fleche. Cet ecart avait ete pose volontairement, et
 * il avait ete SIGNALE au client comme un ecart.
 *
 * LE CLIENT A TRANCHE, ET SA DECISION EST APPLIQUEE. Il a renvoye la regle mot pour mot apres
 * qu'elle lui a ete signalee : l'agglomeration passe donc avant tout le reste. Le cas qui le
 * motive — une nationale taguee 100 km/h au milieu d'une ville, devant six carrefours — est
 * celui qu'il rencontre REELLEMENT a chaque essai, deux documents de suite ; l'autoroute
 * urbaine, lui, est un cas que nous avons imagine et qu'il n'a pas rapporte. Entre une gene
 * supposee et un defaut constate, on corrige le defaut constate.
 *
 * CE QUI PROTEGE L'AUTOROUTE, DESORMAIS, C'EST LA DETECTION ELLE-MEME : une autoroute en rase
 * campagne ne porte ni rue nommee, ni commerce, ni bati a cent cinquante metres, donc
 * `agglomeration` y est faux et la question 1 ne se declenche pas. Ce qui veut dire que la
 * JUSTESSE de agglomeration.ts porte maintenant tout le poids de cette regle — c'est pour cela
 * que ce fichier-la exige trois preuves, et non une.
 *
 * Les sept cas de sa liste de controle sont rejoues dans scripts/verifier-fleches-synchro.ts.
 */

/** Classes de route d'OpenMapTiles qui valent une voie rapide. Les bretelles (`motorway_link`)
 *  arrivent ici deja debarrassees de leur suffixe — voir useSpeedLimit. */
export const CLASSES_VOIE_RAPIDE = ['motorway', 'trunk'] as const;

/**
 * Sommes-nous sur une autoroute ou une voie rapide ?
 *
 * Deux chemins independants, et c'est voulu : `surAutoroute` est le drapeau `highway` que
 * Valhalla pose sur la manoeuvre, `classeRoute` est ce que la carte affiche sous le vehicule.
 * Le premier manque sur les troncons mal tagues, le second manque quand la carte n'est pas
 * encore prete. Il suffit que l'un des deux parle.
 */
export function estVoieRapide(
  surAutoroute: boolean | null | undefined,
  classeRoute: string | null | undefined,
): boolean {
  if (surAutoroute === true) return true;
  if (!classeRoute) return false;
  return (CLASSES_VOIE_RAPIDE as readonly string[]).includes(classeRoute.toLowerCase());
}

/** Ce que l'on sait du troncon sous le vehicule, au moment de la manoeuvre. */
export type TronconCourant = {
  /** Limite reglementaire, en km/h. `null` quand ni les panneaux ni la carte ne l'ont dite. */
  limiteKmh?: number | null;
  /** Classe de route lue sur la carte : `motorway`, `trunk`, `primary`, `minor`... */
  classeRoute?: string | null;
  /** Du bati autour du vehicule ? Voir `estEnAgglomeration`. */
  agglomeration?: boolean | null;
  /** Drapeau `highway` de la manoeuvre Valhalla. */
  surAutoroute?: boolean | null;
};

/**
 * Classes de route qui valent la rase campagne SANS etre des voies rapides.
 *
 * `primary` est la classe d'OpenMapTiles pour la plupart des nationales algeriennes — celles
 * que Valhalla ne marque pas. Le document du client lui donne sa propre ligne, apres
 * l'autoroute : << primary -> 500 m >>.
 */
export const CLASSES_GRAND_AXE = ['primary'] as const;

/** Cette classe de route est-elle celle d'une nationale, au sens des tuiles ? */
export function estClassePrimaire(classeRoute: string | null | undefined): boolean {
  if (!classeRoute) return false;
  return (CLASSES_GRAND_AXE as readonly string[]).includes(classeRoute.toLowerCase());
}

/** A quelle distance de la manoeuvre les DEUX fleches commencent a clignoter, en metres. */
export function seuilClignotementM(troncon: TronconCourant): number {
  /* 1. EN AGGLOMERATION : CINQUANTE METRES, IMMEDIATEMENT.
   *
   *    << isUrban() = true -> 50 m IMMEDIATEMENT · Peu importe maxSpeed, peu importe
   *    roadClass >>. C'est la premiere ligne de la fonction parce que le document l'exige comme
   *    la premiere ligne, et parce que c'est le seul ordre qui corrige le bug rapporte deux fois
   *    de suite : une nationale taguee 100 km/h EN VILLE (RN 68 a Jijel, CW 158 a Azeffoun).
   *    Voir la note en tete de fichier pour ce que ce choix coute sur l'autoroute urbaine. */
  if (troncon.agglomeration === true) return ANTICIPATION_AGGLO_M;

  const limite = troncon.limiteKmh;
  const limiteConnue = typeof limite === 'number' && Number.isFinite(limite) && limite > 0;

  /* 2. LIMITE AU-DESSUS DE CINQUANTE : on est dehors, et la limite le dit. */
  if (limiteConnue && limite > LIMITE_AGGLO_KMH) return ANTICIPATION_RASE_M;

  /* 3. AUTOROUTE ET VOIE RAPIDE, meme sans limite taguee — c'est le bug 3, la sortie
   *    d'autoroute sans `maxspeed` ou le repli prudent serait le pire des choix. */
  if (estVoieRapide(troncon.surAutoroute, troncon.classeRoute)) return ANTICIPATION_RASE_M;

  /* 4. NATIONALE, meme sans limite taguee : << primary -> 500 m >>. */
  if (estClassePrimaire(troncon.classeRoute)) return ANTICIPATION_RASE_M;

  /* 5. TOUT LE RESTE : cinquante metres. Cela couvre la limite de ville (50 km/h tague) et le
   *    cas << rien de sur >>, << agglomeration supposee >> du point E du correctif v2. Mieux
   *    vaut clignoter trop tard sur une route qu'on ne reconnait pas que promettre un carrefour
   *    a cinq cents metres sans savoir lequel. */
  return ANTICIPATION_AGGLO_M;
}
