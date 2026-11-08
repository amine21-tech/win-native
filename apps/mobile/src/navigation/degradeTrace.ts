/**
 * Degrade du trace de navigation : progression ET trafic, en un seul degrade.
 *
 * POURQUOI UNE SEULE FONCTION PLUTOT QUE DEUX COUCHES SUPERPOSEES. MapLibre ne sait pas melanger
 * deux `line-gradient` sur la meme ligne, et poser une seconde ligne par-dessus ferait un
 * bourrelet a chaque raccord. On compose donc les deux informations dans le meme degrade : la
 * couleur d'un point est celle de son bouchon s'il y en a un, sinon celle de sa progression.
 *
 * LA METHODE. On ne balaie pas la ligne, on ne calcule que les POINTS DE RUPTURE — le vehicule,
 * et les deux bords de chaque bande de trafic. Entre deux ruptures la couleur ne change pas, et
 * MapLibre interpole. Une dizaine de paliers suffit donc a decrire un trajet de 300 km.
 *
 * CE FICHIER EST SEPARE DE L'ECRAN POUR POUVOIR ETRE EPROUVE. Les paliers d'une interpolation
 * doivent croitre STRICTEMENT : un seul palier qui ne progresse pas fait rejeter la couche
 * ENTIERE par MapLibre, et le trace disparait — sans message, sans erreur, sans rien. Le defaut
 * ne se verrait que sur un telephone, en pleine navigation. Voir scripts/verifier-degrade.ts.
 */

/** Ecart minimal entre deux paliers : assez petit pour que la transition paraisse nette. */
export const COUPURE = 0.0008;

/**
 * LONGUEUR DE LA QUEUE DE COMETE, en fraction du trajet. Valeur du client (3 novembre).
 *
 * Au-dela, le trace deja parcouru est completement transparent ; juste derriere le vehicule il
 * atteint son opacite maximale. C'est ce qui donne l'impression d'une comete : une tete pleine
 * qui avance, une trainee qui s'efface.
 *
 * CINQ POUR CENT DU TRAJET, ET NON UNE DISTANCE FIXE. C'est ce qu'ecrit le client, et c'est
 * discutable — sur trois cents kilometres la trainee fait quinze kilometres, sur deux
 * kilometres elle fait cent metres. Mais a l'ecran la carte suit le vehicule et le zoom change
 * avec la vitesse : une fraction du trajet donne justement une trainee de longueur a peu pres
 * CONSTANTE a l'ecran, la ou une distance fixe serait invisible sur un long trajet et
 * envahissante sur un court.
 */
export const QUEUE_COMETE = 0.05;

/**
 * Opacite maximale de la trainee, juste derriere le vehicule.
 *
 * Elle ne monte pas a 1 : la trainee doit se distinguer du trace a parcourir, sans quoi on ne
 * verrait plus ou l'on en est — ce qui est tout l'interet de l'effet.
 *
 * LE CORRECTIF DU 8 NOVEMBRE DEMANDE 0,08, ET ON NE L'APPLIQUE PAS. C'est le seul point de ce
 * document qu'on laisse de cote, et la raison est ecrite dans ce depot : la trainee EST DEJA
 * DESCENDUE a 8 %, en octobre. Le chemin parcouru devenait alors une fenetre sur le fond de
 * carte, la nationale jaune d'OpenStreetMap reparaissait dessous, et le client l'a signale en
 * ces termes — << la ligne jaune transparait sous la ligne verte >>. C'est pour cela qu'elle a
 * ete remontee le 23 octobre.
 *
 * Le document se contredit d'ailleurs lui-meme : sa maquette montre une trainee vert clair
 * bien visible, que 8 % d'opacite ne donneraient jamais. La couleur demandee, #B4E6D2, est
 * appliquee exactement ; c'est ce seul nombre qui reste a 0,6. Une ligne a changer si le client
 * confirme vouloir vraiment 8 %.
 */
export const OPACITE_QUEUE = 0.6;

