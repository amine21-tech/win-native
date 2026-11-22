/**
 * LA REGLE DU MICRO A UN SEUL APPUI — point 8 du 22 novembre.
 *
 * << Remplacement de l'appui long (peu intuitif) par un appui simple de 5 secondes. Appui
 * simple -> icone rouge -> 5 s d'ecoute -> reconnaissance automatique -> resultat affiche. >>
 *
 * POURQUOI CINQ SECONDES, DANS LES MOTS DU CLIENT : << Noms de villes algeriennes composes :
 * Draa El Mizan, Ain Temouchent, Bordj Bou Arreridj -> 3 a 4 s. 5 secondes = marge suffisante,
 * pas de pression pour l'utilisateur, pas d'attente inutile. >> Le raisonnement est juste, et
 * il explique aussi pourquoi l'appui maintenu etait un mauvais geste ici : prononcer << Bordj
 * Bou Arreridj >> le doigt colle a l'ecran, en conduisant, demande de tenir quatre secondes
 * sans bouger — on relache au milieu du nom, et la recherche part sur << Bordj Bou >>.
 *
 * POURQUOI CETTE REGLE TIENT DANS UN FICHIER A ELLE. Un geste minute se verifie mal a la main :
 * il faut appuyer, compter, appuyer de nouveau pendant l'ecoute, et recommencer apres une
 * erreur du moteur. Les trois cas ci-dessous s'eprouvent par `scripts/verifier-micro.ts` en une
 * seconde — c'est la meme raison qui a sorti les regles de voies, du cycle de langue, des
 * profils d'itineraire et de la barre du Coran de leurs composants.
 */

/** Duree d'ecoute, en millisecondes. Valeur du document. */
export const ECOUTE_MS = 5000;

/**
 * Ce que fait un appui sur le micro.
 *
 *   'demarrer'  rien n'ecoutait : on lance l'ecoute et on arme la minuterie de cinq secondes.
 *   'finir'     on ecoutait : on finalise TOUT DE SUITE, sans attendre la fin des cinq secondes.
 *
 * LE SECOND CAS N'EST PAS DANS LE DOCUMENT, ET IL EST NECESSAIRE. Pris au mot, le micro ne
 * repond plus pendant cinq secondes une fois lance : on a dit << Alger >> en une seconde, et il
 * reste quatre secondes a attendre devant un bouton rouge qui ignore les appuis. Au volant,
 * un bouton qui ne repond pas se presse une seconde, une troisieme fois. Le deuxieme appui
 * ABREGE donc l'ecoute au lieu de ne rien faire — c'est aussi ce que fait le bouton d'arret
 * d'un dictaphone, et personne n'a besoin qu'on le lui explique.
 *
 * Il ne JETTE pas ce qui a ete entendu : c'est `stop` et non `abort` cote moteur, voir
 * `useVoiceSearch`. Le resultat s'affiche comme si les cinq secondes s'etaient ecoulees.
 */
export function appuiMicro(ecouteEnCours: boolean): 'demarrer' | 'finir' {
  return ecouteEnCours ? 'finir' : 'demarrer';
}

/**
 * Le texte entendu merite-t-il de lancer une recherche ?
 *
 * DEUX CARACTERES AU MOINS, et ce seuil existait deja avant ce point : le moteur rend parfois
 * une seule lettre sur un souffle ou un bruit de voiture, et chercher << a >> renvoie n'importe
 * quoi. La regle est reprise ici telle quelle pour pouvoir etre eprouvee avec le reste.
 */
export function phraseUtilisable(texte: string): boolean {
  return texte.trim().length >= 2;
}
