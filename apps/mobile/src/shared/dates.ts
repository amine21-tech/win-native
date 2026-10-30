// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------
/**
 * LECTURE DES DATES VENUES DU SERVEUR.
 *
 * POURQUOI CE FICHIER EXISTE. Le serveur renvoie ses horodatages au format de PostgreSQL :
 *
 *     2026-08-27 06:00:25.887144+00
 *
 * Ce n'est PAS de l'ISO 8601. Il s'en distingue par trois details, et chacun suffit a le faire
 * rejeter : une espace au lieu du « T », six decimales de seconde au lieu de trois, et un
 * decalage horaire ecrit « +00 » au lieu de « +00:00 » ou « Z ».
 *
 * `new Date()` de Node accepte cette chaine par indulgence. HERMES, le moteur JavaScript
 * d'Android, la refuse et rend `Invalid Date`. Le defaut ne se voyait donc jamais en
 * developpement, et toujours sur le telephone du client — « Invalid Date » sous chaque annonce
 * dans « Mes annonces », et, plus grave parce que silencieux, une jauge de duree de vie des
 * signalements calculee sur `NaN` depuis le debut.
 *
 * ON NE REPARE PAS CELA AVEC UNE INDULGENCE DE PLUS. La fonction ci-dessous normalise la
 * chaine AVANT de la confier au moteur, de sorte que le resultat ne depende plus de la
 * tolerance de celui-ci : le meme texte donne la meme date sur Android, sur un navigateur et
 * sur le serveur.
 */

/** Date lisible par n'importe quel moteur, ou `null` si la chaine n'en contient pas. */
export function dateDepuisServeur(valeur: string | null | undefined): Date | null {
  if (!valeur) return null;

  const iso = normaliserHorodatage(valeur);
  const d = new Date(iso);
  // `getTime()` rend NaN pour une date invalide : c'est le seul test fiable.
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Horodatage PostgreSQL -> ISO 8601.
 *
 * Laisse passer sans y toucher ce qui est deja de l'ISO : le serveur pourrait se mettre a en
 * renvoyer demain, et la fonction doit continuer de fonctionner ce jour-la sans qu'on y pense.
 */
export function normaliserHorodatage(valeur: string): string {
  let s = valeur.trim();

  // 1. L'espace qui separe la date de l'heure devient le « T » de la norme.
  s = s.replace(' ', 'T');

  // 2. Les decimales de seconde sont ramenees a trois — au-dela, la norme ne dit rien et les
  //    moteurs divergent. On TRONQUE sans arrondir : une milliseconde de moins n'a aucune
  //    importance ici, une date refusee en a beaucoup.
  s = s.replace(/\.(\d{3})\d+/, '.$1');

  // 3. Le decalage horaire est complete. PostgreSQL ecrit « +00 », « +01 » ou « -05 » ; la
  //    norme exige les minutes. Sans elles, Hermes rejette la chaine entiere.
  s = s.replace(/([+-]\d{2})$/, '$1:00');

  // 4. Une chaine sans aucun decalage est de l'heure UTC — c'est ce que le serveur stocke.
  //    L'interpreter comme une heure LOCALE decalerait l'affichage d'une heure en Algerie, ce
  //    qui ne se verrait pas... sauf a minuit, ou la date changerait de jour.
  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) s = `${s}Z`;

  return s;
}

/**
 * Horodatage serveur en millisecondes, ou `null`.
 *
 * Pratique la ou l'on calculait `new Date(x).getTime()` : le `null` force l'appelant a decider
 * quoi faire d'une date absente, la ou `NaN` se propageait en silence dans les calculs.
 */
export function millisecondesDepuisServeur(valeur: string | null | undefined): number | null {
  return dateDepuisServeur(valeur)?.getTime() ?? null;
}
