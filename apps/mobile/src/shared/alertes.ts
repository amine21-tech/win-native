// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------
import { DZ_WILAYA_NAMES } from './search';
import type { Language } from './constants';

/**
 * ALERTES OFFICIELLES — vigilance foret, vigilance meteo, fetes et commemorations.
 *
 * CE QUI CHANGE PAR RAPPORT A L'EXISTANT, ET POURQUOI C'EST LE COEUR DU SUJET. Le bandeau
 * << feux de foret >> existait deja, mais il se declenchait TOUT SEUL : du 1er juin au
 * 30 septembre, et uniquement si l'utilisateur se trouvait dans l'une des cinq zones
 * forestieres ecrites en dur dans l'application.
 *
 * Le cahier des charges du client abolit ce declenchement : << activees ou desactivees a la
 * main par le fondateur, et plus de declenchement automatique par dates >>. La raison est
 * solide. Un incendie n'attend pas le 1er juin, une annee seche commence en mai, et surtout :
 * une alerte qui s'allume toute seule ne peut pas s'eteindre quand elle n'a plus lieu d'etre.
 * Le fondateur, lui, sait ce qui se passe dans le pays.
 *
 * Les dates de fetes religieuses disent la meme chose autrement : l'Aid suit l'observation de
 * la lune, pas le calendrier gregorien. Aucune regle ecrite dans l'application ne peut la
 * trouver juste chaque annee — mais quelqu'un qui vit en Algerie la connait le matin meme.
 *
 * CE FICHIER NE CONTIENT QUE DES REGLES, PAS D'AFFICHAGE. Il est partage entre le serveur, qui
 * decide ce qu'il publie, et l'application, qui decide ce qu'elle montre. Les deux doivent
 * trancher pareil : une fete expiree ne doit etre affichee ni d'un cote ni de l'autre.
 */

/* ------------------------------------------------------------------ */
/* Les trois types d'alerte                                            */
/* ------------------------------------------------------------------ */

export const TYPES_ALERTE = ['fire', 'weather', 'event'] as const;
export type TypeAlerte = (typeof TYPES_ALERTE)[number];

/** Phenomenes de la vigilance meteo. Au moins un doit etre coche pour pouvoir activer. */
export const PHENOMENES = ['rain', 'wind', 'sand'] as const;
export type Phenomene = (typeof PHENOMENES)[number];

/**
 * ORDRE D'AFFICHAGE quand plusieurs alertes sont actives : foret, puis meteo, puis fete.
 *
 * Ce n'est pas arbitraire et il vaut mieux l'ecrire une fois pour toutes : l'ordre va du plus
 * urgent au moins urgent. Un feu de foret se fuit, une pluie se traverse prudemment, une fete
 * se souhaite. Si le conducteur ne lit qu'une seule des trois cartes avant de ranger son
 * telephone, autant que ce soit celle qui peut lui sauver la journee.
 */
export const ORDRE_AFFICHAGE: readonly TypeAlerte[] = ['fire', 'weather', 'event'];

/**
 * Duree d'affichage d'une banniere, en millisecondes.
 *
 * Douze secondes, valeur du client. L'ancien bandeau saisonnier en durait dix ; l'ecart est
 * mince mais il compte, parce que la banniere meteo porte desormais une liste de wilayas a
 * lire en plus du message.
 */
export const DUREE_BANNIERE_MS = 12_000;

/**
 * Au-dela, la derniere reponse du serveur gardee hors ligne n'est plus montree.
 *
 * Vingt-quatre heures, valeur du client. Une vigilance d'hier peut encore valoir aujourd'hui ;
 * celle de la semaine derniere, non — et une alerte perimee qui s'affiche quand meme ruine la
 * confiance dans toutes les suivantes.
 */
export const FRAICHEUR_HORS_LIGNE_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Le catalogue des douze fetes                                        */
/* ------------------------------------------------------------------ */

export type CategorieEvenement = 'memoire' | 'religieux';

export type Evenement = {
  id: string;
  /** Date fixe au format JJ-MM, ou `null` pour les fetes qui suivent la lune. */
  dateFixe: string | null;
  categorie: CategorieEvenement;
  /** Jours avant arret automatique, valeur par defaut proposee dans le panneau. */
  arretAutoJours: number;
  /** Annee de l'evenement commemore, quand il y en a une : elle sert a calculer le << 72e >>. */
  annee?: number;
  /** 🇩🇿 pour la memoire et l'independance, 🌙 pour les fetes religieuses. */
  icone: string;
};

