/**
 * LES REGLES DE LA BARRE DE NAVIGATION AUDIO — point 4 du 22 novembre.
 *
 * << Actuellement : seule la duree approximative est affichee. Aucun curseur de navigation
 * audio. >> Le document demande une barre glissable, le temps courant sur la duree totale, et
 * deux boutons de dix secondes.
 *
 * POURQUOI CES QUATRE FONCTIONS VIVENT DANS UN FICHIER SANS UNE LIGNE DE REACT NATIVE. Elles
 * sont toutes de l'arithmetique, et toute l'arithmetique de cette barre a des bords qui se
 * verifient mal au doigt : reculer de dix secondes a la deuxieme seconde, avancer de dix a la
 * fin d'Al-Baqara, toucher la barre a un pixel du bord, ou l'afficher avant que le lecteur ait
 * annonce la duree (elle vaut alors zero). Ecrites ici, elles s'eprouvent par
 * `scripts/verifier-seekbar.ts` en une seconde et sans telephone — c'est la raison qui a deja
 * sorti les regles de voies, du signalement, du cycle de langue et des profils d'itineraire de
 * leurs composants.
 *
 * CE QUE LA BARRE COUVRE EXACTEMENT, et c'est a dire : LE FICHIER EN COURS, pas la recitation
 * entiere quand celle-ci en compte plusieurs. Les trois protectrices sont trois sourates, donc
 * trois fichiers qui s'enchainent (voir `urlsDe`). Le lecteur ne connait la duree que de celui
 * qu'il a charge. Une barre qui pretendrait couvrir les trois afficherait un temps faux pendant
 * les deux premieres — mieux vaut une barre juste sur un fichier.
 */

/** Le pas des deux boutons, en secondes. Valeur du document (<< -10s / +10s >>). */
export const PAS_S = 10;

/**
 * Le temps lisible : `m:ss`, et `h:mm:ss` des qu'on depasse l'heure.
 *
 * L'HEURE N'EST PAS UN CAS D'ECOLE ICI. Al-Baqara dure environ deux heures et Al-Kahf
 * quarante-cinq minutes : la formule du document (`s/60 + ":" + s%60`) afficherait
 * << 127:43 >> pour la premiere, ce qui ne se lit pas. Les sourates courtes, elles, gardent
 * `m:ss` — << 0:48 >> et non << 0:00:48 >>.
 *
 * Les valeurs impossibles sont ramenees a zero plutot que de produire du texte absurde : le
 * lecteur annonce `duration: 0` avant d'avoir lu l'entete du fichier, et `currentTime` peut
 * arriver legerement negatif apres un saut.
 */
export function formaterTemps(secondes: number): string {
  const total = Number.isFinite(secondes) && secondes > 0 ? Math.floor(secondes) : 0;
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const deuxChiffres = (n: number) => (n < 10 ? '0' + n : String(n));
  return h > 0 ? `${h}:${deuxChiffres(m)}:${deuxChiffres(s)}` : `${m}:${deuxChiffres(s)}`;
}

/**
 * Ramene une position dans les bornes du fichier.
 *
 * `duree <= 0` rend zero : c'est l'etat du lecteur entre la demande et l'arrivee des premiers
 * octets, et sauter a une position dans un fichier dont on ignore la longueur n'a pas de sens.
 */
export function bornerPosition(position: number, duree: number): number {
  if (!Number.isFinite(duree) || duree <= 0) return 0;
  if (!Number.isFinite(position) || position < 0) return 0;
  return position > duree ? duree : position;
}

/**
 * La position apres un appui sur l'un des deux boutons.
 *
 * ELLE NE DEBORDE JAMAIS, dans aucun des deux sens, et c'est tout l'interet de la calculer
 * ici : a la deuxieme seconde, << -10s >> doit ramener au debut et non a moins huit, ou le
 * lecteur Android se comporte differemment selon la version. A la fin, << +10s >> s'arrete sur
 * la derniere seconde au lieu de declencher la fin du fichier — donc, pour les protectrices,
 * au lieu de sauter a la sourate suivante.
 */
export function decalerPosition(position: number, delta: number, duree: number): number {
  return bornerPosition(bornerPosition(position, duree) + delta, duree);
}

/**
 * La position visee par un doigt pose a `x` sur une barre large de `largeur`.
 *
 * LE RAPPORT EST CALCULE AVANT D'ETRE MULTIPLIE, et non l'inverse : sur Al-Baqara, sept mille
 * secondes multipliees par un `x` de plusieurs centaines donneraient un nombre inutilement
 * grand avant d'etre divise. Ce n'est pas une question de debordement — c'est que la formule
 * se relit mieux dans cet ordre, et que l'erreur d'arrondi reste du cote du resultat.
 *
 * `largeur <= 0` rend zero : la barre n'a pas encore ete mesuree, et aucun doigt ne peut
 * l'avoir touchee.
 */
export function positionDepuisToucher(x: number, largeur: number, duree: number): number {
  if (!Number.isFinite(largeur) || largeur <= 0) return 0;
  if (!Number.isFinite(x) || x <= 0) return 0;
  const part = x >= largeur ? 1 : x / largeur;
  return bornerPosition(part * duree, duree);
}

/**
 * La part remplie de la barre, entre 0 et 1 — ce qui se dessine.
 *
 * Elle est separee de la position parce qu'elle a son propre cas limite : tant que la duree est
 * inconnue, la barre doit etre VIDE et non pleine. Une barre pleine sur un fichier qui n'a pas
 * commence dirait au lecteur que la recitation est finie.
 */
export function partRemplie(position: number, duree: number): number {
  if (!Number.isFinite(duree) || duree <= 0) return 0;
  return bornerPosition(position, duree) / duree;
}
