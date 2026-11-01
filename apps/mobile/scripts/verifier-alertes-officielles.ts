/**
 * Eprouve les regles des ALERTES OFFICIELLES : vigilance foret, vigilance meteo, fetes.
 *
 * POURQUOI CE SCRIPT. Ces regles ont une particularite genante : elles ne se voient pas. Une
 * alerte desactivee n'affiche rien, une fete expiree n'affiche rien, et un utilisateur hors
 * zone voit la meme banniere qu'un autre a une ligne pres. Autrement dit, la quasi-totalite
 * des defauts possibles se manifeste par UNE ABSENCE — et une absence ne se remarque pas a
 * l'essai : on croit simplement qu'il n'y a rien a montrer.
 *
 * Le cas le plus traitre est le filtrage par wilaya. L'instinct dit qu'une alerte sur Tizi
 * Ouzou ne regarde pas un conducteur d'Oran, et quelqu'un finira par l'<< optimiser >> dans ce
 * sens. Le client demande exactement l'inverse, et il a raison : celui d'Oran peut prendre la
 * route de Tizi Ouzou dans l'heure, et c'est lui qu'il faut prevenir avant qu'il parte. Ce
 * controle existe pour que cette decision survive a la prochaine relecture.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-alertes-officielles.ts
 */
import {
  alertesAAfficher,
  anniversaire,
  CATALOGUE_EVENEMENTS,
  dateArretParDefaut,
  DUREE_BANNIERE_MS,
  estExpiree,
  evenementParId,
  ordinal,
  ORDRE_AFFICHAGE,
  raisonsDeRefus,
  type Alerte,
} from '../src/shared/alertes';
import {
  CHEFS_LIEUX,
  chefsLieuxComplets,
  dansLesZones,
  resumerZones,
  wilayaLaPlusProche,
  ZONES_AFFICHEES_MAX,
} from '../src/shared/wilayas';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

/* ------------------------------------------------------------------ */
console.log('\nLE CATALOGUE DES DOUZE FETES');

verifier('douze evenements, comme le tableau du client', CATALOGUE_EVENEMENTS.length === 12,
  String(CATALOGUE_EVENEMENTS.length));
verifier(
  'les cinq fetes religieuses n\'ont PAS de date fixe',
  CATALOGUE_EVENEMENTS.filter((e) => e.categorie === 'religieux').every((e) => e.dateFixe === null),
  'elles suivent la lune : une date ecrite serait fausse onze annees sur douze',
);
verifier(
  'les sept dates de memoire en ont une',
  CATALOGUE_EVENEMENTS.filter((e) => e.categorie === 'memoire').every((e) => e.dateFixe !== null),
);
verifier(
  'les Aid s\'arretent au bout de trois jours, les autres au bout d\'un',
  evenementParId('fitr')?.arretAutoJours === 3 &&
    evenementParId('adha')?.arretAutoJours === 3 &&
    evenementParId('nov1')?.arretAutoJours === 1,
);
verifier('les identifiants sont uniques', new Set(CATALOGUE_EVENEMENTS.map((e) => e.id)).size === 12);

/* ------------------------------------------------------------------ */
console.log('\nLE NUMERO D\'ANNIVERSAIRE SE CALCULE SEUL');

const en2026 = new Date('2026-11-01T10:00:00Z');
const nov1 = evenementParId('nov1')!;
verifier('1954 donne 72 en 2026', anniversaire(nov1, en2026) === 72, String(anniversaire(nov1, en2026)));
verifier(
  'et 73 en 2027, sans qu\'on y touche',
  anniversaire(nov1, new Date('2027-11-01T10:00:00Z')) === 73,
  'un nombre ecrit dans une traduction serait juste un an, puis faux pour toujours',
);
verifier('un Aid n\'a pas d\'anniversaire', anniversaire(evenementParId('fitr')!, en2026) === null);

console.log('\n  Les suffixes d\'ordinal, qui different d\'une langue a l\'autre :');
verifier('francais : 72e', ordinal(72, 'fr') === '72e', ordinal(72, 'fr'));
verifier('anglais : 72nd', ordinal(72, 'en') === '72nd', ordinal(72, 'en'));
verifier('anglais : 73rd', ordinal(73, 'en') === '73rd', ordinal(73, 'en'));
verifier('anglais : 71st', ordinal(71, 'en') === '71st', ordinal(71, 'en'));
verifier(
  'anglais : 11th, 12th, 13th — l\'exception des adolescents',
  ordinal(11, 'en') === '11th' && ordinal(12, 'en') === '12th' && ordinal(13, 'en') === '13th',
  `${ordinal(11, 'en')} · ${ordinal(12, 'en')} · ${ordinal(13, 'en')}`,
);
verifier('arabe : le nombre seul', ordinal(72, 'ar') === '72', ordinal(72, 'ar'));

