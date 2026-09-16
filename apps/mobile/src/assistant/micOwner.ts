/**
 * Arbitrage du micro entre la dictee de la barre de recherche et l'assistant vocal.
 *
 * Le telephone n'a qu'UN moteur de reconnaissance, et `expo-speech-recognition` diffuse ses
 * evenements a tous les abonnes : sans arbitre, une phrase dictee a l'assistant declenchait
 * aussi une recherche dans la barre, et inversement. Chaque hook annonce donc qu'il prend le
 * micro, et ignore tout evenement qui ne lui est pas destine.
 *
 * Un module plutot qu'un contexte React : l'appartenance doit etre lisible DANS le
 * gestionnaire d'evenement, au moment ou il se declenche, pas au rendu suivant.
 */

export type MicOwner = 'search' | 'assistant';

let owner: MicOwner | null = null;

/** Prend le micro. L'ancien proprietaire, s'il y en avait un, le perd immediatement. */
export function claimMic(next: MicOwner): void {
  owner = next;
}

/** Rend le micro — sans effet si un autre l'a repris entre-temps. */
export function releaseMic(who: MicOwner): void {
  if (owner === who) owner = null;
}

/** Vrai si `who` est bien le destinataire des evenements qui arrivent en ce moment. */
export function holdsMic(who: MicOwner): boolean {
  return owner === who;
}
