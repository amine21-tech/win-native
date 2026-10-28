/**
 * Eprouve l'ordre de classement du point 18 : la ville d'abord, puis les adresses VIP.
 *
 * POURQUOI CE SCRIPT. Le cas que decrit le client — taper << Tipaza >> et voir arriver des
 * commerces d'Alger avant la ville — ne se reproduit pas a volonte : il demande que notre base
 * contienne precisement un commerce nomme ainsi, loin de la ville homonyme. Autant dire qu'on
 * ne le reverra qu'en production, chez un utilisateur, et qu'on ne saura pas s'il est corrige.
 *
 * Les cas ci-dessous reconstituent la situation exacte, plus celles qui lui ressemblent et qui
 * cassent ce genre de classement : la ville plus LOIN que l'etablissement homonyme, le favori
 * hors perimetre, la position inconnue, et l'egalite entre deux villes de meme nom.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-recherche-villes.ts
 */
import { classerPoint18, PERIMETRE_VIP_M, rankSearchResults } from '../src/shared/search';

type Fiche = {
  name: string;
  lat: number;
  lon: number;
  osmKey?: string;
  osmValue?: string;
  type?: string;
  source: 'win' | 'photon';
  vip?: boolean;
};

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/** Le classement complet, tel que l'application l'applique : rang, puis paliers du point 18. */
function classer(fiches: Fiche[], requete: string, moi: { lat: number; lon: number } | null) {
  const rangs = rankSearchResults(fiches, requete, moi);
  return classerPoint18(rangs, {
    estVilleExacte: (r) => r.exactCity === true,
    estVip: (r) => (r as unknown as Fiche).vip === true,
    distanceM: (r) => r.distanceM,
  });
}

/* ------------------------------------------------------------------ */
/* Le cas du client, reconstitue                                        */
/* ------------------------------------------------------------------ */

/* Alger : 36.75 / 3.06. Tipaza : 36.59 / 2.45, soit une soixantaine de kilometres a l'ouest.
 * L'utilisateur est a Alger et tape << Tipaza >>. */
const ALGER = { lat: 36.75, lon: 3.06 };

const CAS_CLIENT: Fiche[] = [
  { name: 'Tipaza Pneus', lat: 36.752, lon: 3.062, source: 'win' }, // a 300 m, dans Alger
  { name: 'Tipaza Auto', lat: 36.748, lon: 3.058, source: 'win' }, // a 400 m, dans Alger
  { name: 'Tipaza', lat: 36.59, lon: 2.45, osmKey: 'place', osmValue: 'town', type: 'town', source: 'photon' },
];

console.log('\nLE CAS DU CLIENT : on tape « Tipaza » depuis Alger');
const resultat = classer(CAS_CLIENT, 'Tipaza', ALGER);
console.log('  ordre obtenu :', resultat.map((r) => r.name).join(' · '));
verifier(
  'la VILLE de Tipaza arrive en premier',
  resultat[0]?.name === 'Tipaza',
  `60 km, contre 300 m pour « ${CAS_CLIENT[0]!.name} »`,
);
verifier(
  'les etablissements homonymes suivent, par distance',
  resultat[1]?.name === 'Tipaza Pneus' && resultat[2]?.name === 'Tipaza Auto',
  resultat.slice(1).map((r) => r.name).join(' · '),
);

/* ------------------------------------------------------------------ */
/* Les adresses VIP                                                     */
/* ------------------------------------------------------------------ */

console.log('\nLES ADRESSES VIP PASSENT APRES LA VILLE, PAS AVANT');
/* LE FAVORI EST VOLONTAIREMENT LE PLUS ELOIGNE DES DEUX. Un favori plus proche passerait en
 * tete par la seule distance, et le test reussirait sans rien prouver — c'est exactement le
 * genre de controle qui donne confiance a tort. Ici, << Tipaza Auto >> est a 2 km et
 * << Tipaza Pneus >> a 300 m : seul le palier VIP peut inverser cet ordre. */
