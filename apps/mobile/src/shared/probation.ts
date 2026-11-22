// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------
/**
 * ROUTES SANS ISSUE ET TRAVAUX : BLOCAGE AUTOMATIQUE, PUIS LEVEE AUTOMATIQUE.
 *
 * Point H du correctif v2 (22 novembre), et c'est le seul point du document qui ajoute une
 * MECANIQUE entiere plutot qu'une correction. Le texte, en entier :
 *
 *   PHASE 1 — Blocage automatique
 *     « 2 utilisateurs DIFFERENTS signalent le meme segment (chemin sans issue / travaux).
 *     Condition : chaque utilisateur a depasse le segment de 10 m (preuve qu'il l'a vecu).
 *     Apres 2 signalements -> segment bloque automatiquement pour TOUS les utilisateurs.
 *     Recalcul d'itineraire automatique pour tout utilisateur route via ce segment. »
 *
 *   PHASE 2 — Levee automatique (sans dependre des reporters)
 *     « Les 2 reporters originaux ne sont PAS notifies — ils ne repasseront peut-etre jamais
 *     par la. Apres 7 jours (travaux) ou 30 jours (chemin sans issue) -> segment provisoirement
 *     rouvert. Les 2 prochains utilisateurs qui empruntent ce segment recoivent la question en
 *     temps reel : "Cette route est-elle praticable ?" Oui / Non. 2 x Oui -> segment
 *     definitivement debloque. 1 x Non -> re-bloque, delai repart. Pas de reponse apres 48 h ->
 *     debloque automatiquement. Maximum 1 question par utilisateur par evenement — jamais de
 *     relance. »
 *
 * LA PHASE 1 EXISTAIT DEJA AUX TROIS QUARTS, et il faut le dire avant d'ajouter quoi que ce
 * soit : depuis le 28 octobre, deux temoins independants (TEMOINS_BLOCAGE) confirment un
 * signalement << route barree >> et le segment sort de tous les calculs d'itineraire ; depuis le
 * 11 novembre, tout conducteur route par la recalcule en silence. Ce qui manquait a la phase 1
 * est la PREUVE DES 10 METRES, et elle seule.
 *
 * LA PHASE 2 EST ENTIEREMENT NOUVELLE. Jusqu'ici un blocage confirme restait jusqu'a ce que
 * deux conducteurs votent << plus la >>. Une route rouverte dont personne ne repasse — c'est le
 * cas d'un cul-de-sac, par definition — restait donc coupee indefiniment.
 *
 * TOUT SE CALCULE A LA LECTURE, SANS TACHE PLANIFIEE, et ce n'est pas une economie de moyens :
 * c'est la regle de ce serveur depuis le premier jour (<< les signalements temporaires expires
 * sont exclus a la lecture plutot que supprimes par une tache de fond : rien a planifier, rien a
 * oublier >>, routes/reports.ts). Une tache qui tourne toutes les heures sur le VPS serait une
 * piece de plus a surveiller, et un blocage leve avec une heure de retard serait invisible.
 * Ici, l'etat d'un blocage est une FONCTION de sa date et des reponses recues.
 *
 * CE FICHIER NE SAIT RIEN DE REACT NI DE POSTGRES : c'est ce qui permet de rejouer les six
 * situations de la phase 2 dans un terminal, et c'est la lecon du 18 novembre — une regle
 * ecrite dans une requete SQL ne peut pas etre eprouvee avant la mise en ligne.
 */
import type { ReportKind } from './constants';

/**
 * Jours de blocage avant reouverture provisoire, pour des TRAVAUX.
 *
 * Sept, du document. Un chantier de voirie algerien dure rarement moins d'une semaine et
 * rarement plus d'un mois ; sept jours est le moment ou il vaut la peine d'aller voir.
 */
export const JOURS_TRAVAUX = 7;

/**
 * Jours de blocage avant reouverture provisoire, pour un CHEMIN SANS ISSUE ou une route barree.
 *
 * Trente, du document. Un cul-de-sac ne se rouvre pas tout seul : le delai est long parce que
 * l'information a de bonnes chances d'etre encore vraie. Mais il n'est pas infini, parce qu'un
 * portail ouvert, une route achevee ou un signalement errone existent aussi.
 */
