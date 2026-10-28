/**
 * Eprouve `pointAu`, qui avance d'une distance depuis un point selon un cap.
 *
 * POURQUOI. Elle sert au pre-calcul anticipatif (point 10C) : c'est elle qui devine ou l'on se
 * trouvera si l'on rate une sortie d'autoroute. Une erreur de quelques dizaines de metres et le
 * point tombe sur la bretelle plutot que sur la voie rapide — Valhalla raccroche alors au
 * mauvais troncon, et l'itineraire prepare envoie dans la direction opposee. Le defaut ne se
 * verrait qu'en roulant, a 110 km/h, au pire moment.
 *
 * La verification est un ALLER-RETOUR : on avance, puis on mesure. Si la distance et le cap
 * retrouves correspondent, la formule est juste — sans avoir a faire confiance a son ecriture.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-geo.ts
 */
import { bearing, haversine, pointAu } from '../src/shared/geo';

/* Quatre lieux reels, choisis pour leurs latitudes : la longueur d'un degre de longitude varie
 * du simple au double entre Tamanrasset et Alger, et c'est exactement ce que la formule doit
 * prendre en compte. */
const LIEUX = [
  { nom: 'Alger', lat: 36.7538, lon: 3.0588 },
  { nom: 'Oran', lat: 35.6971, lon: -0.6308 },
  { nom: 'Tamanrasset', lat: 22.785, lon: 5.5228 },
  { nom: 'Tunis', lat: 36.8065, lon: 10.1815 },
];

const CAPS = [0, 45, 90, 135, 180, 225, 270, 315, 359];
const DISTANCES = [30, 300, 1_000, 5_000];

const TOLERANCE_M = 0.5;
const TOLERANCE_CAP = 0.5;

let fautes = 0;
let essais = 0;

for (const lieu of LIEUX) {
  for (const cap of CAPS) {
    for (const metres of DISTANCES) {
      essais += 1;
      const arrivee = pointAu(lieu.lat, lieu.lon, cap, metres);

      const mesuree = haversine(lieu.lat, lieu.lon, arrivee.lat, arrivee.lon);
      const capMesure = bearing(lieu.lat, lieu.lon, arrivee.lat, arrivee.lon);
      const ecartCap = Math.min(Math.abs(capMesure - cap), 360 - Math.abs(capMesure - cap));

      const problemes: string[] = [];
      if (Math.abs(mesuree - metres) > TOLERANCE_M) {
        problemes.push(`distance ${mesuree.toFixed(2)} m au lieu de ${metres}`);
      }
      if (ecartCap > TOLERANCE_CAP) {
        problemes.push(`cap ${capMesure.toFixed(2)}° au lieu de ${cap}°`);
      }
      if (!Number.isFinite(arrivee.lat) || Math.abs(arrivee.lat) > 90) {
        problemes.push(`latitude hors bornes : ${arrivee.lat}`);
      }
      if (!Number.isFinite(arrivee.lon) || Math.abs(arrivee.lon) > 180) {
        problemes.push(`longitude hors bornes : ${arrivee.lon}`);
      }

      if (problemes.length > 0) {
        fautes += 1;
        console.log(`NON   ${lieu.nom}, cap ${cap}°, ${metres} m`);
        for (const p of problemes) console.log(`        ${p}`);
      }
    }
  }
}

/* Cas limite a part : la longitude doit rester dans [-180, 180] meme en franchissant
 * l'antimeridien, sinon la valeur rendue est inutilisable telle quelle. */
const pres = pointAu(0, 179.999, 90, 1_000);
essais += 1;
if (pres.lon > 180 || pres.lon < -180) {
  fautes += 1;
  console.log(`NON   franchissement de l'antimeridien : longitude ${pres.lon}`);
}

console.log('');
if (fautes > 0) {
  console.log(`${fautes} cas sur ${essais} sont faux.`);
  process.exit(1);
}
console.log(`${essais} cas : distance et cap retrouves a moins de ${TOLERANCE_M} m et ${TOLERANCE_CAP}° pres.`);
