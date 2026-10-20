/**
 * Controle de la tolerance aux fautes de frappe et aux transcriptions.
 *
 * Le client demande que << tizi uzou >> trouve << Tizi Ouzou >>. Une correction automatique est
 * une arme a deux tranchants : celle qui rattrape une faute peut aussi en inventer une. Ce
 * fichier verifie donc les DEUX sens — ce qui doit etre corrige, et surtout ce qui ne doit
 * surtout pas l'etre.
 *
 * Lancer :  npx tsx apps/mobile/scripts/verifier-recherche-floue.ts
 */
import { corrigerLieu, phoneticKey } from '../src/shared/search';

type Cas = { saisie: string; attendu: string; pourquoi: string };

/* Ce qui DOIT etre corrige. */
const A_CORRIGER: Cas[] = [
  { saisie: 'tizi uzou', attendu: 'Tizi Ouzou', pourquoi: "transcription anglaise du 'ou'" },
  { saisie: 'tizi ouzou', attendu: 'Tizi Ouzou', pourquoi: 'orthographe exacte, sans accent' },
  { saisie: 'boumerdas', attendu: 'Boumerdès', pourquoi: 'voyelle finale differente' },
  { saisie: 'boumerdes', attendu: 'Boumerdès', pourquoi: 'accent manquant' },
  { saisie: 'bejaia', attendu: 'Béjaïa', pourquoi: 'accents manquants' },
  { saisie: 'bgaia', attendu: 'Béjaïa', pourquoi: 'nom kabyle de la ville' },
  { saisie: 'bgayet', attendu: 'Béjaïa', pourquoi: 'nom kabyle, orthographe usuelle' },
  { saisie: 'wahran', attendu: 'Oran', pourquoi: 'nom arabe de la ville' },
  { saisie: 'qacentina', attendu: 'Constantine', pourquoi: 'nom arabe de la ville' },
  { saisie: 'pharmacie wahran', attendu: 'pharmacie Oran', pourquoi: 'autre nom en fin de phrase' },
  { saisie: 'setif', attendu: 'Sétif', pourquoi: 'accent manquant' },
  { saisie: 'sidi belabes', attendu: 'Sidi Bel Abbès', pourquoi: 'espace et doublement perdus' },
  { saisie: 'ghardaya', attendu: 'Ghardaïa', pourquoi: "'y' pour 'i'" },
  { saisie: 'jelfa', attendu: 'Djelfa', pourquoi: "'dj' ecrit 'j'" },
  { saisie: 'shlef', attendu: 'Chlef', pourquoi: "'sh' pour 'ch'" },
  { saisie: 'tlemsen', attendu: 'Tlemcen', pourquoi: "'s' pour 'c'" },
  { saisie: 'constantin', attendu: 'Constantine', pourquoi: 'lettre finale oubliee' },
  { saisie: 'tebesa', attendu: 'Tébessa', pourquoi: 'consonne non doublee' },
  { saisie: 'naama', attendu: 'Naâma', pourquoi: 'accent circonflexe manquant' },
  // La partie « lieu » corrigee, le reste intact : c'est tout l'interet.
  { saisie: 'pharmacie tizi uzou', attendu: 'pharmacie Tizi Ouzou', pourquoi: 'seul le lieu bouge' },
  { saisie: 'bureau de poste boumerdas', attendu: 'bureau de poste Boumerdès', pourquoi: 'lieu en fin de phrase' },
  { saisie: 'clinique sidi belabes', attendu: 'clinique Sidi Bel Abbès', pourquoi: 'lieu de trois mots' },
];

/* Ce qui ne doit PAS bouger. */
const A_LAISSER: Cas[] = [
  { saisie: 'poste', attendu: 'poste', pourquoi: 'mot courant, jamais une ville' },
  { saisie: 'hotel', attendu: 'hotel', pourquoi: 'mot courant' },
  { saisie: 'pharmacie', attendu: 'pharmacie', pourquoi: 'mot courant' },
  { saisie: 'plage', attendu: 'plage', pourquoi: 'mot courant' },
  { saisie: 'gym younes', attendu: 'gym younes', pourquoi: "nom d'un commerce" },
  { saisie: 'salle gaya', attendu: 'salle gaya', pourquoi: "nom d'un commerce" },
  { saisie: 'plage medusa', attendu: 'plage medusa', pourquoi: "nom d'un lieu-dit" },
  { saisie: 'bab ezzouar', attendu: 'bab ezzouar', pourquoi: 'commune, mais pas une wilaya' },
  { saisie: 'restaurant la cascade', attendu: 'restaurant la cascade', pourquoi: "nom d'un commerce" },
  { saisie: 'rue didouche mourad', attendu: 'rue didouche mourad', pourquoi: "nom d'une rue" },
  { saisie: 'ab', attendu: 'ab', pourquoi: 'trop court pour decider quoi que ce soit' },
  { saisie: '', attendu: '', pourquoi: 'saisie vide' },
];

let echecs = 0;

function verifier(titre: string, cas: Cas[]) {
  console.log(`\n${titre}`);
  for (const c of cas) {
    const obtenu = corrigerLieu(c.saisie);
    const ok = obtenu === c.attendu;
    if (!ok) echecs += 1;
    console.log(
      `  ${ok ? 'OK  ' : 'RATE'} ${JSON.stringify(c.saisie).padEnd(30)} -> ${JSON.stringify(obtenu).padEnd(26)} ${
        ok ? `(${c.pourquoi})` : `ATTENDU ${JSON.stringify(c.attendu)}`
      }`,
    );
  }
}

verifier('Doit etre corrige', A_CORRIGER);
verifier('Ne doit PAS bouger', A_LAISSER);

console.log('\nQuelques cles phonetiques, pour comprendre ce qui se passe :');
for (const n of ['Tizi Ouzou', 'tizi uzou', 'Boumerdès', 'boumerdas', 'Sidi Bel Abbès', 'sidi belabes']) {
  console.log(`  ${JSON.stringify(n).padEnd(20)} -> ${phoneticKey(n)}`);
}

console.log(`\n${A_CORRIGER.length + A_LAISSER.length} cas, ${echecs} echec(s).`);
process.exit(echecs === 0 ? 0 : 1);