/**
 * Couleur hexadecimale diluee en rgba(). MapLibre n'accepte pas de teinter une couleur dans une
 * expression : il faut lui donner la couleur DEJA diluee.
 *
 * ELLE REFUSE CE QUI N'EST PAS UNE COULEUR HEXADECIMALE, et ce controle a une histoire.
 *
 * Jusqu'au 8 novembre cette fonction vivait dans l'ecran, sans controle. On lui a passe par
 * erreur une couleur deja au format `rgba(...)` : `parseInt('gba(13, 110, 79, 1)', 16)` rend
 * NaN, et NaN decale a droite vaut zero. Elle rendait donc `rgba(0, 0, 0, o)` — du NOIR — pour
 * toute la trainee derriere le vehicule, pendant trois versions, sans la moindre erreur.
 *
 * Une exception est brutale, et c'est le but. Un plantage avec un message clair se voit en dix
 * secondes ; une trainee noire sur une carte sombre ne se voit pas du tout. Les seuls appelants
 * passent des constantes de ROUTE_COLORS, donc le cas ne peut survenir que si quelqu'un refait
 * exactement la meme faute.
 */
export function rgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(
      `rgba() attend une couleur hexadecimale #rrggbb, et a recu « ${hex} ». ` +
        'Une couleur deja diluee ne doit pas etre rediluee : elle sortirait noire.',
    );
  }
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type BandeTrafic = { debut: number; fin: number; couleur: string };

/** Une liste de paliers, telle que MapLibre l'attend : position, couleur, position, couleur… */
export type Paliers = (number | string)[];

export function paliersDuTrace(
  parcouru: string,
  avant: string,
  fait: number,
  bandes: BandeTrafic[],
  /** Applique une opacite a une couleur. Reçoit 0 pour transparent, 1 pour opaque. */
  teinter: (couleur: string, opacite: number) => string,
): Paliers {
  /**
   * OPACITE DE LA TRAINEE A LA POSITION x.
   *
   * Derriere le vehicule et au-dela de la queue : transparent — le trace parcouru disparait.
   * Dans la queue : montee lineaire jusqu'a l'opacite maximale, atteinte au vehicule.
   * Devant : opaque, toujours. C'est la demande centrale du client — << le degrade apparait
   * aussi DEVANT la fleche, trace flou et illisible >>.
   */
  const opaciteEn = (x: number): number => {
    if (x > fait) return 1;
    const debutQueue = fait - QUEUE_COMETE;
    if (x <= debutQueue) return 0;
    if (QUEUE_COMETE <= 0) return OPACITE_QUEUE;
    return ((x - debutQueue) / QUEUE_COMETE) * OPACITE_QUEUE;
  };

  const couleurEn = (x: number): string => {
    const bande = bandes.find((b) => x >= b.debut && x <= b.fin);
    const base = bande ? bande.couleur : x <= fait ? parcouru : avant;
    return teinter(base, opaciteEn(x));
  };

  const bornes = new Set<number>([0, 1]);
  if (fait > 0) {
    /* LES TROIS BORNES DE LA COMETE : la fin du transparent, la tete de la trainee, et le
     * premier point devant le vehicule. Sans la premiere, MapLibre interpolerait depuis le
     * debut du trajet et la trainee ferait toute la longueur de la route. */
    bornes.add(fait - QUEUE_COMETE);
    bornes.add(fait);
    bornes.add(fait + COUPURE);
  }
  for (const b of bandes) {
    bornes.add(b.debut - COUPURE);
    bornes.add(b.debut);
    bornes.add(b.fin);
    bornes.add(b.fin + COUPURE);
  }

  const paliers: Paliers = [];
  let dernier = -1;
  for (const brut of [...bornes].sort((a, b) => a - b)) {
    const x = Math.min(1, Math.max(0, brut));
    if (x <= dernier) continue;
    dernier = x;
    paliers.push(x, couleurEn(x));
  }
  return paliers;
}