/**
 * LES DOUZE EVENEMENTS, dans l'ordre du tableau du client.
 *
 * TOUS ETEINTS PAR DEFAUT, et c'est la regle la plus importante du lot : `active` ne vit pas
 * ici mais en base, et vaut faux tant que personne ne l'a mis a vrai. Une liste d'evenements
 * n'est pas un calendrier qui se declenche ; c'est un menu dans lequel le fondateur choisit.
 *
 * LES DATES FIXES NE SERVENT QU'A AFFICHER. On ecrit << 18 fevrier >> sous le nom dans le
 * panneau pour que le fondateur s'y retrouve, mais aucune ligne de code ne compare cette date
 * a la date du jour. C'est exactement ce que le client demande d'abolir.
 *
 * LES CINQ DATES VARIABLES n'en ont pas du tout : Aid el-Fitr, Aid el-Adha, Mawlid, 1er
 * Moharram et Achoura suivent l'observation de la lune. Leur ecrire une date fixe serait se
 * tromper onze annees sur douze.
 */
export const CATALOGUE_EVENEMENTS: readonly Evenement[] = [
  { id: 'chahid', dateFixe: '18-02', categorie: 'memoire', arretAutoJours: 1, icone: '🇩🇿' },
  { id: 'victoire', dateFixe: '19-03', categorie: 'memoire', arretAutoJours: 1, annee: 1962, icone: '🇩🇿' },
  { id: 'memoire', dateFixe: '08-05', categorie: 'memoire', arretAutoJours: 1, annee: 1945, icone: '🇩🇿' },
  { id: 'jul5', dateFixe: '05-07', categorie: 'memoire', arretAutoJours: 1, annee: 1962, icone: '🇩🇿' },
  { id: 'soummam', dateFixe: '20-08', categorie: 'memoire', arretAutoJours: 1, annee: 1956, icone: '🇩🇿' },
  { id: 'emigration', dateFixe: '17-10', categorie: 'memoire', arretAutoJours: 1, annee: 1961, icone: '🇩🇿' },
  { id: 'nov1', dateFixe: '01-11', categorie: 'memoire', arretAutoJours: 1, annee: 1954, icone: '🇩🇿' },
  { id: 'fitr', dateFixe: null, categorie: 'religieux', arretAutoJours: 3, icone: '🌙' },
  { id: 'adha', dateFixe: null, categorie: 'religieux', arretAutoJours: 3, icone: '🌙' },
  { id: 'mawlid', dateFixe: null, categorie: 'religieux', arretAutoJours: 1, icone: '🌙' },
  { id: 'moharram', dateFixe: null, categorie: 'religieux', arretAutoJours: 1, icone: '🌙' },
  { id: 'achoura', dateFixe: null, categorie: 'religieux', arretAutoJours: 1, icone: '🌙' },
];

export const IDS_EVENEMENTS: readonly string[] = CATALOGUE_EVENEMENTS.map((e) => e.id);

