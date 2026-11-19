/**
 * AVIS ET ETOILES — amelioration 5 de la synthese « Fiche VIP Premium ».
 *
 * Le client la decrit comme « le signal de confiance le plus fort dans les apps de navigation »,
 * et pose deux conditions en toutes lettres : visible UNIQUEMENT si le lieu est VIP, et
 * seulement a partir de trois avis.
 *
 * POURQUOI LE SEUIL EXISTE. Un unique avis a cinq etoiles affiche « 5,0 » : c'est le chiffre le
 * plus flatteur de toute l'application, et il ne repose sur rien. Pire, il est trivial a
 * fabriquer soi-meme le jour ou l'on paie son abonnement. Trois avis ne rendent pas la note
 * vraie, mais ils rendent le mensonge visible — et ils evitent qu'une fiche neuve affiche une
 * note parfaite devant un commerce que personne n'a encore vu.
 *
 * Module feuille, sans import React Native : la condition d'affichage est exactement le genre
 * de regle qu'on croit avoir ecrite et qui se revele inversee a l'ecran.
 */

/** Nombre d'avis en dessous duquel on n'affiche aucune note. Valeur de la synthese. */
export const AVIS_MIN = 3;

/** Bornes d'une note, telles qu'elles sont acceptees par le serveur. */
export const NOTE_MIN = 1;
export const NOTE_MAX = 5;

/**
 * Faut-il afficher le bloc note + avis ?
 *
 * Les deux conditions de la synthese, et dans cet ordre : `isVip && count >= 3`. Un lieu
 * ordinaire bien note ne montre rien — c'est ce qui fait de ce bloc un avantage vendu.
 */
export function avisAffichables(estPartenaire: boolean, nombre: number): boolean {
  return estPartenaire && Number.isFinite(nombre) && nombre >= AVIS_MIN;
}

/** « 4,7 » — une decimale, virgule decimale francaise, comme sur la maquette. */
export function formatNote(note: number): string {
  if (!Number.isFinite(note)) return '';
  return note.toFixed(1).replace('.', ',');
}

/**
 * Les cinq etoiles, pleine / demie / vide, pour une note donnee.
 *
 * On arrondit au demi le plus proche plutot qu'a l'entier : 4,7 doit se lire comme quatre
 * etoiles et demie, et non comme cinq. Afficher cinq etoiles pleines au-dessus du nombre
 * « 4,7 » met l'image en contradiction avec le chiffre juste a cote.
 */
export function etoiles(note: number): ('pleine' | 'demie' | 'vide')[] {
  const n = Number.isFinite(note) ? Math.max(0, Math.min(NOTE_MAX, note)) : 0;
  const demis = Math.round(n * 2);
  return Array.from({ length: NOTE_MAX }, (_, i) => {
    const restant = demis - i * 2;
    if (restant >= 2) return 'pleine' as const;
    if (restant === 1) return 'demie' as const;
    return 'vide' as const;
  });
}

/**
 * LE MOT QUI SUIT LE NOMBRE : « 128 avis patients », « 128 avis clients », ou « 128 avis ».
 *
 * La maquette ecrit « avis patients », parce que son exemple est une clinique ORL. Mais WIN
 * reference des boulangeries, des stations-service et des garages : « 128 avis patients » sous
 * une station Naftal se lit comme une erreur de copie, et une erreur de copie sur une fiche
 * payante abime precisement la credibilite que ce bloc est cense construire.
 *
 * On garde donc le mot du client LA OU IL S'APPLIQUE — les quatre categories de sante — et on
 * dit « clients » pour les commerces, « avis » tout court pour le reste. C'est le seul endroit
 * ou nous nous ecartons de la lettre du document, et c'est pour en tenir l'intention.
 */
export type GenreAvis = 'patients' | 'clients' | 'neutre';

const SANTE = new Set(['pharmacie', 'hopital', 'clinique', 'medecin']);
const COMMERCE = new Set(['commerce', 'restaurant', 'cafe', 'hotel', 'garage', 'station_service']);

export function genreAvis(categorie: string | null | undefined): GenreAvis {
  if (!categorie) return 'neutre';
  if (SANTE.has(categorie)) return 'patients';
  if (COMMERCE.has(categorie)) return 'clients';
  return 'neutre';
}

/**
 * Moyenne et compte, cote serveur comme cote telephone.
 *
 * La synthese la place sur le serveur, et c'est la bonne place : le telephone ne recoit pas la
 * liste des avis, seulement le resultat. La fonction reste ici pour que le verificateur puisse
 * la rejouer sans base de donnees.
 */
export function moyenneAvis(notes: readonly number[]): { note: number; nombre: number } {
  const valides = notes.filter((n) => Number.isFinite(n) && n >= NOTE_MIN && n <= NOTE_MAX);
  if (valides.length === 0) return { note: 0, nombre: 0 };
  const somme = valides.reduce((a, b) => a + b, 0);
  return { note: somme / valides.length, nombre: valides.length };
}
