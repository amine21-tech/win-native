/**
 * LES TROIS PROFILS D'ITINERAIRE EN VOITURE, ET LE MODE PIETON — point 5 du 21 novembre.
 *
 * CE QUE LE CLIENT A CONSTATE, ET C'EST MESURE : << sur un trajet vers l'aeroport d'Alger, le GPS
 * affichait 10-11 km alors que le conducteur etait a 2 km. Cause : use_highways trop eleve ->
 * Valhalla evite les secondaires meme si plus courtes. >>
 *
 * POURQUOI CE FICHIER EXISTE, ET N'IMPORTE NI FASTIFY NI LA CONFIGURATION. Ces reglages sont des
 * NOMBRES qui decident de la route que prend une voiture. Un 1 laisse a la place d'un 0,5 ne
 * provoque aucune erreur, ne ralentit rien, et ne se voit que sur la route — en kilometres
 * inutiles, chez un conducteur qui n'a pas de moyen de savoir que le reglage est en cause. Un
 * tel defaut doit etre attrape par une machine, pas par un test sur le terrain. Isoles ici, les
 * trois profils s'eprouvent par `verifier-profils-itineraire.ts` sans serveur, sans base et sans
 * moteur Valhalla.
 *
 * CE QUE LE DOCUMENT APPELLE << les 3 boutons UI existants >>. Il n'y en avait que DEUX dans
 * cette application : le troisieme (<< plus court >>) avait ete fondu dans les deux autres en
 * octobre. On le remet, et il devient le defaut — c'est la demande, et c'est aussi le reglage
 * qui corrige le detour de l'aeroport.
 */

/** Le choix du conducteur. `court` est le defaut depuis le 21 novembre. */
export type ProfilItineraire = 'court' | 'autoroute' | 'sansAutoroute';

export const PROFILS: readonly ProfilItineraire[] = ['court', 'autoroute', 'sansAutoroute'];

export const PROFIL_DEFAUT: ProfilItineraire = 'court';

/**
 * Le profil a appliquer, pour une requete qui peut venir d'une application plus ancienne.
 *
 * UNE APPLICATION DEJA INSTALLEE N'ENVOIE QUE `autoroute`, et elle doit obtenir exactement ce
 * qu'elle obtenait avant la mise a jour : le nouveau defaut ne lui est pas applique. C'est le
 * seul endroit ou cette traduction a lieu.
 */
export function profilDe(input: {
  profil?: ProfilItineraire;
  autoroute: boolean;
}): ProfilItineraire {
  if (input.profil) return input.profil;
  return input.autoroute ? 'autoroute' : 'sansAutoroute';
}

/**
 * LE FERRY N'EXISTE PAS DANS CE PAYS. Valhalla accepte le ferry a 0,5 par defaut et peut donc
 * proposer une traversee ; la valeur est posee a 0 dans les trois profils plutot qu'une seule
 * fois ailleurs, parce que le document la nomme et qu'un reglage qu'on ne voit pas dans le
 * profil finit par etre supprime par quelqu'un qui le croit inutile.
 */
const SANS_FERRY = { use_ferry: 0 } as const;

/**
 * << ROUTES CARROSSABLES UNIQUEMENT >> — maintenant une REGLE, et non plus une preference.
 *
 * Jusqu'ici on penalisait les pistes avec `use_tracks: 0.1` : un curseur, donc une preference
 * que le moteur peut negocier contre quelques minutes gagnees. Le document demande
 * `exclude_unpaved: true`, et c'est mieux : la documentation de Valhalla dit que la route << est
 * autorisee a COMMENCER et a FINIR sur du non revetu, mais pas a en avoir au MILIEU >>. C'est
 * exactement la distinction qu'on cherchait a obtenir avec 0,1 sans y arriver vraiment — on peut
 * toujours conduire quelqu'un chez lui au bout d'un chemin de terre, et plus jamais lui proposer
 * une piste comme raccourci.
 *
 * ON GARDE AUSSI LES ANCIENS CURSEURS. Deux raisons. `exclude_unpaved` ne couvre que le
 * revetement : une voie de desserte (parking, allee de ferme) est souvent goudronnee et reste un
 * faux raccourci, d'ou les penalites de desserte. Et si le moteur en service est plus ancien que
 * l'option, il IGNORE SILENCIEUSEMENT ce qu'il ne connait pas — les curseurs restent alors la
 * seule protection. Les deux ensemble ne se contredisent pas : ils disent la meme chose, l'un
 * en regle et l'autre en preference.
 */
