/**
 * LE MODE HORS LIGNE AUTOMATIQUE — point I du correctif v2 (22 novembre).
 *
 *   « Téléchargement silencieux des tuiles Algérie + Tunisie au premier lancement en Wi-Fi.
 *   Zoom 4 à 15. Bascule automatique quand le réseau tombe. 0 bouton, 0 action utilisateur.
 *   NE PAS MODIFIER l'interface existante. »
 *
 * ON FAIT EXACTEMENT CELA, SAUF LE ZOOM 15, ET IL FAUT DIRE POURQUOI AU CHIFFRE PRES.
 *
 * Une tuile de carte couvre, au zoom z, un carre de la grille mondiale de 2^z par 2^z cases.
 * Pour le rectangle qui contient l'Algerie et la Tunisie, le total CUMULE depuis le zoom 4 est
 * celui-ci, et la troisieme colonne compte a trente-cinq kilo-octets la tuile vectorielle, une
 * moyenne prudente pour OpenFreeMap :
 *
 *     zoom 4 a 10 :        5 056 tuiles        173 Mo
 *     zoom 4 a 11 :       19 693 tuiles        673 Mo
 *     zoom 4 a 12 :       77 277 tuiles      2 641 Mo
 *     zoom 4 a 15 :    4 895 718 tuiles      163 Go
 *
 * LE ZOOM 15 DEMANDE DONC CENT SOIXANTE-TROIS GIGAOCTETS. Ce n'est pas une estimation qu'on
 * pourrait serrer : meme a dix kilo-octets la tuile, il reste quarante-sept gigaoctets. Aucun
 * telephone ne les stocke, aucune ligne algerienne ne les telecharge << silencieusement >>, et
 * le serveur de tuiles couperait la connexion bien avant la fin.
 *
 * LE ZOOM 10 COUTE 5 056 TUILES, SOIT CENT SOIXANTE-TREIZE MEGAOCTETS - la taille d'une mise a
 * jour d'application, et c'est ce qu'on telecharge. Le zoom 11 en couterait quatre fois plus
 * pour un seul cran de detail : on s'arrete donc avant.
 *
 * CE QU'ON VOIT AU ZOOM 10 : le pays entier, les autoroutes, les routes nationales et
 * wilayales, les villes et les villages nommes. CE QU'ON N'Y VOIT PAS : le nom des rues d'un
 * quartier. Le choix n'est pas entre une bonne et une moins bonne carte ; il est entre une
 * carte du pays qui tient dans le telephone et une carte des rues qui n'y tient pas.
 *
 * ET LES RUES DE CHEZ SOI Y SONT QUAND MEME : le cache ordinaire de MapLibre garde les tuiles
 * fines qu'on a deja affichees. Le paquet couvre ce qu'on n'a jamais traverse, le cache couvre
 * ce qu'on traverse tous les jours.
 *
 * CE QUE LE MODE HORS LIGNE NE FAIT PAS, ET QU'IL FAUT AVOIR DIT AVANT LA ROUTE : il ne calcule
 * pas d'itineraire. Les itineraires viennent de Valhalla, sur le VPS ; sans reseau, la carte
 * s'affiche, la position bleue avance, un trajet DEJA calcule continue de guider — mais une
 * nouvelle destination reste sans reponse. Rendre le calcul local demanderait d'embarquer le
 * graphe routier algerien, qui pese plus que toutes les tuiles reunies.
 *
 * POURQUOI CE FICHIER NE SAIT RIEN DE REACT NATIVE. Les regles ci-dessous — quand telecharger,
 * combien cela coute, ou s'arreter — sont la seule partie qu'on peut eprouver sans telephone :
 * `npx tsx` charge ce module, pas un composant qui importe MapLibre. Le declenchement, lui, vit
 * dans useTuilesHorsLigne.ts.
 */

/**
 * LE RECTANGLE ALGERIE + TUNISIE, dans l'ordre que MapLibre attend : ouest, sud, est, nord.
 *
 * L'Algerie va de 8,68° ouest a 12,0° est et de 18,96° a 37,09° nord ; la Tunisie monte a
 * 37,6° nord et s'arrete a 11,6° est. Le rectangle qui contient les deux est donc celui-ci,
 * arrondi au dixieme de degre vers l'exterieur — un arrondi vers l'interieur laisserait une
 * bande de frontiere blanche, et c'est precisement la ou l'on roule sans reseau.
 */
export const BORNES_DZ_TN: readonly [number, number, number, number] = [-8.7, 18.9, 12.0, 37.6];

/** Le zoom le plus large : la vue d'ouverture de l'application est a 4,6. */
export const ZOOM_MIN = 4;

/**
 * Le zoom le plus fin qu'on telecharge.
 *
 * DIX, LA OU LE DOCUMENT ECRIT QUINZE, et le calcul est en tete de fichier : quinze
 * demanderait cent soixante-trois gigaoctets, onze en demanderait sept cents megaoctets pour un
 * cran de detail. Dix donne le reseau routier du pays pour cent soixante-treize megaoctets.
 *
 * C'EST LE SEUL CHIFFRE DU POINT I QUI S'ECARTE DU DOCUMENT, et il s'ecarte parce que l'autre
 * est impossible, non parce qu'il est inconfortable. Si le client prefere payer plus de place
 * pour un cran de detail, cette ligne et elle seule passe a 11 : tout le reste, la limite de
 * tuiles comprise, se recalcule a partir d'elle.
 */
