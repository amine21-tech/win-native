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

/**
 * Les deux langues que le raccourci va chercher, DANS L'ORDRE DES APPUIS.
 *
 * LE DARIJA D'ABORD — correction du 22 novembre, et le client donne sa raison : << Derija en
 * 1er car langue la plus parlee en Algerie >>. L'ordre etait inverse la veille, non par choix
 * mais par defaut : la synthese du 21 novembre ne disait pas lequel des deux venait en premier,
 * et le tamazight avait ete nomme le premier dans sa phrase.
 *
 * L'ORDRE EST LA SEULE CHOSE QUI CHANGE. Tout le reste du cycle — la memoire de la langue de
 * depart, le retour au troisieme appui, le palier saute quand il ne changerait rien — tient
 * dans la fonction ci-dessous et ne depend pas de cette liste. C'est ce qui permet de
 * l'inverser d'une ligne, et au controle de le prouver.
 */
export const CYCLE: readonly Language[] = ['dz', 'kab'];

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
 * La langue que le PROCHAIN appui donnera — c'est elle que le bouton annonce, et non celle qui
 * est active.
 *
 * C'est ce que demande le document : << Tap 1 -> Derija activee, bouton affiche "Tamazight" >>.
 * Le bouton dit donc ou l'on va, comme le bouton drapeau de la carte. Un bouton qui montrerait
 * l'etat courant obligerait a se souvenir de ce qui vient apres.
 */
export function prochaineLangue(etat: EtatCycle, actuelle: Language): Language {
  return appuiLangue(etat, actuelle).langue;
}

/**
 * Le mot ecrit sur le bouton.
 *
 * DES MOTS, ET NON DES SIGLES — correction du 22 novembre. Le bouton affichait << DZ >> et le
 * caractere tifinagh << ⵣ >>. Le client demande << Derija >> et << Tamazight >> en toutes
 * lettres : « DZ » est le code du pays avant d'etre celui d'une langue, et le tifinagh seul ne
 * se lit que par ceux qui le connaissent deja — c'est-a-dire pas ceux a qui le bouton
 * s'adresse.
 *
 * LES TROIS AUTRES NE SE NOMMENT PLUS DU TOUT — point A du correctif v2 ; la raison est
 * ecrite au-dessus de la table ETIQUETTES, plus bas dans ce fichier.
 */
export function libelleProchain(etat: EtatCycle, actuelle: Language): string {
  return ETIQUETTES[prochaineLangue(etat, actuelle)];
}

/**
 * << LA COLONNE GAUCHE EST EXCLUSIVEMENT RESERVEE A : DARJA + TAMAZIGHT >> — point A du
 * correctif v2.
 *
 * LE CLIENT A VU UN << BOUTON FR >> DANS LA COLONNE, ET IL N'Y EN A PAS. C'est ce bouton-ci, a
 * son troisieme palier : il annonce sa DESTINATION, et au troisieme appui la destination est la
 * langue d'ou l'on vient. Un raccourci vers le darija et le tamazight qui affiche << FR >> se
 * lit comme un bouton de francais que personne n'a demande — c'est mot pour mot ce qui a ete
 * rapporte, et c'est une faute d'affichage, pas une faute de cycle.
 *
 * LES TROIS LANGUES DE DEPART DISENT DONC << RETOUR >>. Le palier, lui, ne disparait pas : le
 * document le confirme deux lignes plus bas (<< Tap 3 = retour a la langue initiale >>), et le
 * supprimer enfermerait dans le darija celui qui a essaye le bouton par curiosite. Seul le MOT
 * change, ce qui est exactement la consigne du point A : << NE PAS MODIFIER la logique de cycle
 * existante — CORRIGER uniquement l'affichage >>.
 *
 * UN MOT PLUTOT QU'UNE FLECHE, pour la raison deja donnee le 22 novembre a propos de << DZ >> et
 * de << ☵ >> : un sigle ou un pictogramme ne se lit que par ceux qui savent deja ce qu'il veut
 * dire. << Retour >> dit ce que l'appui fait.
 */
export const ETIQUETTE_RETOUR = 'Retour';

const ETIQUETTES: Record<Language, string> = {
  dz: 'Derija',
  kab: 'Tamazight',
  /* Les trois langues qui ne sont jamais une DESTINATION du cycle, seulement un RETOUR. */
  fr: ETIQUETTE_RETOUR,
  ar: ETIQUETTE_RETOUR,
  en: ETIQUETTE_RETOUR,
};