const CARROSSABLE = {
  exclude_unpaved: true,
  use_tracks: 0.1,
  service_penalty: 120,
  service_factor: 1.3,
} as const;

/**
 * Les reglages de cout pour un profil donne.
 *
 * `use_tolls` SUIT TOUJOURS L'AUTOROUTE, et ce n'est pas un raccourci : le seul peage d'Algerie
 * est sur l'autoroute Est-Ouest. Refuser l'autoroute, c'est refuser son peage ; l'accepter a
 * 0,5, c'est accepter de le payer quand il fait gagner du temps.
 */
export function optionsAuto(profil: ProfilItineraire) {
  switch (profil) {
    /**
     * LE PLUS COURT — le nouveau defaut, et le correctif du detour de l'aeroport.
     *
     * `shortest: true` classe les itineraires par DISTANCE et non par duree. C'est la ligne qui
     * repare le trajet decrit par le client : a 2 km de l'aeroport, la route la plus rapide
     * passait par l'autoroute et faisait 10 km ; la plus courte fait 2 km par les secondaires.
     *
     * `use_highways: 0.5` n'est pas un compromis mou, c'est le sens meme du choix : << autoroutes
     * OK si vraiment plus courtes >>. A 1 le moteur va la chercher ; a 0 il la fuit meme quand
     * elle est le chemin direct. A 0,5 il la prend si elle est sur le trajet.
     */
    case 'court':
      return { ...SANS_FERRY, ...CARROSSABLE, shortest: true, use_highways: 0.5, use_tolls: 0.5 };

    /* CE QUE `shortest: true` FAIT AUX AUTRES REGLAGES, ET C'EST A SAVOIR AVANT D'Y TOUCHER.
     *
     * La documentation de Valhalla est explicite sur cette option : << Note, this will disable
     * all other costings & penalties >>, et plus bas << will solely use distance as cost and
     * disregard all other costs, penalties and factors >>.
     *
     * Donc, dans CE profil et dans celui-la seulement :
     *   - `use_highways: 0.5` et `use_tolls: 0.5` sont tres probablement IGNORES. Ils restent
     *     ecrits parce que le document les nomme, et parce qu'ils redeviendraient actifs si
     *     `shortest` partait un jour — mais il ne faut pas compter sur eux ici. Ce n'est pas
     *     grave : a distance egale, le plus court passe de toute facon par l'autoroute quand
     *     elle est le chemin direct, ce qui est exactement l'intention du client.
     *   - `use_tracks` et les penalites de desserte sont IGNORES eux aussi. Une voie de
     *     desserte goudronnee peut donc servir de raccourci dans ce profil.
     *   - `exclude_unpaved` n'est PAS un cout mais une AUTORISATION (<< not allowed to have them
     *     in the middle of the route path >>), et devrait donc survivre. La documentation ne le
     *     dit pas noir sur blanc : c'est la seule incertitude de ce fichier, et elle se mesure
     *     sur le moteur en service plutot que de se deviner ici.
     *
     * POURQUOI ON GARDE QUAND MEME `shortest`. Le client le demande par ecrit, et c'est la ligne
     * qui repare le trajet de l'aeroport : `use_highways: 0.5` seul classerait encore par DUREE,
     * et la route de 10 km par l'autoroute resterait la plus rapide. Sans `shortest`, le defaut
     * ne corrige pas ce qu'il est cense corriger. */

    /** AVEC AUTOROUTE — le plus rapide, inchange par rapport a ce que faisait le bouton. */
    case 'autoroute':
      return { ...SANS_FERRY, ...CARROSSABLE, shortest: false, use_highways: 1, use_tolls: 0.5 };

    /**
     * SANS AUTOROUTE — inchange lui aussi.
     *
     * Chez Valhalla, 0 veut dire << evite autant que possible >> et non << interdit >> : la
     * documentation previent qu'une autoroute est parfois le seul moyen d'achever un trajet. On
     * ne peut donc pas promettre au conducteur qu'il n'en verra aucune, et c'est la limite du
     * moteur, pas un reglage a corriger.
     */
    case 'sansAutoroute':
      return { ...SANS_FERRY, ...CARROSSABLE, shortest: false, use_highways: 0, use_tolls: 0 };
  }
}

