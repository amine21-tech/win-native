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
  estLieuPublic,
  estQuartierVise,
  estWilayaVisee,
  rayonProximiteActif,
  rayonVipActif,
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
  category?: string;
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
    estPublic: (r) => estLieuPublic(r),
    estVilleExacte: (r) => r.exactCity === true,
    estQuartier: (r) => estQuartierVise(r, requete),
    estVip: (r) => (r as unknown as Fiche).vip === true,
    distanceM: (r) => r.distanceM,
    /* LE RAYON SE CALCULE COMME DANS L'APPLICATION, sur les distances des VIP presents : un
     * test qui passerait un rayon fixe ne verifierait pas le repli automatique. */
    rayonVip: rayonVipActif(
      rangs.filter((r) => (r as unknown as Fiche).vip === true).map((r) => r.distanceM),
    ),
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

console.log('\nLES ADRESSES VIP PASSENT MAINTENANT AVANT LA VILLE');
/* LE FAVORI EST VOLONTAIREMENT LE PLUS ELOIGNE DES DEUX. Un favori plus proche passerait en
 * tete par la seule distance, et le test reussirait sans rien prouver — c'est exactement le
 * genre de controle qui donne confiance a tort. Ici, << Tipaza Auto >> est a 2 km et
 * << Tipaza Pneus >> a 300 m : seul le palier VIP peut inverser cet ordre.
 *
 * L'ATTENDU A CHANGE LE 9 NOVEMBRE, pas la substance du test. Le titre disait << APRES la
 * ville, pas avant >> ; le point 12 demande l'inverse. Ce que ce controle prouve reste le meme :
 * que le statut VIP, et non la distance, decide de la place. */
