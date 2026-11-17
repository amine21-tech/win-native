/**
 * Eprouve L'ECHELLE DU CURSEUR DE RAYON — point E.3 du 18 novembre, module Emploi.
 *
 * POURQUOI UNE ECHELLE NON LINEAIRE, ET POURQUOI ELLE MERITE D'ETRE EPROUVEE.
 *
 * Le document demande une course de 0 a 2000 km. Sur la largeur d'un telephone — environ
 * trois cent quarante points utiles — un point vaudrait six kilometres : regler CINQUANTE,
 * qui est la valeur par defaut et celle que presque tout le monde veut, demanderait de viser
 * huit points depuis le bord gauche. Impossible au doigt.
 *
 * La moitie gauche de la course couvre donc 1 a 100 km, la moitie droite 100 a 2000. C'est un
 * choix qui rend le curseur utilisable, et c'est aussi un choix qui peut etre SUBTILEMENT
 * FAUX : une echelle dont l'aller et le retour ne se correspondent pas fait sauter le pouce
 * sous le doigt, et personne ne sait dire pourquoi en regardant le code.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-curseur-rayon.ts
 */
import {
  fractionDepuisRayon,
  RAYON_MAX_KM,
  RAYON_MIN_KM,
  rayonDepuisFraction,
} from '../src/jobs/echelleRayon';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

console.log('\nLES DEUX BOUTS DE LA COURSE');
verifier(`tout a gauche : ${RAYON_MIN_KM} km`, rayonDepuisFraction(0) === RAYON_MIN_KM);
verifier(`tout a droite : ${RAYON_MAX_KM} km`, rayonDepuisFraction(1) === RAYON_MAX_KM);
/* UN DOIGT QUI DEBORDE NE CASSE RIEN. `locationX` peut sortir de la zone pendant un
 * glissement rapide ; on borne plutot que de rendre un rayon negatif ou absurde. */
verifier('le doigt deborde a gauche : borne au minimum', rayonDepuisFraction(-0.3) === RAYON_MIN_KM);
verifier('le doigt deborde a droite : borne au maximum', rayonDepuisFraction(1.4) === RAYON_MAX_KM);

console.log('\nLA MOITIE GAUCHE EST LA ZONE UTILE');
/* C'est tout l'objet de l'echelle : les valeurs qu'on regle vraiment doivent occuper la
 * moitie de la course, pas ses huit premiers points. */
const milieu = rayonDepuisFraction(0.5);
verifier('la moitie de la course mene a 100 km', milieu === 100, `${milieu} km`);
const cinquante = fractionDepuisRayon(50);
verifier(
  '50 km — la valeur par defaut — tombe vers le quart de la course',
  cinquante > 0.2 && cinquante < 0.3,
  `a ${Math.round(cinquante * 100)} % de la course`,
);
/* SUR UN ECRAN REEL. Trois cent quarante points de large : combien de points separent 50 de
 * 60 km ? En lineaire ce serait moins de deux — intouchable. */
const LARGEUR = 340;
const ecart = Math.abs(fractionDepuisRayon(60) - fractionDepuisRayon(50)) * LARGEUR;
verifier(
  'de 50 a 60 km, le pouce parcourt une distance attrapable',
  ecart >= 10,
  `${Math.round(ecart)} points sur ${LARGEUR} (moins de 2 en echelle lineaire)`,
);

console.log("\nL'ALLER ET LE RETOUR SE CORRESPONDENT");
/* Si `fractionDepuisRayon` n'est pas l'inverse de `rayonDepuisFraction`, le pouce saute sous
 * le doigt : on le pose a un endroit, il se replace ailleurs. Le defaut est invisible a la
 * lecture et evident a l'usage. */
const ecarts: string[] = [];
for (const km of [1, 5, 10, 25, 50, 100, 150, 300, 500, 1000, 1500, 2000]) {
  const retour = rayonDepuisFraction(fractionDepuisRayon(km));
  /* On tolere l'arrondi au pas d'affichage — 5 km sous 50, 100 km au-dela de 1000 : c'est
   * lui qui rend les valeurs lisibles, et il ne fait jamais sauter le pouce de plus d'un pas. */
  const pas = km < 50 ? 5 : km < 200 ? 10 : km < 1000 ? 50 : 100;
  if (Math.abs(retour - km) > pas) ecarts.push(`${km} -> ${retour}`);
}
verifier(
  'douze valeurs font l aller-retour sans deriver',
  ecarts.length === 0,
  ecarts.join(' · ') || 'le pouce reste ou on le pose',
);

console.log("\nL'ECHELLE EST CROISSANTE, SANS PALIER MORT");
/* Un curseur qui rend deux fois la meme valeur sur une partie de sa course donne
 * l'impression d'etre coince — on pousse, rien ne bouge. */
let precedent = -1;
let recule = 0;
let distinctes = new Set<number>();
for (let f = 0; f <= 1.0001; f += 0.01) {
  const km = rayonDepuisFraction(f);
  if (km < precedent) recule += 1;
  precedent = km;
  distinctes.add(km);
}
verifier('elle ne recule jamais', recule === 0, `${recule} recul(s) sur 101 positions`);
verifier(
  'et elle donne assez de valeurs distinctes',
  distinctes.size >= 30,
  `${distinctes.size} valeurs sur 101 positions`,
);

console.log('\nLES VALEURS SONT RONDES');
/* Personne ne distingue 1240 de 1245 km, et un nombre qui bouge de un en un donne
 * l'impression d'un reglage qu'on ne maitrise pas. */
const brutes: number[] = [0.13, 0.37, 0.52, 0.68, 0.84, 0.97].map(rayonDepuisFraction);
verifier(
  'aucune valeur bizarre',
  brutes.every((km) => km % 5 === 0 || km === RAYON_MIN_KM),
  brutes.join(' · '),
);

console.log(
  fautes === 0
    ? '\nLe curseur se regle au doigt, et le pouce reste ou on le pose.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
