import type { ReportKind } from '../shared';

/**
 * Ordre et emoji du menu de signalement, repris de la grille `.am-grid` en
 * v83 (jam, crash, block, police, flood, fire, bump, object, radar, pothole).
 * Aucun equivalent emoji exact n'existe pour radar/dos d'ane/trou (des icones
 * dessinees a la main en v83) : choix les plus lisibles au premier coup d'oeil.
 */
/* Les trois forces n'occupent qu'UNE case du menu.
 *
 * J'avais d'abord donne une case a chacune : trois pastilles cote a cote, un seul appui pour
 * signaler. Le client a tranche autrement, et sa maquette a raison sur un point que je n'avais
 * pas vu — trois cases sur onze, pour une seule realite, deseequilibrent la grille entiere : le
 * barrage occupait un quart du menu, l'accident un onzieme.
 *
 * Une case, trois ecussons a l'interieur, et le choix de la force se fait DANS la case. Le
 * modele de donnees, lui, ne change pas : trois types distincts en base, chacun avec sa
 * couleur sur la carte. */
/**
 * LE MENU SE RANGE EN TROIS SECTIONS — maquette du 13 novembre.
 *
 * CE QUE LES SECTIONS APPORTENT A UNE GRILLE DE DOUZE CASES. Douze cartes d'affilee se lisent
 * en les parcourant toutes : au volant, on cherche << accident >> en passant devant le radar,
 * le trou et l'inondation. Trois titres coupent cette lecture en trois listes de deux a sept,
 * et la question qu'on se pose en signalant — est-ce la circulation, la route, ou autour ? —
 * trouve sa reponse avant qu'on ait lu une seule case.
 *
 * LES DOUZE TYPES SONT TOUS GARDES. La maquette n'en montre que sept ; decision prise avec
 * arsanne le 13 novembre : on prend ses sections, pas sa selection. Retirer le radar, le dos
 * d'ane, le trou, l'inondation et l'incendie reviendrait a rendre insignalables des choses que
 * des conducteurs signalent deja, et dont la base est pleine.
 *
 * L'ORDRE DE SA MAQUETTE EST RESPECTE LA OU ELLE SE PRONONCE — Bouchon puis Accident, Barrage
 * puis Travaux puis Route barree puis Objet. Nos cinq types supplementaires viennent apres,
 * dans la section ou ils ont leur place.
 */
export type SectionMenu = { cle: string; types: ReportKind[] };

export const SECTIONS_MENU: SectionMenu[] = [
  /* CE QUI RALENTIT OU ARRETE LA CIRCULATION, sans que la route elle-meme soit en cause. */
  { cle: 'circulation', types: ['jam', 'crash'] },
  /* LA ROUTE ELLE-MEME : ce qui la barre, l'abime ou s'y trouve. Le barrage ouvre la section,
   * comme sur la maquette. */
  { cle: 'route', types: ['police', 'works', 'block', 'object', 'bump', 'pothole', 'radar'] },
  /* CE QUI VIENT D'AUTOUR DE LA ROUTE et ne depend pas de la circulation. */
  { cle: 'environnement', types: ['waste', 'flood', 'fire'] },
];

/**
 * La meme liste, a plat, dans l'ordre d'affichage.
 *
 * ELLE EST DERIVEE ET NON RECOPIEE : deux listes a tenir a jour finissent toujours par
 * diverger, et le jour ou elles divergent un type disparait du menu sans que rien ne le dise.
 */
export const REPORT_MENU_ORDER: ReportKind[] = SECTIONS_MENU.flatMap((s) => s.types);

/**
 * GENRE ET NOMBRE DE CHAQUE TYPE, pour que la voix parle francais.
 *
 * On dit << travaux signalES >>, << inondation signalEE >>, << accident signalE >>. Sans cette
 * table, l'annonce aurait ete fautive une fois sur quatre — dite a voix haute, en boucle, a des
 * conducteurs. C'est la seule raison d'etre de ce tableau : il ne sert a rien d'autre qu'a
 * l'accord du participe.
 *
 * Les types ABSENTS sont masculins singuliers, qui est le cas le plus courant. Un type ajoute
 * demain sera donc annonce correctement sans qu'on y pense, et il suffit de l'inscrire ici le
 * jour ou son libelle est feminin ou pluriel. Voir phraseAnnonce dans useApproachAlerts.
 */