const avecVip: Fiche[] = [
  { name: 'Tipaza Pneus', lat: 36.752, lon: 3.062, source: 'win' },
  { name: 'Tipaza Auto', lat: 36.768, lon: 3.072, source: 'win', vip: true },
  { name: 'Tipaza', lat: 36.59, lon: 2.45, osmKey: 'place', osmValue: 'town', type: 'town', source: 'photon' },
];
const r2 = classer(avecVip, 'Tipaza', ALGER);
console.log('  ordre obtenu :', r2.map((r) => r.name).join(' · '));
verifier(
  "l'adresse enregistree est en tete, devant une adresse PLUS PROCHE qui ne l'est pas",
  r2[0]?.name === 'Tipaza Auto',
  '2 km contre 300 m : seul le palier VIP peut l\'expliquer',
);
verifier(
  'la ville vient juste apres, devant le lieu simple',
  r2[1]?.name === 'Tipaza' && r2[2]?.name === 'Tipaza Pneus',
  "derriere les VIP, l'ordre geographique du point 11 est intact",
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
console.log('  ' + r9.map((r) => r.name).join('  →  '));
/* L'ATTENDU A CHANGE LE 9 NOVEMBRE : le partenaire VIP << Tizi Pneus >>, a trois cents metres,
 * passe devant la wilaya. C'est precisement le symptome decrit ci-dessus, et le client l'a
 * REDEMANDE au point 12 en connaissance de cause.
 *
 * CE QUE LE CONTROLE PROUVE ENCORE, et qui est l'essentiel du travail du 2 novembre : la wilaya
 * est toujours RECONNUE comme telle sur un nom partiel. Elle passe devant le lieu simple
 * << Tizi Auto >>, pourtant cent fois plus proche — sans cette reconnaissance, elle tomberait
 * dans le lot commun et se classerait derriere lui. */
verifier(
  '« tizi » : le partenaire VIP en tete (point 12 du 9 novembre)',
  r9[0]?.name === 'Tizi Pneus',
  'il est dans le rayon de 5 km',
);
verifier(
  'la WILAYA est reconnue sur un nom partiel et passe devant le lieu simple',
  r9.findIndex((r) => r.name === 'Tizi Ouzou') < r9.findIndex((r) => r.name === 'Tizi Auto'),
  'a 100 km contre 300 m : seule la reconnaissance de la wilaya peut l expliquer',
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
/* Le palier des lieux PUBLICS                                         */
/* ------------------------------------------------------------------ */

/**
 * << UN ENDROIT PUBLIC, PUIS LES PETITES VILLES >>, demande du 3 novembre. Un hopital, une
 * mairie, une gare passent devant un village homonyme et devant les lieux ajoutes : quand on
 * tape le nom d'un de ces etablissements, on ne cherche jamais un commerce qui porte le meme
 * nom.
 *
 * LE RISQUE EST QUE CE PALIER AVALE LA MOITIE DE LA CARTE. Un restaurant, un cafe, une banque,
 * une station-service sont utiles mais pas publics ; une pharmacie non plus — elle est privee,
 * meme de garde, et l'y mettre ferait passer toutes les pharmacies de la ville devant les
 * villages. Ce controle existe surtout pour tenir cette frontiere.
 */
console.log('\nUN ENDROIT PUBLIC PASSE DEVANT LES PETITES VILLES');

const publics: Fiche[] = [
  { name: 'Ben Aknoun', lat: 36.76, lon: 3.0, osmKey: 'place', osmValue: 'village', type: 'village', source: 'photon' },
  { name: 'Ben Aknoun', lat: 36.755, lon: 3.01, osmKey: 'amenity', osmValue: 'hospital', type: 'hospital', source: 'photon' },
  { name: 'Ben Aknoun Auto', lat: 36.754, lon: 3.012, source: 'win' },
];
const r11 = classer(publics, 'Ben Aknoun', ALGER);
verifier(
  "l'hopital passe devant le village homonyme",
  (r11[0] as unknown as Fiche).osmValue === 'hospital',
  r11.map((r) => r.name + ' (' + String((r as unknown as Fiche).osmValue ?? 'win') + ')').join(' - '),
);

console.log('\nLA FRONTIERE DU MOT PUBLIC');
const estPublic = (f: Partial<Fiche>) =>
  estLieuPublic({ name: '', lat: 0, lon: 0, ...f } as never);

for (const [nom, f] of [
  ['un hopital', { osmKey: 'amenity', osmValue: 'hospital' }],
  ['une mairie', { osmKey: 'amenity', osmValue: 'townhall' }],
  ['une gare', { osmKey: 'railway', osmValue: 'station' }],
  ['un aeroport', { osmKey: 'aeroway', osmValue: 'aerodrome' }],
  ['une ecole', { osmKey: 'amenity', osmValue: 'school' }],
  ['une mosquee', { osmKey: 'amenity', osmValue: 'place_of_worship' }],
  ['une fiche WIN administration', { category: 'administration' }],
] as [string, Partial<Fiche>][]) {
  verifier('  public : ' + nom, estPublic(f));
}

for (const [nom, f] of [
  ['un restaurant', { osmKey: 'amenity', osmValue: 'restaurant' }],
  ['un cafe', { osmKey: 'amenity', osmValue: 'cafe' }],
  ['une banque', { osmKey: 'amenity', osmValue: 'bank' }],
  ['une station-service', { osmKey: 'amenity', osmValue: 'fuel' }],
  ['une pharmacie', { category: 'pharmacie' }],
  ['un hotel', { category: 'hotel' }],
  ['une ville', { osmKey: 'place', osmValue: 'city', type: 'city' }],
] as [string, Partial<Fiche>][]) {
  verifier('  PAS public : ' + nom, !estPublic(f), 'sinon ce palier avalerait la moitie de la carte');
}

/* ------------------------------------------------------------------ */
/* L'ordre des trois familles : ville, VIP, puis le reste              */
/* ------------------------------------------------------------------ */

/**
 * LE VIP PASSE DEVANT LA VILLE DEPUIS LE 9 NOVEMBRE, ET CE TEST A ETE RETOURNE.
 *
 * IL AFFIRMAIT L'INVERSE, et l'histoire compte parce qu'elle a trois etages :
 *
 *   29/10 — point 18 : la ville exacte en tete, les favoris ensuite.
 *   02/11 — le client rappelle « les grandes villes sont avantagees par rapport aux lieux
 *           ajoutes par des clients ». Un bloc remontait alors les partenaires a moins de 60 km
 *           AU-DESSUS de tout, y compris de la ville : il a ete retire.
 *   09/11 — point 12 : « les etablissements abonnes WIN VIP sont affiches EN TETE des
 *           resultats », avec son code, `results = vips + standardResults`. C'est exactement ce
 *           qui avait ete retire le 2 novembre.
 *
 * LA CONSEQUENCE A ETE SIGNALEE A arsanne AVANT D'ETRE APPLIQUEE : taper « Tipaza » ramene de
 * nouveau « Tipaza Pneus », garage VIP d'Alger, avant la ville de Tipaza. Il a tranche le
 * 9 novembre — on suit le document. C'est le modele commercial de WIN : les partenaires paient
 * pour cette place.
 *
 * CE QUI RESTE VERROUILLE, et qui est la vraie valeur de ce test aujourd'hui : la portee du
 * renversement. Seuls les VIP du RAYON ACTIF montent, et au-dela de trente kilometres il n'y en
 * a plus aucun — sans quoi un partenaire de Constantine remonterait sur une recherche faite a
 * Oran.
 */
console.log('\nLE VIP EN TETE, PUIS LA VILLE, PUIS LE RESTE');

const troisFamilles: Fiche[] = [
  /* Un partenaire VIP tout proche, dont le nom contient celui de la ville : le cas qui fait
   * tomber a peu pres tous les classements naifs — et que le point 12 tranche en sa faveur. */
  { name: 'Tipaza Pneus', lat: 36.75, lon: 3.058, source: 'win', vip: true },
  /* Un lieu simple ajoute par un utilisateur, plus proche encore. */
  { name: 'Tipaza Auto', lat: 36.752, lon: 3.059, source: 'win' },
  /* La ville, a soixante kilometres. */
  { name: 'Tipaza', lat: 36.59, lon: 2.45, osmKey: 'place', osmValue: 'city', type: 'city', source: 'photon' },
];
const r8 = classer(troisFamilles, 'Tipaza', ALGER);
console.log('  ' + r8.map((r) => r.name).join('  →  '));
verifier(
  'le partenaire VIP passe devant la ville (point 12 du 9 novembre)',
  r8[0]?.name === 'Tipaza Pneus',
  'il est dans le rayon de 5 km ; la ville est a 60 km',
);
verifier(
  'la ville reste devant le lieu simple du meme nom',
  r8.findIndex((r) => r.name === 'Tipaza') < r8.findIndex((r) => r.name === 'Tipaza Auto'),
  "le renversement ne concerne que les VIP : l'ordre geographique du point 11 est intact derriere",
);

/* ------------------------------------------------------------------ */
/* LE RAYON DYNAMIQUE : 5 km, puis 15, puis 30 (point 12)              */
/* ------------------------------------------------------------------ */

/**
 * CE QUE LE RAYON PROTEGE. Le renversement ci-dessus donne aux partenaires la premiere place ;
 * le rayon est ce qui empeche cette place de devenir absurde. Sans lui, un garage VIP de
 * Tamanrasset remonterait en tete d'une recherche faite a Alger, et la liste cesserait d'etre
 * utile — donc la mise en avant cesserait de valoir quelque chose.
 *
 * LES TROIS PALIERS SE TESTENT PAR LEUR FRONTIERE, parce que c'est la que les erreurs vivent :
 * un `<` au lieu d'un `<=`, ou un palier essaye dans le mauvais ordre.
 */
console.log('\nLE RAYON VIP S ELARGIT SEUL, ET SILENCIEUSEMENT');

verifier(
  'un VIP a 3 km : le rayon reste a 5 km',
  rayonVipActif([3_000]) === 5_000,
);
verifier(
  'un VIP a 5 km pile : encore dans le premier palier',
  rayonVipActif([5_000]) === 5_000,
  'la borne est inclusive — sinon le partenaire pile a la limite disparaitrait',
);
verifier(
  'le plus proche a 9 km : on elargit a 15 km',
  rayonVipActif([9_000, 40_000]) === 15_000,
  'elargissement automatique, sans message a l utilisateur',
);
verifier(
  'le plus proche a 22 km : on elargit a 30 km',
  rayonVipActif([22_000]) === 30_000,
);
verifier(
  'le plus proche a 31 km : AUCUN palier VIP',
  rayonVipActif([31_000, 80_000]) === null,
  'au-dela, la mise en avant payante passerait avant l utilite',
);
verifier(
  'aucun VIP du tout : aucun palier',
  rayonVipActif([]) === null,
);
verifier(
  'position inconnue : on garde le VIP plutot que de le perdre',
  rayonVipActif([undefined]) === 5_000,
  'sans GPS, exclure les VIP desactiverait la mise en avant au pire moment',
);
verifier(
  'un VIP proche l emporte sur le choix du palier, pas le plus lointain',
  rayonVipActif([28_000, 2_000]) === 5_000,
  'les paliers sont essayes du plus etroit au plus large, quel que soit l ordre de la liste',
);

console.log('\nLE RAYON DE PROXIMITE DES LIEUX : 5 km, PUIS 15, 30, 50');

/**
 * POINT 11 : << rayon de PROXIMITE : 5 km en ville pour les lieux/etablissements >>.
 *
 * Le code du document ecrit un filtre sec a cinq kilometres. Applique tel quel, il vide la liste
 * partout ou il n'y a rien a cinq kilometres — un village, une route du Sud, la moitie du
 * territoire. On reprend donc le mecanisme que le client decrit LUI-MEME au point 12 pour les
 * VIP : elargissement automatique et silencieux. Les controles ci-dessous verrouillent les deux
 * moities de la regle — le resserrage en ville, et le repli ailleurs.
 */
verifier(
  'des pharmacies a 1 et 3 km : le rayon reste a 5 km',
  rayonProximiteActif([1_000, 3_000, 42_000]) === 5_000,
  'celle a 42 km disparait de la liste : c est le resserrage demande',
);
verifier(
  'la plus proche a 12 km : on elargit a 15 km',
  rayonProximiteActif([12_000, 44_000]) === 15_000,
);
verifier(
  'la plus proche a 28 km : on elargit a 30 km',
  rayonProximiteActif([28_000]) === 30_000,
);
verifier(
  'la plus proche a 45 km : on va jusqu a 50 km',
  rayonProximiteActif([45_000]) === 50_000,
  'chercher une pharmacie depuis Djanet ne doit pas rendre une liste vide',
);
verifier('aucun resultat : aucun palier', rayonProximiteActif([]) === null);
verifier(
  'le palier des lieux va plus loin que celui des VIP',
  rayonProximiteActif([45_000]) === 50_000 && rayonVipActif([45_000]) === null,
  'un commerce lointain peut etre utile ; un partenaire lointain n a pas a etre mis en avant',
);

console.log('\nUN VIP HORS DU RAYON NE MONTE PAS, MAIS N EST PAS EFFACE');

/* Oran est a environ 350 km d'Alger : le partenaire y est bien au-dela des trente kilometres. */
const vipLointain: Fiche[] = [
  { name: 'Oran Pneus', lat: 35.7, lon: -0.63, source: 'win', vip: true },
  { name: 'Oran', lat: 35.6971, lon: -0.6308, osmKey: 'place', osmValue: 'city', type: 'city', source: 'photon' },
];
const rVipLointain = classer(vipLointain, 'Oran', ALGER);
console.log('  ' + rVipLointain.map((r) => r.name).join('  →  '));
verifier(
  'la ville passe devant le partenaire a 350 km',
  rVipLointain[0]?.name === 'Oran',
  'aucun palier VIP au-dela de 30 km : le classement geographique reprend la main',
);
verifier(
  'le partenaire lointain figure quand meme dans la liste',
  rVipLointain.some((r) => r.name === 'Oran Pneus'),
  'il n est pas mis en avant, il n est pas efface',
);

console.log('\nENTRE DEUX PARTENAIRES, LE PLUS PROCHE D ABORD');

/* Le document l'exige : << dans chaque niveau, les VIP sont tries par distance croissante >>.
 * C'est la seule exception a la regle qui veut que chaque palier garde l'ordre du classement
 * precedent — et elle se defend : entre deux partenaires, le plus proche est le plus utile. */
const deuxVip: Fiche[] = [
  { name: 'Pharmacie VIP loin', lat: 36.79, lon: 3.10, source: 'win', vip: true },
  { name: 'Pharmacie VIP pres', lat: 36.752, lon: 3.0595, source: 'win', vip: true },
];
const rDeuxVip = classer(deuxVip, 'pharmacie', ALGER);
console.log('  ' + rDeuxVip.map((r) => r.name).join('  →  '));
verifier(
  'le partenaire le plus proche est premier',
  rDeuxVip[0]?.name === 'Pharmacie VIP pres',
  'tri explicite par distance a l interieur du palier VIP',
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

/* ------------------------------------------------------------------ */
/* LE QUARTIER ET LA DAIRA — correctif du 8 novembre, point 11          */
/* ------------------------------------------------------------------ */

/**
 * LE DEFAUT, EN UNE PHRASE : on tape le nom d'un quartier, et une boulangerie du meme nom passe
 * devant parce qu'elle est plus proche.
 *
 * C'est exactement le defaut << Tizi >> corrige le 2 novembre, un cran plus bas dans l'echelle
 * administrative — et il avait survecu parce que la correction ne portait que sur les 58
 * wilayas. Un quartier n'est ni une wilaya ni une ville exacte : il tombait dans le lot commun,
 * ou seule la distance compte.
 *
 * Alger-centre : 36.7538 / 3.0588. Bab El Oued : 36.7906 / 3.0547, soit environ 4 km au nord.
 */
console.log('\nLE QUARTIER PASSE DEVANT LE COMMERCE HOMONYME PLUS PROCHE');

const ALGER_CENTRE = { lat: 36.7538, lon: 3.0588 };

const BAB_EL_OUED: Fiche[] = [
  /* La boulangerie est a quatre cents metres, le quartier a quatre kilometres : dans un
   * classement a la distance, elle gagne de dix longueurs. */
  { name: 'Boulangerie Bab El Oued', lat: 36.7571, lon: 3.0601, osmKey: 'shop', osmValue: 'bakery', source: 'photon' },
  { name: 'Bab El Oued', lat: 36.7906, lon: 3.0547, osmKey: 'place', osmValue: 'suburb', source: 'photon' },
  { name: 'Rue Bab El Oued', lat: 36.7555, lon: 3.0575, osmKey: 'highway', osmValue: 'residential', source: 'photon' },
];

const ordreBEO = classer(BAB_EL_OUED, 'bab el oued', ALGER_CENTRE).map((r) => r.name);
console.log('  ' + ordreBEO.join('  →  '));
verifier(
  'le quartier arrive en premier',
  ordreBEO[0] === 'Bab El Oued',
  'la boulangerie est dix fois plus proche, et ce n est pas elle qu on cherche',
);
verifier(
  'la rue et le commerce restent derriere',
  ordreBEO.indexOf('Rue Bab El Oued') > 0 && ordreBEO.indexOf('Boulangerie Bab El Oued') > 0,
  'rangs 3 et 4 du document : rue, puis adresse',
);

console.log('\nLA VILLE RESTE DEVANT LE QUARTIER');

/**
 * L'ORDRE DU DOCUMENT EST << 1-Ville/Commune, 2-Quartier/Daira >>, et il faut le verifier dans
 * ce sens-la : le quartier est teste APRES la ville dans la boucle, mais un `place=district`
 * satisfait aussi `cityRank` — il aurait pu etre capte par le palier des villes, ou pose devant
 * elles si l'ordre des tests avait ete pris pour l'ordre des paliers.
 */
const MELANGE: Fiche[] = [
  { name: 'Hussein Dey', lat: 36.7406, lon: 3.1061, osmKey: 'place', osmValue: 'district', source: 'photon' },
  { name: 'Hussein Dey', lat: 36.7400, lon: 3.1000, osmKey: 'place', osmValue: 'town', source: 'photon' },
];
const ordreMelange = classer(MELANGE, 'hussein dey', ALGER_CENTRE).map(
  (r) => `${r.name} (${(r as unknown as Fiche).osmValue})`,
);
console.log('  ' + ordreMelange.join('  →  '));
verifier(
  'la commune passe devant la daira du meme nom',
  ordreMelange[0]?.includes('town') === true,
  'un place=district satisfait aussi cityRank : il aurait pu etre pris pour une ville',
);

console.log('\nUN NOM QUI NE CORRESPOND PAS NE REMONTE AUCUN QUARTIER');

/**
 * LE CONTROLE QUI EMPECHE LE PALIER D'AVALER LA CARTE. Les quartiers apparaissent dans les
 * resultats des que leur description contient le mot tape. Sans exiger que leur NOM commence
 * par la saisie, taper << pharmacie >> remonterait au quatrieme palier tous les quartiers des
 * environs — devant les pharmacies.
 */
const PHARMACIES: Fiche[] = [
  { name: 'Pharmacie Centrale', lat: 36.7540, lon: 3.0590, osmKey: 'amenity', osmValue: 'pharmacy', source: 'photon' },
  { name: 'El Madania', lat: 36.7480, lon: 3.0620, osmKey: 'place', osmValue: 'suburb', source: 'photon' },
];
const ordrePharma = classer(PHARMACIES, 'pharmacie', ALGER_CENTRE).map((r) => r.name);
console.log('  ' + ordrePharma.join('  →  '));
verifier(
  'le quartier ne passe pas devant la pharmacie cherchee',
  ordrePharma[0] === 'Pharmacie Centrale',
  'son nom ne commence pas par ce qui a ete tape',
);

console.log('\nLE QUARTIER NE DELOGE PAS LES PALIERS DEJA ACQUIS');

/**
 * LES DEUX DEMANDES ANTERIEURES DU MEME CLIENT. La wilaya (2 novembre) et le lieu public
 * (3 novembre) passent avant le quartier : sa liste du 8 novembre ne les mentionne pas, mais
 * elle ne les retire pas non plus, et un document qui ne parle pas d'une regle ne l'abroge pas.
 */
const TOUT: Fiche[] = [
  { name: 'Hopital Bologhine', lat: 36.7960, lon: 3.0480, osmKey: 'amenity', osmValue: 'hospital', source: 'photon' },
  { name: 'Bologhine', lat: 36.7980, lon: 3.0500, osmKey: 'place', osmValue: 'suburb', source: 'photon' },
  { name: 'Bologhine Auto', lat: 36.7545, lon: 3.0592, osmKey: 'shop', osmValue: 'car_repair', vip: true, source: 'win' },
];
const ordreTout = classer(TOUT, 'bologhine', ALGER_CENTRE).map((r) => r.name);
console.log('  ' + ordreTout.join('  →  '));
/* L'ATTENDU A CHANGE LE 9 NOVEMBRE. Le partenaire VIP est en tete ; les deux paliers acquis en
 * novembre — le lieu public du 3, le quartier du 8 — gardent leur ordre RELATIF derriere lui.
 * C'est cela qu'il faut verrouiller : le point 12 met les VIP devant, il ne rebat pas le reste. */
verifier(
  'le partenaire VIP est en tete (point 12 du 9 novembre)',
  ordreTout[0] === 'Bologhine Auto',
);
verifier(
  'le lieu public reste devant le quartier',
  ordreTout.indexOf('Hopital Bologhine') < ordreTout.indexOf('Bologhine'),
  'deuxieme palier, acquis le 3 novembre, intact derriere les VIP',
);

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
    ? '\nLe partenaire VIP du rayon actif passe en tete, la ville juste derriere.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
