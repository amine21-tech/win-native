/**
 * Eprouve les paliers du degrade du trace.
 *
 * POURQUOI CE SCRIPT. Les paliers d'une interpolation MapLibre doivent croitre STRICTEMENT. Un
 * seul palier qui ne progresse pas fait rejeter la couche ENTIERE : le trace disparait, sans
 * message, sans erreur, sans rien dans la console. Le defaut ne se verrait qu'en navigation, sur
 * un telephone — c'est-a-dire trop tard, et chez le client.
 *
 * Les cas ci-dessous sont ceux qui FABRIQUENT des paliers egaux : une bande collee au depart,
 * une bande collee a l'arrivee, deux bandes qui se chevauchent, le vehicule pile sur un bord de
 * bande, une bande plus courte que la coupure. Chacun a ete choisi parce qu'il produit
 * naturellement deux bornes identiques.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-degrade.ts
 */
import { paliersDuTrace, type BandeTrafic } from '../src/navigation/degradeTrace';

const attenuer = (c: string) => `${c}@25`;

type Cas = { nom: string; fait: number; bandes: BandeTrafic[] };

const CAS: Cas[] = [
  { nom: 'rien : ni progression ni trafic', fait: 0, bandes: [] },
  { nom: 'progression seule, a mi-parcours', fait: 0.5, bandes: [] },
  { nom: 'progression a 0 pile', fait: 0, bandes: [{ debut: 0.2, fin: 0.3, couleur: '#E67E22' }] },
  { nom: 'progression a 1 pile', fait: 1, bandes: [{ debut: 0.2, fin: 0.3, couleur: '#E67E22' }] },
  { nom: 'bande collee au depart', fait: 0.1, bandes: [{ debut: 0, fin: 0.05, couleur: '#C0392B' }] },
  { nom: 'bande collee a l arrivee', fait: 0.1, bandes: [{ debut: 0.97, fin: 1, couleur: '#C0392B' }] },
  {
    nom: 'deux bandes qui se chevauchent',
    fait: 0.1,
    bandes: [
      { debut: 0.3, fin: 0.5, couleur: '#E67E22' },
      { debut: 0.4, fin: 0.6, couleur: '#C0392B' },
    ],
  },
  {
    nom: 'deux bandes collees bord a bord',
    fait: 0.1,
    bandes: [
      { debut: 0.3, fin: 0.4, couleur: '#E67E22' },
      { debut: 0.4, fin: 0.5, couleur: '#C0392B' },
    ],
  },
  {
    nom: 'vehicule pile sur le bord d une bande',
    fait: 0.3,
    bandes: [{ debut: 0.3, fin: 0.45, couleur: '#E67E22' }],
  },
  {
    nom: 'bande plus courte que la coupure',
    fait: 0.1,
    bandes: [{ debut: 0.5, fin: 0.5000001, couleur: '#E67E22' }],
  },
  {
    nom: 'bande de longueur nulle',
    fait: 0.1,
    bandes: [{ debut: 0.5, fin: 0.5, couleur: '#E67E22' }],
  },
  {
    nom: 'trajet couvert de bout en bout',
    fait: 0.4,
    bandes: [{ debut: 0, fin: 1, couleur: '#C0392B' }],
  },
  {
    nom: 'treize bandes, un trajet charge',
    fait: 0.22,
    bandes: Array.from({ length: 13 }, (_, i) => ({
      debut: i / 13,
      fin: i / 13 + 0.01,
      couleur: i % 2 === 0 ? '#E67E22' : '#C0392B',
    })),
  },
];

let fautes = 0;

for (const cas of CAS) {
  const paliers = paliersDuTrace('#PARCOURU', '#AVANT', cas.fait, cas.bandes, attenuer);

  const positions: number[] = [];
  for (let i = 0; i < paliers.length; i += 2) positions.push(paliers[i] as number);

  const problemes: string[] = [];

  if (paliers.length % 2 !== 0) problemes.push('nombre impair de valeurs');
  if (positions.length < 2) problemes.push('moins de deux paliers');

  for (let i = 1; i < positions.length; i += 1) {
    if (!(positions[i]! > positions[i - 1]!)) {
      problemes.push(`palier ${i} ne progresse pas : ${positions[i - 1]} puis ${positions[i]}`);
    }
  }
  for (const p of positions) {
    if (!Number.isFinite(p) || p < 0 || p > 1) problemes.push(`palier hors de [0,1] : ${p}`);
  }
  for (let i = 1; i < paliers.length; i += 2) {
    if (typeof paliers[i] !== 'string') problemes.push(`couleur manquante au rang ${i}`);
  }

  if (problemes.length > 0) {
    fautes += 1;
    console.log(`NON   ${cas.nom}`);
    for (const p of problemes) console.log(`        ${p}`);
    console.log(`        paliers : ${JSON.stringify(paliers)}`);
  } else {
    console.log(`OK    ${cas.nom} — ${positions.length} paliers`);
  }
}

console.log('');
if (fautes > 0) {
  console.log(`${fautes} cas sur ${CAS.length} produisent des paliers que MapLibre refuserait.`);
  process.exit(1);
}
console.log(`${CAS.length} cas : tous les paliers croissent strictement et restent dans [0,1].`);