const avecVip: Fiche[] = [
  { name: 'Tipaza Pneus', lat: 36.752, lon: 3.062, source: 'win' },
  { name: 'Tipaza Auto', lat: 36.768, lon: 3.072, source: 'win', vip: true },
  { name: 'Tipaza', lat: 36.59, lon: 2.45, osmKey: 'place', osmValue: 'town', type: 'town', source: 'photon' },
];
const r2 = classer(avecVip, 'Tipaza', ALGER);
console.log('  ordre obtenu :', r2.map((r) => r.name).join(' · '));
verifier('la ville reste en tete', r2[0]?.name === 'Tipaza');
verifier(
  "l'adresse enregistree passe devant une adresse PLUS PROCHE qui ne l'est pas",
  r2[1]?.name === 'Tipaza Auto',
  '2 km contre 300 m : seul le palier VIP peut l\'expliquer',
);

console.log('\nUN FAVORI HORS PERIMETRE REDESCEND DANS LE LOT COMMUN');
/* Un favori enregistre a Oran (35.70 / -0.63), soit 350 km d'Alger : il repond au nom tape,
 * mais pas au besoin de quelqu'un qui cherche depuis Alger. */
const vipLoin: Fiche[] = [
  { name: 'Tipaza Oran', lat: 35.7, lon: -0.63, source: 'win', vip: true },
  { name: 'Tipaza Auto', lat: 36.748, lon: 3.058, source: 'win' },
];
const r3 = classer(vipLoin, 'Tipaza', ALGER);
console.log('  ordre obtenu :', r3.map((r) => r.name).join(' · '));
verifier(
  'le favori lointain ne passe pas devant un resultat proche',
  r3[0]?.name === 'Tipaza Auto',
  `perimetre VIP : ${PERIMETRE_VIP_M / 1000} km`,
);

console.log('\nSANS POSITION CONNUE, LE FAVORI RESTE PRIORITAIRE');
const r4 = classer(vipLoin, 'Tipaza', null);
verifier(
  'faute de distance, on fait confiance a ce que l\'utilisateur a enregistre',
  r4[0]?.name === 'Tipaza Oran',
  r4.map((r) => r.name).join(' · '),
);

/* ------------------------------------------------------------------ */
/* Ce qui ne doit pas avoir change                                      */
/* ------------------------------------------------------------------ */

console.log('\nCE QUI MARCHAIT DOIT CONTINUER DE MARCHER');
/* Deux villes homonymes : la plus grande d'abord, et non la plus proche. C'est le
 * comportement repris de la v83, que le point 18 ne doit pas defaire. */
const homonymes: Fiche[] = [
  { name: 'Blida', lat: 36.73, lon: 3.05, osmKey: 'place', osmValue: 'village', type: 'village', source: 'photon' },
  { name: 'Blida', lat: 36.47, lon: 2.83, osmKey: 'place', osmValue: 'city', type: 'city', source: 'photon' },
];
const r5 = classer(homonymes, 'Blida', ALGER);
verifier(
  'entre deux villes homonymes, la plus grande passe devant la plus proche',
  (r5[0] as unknown as Fiche).osmValue === 'city',
  r5.map((r) => `${r.name} (${(r as unknown as Fiche).osmValue})`).join(' · '),
);

/* Une recherche qui ne vise aucune ville doit rester triee par la distance seule. */
const sansVille: Fiche[] = [
  { name: 'Pharmacie du Centre', lat: 36.8, lon: 3.1, source: 'photon' },
  { name: 'Pharmacie Centrale', lat: 36.752, lon: 3.062, source: 'win' },
];
const r6 = classer(sansVille, 'pharmacie', ALGER);
verifier(
  'sans ville visee, la plus proche reste en tete',
  r6[0]?.name === 'Pharmacie Centrale',
  r6.map((r) => r.name).join(' · '),
);

console.log(
  fautes === 0
    ? '\nLa ville passe toujours en premier.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