export const ZOOM_MAX = 10;

/**
 * L'ETIQUETTE DU PAQUET, ecrite dans ses metadonnees.
 *
 * ET NON SON IDENTIFIANT, qu'on ne peut pas choisir : MapLibre le genere lui-meme, en UUID, au
 * moment de la creation. C'est donc a cette etiquette qu'on reconnait NOTRE paquet parmi ceux
 * que la base contient, et c'est elle qui empeche d'en recreer un a chaque lancement.
 */
export const PAQUET_ETIQUETTE = 'win-dz-tn';

/** Taille moyenne d'une tuile vectorielle OpenFreeMap, en octets. Mesure prudente. */
const OCTETS_PAR_TUILE = 35 * 1024;

/**
 * Nombre de tuiles d'un zoom pour le rectangle donne.
 *
 * LA LATITUDE NE SE DIVISE PAS LINEAIREMENT, et c'est l'erreur qu'on fait toujours ici : la
 * grille des tuiles est en projection de Mercator, ou un degre de latitude vaut d'autant moins
 * de tuiles qu'on s'eloigne de l'equateur. Compter `(nord - sud) / 180 * 2^z` donnerait pour
 * l'Algerie un tiers de tuiles en trop.
 */
export function tuilesDuZoom(
  zoom: number,
  bornes: readonly [number, number, number, number] = BORNES_DZ_TN,
): number {
  const [ouest, sud, est, nord] = bornes;
  const cotes = 2 ** zoom;
  const colonne = (lon: number) => Math.floor(((lon + 180) / 360) * cotes);
  const ligne = (lat: number) => {
    const phi = (lat * Math.PI) / 180;
    const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
    return Math.floor(y * cotes);
  };
  const largeur = colonne(est) - colonne(ouest) + 1;
  /* Le nord est en HAUT, donc sa ligne porte le plus petit numero : l'ordre de la soustraction
   * est l'inverse de celui des longitudes. */
  const hauteur = ligne(sud) - ligne(nord) + 1;
  return largeur * hauteur;
}

/** Nombre total de tuiles entre deux zooms, bornes comprises. */
export function tuilesTotales(
  zoomMin: number = ZOOM_MIN,
  zoomMax: number = ZOOM_MAX,
  bornes: readonly [number, number, number, number] = BORNES_DZ_TN,
): number {
  let total = 0;
  for (let z = zoomMin; z <= zoomMax; z += 1) total += tuilesDuZoom(z, bornes);
  return total;
}

/** Poids estime du paquet, en megaoctets. */
export function poidsEstimeMo(zoomMin: number = ZOOM_MIN, zoomMax: number = ZOOM_MAX): number {
  return (tuilesTotales(zoomMin, zoomMax) * OCTETS_PAR_TUILE) / (1024 * 1024);
}

/**
 * LA LIMITE DE TUILES A DEMANDER A MAPLIBRE.
 *
 * Sa valeur par defaut est de six mille tuiles, et ce n'est pas un hasard : au-dela, un
 * fournisseur de tuiles considere en general qu'on recopie sa carte. Au zoom 10, notre paquet
 * en demande 5 056, plus une marge d'un dixieme pour les glyphes et les polices que le style
 * reclame en plus des tuiles de donnees : 5 562, soit juste sous le plafond par defaut.
 *
 * ALORS POURQUOI APPELER `setTileCountLimit` DU TOUT ? Parce que la limite se calcule ici a
 * partir du zoom, et que le jour ou ZOOM_MAX passera a 11, le paquet en demandera nettement
 * plus de vingt mille. Sans cet appel, le telechargement s'arreterait de lui-meme a six mille
 * et laisserait une carte du nord sans le Sahara, sans erreur ni message : une panne qui se
 * decouvre a Tamanrasset. Avec lui, le changement d'un chiffre suffit.
 */
export function limiteTuiles(): number {
  return Math.ceil(tuilesTotales() * 1.1);
}

/** Ce que le telephone sait de son reseau, reduit a ce qui nous interesse. */
export type EtatReseau = {
  /** Vrai si et seulement si la connexion est un Wi-Fi. */
  wifi: boolean;
  /** Vrai si Internet est reellement joignable (un Wi-Fi d'hotel sans sortie ne l'est pas). */
  joignable: boolean;
};

/** Ou en est le paquet sur ce telephone. */
export type EtatPaquet = 'absent' | 'partiel' | 'complet';

/**
 * FAUT-IL LANCER OU REPRENDRE LE TELECHARGEMENT MAINTENANT ?
 *
 * LE WI-FI N'EST PAS UNE PRECAUTION DE CONFORT, c'est la condition que le client ecrit
 * lui-meme (« au premier lancement en Wi-Fi »), et elle est la seule chose qui rend ce point
 * acceptable : deux cents megaoctets preleves en silence sur un forfait algerien seraient un
 * degat, pas une fonctionnalite. Donc pas de Wi-Fi, pas de telechargement — jamais, et sans
 * message, puisque l'utilisateur n'a rien demande.
 *
 * UN PAQUET PARTIEL SE REPREND. C'est le cas ordinaire : on quitte la maison au milieu du
 * telechargement. MapLibre garde ce qu'il a, et `resume()` continue la ou il s'etait arrete.
 */
export function doitTelecharger(reseau: EtatReseau, paquet: EtatPaquet): boolean {
  if (paquet === 'complet') return false;
  return reseau.wifi && reseau.joignable;
}
