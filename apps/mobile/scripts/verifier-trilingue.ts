/**
 * Eprouve la RECHERCHE TRILINGUE et la CORRECTION PHONETIQUE — point 11 du 9 novembre.
 *
 * << CORRECTION PHONETIQUE automatique : 'Bejaia' → 'Béjaïa', 'Tizi Ouzu' → 'Tizi Ouzou'.
 *    Recherche TRILINGUE : francais, arabe, tamazight. >>
 *
 * POURQUOI CE SCRIPT. Une recherche qui ne trouve rien ne provoque aucune erreur : elle rend une
 * liste vide, et l'utilisateur en conclut que le lieu n'existe pas dans l'application. C'est le
 * genre de defaut qu'on ne decouvre que par une plainte, des mois plus tard, et jamais en
 * relisant du code — la fonction fait exactement ce qu'elle dit, elle ne couvre simplement pas
 * ce qu'on a tape.
 *
 * Les trois chemins sont donc verifies ici, saisie par saisie : le francais mal orthographie,
 * l'arabe, et le tifinagh.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-trilingue.ts
 */
import {
  CITY_ALIASES,
  corrigerLieu,
  DZ_WILAYA_NAMES,
  estArabe,
  estTifinagh,
  normalizeCity,
  translittererRequete,
  translittererTifinagh,
  WILAYAS_AR,
} from '../src/shared/search';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/** La chaine de traitement COMPLETE, dans l'ordre exact ou l'application l'applique. */
function chercher(saisie: string): string {
  const latin = translittererRequete(saisie);
  return corrigerLieu(CITY_ALIASES[normalizeCity(latin)] ?? latin);
}

/* ------------------------------------------------------------------ */
console.log('\nLES DEUX EXEMPLES DU DOCUMENT');

verifier("« Bejaia » → « Béjaïa »", chercher('Bejaia') === 'Béjaïa', chercher('Bejaia'));
verifier("« Tizi Ouzu » → « Tizi Ouzou »", chercher('Tizi Ouzu') === 'Tizi Ouzou', chercher('Tizi Ouzu'));

console.log('\nLE FRANCAIS MAL ORTHOGRAPHIE, PLUS LARGEMENT');
for (const [saisie, attendu] of [
  ['bejaia', 'Béjaïa'],
  ['tizi uzou', 'Tizi Ouzou'],
  ['Constantin', 'Constantine'],
  ['Setif', 'Sétif'],
  ['Ghardaia', 'Ghardaïa'],
  ['Bordj Bou Areridj', 'Bordj Bou Arréridj'],
  /* LE NOM KABYLE EN ALPHABET LATIN, qui marche depuis le 2 novembre par la meme mesure de
   * proximite : c'est deja une partie du trilingue demande. */
  ['Bgayet', 'Béjaïa'],
] as [string, string][]) {
  verifier(`« ${saisie} » → « ${attendu} »`, chercher(saisie) === attendu, chercher(saisie));
}

console.log('\nCE QUI EST DEJA JUSTE N EST PAS ABIME');
for (const nom of ['Tlemcen', 'Alger', 'Oran', 'Annaba']) {
  verifier(`« ${nom} » reste « ${nom} »`, chercher(nom) === nom, chercher(nom));
}
verifier(
  'un commerce quelconque traverse sans etre touche',
  chercher('Boulangerie du centre') === 'Boulangerie du centre',
  chercher('Boulangerie du centre'),
);

/* ------------------------------------------------------------------ */
console.log("\nL ARABE : LA TABLE, PARCE QU AUCUNE REGLE N Y SUFFIT");

/**
 * POURQUOI UNE TABLE ET PAS UNE TRANSLITTERATION. L'arabe ne note pas les voyelles courtes :
 * << وهران >> s'ecrit w-h-r-a-n. Une conversion lettre a lettre en tire << whran >>, qui ne
 * ressemble a << Oran >> par aucune mesure de proximite. Idem pour << قسنطينة >>, soit
 * q-s-n-t-i-n-a, face a << Constantine >>.
 *
 * Ces deux cas sont dans la liste ci-dessous exactement pour cela : ce sont ceux qu'une solution
 * mecanique raterait, et donc ceux qui prouvent que la table est bien consultee.
 */
for (const [saisie, attendu] of [
  ['وهران', 'Oran'],
  ['قسنطينة', 'Constantine'],
  ['تيزي وزو', 'Tizi Ouzou'],
  ['بجاية', 'Béjaïa'],
  ['الجزائر', 'Alger'],
  ['سطيف', 'Sétif'],
  ['تيبازة', 'Tipaza'],
  ['عين تموشنت', 'Aïn Témouchent'],
  ['برج بوعريريج', 'Bordj Bou Arréridj'],
] as [string, string][]) {
  verifier(`« ${saisie} » → « ${attendu} »`, chercher(saisie) === attendu, chercher(saisie));
}