export const REPORT_GENRE: Partial<Record<ReportKind, 'm' | 'f' | 'pl'>> = {
  flood: 'f', // « Inondation »
  block: 'f', // « Route bloquee »
  works: 'pl', // « Travaux »
  waste: 'pl', // « Dechets sauvages »
};

/**
 * LA TABLE DES TROIS FORCES A ETE RETIREE le 9 novembre — << un barrage, ca reste un barrage >>.
 *
 * Elle donnait a POLICE, GEND. et ARMEE un ecusson et une couleur institutionnelle, affiches
 * dans la carte << Barrage >> du menu : il fallait choisir laquelle avant de signaler.
 *
 * POURQUOI ON N'EN DEMANDE PLUS. Le temoin ne sait pas toujours. On aperçoit un barrage a deux
 * cents metres ; distinguer un uniforme de gendarme d'un uniforme de policier a cette distance,
 * en roulant, est une precision qu'on n'a pas. Exiger le choix, c'est obtenir une reponse au
 * hasard — et un barrage annonce << gendarmerie >> alors qu'il est tenu par la police est une
 * information FAUSSE, ce qui est pire qu'une information absente. Le conducteur suivant le
 * decouvrira en arrivant, ce qui ne lui coute rien.
 *
 * LES TROIS TYPES RESTENT DANS REPORT_KINDS, et c'est deliberement. Des milliers de
 * signalements existants portent deja << gendarmerie >> ou << armee >> en base ; les retirer du
 * modele ferait rejeter leur lecture par la validation et les ferait disparaitre de la carte.
 * Ils ne sont simplement plus CREABLES depuis le menu. Sur la carte, ils etaient de toute facon
 * deja indistinguables — meme bleu, meme pictogramme (voir signalisation.ts).
 */

/**
 * Famille d'un signalement, qui decide de sa teinte dans le menu.
 *
 * Quatre familles, et la couleur n'est pas decorative : au volant, on choisit dans ce menu en
 * une seconde, sans lire. Le rouge appelle ce qui met en danger, l'ambre ce qui ralentit, le
 * bleu ce qui se contourne ou s'anticipe. `nouveau` ne dure que le temps qu'une fonction cesse
 * d'etre une nouveaute.
 */
export type ReportFamille = 'danger' | 'ralentit' | 'info' | 'nouveau';

export const REPORT_FAMILLE: Record<ReportKind, ReportFamille> = {
  crash: 'danger',
  fire: 'danger',
  object: 'danger',
  block: 'danger',
  flood: 'danger',
  jam: 'ralentit',
  bump: 'ralentit',
  pothole: 'ralentit',
  /* LES TRAVAUX NE SONT PLUS UNE NOUVEAUTE. Ils portaient le badge << Nouveau >> depuis le
   * 28 octobre ; onze jours et six versions plus tard, il ne dit plus rien d'utile et il
   * volerait l'attention au seul type qui vient reellement d'arriver. */
  works: 'ralentit',
  waste: 'nouveau',
  police: 'info',
  gendarmerie: 'info',
  armee: 'info',
  radar: 'info',
};

export const REPORT_EMOJI: Record<ReportKind, string> = {
  jam: '🚗',
  crash: '💥',
  block: '🚧',
  police: '🚓',
  flood: '🌊',
  fire: '🔥',
  bump: '〰️',
  object: '⚠️',
  radar: '📸',
  pothole: '🕳️',
  /* LES TROIS FORCES PARTAGENT LA VOITURE DE POLICE depuis le 13 novembre. Elles se
   * distinguaient par une casquette, un beret et une tenue de combat ; le menu ne demande plus
   * quelle force tient le barrage depuis le 9 novembre, et la maquette des douze symboles ne
   * montre qu'une voiture. Les trois types restent dans le modele pour que les signalements
   * deja en base continuent de s'afficher. */
  gendarmerie: '🚓',
  armee: '🚓',
  /* La grue, pas la barriere : << Route bloquee >> porte deja le chevalet de chantier, et deux
   * cases du meme menu affichaient le meme pictogramme. Sur la maquette du client, les deux se
   * distinguent au premier regard — c'est tout l'interet d'une image. */
  works: '🏗️',
  waste: '🗑️',
};

