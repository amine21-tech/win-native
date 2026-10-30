/**
 * Eprouve la lecture des horodatages venus du serveur.
 *
 * POURQUOI CE SCRIPT. Le defaut qu'il protege ne s'est vu qu'apres six versions, sur le
 * telephone du client, sous la forme d'un « Invalid Date » dans « Mes annonces ». Il etait
 * pourtant partout : dix endroits de l'application parsaient le meme format, et l'un d'eux —
 * la jauge de duree de vie des signalements — echouait EN SILENCE depuis le debut, parce
 * qu'un garde-fou bien intentionne transformait l'erreur en « pas de jauge a afficher ».
 *
 * Il n'a jamais pu etre vu en developpement : `new Date()` de Node accepte le format de
 * PostgreSQL par indulgence, HERMES le refuse. Tout ce qui se verifie dans un navigateur ou
 * sur un poste de travail passe donc sans rien dire.
 *
 * Les cas ci-dessous sont des chaines REELLES, relevees sur la production, plus les formes
 * voisines que le serveur pourrait renvoyer un jour.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-dates.ts
 */
import {
  dateDepuisServeur,
  millisecondesDepuisServeur,
  normaliserHorodatage,
} from '../src/shared/dates';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/* ------------------------------------------------------------------ */
/* Les chaines relevees sur la production                               */
/* ------------------------------------------------------------------ */

console.log('\nLES HORODATAGES REELS DU SERVEUR');
/* Le decalage est ecrit « +00:00 » et non « Z ». Les deux sont de l'ISO 8601 valide et
 * designent le meme instant ; completer le decalage existant est plus honnete que de le
 * remplacer par un « Z », qui ferait perdre l'information d'un serveur regle sur un autre
 * fuseau. Ma premiere version de ce test attendait « Z » — c'est l'ATTENTE qui etait fausse,
 * pas le code, et il a fallu que le script le dise pour que je m'en aperçoive. */
const REELS: [string, string][] = [
  ['2026-08-27 06:00:25.887144+00', '2026-08-27T06:00:25.887+00:00'],
  ['2026-10-28 21:02:14.962031+00', '2026-10-28T21:02:14.962+00:00'],
  ['2026-10-29 23:43:28+00', '2026-10-29T23:43:28+00:00'],
];
for (const [brut, attendu] of REELS) {
  const iso = normaliserHorodatage(brut);
  verifier(`« ${brut} »`, iso === attendu, iso);
  const d = dateDepuisServeur(brut);
  verifier('  ... et elle se lit comme une vraie date', d !== null && !Number.isNaN(d.getTime()));
}

console.log('\nCE QUI FAISAIT ECHOUER HERMES, point par point');
verifier(
  "l'espace devient un « T »",
  normaliserHorodatage('2026-01-02 03:04:05+00').includes('T'),
);
verifier(
  'les six decimales sont ramenees a trois',
  normaliserHorodatage('2026-01-02 03:04:05.123456+00') === '2026-01-02T03:04:05.123+00:00',
  normaliserHorodatage('2026-01-02 03:04:05.123456+00'),
);
verifier(
  '« +00 » devient « +00:00 »',
  normaliserHorodatage('2026-01-02T03:04:05+00').endsWith('+00:00'),
  normaliserHorodatage('2026-01-02T03:04:05+00'),
);
verifier(
  'une chaine sans decalage est lue en UTC et non en heure locale',
  normaliserHorodatage('2026-01-02 03:04:05').endsWith('Z'),
  'sinon l\'affichage glisse d\'une heure, et change de JOUR a minuit',
);

console.log("\nL'ISO DEJA VALIDE PASSE SANS ETRE ABIME");
for (const iso of [
  '2026-01-02T03:04:05.123Z',
  '2026-01-02T03:04:05Z',
  '2026-01-02T03:04:05+01:00',
]) {
  verifier(`« ${iso} »`, normaliserHorodatage(iso) === iso, normaliserHorodatage(iso));
}

console.log('\nLA DATE LUE EST LA BONNE, A LA MILLISECONDE');
const d = dateDepuisServeur('2026-08-27 06:00:25.887144+00')!;
verifier('annee 2026', d.getUTCFullYear() === 2026);
verifier('mois aout (7)', d.getUTCMonth() === 7, `${d.getUTCMonth()}`);
verifier('jour 27', d.getUTCDate() === 27);
verifier('06 h 00 UTC', d.getUTCHours() === 6 && d.getUTCMinutes() === 0);
verifier('887 millisecondes', d.getUTCMilliseconds() === 887, `${d.getUTCMilliseconds()}`);

console.log('\nUNE DATE ABSENTE OU ILLISIBLE REND null, JAMAIS NaN');
/* C'est le coeur du probleme : NaN se propage en silence dans les calculs, et la jauge
 * disparaissait sans que rien ne le signale. `null` force l'appelant a en decider. */
for (const mauvais of [null, undefined, '', '   ', 'pas une date', '2026-13-45 99:99:99']) {
  verifier(
    `${JSON.stringify(mauvais)} -> null`,
    dateDepuisServeur(mauvais as string | null) === null &&
      millisecondesDepuisServeur(mauvais as string | null) === null,
  );
}

console.log("\nLE CALCUL D'ANCIENNETE DONNE UN NOMBRE, PAS NaN");
const ilYaUneHeure = new Date(Date.now() - 3_600_000);
/* On refabrique le format de PostgreSQL a partir d'une vraie date, pour verifier le chemin
 * complet : serveur -> chaine -> lecture -> difference en minutes. */
const commeLeServeur = ilYaUneHeure
  .toISOString()
  .replace('T', ' ')
  .replace(/\.(\d{3})Z$/, '.$1000+00');
const ms = millisecondesDepuisServeur(commeLeServeur)!;
const minutes = Math.round((Date.now() - ms) / 60000);
verifier('il y a environ 60 minutes', minutes >= 59 && minutes <= 61, `${minutes} min`);

console.log(
  fautes === 0
    ? '\nLes dates du serveur se lisent partout de la meme facon.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
