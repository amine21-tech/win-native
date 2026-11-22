/**
 * Eprouve LA MENTION DE ROUTE SOUS CHAQUE ALTERNATIVE — point D du correctif v2.
 *
 * << Ajouter une mention de route sous chaque alternative : Via A1 · Autoroute / Via RN5 / Via
 * CW. Meme logique que Waze / Google Maps. >>
 *
 * CE QU'UN ESSAI SUR LE TELEPHONE NE TROUVERA PAS. Sur un trajet Alger - Tizi Ouzou, n'importe
 * quelle regle donne << Via N12 >> et parait juste. Les cas qui comptent sont ceux qu'on ne
 * rencontre pas en essayant : un itineraire dont aucune voie n'est nommee — la majorite des
 * routes algeriennes n'ont pas de nom dans OpenStreetMap —, une rue de depart nommee alors que
 * tout le reste est anonyme, une nationale decoupee en sept morceaux par des ronds-points face
 * a une autoroute d'un seul tenant. Chacun de ces trois cas fait mentir l'ecran, et chacun se
 * verifie ici en une seconde.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-voie-principale.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PART_MINIMALE, voiePrincipale, type TronconNomme } from '../src/navigation/voiePrincipale';

const fautes: string[] = [];

function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? '  - ' + detail : ''}`);
  if (!ok) fautes.push(nom);
}

function lire(...bouts: string[]): string {
  return readFileSync(resolve(__dirname, '..', ...bouts), 'utf8');
}

const t = (streetName: string, km: number, surAutoroute = false): TronconNomme => ({
  streetName,
  distanceM: km * 1000,
  surAutoroute,
});

console.log('\nLES TROIS EXEMPLES DU DOCUMENT');
verifier(
  'un trajet d autoroute s annonce Via A1, et dit que c est une autoroute',
  (() => {
    const r = voiePrincipale([t('Rue Hassiba Ben Bouali', 1), t('A1', 36, true), t('', 2)]);
    return r.nom === 'A1' && r.surAutoroute;
  })(),
  JSON.stringify(voiePrincipale([t('Rue Hassiba Ben Bouali', 1), t('A1', 36, true), t('', 2)])),
);
verifier(
  'un trajet de nationale s annonce Via RN5, sans mention d autoroute',
  (() => {
    const r = voiePrincipale([t('RN5', 48), t('Rue du 1er Novembre', 2)]);
    return r.nom === 'RN5' && !r.surAutoroute;
  })(),
);
verifier(
  'une route de wilaya s annonce par son nom',
  voiePrincipale([t('CW 128', 30), t('', 5)]).nom === 'CW 128',
);

console.log('\nON CUMULE PAR NOM, ON NE COURONNE PAS LE PLUS LONG TRONCON');
/* LE CAS QUI A DICTE LA REGLE. Une nationale coupee par six ronds-points arrive en sept
 * manoeuvres de 6 km ; l'autoroute, elle, tient en une manoeuvre de 15. Le plus long TRONCON
 * est l'autoroute ; la route par laquelle on passe vraiment est la nationale. */
const coupee: TronconNomme[] = [
  t('RN12', 6),
  t('RN12', 6),
  t('RN12', 6),
  t('RN12', 6),
  t('RN12', 6),
  t('RN12', 6),
  t('RN12', 6),
  t('A1', 15, true),
];
verifier(
  'sept morceaux de 6 km battent un troncon de 15',
  voiePrincipale(coupee).nom === 'RN12',
  `${voiePrincipale(coupee).nom} (42 km de RN12 contre 15 d autoroute)`,
);

console.log('\nQUAND IL VAUT MIEUX NE RIEN DIRE');
/* << Via rue des Freres Bouadou >> sur un trajet de cinquante kilometres est vrai et trompeur :
 * c'est la rue du DEPART, et c'est presque toujours la seule nommee quand le reste ne l'est
 * pas. Le seuil existe pour ce cas-la, qui est le plus courant de tous en Algerie. */
verifier(
  'une rue de depart ne donne pas son nom a tout le trajet',
  voiePrincipale([t('Rue des Freres Bouadou', 1.5), t('', 48.5)]).nom === '',
  '1,5 km nomme sur 50',
);
verifier(
  'un itineraire entierement anonyme ne dit rien',
  voiePrincipale([t('', 12), t('', 8)]).nom === '',
);
verifier('une liste vide ne dit rien', voiePrincipale([]).nom === '');
verifier(
  'des longueurs nulles ne divisent pas par zero',
  voiePrincipale([t('RN5', 0), t('', 0)]).nom === '',
);
verifier(
  'une longueur absurde est ignoree plutot que comptee',
  voiePrincipale([
    { streetName: 'RN5', distanceM: Number.NaN },
    t('CW 128', 10),
  ]).nom === 'CW 128',
);

console.log('\nLE SEUIL, DE PART ET D AUTRE');
verifier('le seuil est au quart du trajet', PART_MINIMALE === 0.25, String(PART_MINIMALE));
/* Juste au-dessus et juste en dessous : c'est la seule facon de prouver que la comparaison
 * n'est pas a un cheveu de son contraire. */
verifier(
  'a 26 % du trajet, la route est nommee',
  voiePrincipale([t('RN5', 26), t('', 74)]).nom === 'RN5',
);
verifier(
  'a 24 %, elle ne l est pas',
  voiePrincipale([t('RN5', 24), t('', 76)]).nom === '',
);

console.log('\nLA MENTION << AUTOROUTE >> SUIT CE QUE LA ROUTE EST VRAIMENT');
verifier(
  'une bretelle d autoroute ne rend pas une nationale autoroutiere',
  (() => {
    const r = voiePrincipale([t('RN24', 2, true), t('RN24', 38)]);
    return r.nom === 'RN24' && !r.surAutoroute;
  })(),
  'deux kilometres marques sur quarante',
);
verifier(
  'une autoroute avec une sortie non marquee reste une autoroute',
  voiePrincipale([t('A1', 30, true), t('A1', 2)]).surAutoroute,
);

console.log('\nET LA FICHE S EN SERT VRAIMENT');
/* Un module juste dont personne ne se sert est le defaut que la synthese du 18 novembre a
 * appris a chercher : une fonction ecrite, eprouvee, et sans effet a l'ecran. */
const fiche = lire('src', 'components', 'TripCard.tsx');
verifier(
  'la carte de trajet appelle le calcul',
  /voiePrincipale\(/.test(fiche) && /from '\.\.\/navigation\/voiePrincipale'/.test(fiche),
);
verifier(
  'et elle ecrit la ligne sous chaque alternative',
  /trip\.via/.test(fiche),
  '<< Via A1 · Autoroute >>',
);
/* << Supprimer le bouton "Plus court" + "Autoroute" + "Sans autoroute" >> : les trois boutons
 * du point D doivent avoir quitte la fiche, et pas seulement etre caches. */
verifier(
  'les trois boutons de profil ont quitte la fiche',
  !fiche.includes('setProfil') && !fiche.includes('trip.noMotorway'),
  '<< ces 3 boutons n ont pas ete demandes et encombrent l interface >>',
);
verifier(
  'les deux modes voiture / a pied sont restes',
  fiche.includes('trip.byCar') && fiche.includes('trip.onFoot'),
  '<< Conserver : En voiture + A pied + les 3 alternatives >>',
);

console.log('');
if (fautes.length > 0) {
  console.log(`A CORRIGER : ${fautes.length} verification(s) en echec.\n`);
  process.exit(1);
}
console.log('Chaque alternative dit par ou elle passe, ou se tait plutot que de mentir.\n');