export const JOURS_SANS_ISSUE = 30;

/** Heures de reouverture provisoire sans reponse au bout desquelles on debloque. */
export const PROBATION_HEURES = 48;

/** Reponses << oui, c'est praticable >> qui debloquent definitivement. */
export const OUI_POUR_DEBLOQUER = 2;

/** Nombre maximal de conducteurs a qui l'on pose la question, par evenement. */
export const QUESTIONS_PAR_EVENEMENT = 2;

/**
 * Metres a depasser au-dela du point pour que le signalement compte comme VECU.
 *
 * Dix, du document : << chaque utilisateur a depasse le segment de 10 m (preuve qu'il l'a
 * vecu) >>. C'est le meme ordre de grandeur que MANOEUVRE_RATEE_M, et pour une raison voisine :
 * dix metres de route parcourus ne s'expliquent pas par l'imprecision du GPS, alors que dix
 * metres d'ecart lateral, si.
 *
 * CE QUE CELA ECARTE : le signalement depose depuis un fauteuil, ou depuis la voiture arretee
 * trois cents metres avant, par quelqu'un qui croit savoir. Ce que cela n'ecarte pas : le
 * mensonge d'un conducteur qui a reellement roule la. Rien ne l'ecarte, et c'est pour cela que
 * le seuil des deux temoins reste.
 */
export const PREUVE_PASSAGE_M = 10;

/**
 * Rayon, en metres, dans lequel on considere qu'un conducteur EMPRUNTE le segment.
 *
 * Soixante metres : assez pour attraper un conducteur qui passe a vitesse normale entre deux
 * mesures GPS (a 50 km/h, une seconde fait quatorze metres), assez peu pour ne pas interroger
 * celui qui roule sur la route parallele. En dessous de quarante, un passage a 90 km/h pourrait
 * ne jamais produire une seule mesure a l'interieur du cercle.
 */
export const RAYON_QUESTION_M = 60;

/** Jours de blocage avant reouverture provisoire, selon le type de signalement. */
export function joursReouverture(kind: ReportKind): number {
  return kind === 'works' ? JOURS_TRAVAUX : JOURS_SANS_ISSUE;
}

/**
 * Les trois etats d'un blocage confirme.
 *
 *   `bloque`    — exclu des itineraires, comme avant le point H.
 *   `probation` — provisoirement rouvert : les itineraires repassent par la, et les deux
 *                 prochains conducteurs recoivent la question.
 *   `degage`    — definitivement rouvert : le signalement quitte la carte.
 */
export type PhaseBlocage = 'bloque' | 'probation' | 'degage';

/** Date souple : l'API rend des chaines, les tests manipulent des Date. */
export type DateSouple = Date | string | number | null | undefined;

