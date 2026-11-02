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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classerPoint18,
  estWilayaVisee,
  PERIMETRE_VIP_M,
  rankSearchResults,
  wilayasVisees,
} from '../src/shared/search';

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
  const visees = wilayasVisees(requete);
  return classerPoint18(rangs, {
    estWilaya: (r) => estWilayaVisee(r, visees),
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


/* ------------------------------------------------------------------ */
/* Le cas « Constantine » du 31 octobre                                */
/* ------------------------------------------------------------------ */

/**
 * CE CAS EST PLUS DUR QUE « Tipaza », et c'est pour cela qu'il figure a part.
 *
 * Le concurrent n'est pas un commerce : « Gue de Constantine » est une VILLE, a huit kilometres
 * d'Alger, quand la Constantine cherchee est a trois cent vingt. Un classement qui se contente
 * de pousser les villes devant le reste les met donc toutes les deux devant — et la plus proche
 * gagne.
 *
 * Ce qui les separe est que le nom tape est EXACTEMENT celui de l'une et seulement une partie de
 * celui de l'autre. C'est ce que verifie ce bloc.
 */
/* ------------------------------------------------------------------ */
/* La saisie PARTIELLE d'un nom de wilaya                              */
/* ------------------------------------------------------------------ */

/**
 * PERSONNE NE TAPE << Tizi Ouzou >> EN ENTIER. On tape << tizi >>, on regarde la premiere
 * suggestion, on appuie. Le classement ne reconnaissait pourtant une ville que sur un nom
 * COMPLET : avec quatre lettres, Tizi Ouzou retombait dans le lot commun ou seule la distance
 * compte, et depuis Alger un commerce nomme << Tizi Pneus >> a trois cents metres passait
 * devant la wilaya a cent kilometres.
 *
 * C'est le meme symptome que << Tipaza >>, corrige deux fois deja, mais par une TROISIEME
 * porte : la premiere fois le classement etait faux, la deuxieme un bloc remontait les
 * partenaires par-dessus, ici la ville n'etait tout simplement pas reconnue comme telle. Trois
 * causes differentes pour un seul defaut visible — d'ou ce controle, qui vise la cause et non
 * le symptome.
 */
console.log('\nUN NOM DE WILAYA TAPE A MOITIE');

const tiziPartiel: Fiche[] = [
  { name: 'Tizi Pneus', lat: 36.75, lon: 3.058, source: 'win', vip: true },
  { name: 'Tizi Auto', lat: 36.752, lon: 3.059, source: 'win' },
  { name: 'Tizi Ouzou', lat: 36.7118, lon: 4.0458, osmKey: 'place', osmValue: 'city', type: 'city', source: 'photon' },
];
const r9 = classer(tiziPartiel, 'tizi', ALGER);
verifier(
  '« tizi » suggere la WILAYA en premier',
  r9[0]?.name === 'Tizi Ouzou',
  r9.map((r) => r.name).join(' · '),
);
verifier(
  'et les lieux ajoutes suivent, VIP avant simple',
  r9.findIndex((r) => r.name === 'Tizi Pneus') < r9.findIndex((r) => r.name === 'Tizi Auto'),
);

console.log("\nCE QUE LA SAISIE DESIGNE, ET CE QU'ELLE NE DESIGNE PAS");
verifier('« tizi » designe Tizi Ouzou', wilayasVisees('tizi').join(',') === 'Tizi Ouzou', wilayasVisees('tizi').join(', '));
verifier(
  "« ain » en designe deux, et c'est normal",
  wilayasVisees('ain').length === 2,
  wilayasVisees('ain').join(', '),
);
verifier(
  '« bej » trouve Bejaia malgre les accents',
  wilayasVisees('bej').includes('Béjaïa'),
  wilayasVisees('bej').join(', '),
);
verifier(
  "« msila » trouve M'Sila malgre l'apostrophe",
  wilayasVisees('msila').includes("M'Sila"),
  wilayasVisees('msila').join(', '),
);
verifier(
  'une seule lettre ne designe rien',
  wilayasVisees('a').length === 0,
  'sinon cinq wilayas occuperaient la tete et la suggestion ne suggererait plus rien',
);
verifier(
  '« pharmacie » ne designe aucune wilaya',
  wilayasVisees('pharmacie').length === 0,
);

/* UNE RUE QUI PORTE LE NOM D'UNE WILAYA N'EST PAS LA WILAYA. Sans ce controle, la << rue de
 * Tizi Ouzou >> a Alger monterait au premier palier, devant la ville elle-meme. */
console.log('\nUNE RUE DU MEME NOM NE PREND PAS LA PLACE DE LA WILAYA');
const rueHomonyme: Fiche[] = [
  { name: 'Tizi Ouzou', lat: 36.77, lon: 3.05, osmKey: 'highway', osmValue: 'residential', type: 'street', source: 'photon' },
  { name: 'Tizi Ouzou', lat: 36.7118, lon: 4.0458, osmKey: 'place', osmValue: 'city', type: 'city', source: 'photon' },
];
const r10 = classer(rueHomonyme, 'tizi', ALGER);
verifier(
  'la ville passe devant la rue homonyme, pourtant bien plus proche',
  (r10[0] as unknown as Fiche).osmValue === 'city',
  r10.map((r) => `${r.name} (${(r as unknown as Fiche).osmValue})`).join(' · '),
);

/* ------------------------------------------------------------------ */
/* L'ordre des trois familles : ville, VIP, puis le reste              */
/* ------------------------------------------------------------------ */

/**
 * LA REGLE DU CLIENT, RAPPELEE LE 2 NOVEMBRE : « les grandes villes sont avantagees par
 * rapport aux lieux ajoutes par des clients ; les lieux ajoutes en VIP passent avant les lieux
 * simples ». Soit trois familles, dans cet ordre : VILLE, VIP, SIMPLE.
 *
 * CE CONTROLE EXISTE PARCE QUE LE DEFAUT ETAIT REVENU PAR UNE AUTRE PORTE. Le classement
 * respectait deja cet ordre ; mais la liste de resultats extrayait ensuite les partenaires VIP
 * situes a moins de 60 km et les affichait EN TETE, avant tout le reste — y compris avant la
 * ville. Deux mecanismes, dont le second defaisait le premier.
 *
 * C'est le genre de defaut qu'un test de classement ne peut pas voir : `classerPoint18` rendait
 * le bon ordre, et la faute se produisait apres lui.
 */
console.log('\nVILLE, PUIS VIP, PUIS LE RESTE');

const troisFamilles: Fiche[] = [
  /* Un partenaire VIP tout proche, dont le nom contient celui de la ville : le cas qui fait
   * tomber a peu pres tous les classements naifs. */
  { name: 'Tipaza Pneus', lat: 36.75, lon: 3.058, source: 'win', vip: true },
  /* Un lieu simple ajoute par un utilisateur, plus proche encore. */
  { name: 'Tipaza Auto', lat: 36.752, lon: 3.059, source: 'win' },
  /* La ville, a soixante kilometres. */
  { name: 'Tipaza', lat: 36.59, lon: 2.45, osmKey: 'place', osmValue: 'city', type: 'city', source: 'photon' },
];
const r8 = classer(troisFamilles, 'Tipaza', ALGER);
verifier(
  'la ville passe devant le partenaire VIP, pourtant 60 km plus pres',
  r8[0]?.name === 'Tipaza',
  r8.map((r) => r.name).join(' · '),
);
verifier(
  'le partenaire VIP passe devant le lieu simple, pourtant plus proche',
  r8.findIndex((r) => r.name === 'Tipaza Pneus') < r8.findIndex((r) => r.name === 'Tipaza Auto'),
  "c'est la seule chose que le statut VIP achete : le rang, pas la premiere place",
);

/* LE CONTROLE SUR LE TEXTE, parce qu'un test de classement ne voit pas ce qui se passe APRES
 * lui. La remontee separee des partenaires vivait dans la liste de resultats, bien au-dela de
 * `classerPoint18`, et c'est pourtant elle qui defaisait l'ordre. */
console.log('\nRIEN NE REMONTE LES PARTENAIRES APRES LE CLASSEMENT');
const resultats = readFileSync(resolve('apps/mobile/src/components/SearchResults.tsx'), 'utf8');
verifier(
  "la liste de resultats n'extrait plus les partenaires en tete",
  !/partners\.map\(/.test(resultats),
  'ils gardent leur etoile a leur rang, ou le classement les a places',
);
verifier(
  'elle les dessine toujours differemment',
  /r\.isPartner \? \(/.test(resultats),
  'la mise en avant visuelle reste : seul le passe-droit sur la ville disparait',
);

console.log("\nLE CAS « CONSTANTINE » : UNE VILLE HOMONYME PLUS PROCHE");
const constantine: Fiche[] = [
  { name: 'Gué de Constantine', lat: 36.68, lon: 3.06, osmKey: 'place', osmValue: 'town', type: 'town', source: 'photon' },
  { name: 'Rue de Constantine', lat: 36.77, lon: 3.05, osmKey: 'highway', osmValue: 'residential', type: 'street', source: 'photon' },
  { name: 'Constantine', lat: 36.364, lon: 6.608, osmKey: 'place', osmValue: 'city', type: 'city', source: 'photon' },
];
const r7 = classer(constantine, 'Constantine', ALGER);
verifier(
  'la ville cherchee passe devant la ville homonyme quarante fois plus proche',
  r7[0]?.name === 'Constantine',
  r7.map((r) => r.name).join(' · '),
);
verifier(
  "une rue qui porte le nom de la ville ne prend pas sa place",
  r7.findIndex((r) => r.name === 'Constantine') <
    r7.findIndex((r) => r.name === 'Rue de Constantine'),
);

/* ------------------------------------------------------------------ */
/* La liste a classer doit d'abord CONTENIR la ville                    */
/* ------------------------------------------------------------------ */

/**
 * POURQUOI UN CONTROLE SUR LE TEXTE DU CODE, ici, parmi des controles de comportement.
 *
 * Tout ce qui precede eprouve le CLASSEMENT, sur des fiches ecrites a la main. Ces controles
 * passaient au vert pendant que le client voyait exactement le defaut qu'il decrit — parce que
 * le defaut etait ailleurs : en transmettant la position au geocodeur, on lui demandait les
 * resultats AUTOUR de l'utilisateur, et depuis Alger les douze places disponibles etaient prises
 * par le Gue de Constantine et les rues qui portent ce nom. La ville n'etait pas dans la liste
 * du tout, et aucun tri ne remonte un resultat absent.
 *
 * Un test sur fiches ne peut pas trouver cela : il PART de la liste. La correction du 31 octobre
 * est donc une requete supplementaire, sans position, et c'est son existence qu'on verifie ici.
 * Le cas reel est eprouve contre le vrai geocodeur par verifier-recherche-ville-reelle.ts ; ce
 * controle-ci ne demande pas le reseau et tient donc dans la serie lancee avant chaque version.
 */
console.log('\nLA RECHERCHE INTERROGE AUSSI LE GEOCODEUR SANS POSITION');
/* Chemin depuis la racine du depot, d'ou ce script se lance : les types de l'application
 * decrivent l'URL du navigateur, qui n'est pas celle de Node, et un chemin est de toute facon
 * plus lisible dans le message d'erreur si le fichier bouge. */
const FICHIER = 'apps/mobile/src/search/usePlaceSearch.ts';
let source: string;
try {
  source = readFileSync(resolve(FICHIER), 'utf8');
} catch {
  console.log(`  FAUX  ${FICHIER} introuvable — lancer ce script depuis la racine du depot`);
  process.exit(1);
}
verifier(
  'la troisieme requete, sans biais de position, existe toujours',
  /async function chercherPartout\(/.test(source),
  'sans elle, une ville lointaine ne figure jamais dans la liste a classer',
);
verifier(
  'elle est bien lancee avec les deux autres',
  /Promise\.all\(\[[\s\S]{0,400}?chercherPartout\(/.test(source),
);
verifier(
  "et ses resultats entrent dans la liste classee",
  /dedupe\(\[[^\]]*partout[^\]]*\]\)/.test(source),
);

console.log(
  fautes === 0
    ? '\nLa ville passe toujours en premier.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
