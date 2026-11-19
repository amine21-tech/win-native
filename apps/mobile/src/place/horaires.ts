/**
 * HORAIRES D'OUVERTURE — « Ouvert / Ferme » en temps reel sur la fiche VIP.
 *
 * Amelioration 4 de la synthese « Fiche VIP Premium » : le client veut un signal de confiance
 * immediat, le jour en cours visible, et un point vert qui bat quand c'est ouvert.
 *
 * CE FICHIER N'IMPORTE RIEN DE REACT NATIVE, et c'est deliberé : la regle « est-ce ouvert
 * maintenant ? » est la seule partie de cette fonction qu'on peut se tromper sans le voir a
 * l'ecran. Un badge vert qui s'affiche est rassurant meme quand il ment. On la met donc dans un
 * module feuille, et le verificateur la rejoue sur des horaires reels (voir
 * scripts/verifier-horaires-vip.ts).
 *
 * DEUX CAS QUE LE CODE DE LA SYNTHESE TRAITE A TORT, et qui sont la raison d'etre de ce module.
 *
 *   1. LA FERMETURE APRES MINUIT. Le code propose ecrit `hActuelle in (hOuv*60)..(hFerm*60)`.
 *      Pour une pizzeria ouverte 18h00–01h00, cela donne l'intervalle 1080..60, qui est VIDE en
 *      Kotlin comme en TypeScript : la fiche afficherait « Ferme » a 22 heures, c'est-a-dire au
 *      moment exact ou le plus de gens la consultent. En Algerie le cas est partout — fast-foods,
 *      cafes, pharmacies de garde.
 *
 *   2. LA COUPURE DE MIDI. Un seul couple ouverture/fermeture par jour ne sait pas dire
 *      8h–12h puis 14h–18h. On l'ecrirait 8h–18h, et la fiche affirmerait « Ouvert » a 13 heures
 *      devant une porte close. On accepte donc PLUSIEURS PLAGES pour un meme jour : c'est le
 *      meme format, une ligne de plus, et cela cesse de mentir.
 *
 * Le format des heures accepte « 08h00 » (celui de la synthese) comme « 08:00 » (celui que
 * tapent les gens), parce que refuser l'un des deux ne protege personne et fait perdre une
 * saisie.
 */

/** Une plage d'ouverture, pour UN jour. Plusieurs plages par jour sont permises. */
export type Horaire = {
  /** 0 = dimanche … 6 = samedi, comme `Date.prototype.getDay()`. */
  jour: number;
  /** Heure d'ouverture, « HH:MM » ou « HHhMM ». Vide ou absente = ferme ce jour-la. */
  ouv: string;
  /** Heure de fermeture. Inferieure a l'ouverture = la plage passe minuit. */
  ferm: string;
};

/** Minutes depuis minuit, ou null si l'ecriture est inexploitable. */
export function minutesDepuisMinuit(heure: string | null | undefined): number | null {
  if (!heure) return null;
  const m = /^(\d{1,2})\s*[h:]\s*(\d{1,2})?$/.exec(heure.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] == null || m[2] === '' ? 0 : Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Remet une heure dans l'ecriture d'affichage de la maquette : « 08h00 ». */
export function formatHeure(heure: string | null | undefined): string {
  const m = minutesDepuisMinuit(heure);
  if (m == null) return '';
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}h${String(min).padStart(2, '0')}`;
}

/** « 08h00 – 20h00 ». Le tiret est un demi-cadratin, comme sur la maquette. */
export function formatPlage(h: Horaire): string {
  const ouv = formatHeure(h.ouv);
  const ferm = formatHeure(h.ferm);
  if (!ouv || !ferm) return '';
  return `${ouv} – ${ferm}`;
}

/** Les plages declarees pour un jour donne, dans l'ordre de la journee. */
export function horairesDuJour(horaires: readonly Horaire[], jour: number): Horaire[] {
  return horaires
    .filter((h) => h.jour === jour && minutesDepuisMinuit(h.ouv) != null && minutesDepuisMinuit(h.ferm) != null)
    .sort((a, b) => (minutesDepuisMinuit(a.ouv) ?? 0) - (minutesDepuisMinuit(b.ouv) ?? 0));
}

/** Une plage franchit-elle minuit ? 18h00–01h00 : oui. 08h00–20h00 : non. */
function passeMinuit(h: Horaire): boolean {
  const o = minutesDepuisMinuit(h.ouv);
  const f = minutesDepuisMinuit(h.ferm);
  if (o == null || f == null) return false;
  return f <= o;
}

const JOURS = 7;
const MINUTES_PAR_JOUR = 24 * 60;

/**
 * EST-CE OUVERT A CET INSTANT ?
 *
 * On regarde le jour en cours, et AUSSI LA VEILLE : une plage 18h00–01h00 declaree lundi est
 * encore en cours a minuit trente, mais on est alors mardi. L'oublier ferme la fiche une heure
 * par nuit, sans que personne ne comprenne pourquoi.
 *
 * `maintenant` est un parametre et non `new Date()` pris au vol : c'est ce qui permet de rejouer
 * la regle a vingt-deux heures un mardi sans attendre mardi vingt-deux heures.
 */
export function estOuvertMaintenant(horaires: readonly Horaire[] | null | undefined, maintenant: Date): boolean {
  if (!horaires || horaires.length === 0) return false;
  const jour = maintenant.getDay();
  const minute = maintenant.getHours() * 60 + maintenant.getMinutes();

  for (const h of horairesDuJour(horaires, jour)) {
    const o = minutesDepuisMinuit(h.ouv)!;
    const f = minutesDepuisMinuit(h.ferm)!;
    if (passeMinuit(h)) {
      // 18h00–01h00 : ouvert de 18h00 a la fin de la journee.
      if (minute >= o) return true;
    } else if (minute >= o && minute < f) {
      return true;
    }
  }

  // La veille, et seulement ses plages qui franchissent minuit.
  const veille = (jour + JOURS - 1) % JOURS;
  for (const h of horairesDuJour(horaires, veille)) {
    if (!passeMinuit(h)) continue;
    const f = minutesDepuisMinuit(h.ferm)!;
    // `f + MINUTES_PAR_JOUR` serait l'heure absolue ; ramene a aujourd'hui, c'est `f`.
    if (minute < f) return true;
  }
  return false;
}

/** Y a-t-il de quoi afficher un bloc horaires ? Une liste vide ne doit pas produire un cadre. */
export function aDesHoraires(horaires: readonly Horaire[] | null | undefined): boolean {
  if (!horaires || horaires.length === 0) return false;
  return horaires.some((h) => minutesDepuisMinuit(h.ouv) != null && minutesDepuisMinuit(h.ferm) != null);
}

/**
 * Les sept jours a partir d'AUJOURD'HUI, pour la liste de la maquette : « Aujourd'hui · Jeu. »
 * en tete, puis les suivants. Un jour sans plage est rendu avec `plages: []`, ce que l'affichage
 * traduit par « Ferme » — le dire vaut mieux que de sauter la ligne, car un jour absent se lit
 * comme un oubli de saisie.
 */
export function semaineDepuisAujourdhui(
  horaires: readonly Horaire[] | null | undefined,
  maintenant: Date,
): { jour: number; aujourdhui: boolean; plages: Horaire[] }[] {
  const base = maintenant.getDay();
  const liste = horaires ?? [];
  return Array.from({ length: JOURS }, (_, i) => {
    const jour = (base + i) % JOURS;
    return { jour, aujourdhui: i === 0, plages: horairesDuJour(liste, jour) };
  });
}