function enDate(valeur: DateSouple): Date | null {
  if (valeur == null) return null;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isFinite(d.getTime()) ? d : null;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * OU EN EST UN BLOCAGE CONFIRME ?
 *
 * `bloqueLe` est l'instant ou le deuxieme temoin l'a confirme — et, apres un << non >>, celui
 * ou le delai a REPARTI. C'est ainsi que << 1 x Non -> re-bloque, delai repart >> est exprime :
 * non pas par un compteur de refus, mais en remettant la date de depart a l'instant du refus.
 * Une seule valeur porte donc tout l'etat, et il n'y a pas deux chemins pour la meme situation.
 *
 * `oui` est le nombre de reponses << praticable >> recues DEPUIS cette date (c'est la requete
 * qui s'en charge : les reponses anterieures appartiennent au cycle precedent).
 *
 * `bloqueLe` absent veut dire << pas encore confirme >> : on repond `bloque`, qui est l'etat
 * qu'avait ce signalement avant le point H. Il n'est de toute facon pas exclu des itineraires
 * tant que ses deux temoins ne sont pas la.
 */
export function phaseBlocage(args: {
  kind: ReportKind;
  bloqueLe: DateSouple;
  oui: number;
  maintenant: Date;
}): PhaseBlocage {
  const depart = enDate(args.bloqueLe);
  if (!depart) return 'bloque';
  if (args.oui >= OUI_POUR_DEBLOQUER) return 'degage';

  const debutProbation = depart.getTime() + joursReouverture(args.kind) * JOUR_MS;
  const t = args.maintenant.getTime();
  if (t < debutProbation) return 'bloque';
  /* << Pas de reponse apres 48 h -> debloque automatiquement. >> Les quarante-huit heures
   * courent depuis la REOUVERTURE PROVISOIRE, et non depuis la premiere question posee : sinon
   * un segment que personne n'emprunte n'aurait jamais de premiere question, et resterait en
   * probation pour toujours — exactement le defaut que la phase 2 corrige. */
  if (t >= debutProbation + PROBATION_HEURES * 60 * 60 * 1000) return 'degage';
  return 'probation';
}

/** Instant de la reouverture provisoire, ou `null` si le blocage n'est pas confirme. */
export function debutProbation(kind: ReportKind, bloqueLe: DateSouple): Date | null {
  const depart = enDate(bloqueLe);
  return depart ? new Date(depart.getTime() + joursReouverture(kind) * JOUR_MS) : null;
}

/**
 * CE SIGNALEMENT SORT-IL LES ITINERAIRES DE SON SEGMENT ?
 *
 * Seul l'etat `bloque` exclut. << Segment provisoirement rouvert >> veut dire que les trajets y
 * repassent : c'est la condition meme pour que deux conducteurs l'empruntent et repondent.
 */
export function exclutLesItineraires(phase: PhaseBlocage): boolean {
  return phase === 'bloque';
}

/**
 * FAUT-IL POSER LA QUESTION A CE CONDUCTEUR, MAINTENANT ?
 *
 * Quatre conditions, et chacune vient du document :
 *
 *   - le segment est en reouverture provisoire ;
 *   - on n'a pas deja recu les deux reponses attendues (<< les 2 prochains utilisateurs >>) ;
 *   - cet appareil n'a jamais repondu sur ce signalement (<< maximum 1 question par utilisateur
 *     par evenement — jamais de relance >>). L'appareil le sait localement, et le serveur le
 *     sait aussi par son index unique : les deux, parce que le premier evite d'afficher et le
 *     second evite de compter ;
 *   - le conducteur EMPRUNTE le segment, c'est-a-dire qu'il en est a moins de soixante metres
 *     (<< au moment du passage >>).
 */
export function doitPoserLaQuestion(args: {
  phase: PhaseBlocage;
  reponses: number;
  dejaRepondu: boolean;
  distanceM: number | null | undefined;
}): boolean {
  if (args.phase !== 'probation') return false;
  if (args.reponses >= QUESTIONS_PAR_EVENEMENT) return false;
  if (args.dejaRepondu) return false;
  return typeof args.distanceM === 'number' && args.distanceM <= RAYON_QUESTION_M;
}

/**
 * LE SIGNALEMENT A-T-IL ETE VECU ? << Preuve qu'il l'a vecu >>, dit le document.
 *
 * `metresParcourus` est la distance que l'appareil a reellement parcourue juste avant le
 * signalement, mesuree sur ses propres positions GPS. Dix metres suffisent — on ne demande pas
 * au conducteur d'avoir fait le tour du quartier, mais d'avoir ROULE la.
 *
 * L'ABSENCE DE MESURE N'EST PAS UN REFUS, et c'est volontaire : une application plus ancienne
 * que le serveur n'envoie pas ce chiffre, et punir ses signalements reviendrait a desarmer les
 * blocages de tous les telephones qui n'ont pas encore ete mis a jour. Ce qui est ecarte, c'est
 * une mesure PRESENTE et INSUFFISANTE — le signalement depose a l'arret, loin de la route.
 */
export function preuveVecue(metresParcourus: number | null | undefined): boolean {
  if (typeof metresParcourus !== 'number' || !Number.isFinite(metresParcourus)) return true;
  return metresParcourus >= PREUVE_PASSAGE_M;
}
