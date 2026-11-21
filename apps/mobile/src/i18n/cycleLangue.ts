import type { Language } from '../shared';

/**
 * LE CYCLE DU BOUTON DE LANGUE EN NAVIGATION — point 6 du 21 novembre.
 *
 * CE QUE LE CLIENT DEMANDE, MOT POUR MOT :
 *
 *   1er tap  Bascule en Tamazight/Kabyle -> voix kabyle + message de bienvenue en Tifinagh
 *   2e tap   Bascule en Derija algerienne -> voix Derija + message de bienvenue
 *   3e tap   Retour a la langue active avant le premier tap (FR, AR, EN...)
 *
 * POURQUOI CETTE REGLE VIT DANS UN FICHIER A ELLE, SANS UNE LIGNE DE REACT NATIVE. Un cycle a
 * trois paliers qui MEMORISE un etat se verifie mal a la main : il faut appuyer trois fois, dans
 * l'ordre, depuis cinq langues de depart. Ecrit ici, il s'eprouve par
 * `scripts/verifier-cycle-langue.ts` en une seconde et sans telephone — c'est la meme raison qui
 * a sorti les regles de voies et celles du signalement de leurs composants.
 *
 * LE SEUL ECART AVEC LE DOCUMENT, ET IL EST VOULU : UN APPUI NE DOIT JAMAIS RESTER SANS EFFET.
 * Pris au mot, le cycle fait qu'un conducteur deja en kabyle appuie une premiere fois... pour
 * passer en kabyle. Rien ne bouge, et au volant un bouton qui ne repond pas est un bouton
 * casse — on le presse une seconde fois, on regarde l'ecran, on quitte la route des yeux. On
 * SAUTE donc le palier qui ne changerait rien, et on continue d'avancer dans le meme ordre.
 * Le cas normal (on part du francais, de l'arabe ou de l'anglais) est exactement celui du
 * document ; seuls les departs depuis le kabyle ou le darija en profitent.
 */

/** Les deux langues que le raccourci va chercher, dans l'ordre des appuis. */
export const CYCLE: readonly Language[] = ['kab', 'dz'];

/** Nombre de paliers : les deux langues, puis le retour. */
const PALIERS = CYCLE.length + 1;

export type EtatCycle = {
  /**
   * La langue active AVANT le premier appui — celle a laquelle le troisieme appui ramene.
   * `null` tant que le cycle dort : on ne la retient qu'au moment ou on la quitte, sinon on
   * ramenerait le conducteur a une langue qu'il a changee entre-temps depuis l'accueil.
   */
  avant: Language | null;
  /** 0 au repos, puis le numero du palier atteint : 1 = kabyle, 2 = darija, 3 = retour. */
  pas: 0 | 1 | 2 | 3;
};

export const AU_REPOS: EtatCycle = { avant: null, pas: 0 };

/**
 * Un appui : rend la langue a appliquer, et l'etat a retenir pour l'appui suivant.
 *
 * `actuelle` est la langue REELLEMENT active au moment de l'appui, et non celle que le cycle
 * croit avoir posee : entre deux appuis, l'utilisateur peut avoir change de langue depuis
 * l'accueil. C'est elle qui decide si un palier change quelque chose.
 */
export function appuiLangue(
  etat: EtatCycle,
  actuelle: Language,
): { etat: EtatCycle; langue: Language } {
  const avant = etat.pas === 0 ? actuelle : (etat.avant ?? actuelle);
  let pas = etat.pas;

  /* Au plus un tour complet : les paliers sont trois, et au pire les trois proposent la langue
   * deja active — on revient alors au repos sans rien changer, plutot que de tourner sans fin. */
  for (let n = 0; n < PALIERS; n += 1) {
    pas = ((pas % PALIERS) + 1) as 1 | 2 | 3;
    /* `CYCLE[pas - 1]` est toujours defini : `pas` vaut 1 ou 2 des que l'on n'est pas sur le
     * palier de retour, et CYCLE a deux entrees. C'est ce que l'assertion dit. */
    const langue = pas === PALIERS ? avant : CYCLE[pas - 1]!;
    if (langue !== actuelle) {
      return { etat: pas === PALIERS ? AU_REPOS : { avant, pas }, langue };
    }
  }

  return { etat: AU_REPOS, langue: avant };
}

/**
 * Le libelle a trois caracteres affiche sur le bouton : la langue OU L'ON VA, pas celle d'ou
 * l'on vient. C'est ce que fait le bouton drapeau de la carte, et c'est ce qu'on lit d'un coup
 * d'oeil au volant — un bouton qui montre l'etat courant demande de se souvenir de ce qui suit.
 */
export function libelleProchain(etat: EtatCycle, actuelle: Language): string {
  const { langue } = appuiLangue(etat, actuelle);
  return ETIQUETTES[langue];
}

const ETIQUETTES: Record<Language, string> = {
  fr: 'FR',
  dz: 'DZ',
  ar: 'AR',
  en: 'EN',
  kab: 'ⵣ',
};