/**
 * BADGE POSE SUR UNE CARTE DU MENU.
 *
 * La maquette du panneau en montre deux, dans la meme pastille doree : << Nouveau >> sur les
 * dechets sauvages, et << MIS A JOUR >> sur Route barree. Le second ne dit pas qu'une carte
 * vient d'arriver, mais que son COMPORTEMENT a change — la note de bas de maquette l'explique :
 * << Route barree et Chemin sans issue : meme logique que Barrage. 2 votes utilisateurs
 * differents, s'ajoutent au calcul, recalcul proactif immediat. >>
 *
 * Cette regle-la est en place depuis le 2 novembre (blocageConfirme dans shared/constants.ts :
 * deux temoins, pas un) et le recalcul proactif vit dans index.tsx. Le badge ne cree donc rien ;
 * il DIT au conducteur que le signalement qu'il s'apprete a poser pese desormais sur le calcul
 * d'itineraire des autres. C'est une information qu'on ne pouvait pas deviner de la carte.
 *
 * UNE TABLE PLUTOT QU'UN BOOLEEN. Le badge etait deduit de REPORT_FAMILLE === 'nouveau' : une
 * famille servait a la fois a teinter et a badger, et ajouter un second libelle aurait demande
 * une famille << misAJour >> qui n'est pas une famille. Les deux notions se separent ici.
 */
export type ReportBadge = 'nouveau' | 'misAJour';

export const REPORT_BADGE: Partial<Record<ReportKind, ReportBadge>> = {
  waste: 'nouveau',
  block: 'misAJour',
};

/**
 * Pictogramme du MENU, quand il doit differer de celui de la carte.
 *
 * POURQUOI LES DEUX SURFACES DIVERGENT, ET CE N'EST PAS UNE NEGLIGENCE. La synthese du
 * 13 novembre tient en deux pages, et elles ne donnent pas les memes symboles aux memes types :
 *
 *                      page << 12 symboles sur la carte >>   page << panneau de signalement >>
 *   Bouchon                    voiture + souffle                   voiture + souffle
 *   Accident                      explosion                             gyrophare
 *   Barrage                    voiture de police                        chevalet
 *   Travaux                          grue                                marteau
 *   Route barree                   chevalet                         sens interdit
 *   Objet sur route               triangle                               carton
 *
 * J'ai d'abord cru a une contradiction, et la tentation etait de choisir une page. C'est en
 * regardant le BARRAGE que la logique apparait : sur la page carte il est une voiture de
 * police, parce que le chevalet y est deja pris par Route barree — deux pastilles identiques
 * sur une carte sont deux dangers qu'on ne distingue plus. Sur le panneau, les cartes portent
 * leur NOM ecrit dessous : le chevalet peut y dire << barrage >> sans ambiguite, et le sens
 * interdit dit mieux << route barree >> que ne le ferait un chevalet.
 *
 * Chaque page est donc juste POUR SA SURFACE, et on applique les deux. REPORT_EMOJI porte la
 * page carte (elle sert aussi a la carte d'alerte, qui doit montrer le meme symbole que le
 * marqueur qu'on vient de depasser) ; cette table porte la page panneau.
 *
 * LE BOUCHON gardait trois voitures en file, demandees le 28 octobre. Les deux pages de la
 * synthese montrent desormais une voiture et un souffle : la file disait << embouteillage >>,
 * le souffle dit << ca n'avance pas >>, et c'est le meme mot. On suit la derniere synthese.
 */
const MENU_SPECIFIQUE: Partial<Record<ReportKind, string>> = {
  jam: '🚗💨',
  crash: '🚨',
  police: '🚧',
  works: '🔨',
  block: '⛔',
  object: '📦',
};

export function menuEmoji(kind: ReportKind): string {
  return MENU_SPECIFIQUE[kind] ?? REPORT_EMOJI[kind];
}