export function evenementParId(id: string): Evenement | null {
  return CATALOGUE_EVENEMENTS.find((e) => e.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Le numero d'anniversaire                                            */
/* ------------------------------------------------------------------ */

/**
 * << 72e anniversaire >> : annee en cours moins annee de l'evenement.
 *
 * POURQUOI IL EST CALCULE ET NON ECRIT. Un nombre ecrit dans un texte de traduction est juste
 * un an, puis faux pour toujours — et personne ne s'en apercoit, parce qu'il faut connaitre la
 * date pour voir l'erreur. C'est le genre de detail qu'un client remarque le 1er novembre
 * suivant, devant son telephone, et qui donne l'impression que l'application n'est plus
 * entretenue.
 *
 * Renvoie `null` quand l'evenement ne commemore pas une annee — un Aid n'a pas d'anniversaire.
 */
export function anniversaire(evenement: Evenement, maintenant: Date = new Date()): number | null {
  if (evenement.annee == null) return null;
  const n = maintenant.getFullYear() - evenement.annee;
  return n > 0 ? n : null;
}

/**
 * Le suffixe d'ordinal, qui n'obeit pas aux memes regles d'une langue a l'autre.
 *
 * Le francais ecrit << 72e >>, l'anglais regarde le dernier chiffre (<< 72nd >>, << 73rd >>,
 * << 71st >>) avec l'exception des adolescents 11, 12 et 13 qui prennent tous << th >>.
 * L'arabe et la darija ecrivent le nombre seul. Le kabyle place le rang devant le nombre
 * (<< aseggas wis 72 >>), ce que gere le gabarit de phrase et non cette fonction.
 */
export function ordinal(n: number, lang: Language): string {
  if (lang === 'fr') return `${n}e`;
  if (lang === 'en') {
    const deux = n % 100;
    if (deux >= 11 && deux <= 13) return `${n}th`;
    const un = n % 10;
    return `${n}${un === 1 ? 'st' : un === 2 ? 'nd' : un === 3 ? 'rd' : 'th'}`;
  }
  return String(n);
}

/* ------------------------------------------------------------------ */
/* L'arret automatique                                                 */
/* ------------------------------------------------------------------ */

/**
 * Une alerte dont la date d'arret est passee ne doit plus etre affichee.
 *
 * ELLE EST CONTROLEE DES DEUX COTES, et ce n'est pas de la redondance inutile. Le serveur
 * filtre ce qu'il publie ; l'application refiltre ce qu'elle a recu. Entre les deux il y a le
 * cache hors ligne de vingt-quatre heures : une alerte valable a la derniere connexion peut
 * avoir expire depuis, et c'est precisement le telephone — qui connait l'heure qu'il est — qui
 * doit s'en rendre compte.
 *
 * `until` est une date seule (AAAA-MM-JJ) et non un horodatage : l'arret vaut pour la fin de
 * la journee indiquee, pas pour minuit du jour ou on l'a ecrite.
 */
export function estExpiree(until: string | null | undefined, maintenant: Date = new Date()): boolean {
  if (!until) return false;
  const fin = new Date(`${until}T23:59:59Z`);
  if (Number.isNaN(fin.getTime())) return false;
  return maintenant.getTime() > fin.getTime();
}

/**
 * La date d'arret proposee dans le panneau : aujourd'hui plus le delai par defaut, moins un.
 *
 * Un arret auto d'<< un jour >> veut dire << aujourd'hui seulement >>, pas << aujourd'hui et
 * demain >>. Trois jours pour un Aid couvrent le jour meme et les deux suivants.
 */
export function dateArretParDefaut(evenement: Evenement, maintenant: Date = new Date()): string {
  const fin = new Date(maintenant.getTime());
  fin.setDate(fin.getDate() + Math.max(0, evenement.arretAutoJours - 1));
  return fin.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Ce qu'une alerte contient                                           */
/* ------------------------------------------------------------------ */

/** Le texte d'une banniere dans les cinq langues, quand le fondateur l'a reecrit. */
export type MessageMultilingue = Partial<Record<Language, string>>;

export type Alerte = {
  type: TypeAlerte;
  /** Seulement pour `event` : l'identifiant du catalogue. */
  id?: string;
  active: boolean;
  /** Seulement pour `weather`, au moins un. */
  phenomena?: Phenomene[];
  /** `fire` et `weather`. Liste vide = toute l'Algerie. */
  wilayas?: string[];
  /** Texte reecrit par le fondateur ; `null` = le texte standard du cahier des charges. */
  message?: MessageMultilingue | null;
  /** Arret automatique, AAAA-MM-JJ, facultatif. */
  until?: string | null;
};

/**
 * CE QUE L'APPLICATION DOIT AFFICHER, a partir de ce que le serveur a envoye.
 *
 * POURQUOI LES WILAYAS NE FILTRENT RIEN. C'est le piege de cette fonctionnalite, et le client
 * l'ecrit noir sur blanc : << la meteo est montree a tous, avec la liste des wilayas cochees >>.
 * L'instinct dit le contraire — une alerte sur Tizi Ouzou ne regarde pas un conducteur
 * d'Oran — mais l'instinct a tort : celui d'Oran peut prendre la route de Tizi Ouzou dans
 * l'heure, et c'est justement lui qu'il faut prevenir avant qu'il parte.
 *
 * Les wilayas servent donc a NOMMER les zones, jamais a cacher l'alerte. La seule difference
 * entre un utilisateur dedans et un utilisateur dehors tient en une ligne de plus : << Vous
 * etes dans une zone concernee >>.
 */
export function alertesAAfficher(
  alertes: readonly Alerte[],
  maintenant: Date = new Date(),
): Alerte[] {
  const retenues = alertes.filter((a) => a.active && !estExpiree(a.until, maintenant));
  return retenues.sort(
    (a, b) => ORDRE_AFFICHAGE.indexOf(a.type) - ORDRE_AFFICHAGE.indexOf(b.type),
  );
}

/**
 * Une alerte est-elle publiable ? Les regles que le panneau doit faire respecter AVANT
 * d'envoyer, et que le serveur refait de son cote.
 *
 * Renvoie la liste des raisons de refus, vide quand tout va bien. Une liste plutot qu'un
 * booleen : le panneau doit pouvoir DIRE ce qui manque, sinon le bouton reste grise sans
 * explication et le fondateur cherche.
 */
export function raisonsDeRefus(alerte: Alerte): string[] {
  const raisons: string[] = [];

  if (alerte.type === 'weather' && alerte.active && (alerte.phenomena ?? []).length === 0) {
    raisons.push('phenomene');
  }
  if (alerte.type === 'event' && !evenementParId(alerte.id ?? '')) {
    raisons.push('evenement-inconnu');
  }
  /* LES NOMS DE WILAYA SONT VERIFIES CONTRE LA LISTE DE REFERENCE. Une faute de frappe cote
   * panneau donnerait une banniere qui nomme une zone inexistante, et surtout la comparaison
   * avec la wilaya de l'utilisateur echouerait en silence : il serait dans la zone sans que
   * l'application le sache. */
  for (const w of alerte.wilayas ?? []) {
    if (!DZ_WILAYA_NAMES.includes(w)) raisons.push(`wilaya-inconnue:${w}`);
  }
  if (alerte.until && !/^\d{4}-\d{2}-\d{2}$/.test(alerte.until)) {
    raisons.push('date-arret');
  }
  return raisons;
}