/**
 * CONTOURNEMENT D'UNE ROUTE BLOQUEE : LA HIERARCHIE DU CLIENT (point 12, 28 octobre).
 *
 * << 1er choix Route Nationale, 2e l'autoroute si la RN y mene naturellement, 3e la route de
 * wilaya, JAMAIS un chemin secondaire, une piste ou une voie non classee. >>
 *
 * CE PROFIL IGNORE LE CHOIX DU CONDUCTEUR, sauf pour le peage, et c'est voulu : la route normale
 * n'est plus praticable, et le detour doit etre une route qu'une berline passe. Ce n'est pas une
 * preference de confort.
 *
 * `shortest` reste FAUX ici, a l'oppose du nouveau defaut, et il faut le dire parce que c'est
 * contre-intuitif : un contournement par la nationale est plus long en kilometres et plus court
 * en minutes qu'un raccourci de terre. Pour un detour impose, le temps est le meilleur juge de
 * la praticabilite — alors que pour un trajet choisi, c'est la distance que le conducteur juge.
 */
export function optionsBlocage(profil: ProfilItineraire) {
  return {
    ...SANS_FERRY,
    exclude_unpaved: true,
    use_highways: 0.8,
    use_tolls: profil === 'sansAutoroute' ? 0 : 0.5,
    use_tracks: 0,
    use_living_streets: 0,
    service_penalty: 600,
    service_factor: 3,
  };
}

/**
 * A PIED, LE CHEMIN LE PLUS COURT, SANS RESTRICTION DE CIRCULATION (point 17, puis point 5C).
 *
 * Les reglages par defaut de Valhalla sont ceux d'un promeneur prudent : il paie une penalite
 * pour emprunter une ruelle (`alley_factor` 2) et surtout une allee privee (`driveway_factor` 5),
 * evite les marches, et optimise le TEMPS. Un pieton algerien qui coupe par une ruelle ne fait
 * rien d'autre que marcher droit : on ramene ces facteurs a 1, on retire la penalite de marche
 * et on demande explicitement la plus courte distance.
 *
 * LES SENS INTERDITS N'ONT JAMAIS CONCERNE LE PIETON : Valhalla ne les lui applique pas, et le
 * document le dit lui-meme (<< Valhalla ignore automatiquement les oneway=yes pour pedestrian >>).
 * Il n'y a donc rien a regler pour obtenir ce qu'il demande a cette ligne.
 *
 * CE QUE LE DOCUMENT DEMANDE ET QUI N'EST PAS ENVOYE : `use_roads: 1.0`. Ce curseur existe chez
 * Valhalla, mais pour le VELO — il dit la volonte de rouler au milieu des voitures. Le cout d'un
 * pieton ne le lit pas, et un moteur ignore en silence une option qu'il ne connait pas : l'envoyer
 * ne ferait rien, tout en laissant croire a qui relit ce fichier que la question est reglee ici.
 * Elle l'est par les deux paragraphes ci-dessus. Le jour ou Valhalla l'ajoute au pieton, cette
 * remarque dira quoi faire.
 *
 * LES ROUTES BARREES PAR VOTE NE S'APPLIQUENT PAS AU PIETON (point 5B) — ce n'est pas ici que
 * cela se joue mais a l'envoi de la requete, ou `exclude_locations` est desormais omis en mode
 * pieton. Le document est explicite : << NE PAS appliquer applyReportedClosures() quand
 * costing = 'pedestrian' >>. Une route fermee aux voitures se traverse a pied.
 */
export function optionsPieton() {
  return {
    /**
     * 5,0 km/h : LA VALEUR DU DOCUMENT DU 21 NOVEMBRE, ET ELLE EN REMPLACE UNE AUTRE.
     *
     * On etait a 4,5 depuis le portage, parce que c'est ce que le site v83 utilisait et que
     * l'application doit coincider avec lui. Le client ecrit maintenant 5,0. Entre une valeur
     * reprise du site et une valeur ecrite noir sur blanc dans la derniere synthese, c'est la
     * seconde qui tranche — et l'ecart ne change que l'heure d'arrivee annoncee de quelques
     * secondes par kilometre, jamais le chemin emprunte.
     */
    walking_speed: 5.0,
    /* `shortest` : on classe par DISTANCE et non par duree. A pied c'est la meme chose pour le
     * marcheur, et cela ecarte les grands contournements bien plats. */
    shortest: true,
    /* Ruelles, allees et voies de desserte : plus aucune penalite. Ce sont precisement les
     * raccourcis que le client demande, en ville comme en dehors. */
    alley_factor: 1,
    driveway_factor: 1,
    service_penalty: 0,
    service_factor: 1,
    /* Un trottoir ou un sentier plutot que le bord d'une route a voitures. */
    walkway_factor: 0.9,
    step_penalty: 0,
  };
}