console.log('\nUN NOM DE VILLE AU MILIEU D UNE PHRASE ARABE');
verifier(
  '« صيدلية تيزي وزو » garde le mot cherche et corrige la ville',
  chercher('صيدلية تيزي وزو') === 'صيدلية Tizi Ouzou',
  chercher('صيدلية تيزي وزو'),
);

console.log("\nCE QUE LA TABLE NE CONNAIT PAS REPART INTACT");
verifier(
  'un mot arabe inconnu traverse sans etre abime',
  chercher('مطعم') === 'مطعم',
  'le geocodeur fera ce qu il peut : ne rien reconnaitre ne doit pas etre pire que ne pas essayer',
);

/* ------------------------------------------------------------------ */
console.log('\nLE TIFINAGH : UNE TRANSLITTERATION, PARCE QU IL NOTE LES VOYELLES');

verifier('ⵜⵉⵣⵉ → tizi', translittererTifinagh('ⵜⵉⵣⵉ') === 'tizi', translittererTifinagh('ⵜⵉⵣⵉ'));
verifier(
  '« ⵜⵉⵣⵉ ⵡⵣⵣⵓ » trouve Tizi Ouzou',
  chercher('ⵜⵉⵣⵉ ⵡⵣⵣⵓ') === 'Tizi Ouzou',
  chercher('ⵜⵉⵣⵉ ⵡⵣⵣⵓ'),
);
verifier(
  '« ⵍⵣⵣⴰⵢⵔ » trouve Alger',
  chercher('ⵍⵣⵣⴰⵢⵔ') === 'Alger',
  chercher('ⵍⵣⵣⴰⵢⵔ'),
);
verifier(
  '« ⴱⴳⴰⵢⴻⵜ » trouve Béjaïa',
  chercher('ⴱⴳⴰⵢⴻⵜ') === 'Béjaïa',
  chercher('ⴱⴳⴰⵢⴻⵜ'),
);
verifier(
  'les lettres composees rendent deux caracteres latins',
  translittererTifinagh('ⵖⵅⵛ') === 'ghkhch',
  translittererTifinagh('ⵖⵅⵛ'),
);

/* ------------------------------------------------------------------ */
console.log('\nLA DETECTION D ECRITURE NE SE TROMPE PAS');

verifier('l arabe est reconnu', estArabe('وهران') && !estArabe('Oran'));
verifier('le tifinagh est reconnu', estTifinagh('ⵜⵉⵣⵉ') && !estTifinagh('tizi'));
verifier(
  'le tifinagh n est pas pris pour de l arabe',
  !estArabe('ⵜⵉⵣⵉ ⵡⵣⵣⵓ'),
  'les deux plages Unicode sont distinctes, mais la confusion serait silencieuse',
);
verifier(
  'une saisie vide ne plante pas',
  translittererRequete('') === '' && translittererRequete('   ') === '   ',
);

/* ------------------------------------------------------------------ */
console.log('\nLA TABLE ARABE EST COMPLETE ET SANS FAUTE DE FRAPPE');

/**
 * LE CONTROLE QUI RATTRAPE UNE COQUILLE. Chaque valeur de la table doit etre un nom que le reste
 * de l'application connait — sans quoi la saisie arabe donnerait un nom latin que le classement
 * ne reconnaitrait pas comme une wilaya, et la ville retomberait dans le lot commun. Le defaut
 * serait invisible : la recherche rendrait des resultats, simplement pas le bon en tete.
 */
const inconnus = Object.values(WILAYAS_AR).filter((n) => !DZ_WILAYA_NAMES.includes(n));
verifier(
  `les ${Object.keys(WILAYAS_AR).length} entrees arabes designent toutes une wilaya connue`,
  inconnus.length === 0,
  inconnus.join(', ') || `sur ${DZ_WILAYA_NAMES.length} wilayas`,
);

const couvertes = new Set(Object.values(WILAYAS_AR));
const manquantes = DZ_WILAYA_NAMES.filter((n) => !couvertes.has(n));
verifier(
  `les ${DZ_WILAYA_NAMES.length} wilayas ont toutes un nom arabe`,
  manquantes.length === 0,
  manquantes.join(', ') || 'aucune oubliee',
);

console.log(
  fautes === 0
    ? '\nLes trois langues menent au meme lieu.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