/* ------------------------------------------------------------------ */
console.log('\nL\'ARRET AUTOMATIQUE');

const hier = '2026-10-31';
const aujourdhui = '2026-11-01';
verifier('une alerte d\'hier est expiree', estExpiree(hier, en2026));
verifier(
  'celle du jour meme ne l\'est pas, meme le soir',
  !estExpiree(aujourdhui, new Date('2026-11-01T23:30:00Z')),
  'l\'arret vaut pour la FIN de la journee indiquee',
);
verifier('sans date d\'arret, rien n\'expire', !estExpiree(null, en2026) && !estExpiree(undefined, en2026));
verifier(
  'un arret auto d\'un jour veut dire « aujourd\'hui seulement »',
  dateArretParDefaut(nov1, en2026) === '2026-11-01',
  dateArretParDefaut(nov1, en2026),
);
verifier(
  'trois jours pour un Aid couvrent le jour meme et les deux suivants',
  dateArretParDefaut(evenementParId('fitr')!, en2026) === '2026-11-03',
  dateArretParDefaut(evenementParId('fitr')!, en2026),
);

/* ------------------------------------------------------------------ */
console.log('\nCE QUE L\'APPLICATION AFFICHE, ET DANS QUEL ORDRE');

const toutes: Alerte[] = [
  { type: 'event', id: 'nov1', active: true },
  { type: 'weather', active: true, phenomena: ['rain'], wilayas: ['Tizi Ouzou'] },
  { type: 'fire', active: true, wilayas: [] },
];
const ordre = alertesAAfficher(toutes, en2026).map((a) => a.type);
verifier(
  'foret, puis meteo, puis fete',
  ordre.join(' ') === 'fire weather event',
  `${ordre.join(' · ')} — du plus urgent au moins urgent`,
);
verifier(
  'une alerte desactivee n\'apparait nulle part',
  alertesAAfficher([{ type: 'fire', active: false }], en2026).length === 0,
  'c\'est la regle numero un du client : desactivee = rien chez personne',
);
verifier(
  'une fete expiree est ignoree',
  alertesAAfficher([{ type: 'event', id: 'nov1', active: true, until: hier }], en2026).length === 0,
  'meme active, meme recue du serveur : c\'est le telephone qui connait l\'heure',
);
verifier('l\'ordre de reference a bien trois entrees', ORDRE_AFFICHAGE.length === 3);
verifier('la banniere dure douze secondes', DUREE_BANNIERE_MS === 12_000, `${DUREE_BANNIERE_MS} ms`);

/* ------------------------------------------------------------------ */
console.log('\nLES WILAYAS NOMMENT LES ZONES, ELLES NE CACHENT RIEN');

/* C'est LE piege de cette fonctionnalite. On ne peut pas le verifier sur `alertesAAfficher`,
 * qui ne recoit pas la position : c'est justement la preuve que le filtrage n'existe pas. On
 * verifie donc que la fonction de zone ne sert qu'a la LIGNE EN PLUS. */
const meteoTizi: Alerte = { type: 'weather', active: true, phenomena: ['rain'], wilayas: ['Tizi Ouzou'] };
verifier(
  'un conducteur d\'Oran voit quand meme l\'alerte sur Tizi Ouzou',
  alertesAAfficher([meteoTizi], en2026).length === 1,
  'il peut prendre la route dans l\'heure — c\'est lui qu\'il faut prevenir avant qu\'il parte',
);
verifier(
  'mais il n\'a pas la ligne « vous etes dans une zone concernee »',
  !dansLesZones('Oran', ['Tizi Ouzou']),
);
verifier('celui de Tizi Ouzou, si', dansLesZones('Tizi Ouzou', ['Tizi Ouzou']));
verifier(
  'aucune wilaya cochee = toute l\'Algerie',
  dansLesZones('Oran', []) && dansLesZones('Tamanrasset', []),
  'lire cette regle a l\'envers n\'afficherait la vigilance foret a personne',
);
verifier('position inconnue : pas de ligne, mais la banniere reste', !dansLesZones(null, ['Alger']));

/* ------------------------------------------------------------------ */
console.log('\nLA WILAYA DE L\'UTILISATEUR, SANS INTERNET');

verifier('les 58 chefs-lieux sont la, et ce sont les bons', chefsLieuxComplets(),
  `${CHEFS_LIEUX.length} chefs-lieux`);
verifier('Alger', wilayaLaPlusProche({ lat: 36.7538, lon: 3.0588 }) === 'Alger');
verifier('Tizi Ouzou', wilayaLaPlusProche({ lat: 36.7118, lon: 4.0458 }) === 'Tizi Ouzou');
verifier('Oran', wilayaLaPlusProche({ lat: 35.6971, lon: -0.6308 }) === 'Oran');
verifier('Tamanrasset', wilayaLaPlusProche({ lat: 22.785, lon: 5.5228 }) === 'Tamanrasset');
verifier(
  'Bab Ezzouar, en banlieue d\'Alger',
  wilayaLaPlusProche({ lat: 36.72, lon: 3.18 }) === 'Alger',
  String(wilayaLaPlusProche({ lat: 36.72, lon: 3.18 })),
);
verifier('sans position, aucune wilaya', wilayaLaPlusProche(null) === null);
verifier(
  'Paris n\'est pas une wilaya algerienne',
  wilayaLaPlusProche({ lat: 48.8566, lon: 2.3522 }) === null,
  'sans cette limite, le chef-lieu le moins loin gagnerait toujours',
);
verifier(
  'Tunis non plus',
  wilayaLaPlusProche({ lat: 36.8065, lon: 10.1815 }) === null,
  String(wilayaLaPlusProche({ lat: 36.8065, lon: 10.1815 })),
);

/* ------------------------------------------------------------------ */
console.log('\nLA LISTE DES ZONES DANS LA BANNIERE');

verifier(
  'quatre zones s\'ecrivent en entier',
  resumerZones(['Tizi Ouzou', 'Béjaïa', 'Jijel', 'Bouira']) === 'Tizi Ouzou · Béjaïa · Jijel · Bouira',
);
const dix = ['Alger', 'Blida', 'Tipaza', 'Boumerdès', 'Médéa', 'Tizi Ouzou', 'Bouira', 'Béjaïa', 'Jijel', 'Sétif'];
verifier(
  'dix zones : six noms puis « +4 », comme la variante B',
  resumerZones(dix) === 'Alger · Blida · Tipaza · Boumerdès · Médéa · Tizi Ouzou · +4',
  resumerZones(dix),
);
verifier('le seuil est bien de six', ZONES_AFFICHEES_MAX === 6);

/* ------------------------------------------------------------------ */
console.log('\nCE QUI NE DOIT PAS ETRE PUBLIE');

verifier(
  'une vigilance meteo sans phenomene coche est refusee',
  raisonsDeRefus({ type: 'weather', active: true, phenomena: [] }).includes('phenomene'),
  'le client l\'ecrit : au moins un phenomene pour activer',
);
verifier(
  'mais une meteo DESACTIVEE sans phenomene passe',
  raisonsDeRefus({ type: 'weather', active: false, phenomena: [] }).length === 0,
  'on doit pouvoir eteindre une alerte sans d\'abord la completer',
);
verifier(
  'une wilaya mal orthographiee est refusee',
  raisonsDeRefus({ type: 'weather', active: true, phenomena: ['rain'], wilayas: ['Tizi-Ouzou'] })
    .some((r) => r.startsWith('wilaya-inconnue')),
  'sinon la comparaison avec la wilaya de l\'utilisateur echouerait EN SILENCE',
);
verifier(
  'les noms exacts passent',
  raisonsDeRefus({ type: 'weather', active: true, phenomena: ['rain'], wilayas: ["M'Sila", "El M'Ghair"] }).length === 0,
  'les deux wilayas a apostrophe, que le client signale comme un piege deja rencontre',
);
verifier(
  'une fete inconnue est refusee',
  raisonsDeRefus({ type: 'event', id: 'aid-inexistant', active: true }).includes('evenement-inconnu'),
);
verifier(
  'une date d\'arret mal ecrite est refusee',
  raisonsDeRefus({ type: 'fire', active: true, until: '01/11/2026' }).includes('date-arret'),
);

console.log(
  fautes === 0
    ? '\nLes alertes officielles obeissent au cahier des charges.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
