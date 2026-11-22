/**
 * LA SYNTHESE « FICHE VIP PREMIUM » (19 novembre 2026), SOUS-EXIGENCE PAR SOUS-EXIGENCE.
 *
 * Le document demande cinq ameliorations, et donne pour chacune des valeurs chiffrees : une
 * bordure de deux points, des coins a seize, un cycle de 2 800 ms, une inclinaison de 20°, un
 * seuil de trois avis. Relire les titres aurait donne cinq coches. Ce fichier verifie les
 * VALEURS et REJOUE LES REGLES, parce que la leçon du 18 novembre tient toujours : une fonction
 * peut etre ecrite, testee, et sans effet dans la situation pour laquelle on l'a demandee.
 *
 * LA PARTIE QUI COMPTE VRAIMENT EST LA PREMIERE. Le code Kotlin de la synthese contient deux
 * defauts, et ce ne sont pas des details de style : il affiche « Ferme » devant une porte
 * ouverte. On rejoue donc SA logique a cote de la notre, sur les memes horaires, et l'on exige
 * qu'elles divergent. Si un jour quelqu'un « simplifie » notre fonction en revenant a la
 * formule du document, ces deux lignes-la echoueront.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-fiche-vip-premium.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  estOuvertMaintenant,
  formatPlage,
  minutesDepuisMinuit,
  semaineDepuisAujourdhui,
  type Horaire,
} from '../src/place/horaires';
import { AVIS_MIN, avisAffichables, etoiles, formatNote, genreAvis, moyenneAvis } from '../src/place/avis';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const lireApi = (...p: string[]) => readFileSync(join(__dirname, '..', '..', 'api', ...p), 'utf8');

/* ------------------------------------------------------------------------------------------ */
/* LA FORMULE DE LA SYNTHESE, RECOPIEE TELLE QUELLE.                                          */
/*                                                                                            */
/* `hActuelle in (hOuv*60+mOuv)..(hFerm*60+mFerm)` en Kotlin est un intervalle ferme, vide des */
/* que la borne haute est inferieure a la borne basse. On le transcrit a l'identique.          */
/* ------------------------------------------------------------------------------------------ */
function ouvertSelonLaSynthese(horaires: readonly Horaire[], maintenant: Date): boolean {
  const jourIdx = maintenant.getDay() + 1; // Calendar.DAY_OF_WEEK : 1 = dimanche
  const hActuelle = maintenant.getHours() * 60 + maintenant.getMinutes();
  const h = horaires[jourIdx - 1];
  if (!h || !h.ouv) return false;
  const o = minutesDepuisMinuit(h.ouv)!;
  const f = minutesDepuisMinuit(h.ferm)!;
  return hActuelle >= o && hActuelle <= f;
}

/** Jeudi 19 novembre 2026, a l'heure indiquee. Le 19/11/2026 est un jeudi (jour 4). */
const jeudi = (h: number, m = 0) => new Date(2026, 10, 19, h, m, 0);
/** Vendredi 20 novembre 2026, 00 h 30 : le lendemain du jeudi. */
const vendrediNuit = (h: number, m = 0) => new Date(2026, 10, 20, h, m, 0);

console.log('\n============================================================');
console.log('LES DEUX DEFAUTS DU CODE DE LA SYNTHESE, REJOUES SUR LES MEMES HORAIRES');
console.log('============================================================');

/* ---- DEFAUT 1 : la fermeture apres minuit. Une pizzeria ouverte 18h00–01h00, le jeudi. */
const pizzeria: Horaire[] = [{ jour: 4, ouv: '18h00', ferm: '01h00' }];
verifier(
  'a 22 h, nous disons OUVERT',
  estOuvertMaintenant(pizzeria, jeudi(22)) === true,
  'pizzeria 18h00-01h00, jeudi 22 h',
);
verifier(
  "et la formule du document dit FERME — c'est le defaut",
  ouvertSelonLaSynthese([{ jour: 4, ouv: '18h00', ferm: '01h00' }], jeudi(22)) === false,
  "l'intervalle 1080..60 est vide : la fiche aurait menti a l'heure de pointe",
);
verifier(
  'a 00 h 30 le lendemain, nous disons encore OUVERT',
  estOuvertMaintenant(pizzeria, vendrediNuit(0, 30)) === true,
  'la plage de la veille court toujours',
);
verifier('a 16 h, nous disons FERME', estOuvertMaintenant(pizzeria, jeudi(16)) === false);
verifier('a 02 h, nous disons FERME', estOuvertMaintenant(pizzeria, vendrediNuit(2)) === false);

/* ---- DEFAUT 2 : la coupure de midi. Un cabinet 08h00–12h00 puis 14h00–18h00, le jeudi. */
const cabinet: Horaire[] = [
  { jour: 4, ouv: '08h00', ferm: '12h00' },
  { jour: 4, ouv: '14h00', ferm: '18h00' },
];
verifier('a 09 h, OUVERT', estOuvertMaintenant(cabinet, jeudi(9)) === true);
verifier(
  'a 13 h, FERME — la coupure de midi est respectee',
  estOuvertMaintenant(cabinet, jeudi(13)) === false,
  'un seul couple ouv/ferm par jour aurait affirme << Ouvert >> devant une porte close',
);
verifier('a 15 h, OUVERT', estOuvertMaintenant(cabinet, jeudi(15)) === true);
verifier('a 19 h, FERME', estOuvertMaintenant(cabinet, jeudi(19)) === false);

/* ---- Les bords, qui sont la ou l'on se trompe. */
const bureau: Horaire[] = [{ jour: 4, ouv: '08h00', ferm: '20h00' }];
verifier("a 08 h 00 pile, OUVERT — l'ouverture est incluse", estOuvertMaintenant(bureau, jeudi(8, 0)) === true);
verifier(
  "a 20 h 00 pile, FERME — la fermeture est exclue",
  estOuvertMaintenant(bureau, jeudi(20, 0)) === false,
  'une porte qui ferme a 20 h est fermee a 20 h',
);
verifier('a 07 h 59, FERME', estOuvertMaintenant(bureau, jeudi(7, 59)) === false);
verifier('a 19 h 59, OUVERT', estOuvertMaintenant(bureau, jeudi(19, 59)) === true);
verifier('aucun horaire du tout : FERME, jamais << ouvert par defaut >>', estOuvertMaintenant([], jeudi(12)) === false);
verifier('horaires absents : FERME', estOuvertMaintenant(null, jeudi(12)) === false);
verifier(
  'un jour non declare ne rend pas le lieu ouvert',
  estOuvertMaintenant([{ jour: 1, ouv: '08h00', ferm: '20h00' }], jeudi(12)) === false,
  'lundi seul, consulte un jeudi',
);

console.log('\nLES DEUX ECRITURES DE L HEURE');
verifier("<< 08h00 >>, celle du document", minutesDepuisMinuit('08h00') === 480);
verifier("<< 08:00 >>, celle que tapent les gens", minutesDepuisMinuit('08:00') === 480);
verifier("<< 8h >> sans minutes", minutesDepuisMinuit('8h') === 480);
verifier('une saisie inexploitable ne vaut pas minuit', minutesDepuisMinuit('midi') === null, "'midi' -> null, et non 0");
verifier('une heure impossible est refusee', minutesDepuisMinuit('25h00') === null);
verifier("l'affichage de la maquette", formatPlage({ jour: 4, ouv: '8:0', ferm: '20:00' }) === '08h00 – 20h00');

console.log('\nLA SEMAINE COMMENCE AUJOURD HUI (maquette : << Aujourd’hui · Jeu. >>)');
const semaine = semaineDepuisAujourdhui(bureau, jeudi(10));
verifier('sept lignes', semaine.length === 7);
verifier("la premiere est aujourd'hui", semaine[0]!.aujourdhui === true && semaine[0]!.jour === 4, 'jeudi = 4');
verifier('et elle porte la plage du jour', semaine[0]!.plages.length === 1);
verifier(
  'un jour sans plage est rendu vide, pas omis',
  semaine[1]!.plages.length === 0 && semaine.length === 7,
  'une ligne manquante se lit comme un oubli de saisie',
);

console.log('\n============================================================');
console.log('AMELIORATION 5 — ETOILES ET AVIS');
console.log('============================================================');
verifier(
  "le seuil du document : trois avis",
  AVIS_MIN === 3 && avisAffichables(true, 3) === true && avisAffichables(true, 2) === false,
);
verifier(
  'et la condition isVip : une fiche ordinaire ne montre rien',
  avisAffichables(false, 128) === false,
  '<< visible UNIQUEMENT si lieu.isVip == true >>',
);
verifier("4,7 s'ecrit avec une virgule", formatNote(4.7) === '4,7');
verifier('4,0 garde sa decimale', formatNote(4) === '4,0', 'sinon la note saute de hauteur dans la ligne');
const e47 = etoiles(4.7);
verifier(
  "4,7 donne quatre etoiles pleines et une demie — pas cinq pleines",
  e47.filter((x) => x === 'pleine').length === 4 && e47[4] === 'demie',
  "cinq pleines au-dessus du chiffre << 4,7 >> mettraient l'image en contradiction avec le texte",
);
verifier('5,0 donne cinq pleines', etoiles(5).every((x) => x === 'pleine'));
verifier('0 donne cinq vides', etoiles(0).every((x) => x === 'vide'));
verifier('une note hors bornes ne deborde pas', etoiles(9).length === 5 && etoiles(-3).length === 5);
const moy = moyenneAvis([5, 4, 5]);
verifier('la moyenne de 5, 4, 5', Math.abs(moy.note - 14 / 3) < 1e-9 && moy.nombre === 3);
verifier('une note invalide est ecartee du calcul', moyenneAvis([5, 0, 9, 4]).nombre === 2);
verifier('aucun avis : note 0, nombre 0', moyenneAvis([]).nombre === 0);

console.log('\nLE MOT QUI SUIT LE NOMBRE');
verifier("<< patients >> pour une clinique, comme la maquette", genreAvis('clinique') === 'patients');
verifier('et pour une pharmacie', genreAvis('pharmacie') === 'patients');
verifier(
  "<< clients >> pour un restaurant, et non << patients >>",
  genreAvis('restaurant') === 'clients',
  "<< 128 avis patients >> sous une pizzeria se lit comme une erreur de copie",
);
verifier("<< avis >> tout court pour une mosquee", genreAvis('mosquee') === 'neutre');
verifier('categorie absente : neutre', genreAvis(null) === 'neutre');

console.log('\n============================================================');
console.log('LES VALEURS CHIFFREES DU DOCUMENT, A LEUR PLACE DANS LE CODE');
console.log('============================================================');

const theme = lire('src', 'theme.ts');
console.log('\nTokens couleurs (colors.xml de la synthese)');
for (const [nom, valeur] of [
  ['gold_500', "gold500: '#C8880E'"],
  ['gold_300', "gold300: '#F0B429'"],
  ['gold_bg', "goldBg: '#FFFAED'"],
  ['open_green', "openGreen: '#1A7A40'"],
  ['open_bg', "openBg: '#E5F5EC'"],
] as const) {
  verifier(nom, theme.includes(valeur), valeur);
}
verifier(
  "l'or ne change pas la nuit",
  (theme.match(/gold500: '#C8880E'/g) ?? []).length === 2,
  'un dore assombri cesse de se lire comme de l or',
);
verifier(
  'mais les deux fonds clairs sont retournes la nuit',
  theme.includes("goldBg: '#2A2416'") && theme.includes("openBg: '#13301F'"),
  '#FFFAED pose sur le fond nocturne aurait fait un rectangle eblouissant',
);

console.log('\nDimensions (dimens.xml de la synthese)');
for (const [nom, valeur] of [
  ['vip_card_corner 16dp', 'cardCorner: 16'],
  ['vip_stroke_width 2dp', 'strokeWidth: 2'],
  ['vip_gold_stripe_h 3dp', 'goldStripeH: 3'],
  ['carousel_height 175dp', 'carouselHeight: 175'],
] as const) {
  verifier(nom, theme.includes(valeur), valeur);
}

console.log('\nAmelioration 1 — cadre et lisere dore anime');
const lisere = lire('src', 'components', 'vip', 'LisereDore.tsx');
const resultats = lire('src', 'components', 'SearchResults.tsx');
verifier('le cycle des trois images de 300 ms', /CYCLE_MS = 900/.test(lisere));
verifier('le degrade du document, #C8880E vers #F0B429', /gold500/.test(lisere) && /gold300/.test(lisere));
verifier(
  'la bande fait deux largeurs de carte',
  /width: largeur \* 2/.test(lisere),
  'une seule largeur ferait reapparaitre le bord gauche a chaque boucle',
);
verifier(
  'la boucle est arretee au demontage',
  /return \(\) => boucle\.stop\(\)/.test(lisere),
  'une Animated.loop non arretee continue de tourner apres la disparition du composant',
);
/* LE CONTROLE QUI DIT QUE L AMELIORATION 1 AGIT LA OU LE CLIENT LA VEUT : << identification
 * instantanee DANS LA LISTE DE RESULTATS >>. Le lisere pose sur la seule fiche ouverte ne
 * repondrait pas a la demande. */
verifier(
  'la ligne d un partenaire porte le cadre dore dans la LISTE',
  /styles\.carteVip/.test(resultats) && /<LisereDore \/>/.test(resultats),
  '<< identification instantanee dans la liste de resultats >>',
);
verifier(
  'avec les dimensions du document',
  /borderRadius: vip\.cardCorner/.test(resultats) && /borderWidth: vip\.strokeWidth/.test(resultats),
);
verifier("l'ombre du cardElevation=6dp", /elevation: 6/.test(resultats));
verifier(
  'et les partenaires ne sont PAS remontes en tete pour autant',
  !/results\.filter\(\(r\) => r\.isPartner\)/.test(resultats),
  'regle du 2 novembre : ville, puis VIP, puis le reste',
);

console.log('\nAmelioration 2 — carousel photos');
const carousel = lire('src', 'components', 'vip', 'CarouselPhotos.tsx');
const fiche = lire('src', 'components', 'PlaceSheet.tsx');
verifier('pagine au doigt', /pagingEnabled/.test(carousel));
verifier('la hauteur du document', /vip\.carouselHeight/.test(carousel));
verifier('des pastilles de position', /styles\.pastilles/.test(carousel));
verifier(
  'la largeur de page est MESUREE et non prise sur l ecran',
  /onLayout=/.test(carousel) && /largeurPage/.test(carousel),
  'la fiche a des marges : une page trop large decalerait l arret de la pagination',
);
verifier(
  'un echec par photo, et non un seul pour le carousel',
  /echecs\[/.test(carousel),
  'la deuxieme image peut echouer quand la premiere s affiche',
);
verifier(
  'il est reserve aux fiches partenaires',
  /place\.isPartner && \(gallery\.length > 0 \|\| place\.videoUrl\)/.test(fiche),
  '<< 1 vignette >> pour une fiche standard, << Carousel 3 photos >> pour une VIP',
);
/* LA CONDITION A CHANGE LE 24 NOVEMBRE, ET LA REGLE QU'ELLE GARDE N'A PAS BOUGE.
 *
 * On lisait `place.isPartner && gallery.length > 0`. La reserve aux fiches partenaires est
 * intacte — c'est le premier terme, et il est toujours la. Ce qui s'est ajoute, c'est la
 * VIDEO : une fiche partenaire qui n'a QU'UNE video et aucune photo ouvrait un vide a cet
 * endroit, parce qu'on ne comptait que les photos. */
verifier(
  'une fiche partenaire SANS photo mais AVEC video ouvre quand meme le carousel',
  /gallery\.length > 0 \|\| place\.videoUrl/.test(fiche),
  'sinon la video payee ne s afficherait nulle part',
);

/* ------------------------------------------------------------------------------------------ */
/* POINT B DU CORRECTIF v2 (22 novembre) — << la carte VIP ressemble a une fiche ordinaire >>. */
/*                                                                                            */
/* Quatre exigences chiffrees : la bordure doree sur les quatre cotes, le bandeau a cinq       */
/* teintes, les miniatures cliquables a droite — et la VIDEO, qui attendait de savoir ou elle  */
/* serait hebergee. Elle est arrivee le 24 novembre : meme disque que les photos, table        */
/* place_videos, migration 0016. Son chapitre a elle est dans                                  */
/* verifier-correctifs-24-novembre.ts ; ici on verifie seulement qu'elle a bien pris la place  */
/* de diapositive PRINCIPALE que les deux documents lui donnent.                               */
/* ------------------------------------------------------------------------------------------ */
console.log('\nPoint B du correctif v2 — bordure, bandeau a cinq teintes, miniatures');

verifier(
  "le brun d'or #7A4D00 existe, de jour comme de nuit",
  (theme.match(/gold700: '#7A4D00'/g) ?? []).length === 2,
  'la teinte sombre des deux bords du bandeau du point B',
);
verifier(
  'et il s AJOUTE aux cinq jetons du 19 novembre, sans en remplacer un',
  theme.includes("gold500: '#C8880E'") && theme.includes("gold300: '#F0B429'"),
  '<< ne rien casser du travail accompli precedemment >>',
);

/* LE MOTIF DU DOCUMENT, ARRET PAR ARRET : #7A4D00 -> #C8880E -> #F0B429 -> #C8880E -> #7A4D00.
 * On le relit tel qu'il est ecrit dans le composant, puis on exige qu'il tienne DEUX fois sur
 * la bande — qui est large de deux cartes et glisse d'une seule. Neuf arrets, le cinquieme
 * servant de charniere. */
const arrets = [...lisere.matchAll(/palette\.light\.(gold\d00)/g)].map((m) => m[1]);
const MOTIF = ['gold700', 'gold500', 'gold300', 'gold500', 'gold700'];
verifier(
  'le bandeau porte les CINQ teintes du point B',
  MOTIF.every((t) => arrets.includes(t)),
  MOTIF.join(' -> '),
);
verifier(
  'ecrites neuf fois, soit le motif deux fois bout a bout',
  arrets.length === 9 &&
    arrets.slice(0, 5).join() === MOTIF.join() &&
    arrets.slice(4).join() === MOTIF.join(),
  arrets.length === 9
    ? 'les deux moities partagent l arret du milieu'
    : `${arrets.length} arrets au lieu de 9 : la boucle sauterait`,
);
verifier(
  'et le motif est symetrique, ce qui rend le raccord invisible',
  arrets[0] === arrets[arrets.length - 1],
  'un degrade qui ne finit pas sur sa teinte de depart se lit comme une couture',
);

verifier(
  'la fiche partenaire porte une bordure doree sur les quatre cotes',
  /borderWidth: vip\.strokeWidth, borderColor: colors\.gold300/.test(fiche),
  '<< bordure doree complete autour de la carte, strokeColor #F0B429 >>',
);
verifier(
  'et une fiche ORDINAIRE n en a pas',
  /place\.isPartner\s*\?\s*\{ borderWidth: vip\.strokeWidth/.test(fiche),
  'une bordure sur toutes les fiches ne distinguerait plus rien — c est le defaut signale',
);

verifier(
  'le carousel sait poser des miniatures cliquables',
  /vignettes\?: 'aucune' \| 'bas' \| 'droite'/.test(carousel) && /allerA\(i\)/.test(carousel),
  'une miniature qui ne deplace pas l image ferait mentir la pastille',
);
verifier(
  'elle defile par une reference, et non par un etat seul',
  /defilement\.current\?\.scrollTo/.test(carousel),
  "sans la reference, le carousel resterait ou il est",
);
verifier(
  'la fiche VIP les demande A DROITE, comme le point B',
  /vignettes="droite"/.test(fiche),
  '<< 3 photos en miniatures cliquables a droite >>',
);
verifier(
  "et sans demande, le carousel rend exactement ce qu'il rendait avant",
  /vignettes = 'aucune'/.test(carousel),
  'la valeur par defaut protege les appels d avant le correctif v2',
);
verifier(
  'une seule photo ne recoit jamais de miniature',
  /visibles\.length < 2/.test(carousel),
  'une vignette qui reproduit l image qu on regarde vole de la place a celle-ci',
);

console.log('\nAmelioration 3 — badge a brillance');
const badge = lire('src', 'components', 'vip', 'BadgeVipShimmer.tsx');
verifier('le cycle de 2 800 ms', /CYCLE_MS = 2_800/.test(badge));
verifier('le passage de 1 200 ms', /PASSAGE_MS = 1_200/.test(badge));
verifier("l'inclinaison de 20°", /INCLINAISON = '20deg'/.test(badge));
verifier("l'opacite 0,4 du shimmer_highlight_alpha", /ECLAT_OPACITE = 0\.4/.test(badge));
verifier(
  'le reflet sort des deux cotes du badge',
  /outputRange: \[-largeur, largeur \* 1\.5\]/.test(badge),
  'sinon il s allume au milieu au lieu de passer',
);
verifier(
  'des bords fondus et non un rectangle plein',
  /rgba\(255,255,255,0\)/.test(badge),
  'un bord net se lit comme une barre blanche posee sur le badge',
);
verifier(
  'le libelle vient de l appelant, jamais ecrit en dur',
  /libelle: string/.test(badge) && !/VIP Certifi/.test(badge),
  'il doit rester traduit dans les cinq langues',
);
verifier('la fiche remplace le texte statique par le badge', /<BadgeVipShimmer/.test(fiche));
verifier('et la liste de resultats aussi', /<BadgeVipShimmer/.test(resultats));

console.log('\nAmelioration 4 — horaires temps reel');
const horairesVue = lire('src', 'components', 'vip', 'HorairesVip.tsx');
verifier("le battement du document : 1 600 ms, 1f vers .3f", /BATTEMENT_MS = 1_600/.test(horairesVue) && /BATTEMENT_MIN = 0\.3/.test(horairesVue));
verifier(
  'le point ne bat que si c est ouvert',
  /if \(!ouvert \|\| mouvementReduit\)/.test(horairesVue),
  'un point rouge qui pulse ressemble a une alarme',
);
verifier(
  "l'heure est relue chaque minute",
  /RAFRAICHISSEMENT_MS = 60_000/.test(horairesVue) && /setInterval/.test(horairesVue),
  'une fiche ouverte a 19 h 59 afficherait sinon << Ouvert >> a 20 h 30',
);
verifier(
  'la decision vient du module feuille, pas du composant',
  /estOuvertMaintenant/.test(horairesVue) && !/getHours\(\) \* 60/.test(horairesVue),
  'un badge vert est rassurant meme quand il ment : la regle doit etre testable',
);
verifier(
  'pas de cadre quand aucun horaire n est saisi',
  /aDesHoraires\(place\.horaires\)/.test(fiche),
  'un bloc vide intitule << Horaires >> se lit comme une panne',
);

console.log('\nAmelioration 5 — l affichage, et le moyen d atteindre le seuil');
const avisVue = lire('src', 'components', 'vip', 'AvisVip.tsx');
verifier('les deux conditions du document', /avisAffichables\(estPartenaire, nombreCourant\)/.test(avisVue));
verifier(
  'le bloc entier est reserve aux partenaires',
  /if \(!estPartenaire \|\| !placeId\) return null;/.test(avisVue),
);
/* LE CONTROLE LE PLUS IMPORTANT DE CE CHAPITRE. Sans moyen de deposer un avis, aucune fiche
 * n'atteindrait jamais trois avis : les etoiles seraient ecrites, testees, et invisibles
 * partout. C'est le defaut du 18 novembre, a l'identique. */
verifier(
  'ON PEUT DEPOSER UN AVIS — sans quoi le seuil de trois ne serait jamais atteint',
  /\/avis`/.test(avisVue) && /method: 'POST'/.test(avisVue),
  'une fonction correcte et sans effet dans la situation demandee : le defaut du 18 novembre',
);
verifier(
  'sous le seuil, on invite a noter au lieu de tout cacher',
  /reviewsBelowThreshold/.test(avisVue) && /reviewsNone/.test(avisVue),
  'tout cacher garantirait qu il n y ait jamais trois avis',
);
verifier(
  'la note se met a jour sans recharger la fiche',
  /setLocal\(\{ note: r\.avisNote, nombre: r\.avisCount \}\)/.test(avisVue),
  'sans reponse visible, on appuie une seconde fois',
);

console.log('\nLE REGLAGE << SUPPRIMER LES ANIMATIONS >> EST RESPECTE');
const mouvement = lire('src', 'components', 'vip', 'mouvement.ts');
verifier('on lit le reglage du systeme', /isReduceMotionEnabled/.test(mouvement));
verifier('et son changement en cours de route', /reduceMotionChanged/.test(mouvement));
for (const [nom, fichier] of [
  ['le lisere', lisere],
  ['le badge', badge],
  ['le point vert', horairesVue],
] as const) {
  verifier(`${nom} s'immobilise`, /mouvementReduit/.test(fichier));
}

console.log('\n============================================================');
console.log('LE SERVEUR : LES DEUX CHAMPS DOIVENT ARRIVER JUSQU AU TELEPHONE');
console.log('============================================================');
const route = lireApi('src', 'routes', 'places.ts');
const migration = lireApi('db', 'migrations', '0014_fiche_vip_premium.sql');
const schemaApi = lireApi('src', 'db', 'schema.ts');
verifier('la colonne horaires existe', /ADD COLUMN IF NOT EXISTS horaires jsonb/.test(migration));
verifier('la table des avis existe', /CREATE TABLE IF NOT EXISTS place_reviews/.test(migration));
verifier(
  'un seul avis par appareil et par lieu',
  /CREATE UNIQUE INDEX IF NOT EXISTS place_reviews_unique_device/.test(migration),
  'sans cela la note appartient a qui appuie le plus, et le seuil de trois ne protege rien',
);
verifier('la note est bornee 1–5 par la base', /CHECK \(note BETWEEN 1 AND 5\)/.test(migration));
verifier('le schema drizzle suit', /placeReviews/.test(schemaApi) && /horaires: jsonb/.test(schemaApi));
verifier('les horaires sont renvoyes a l application', /p\.horaires,/.test(route));
verifier('la moyenne et le compte aussi', /"avisNote"/.test(route) && /"avisCount"/.test(route));
verifier('la moyenne est calculee par le serveur', /ROUND\(AVG\(r\.note\)/.test(route));
/* Le defaut du 18 novembre encore : une jointure ajoutee a UNE requete et oubliee dans les
 * trois autres donnerait une note sur la fiche et aucune dans la recherche. */
verifier(
  "la jointure des avis est sur les QUATRE requetes de lieux",
  (route.match(/\$\{avisJoin\}/g) ?? []).length === 4,
  'une seule oubliee, et la note manque dans la recherche ou sur la carte',
);
verifier('la route de depot existe', /'\/places\/:id\/avis'/.test(route));
verifier(
  'un second depot CORRIGE le premier',
  /ON CONFLICT \(place_id, device_id\)/.test(route) && /DO UPDATE SET note = EXCLUDED\.note/.test(route),
  'on change d avis sur un commerce, on ne vote pas dix fois',
);
verifier(
  'les horaires sont enregistrables',
  /horaires     = COALESCE/.test(route) && (route.match(/horaires     = COALESCE/g) ?? []).length === 2,
  'la fiche et le panneau admin : sans cela, aucun horaire n existerait jamais',
);
verifier(
  'le transtypage ::jsonb est present',
  /JSON\.stringify\(input\.horaires\) : null\}::jsonb/.test(route),
  'sans lui Postgres refuse la requete entiere, donc TOUTE correction de fiche',
);

console.log('\n============================================================');
console.log('L ECRAN NE DOIT PLUS JAMAIS DEVENIR NOIR');
console.log('============================================================');
/* LE 19 NOVEMBRE, chercher un lieu a rendu l'ecran entierement noir. Deux causes possibles
 * etaient ouvertes, et les deux sont fermees ici : un degrade de taille nulle (exception
 * NATIVE sur Android, qui tue le processus sans laisser de trace rattrapable), et l'absence
 * de tout filet autour du rendu de l'ecran principal. */
const racine = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
const ecran = readFileSync(join(__dirname, '..', 'app', 'index.tsx'), 'utf8');
const ecranSur = lire('src', 'components', 'EcranSur.tsx');
const picker = lire('src', 'components', 'NavDestinationPicker.tsx');

verifier(
  'aucun degrade n est rendu avant d avoir ete mesure',
  /\{largeur > 0 \? \(/.test(lisere) && /\{largeur > 0 \? \(\s*<LinearGradient/.test(badge),
  'un LinearGradient de largeur nulle peut lever une exception native et tuer le processus',
);
verifier(
  'le badge garde une couleur pleine sous son degrade',
  /backgroundColor: palette\.light\.gold500/.test(badge),
  'sinon un degrade qui echoue laisse un rectangle transparent',
);
verifier('un filet est pose A LA RACINE', /<EcranSur>/.test(racine));
verifier(
  'et il montre le message ET le composant fautif',
  /componentStack/.test(ecranSur) && /erreur\.message/.test(ecranSur),
  'le telephone de test n a pas de console : cet encadre EST la console',
);
verifier(
  'il propose de repartir',
  /reprendre = \(\) =>/.test(ecranSur),
  'une panne passagere ne doit pas obliger a tuer l application',
);
verifier(
  'la liste de resultats ne peut plus emporter la carte',
  (ecran.match(/<SectionSure nom="Resultats de recherche">/g) ?? []).length === 2 &&
    /<SectionSure nom="Resultats de recherche">/.test(picker),
  'les trois endroits ou l on cherche un lieu : carte, detour, et destination en roulant',
);
verifier('ni la fiche du lieu', /<SectionSure nom="Fiche du lieu"/.test(ecran));

console.log('\nLES CINQ LANGUES');
const clefs = [
  'openNow', 'closedNow', 'closedDay', 'today',
  'daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat',
  'hoursExpand', 'hoursCollapse', 'photoCount',
  'reviewsNone', 'rateThis', 'yourRating', 'rateStars', 'rateFailed',
];
for (const langue of ['fr', 'en', 'ar', 'dz', 'kab']) {
  const j = JSON.parse(lire('src', 'i18n', 'locales', `${langue}.json`)) as {
    place?: Record<string, string>;
  };
  const place = j.place ?? {};
  const manquantes = clefs.filter((c) => !place[c]);
  const pluriels = ['reviewsPatients', 'reviewsClients', 'reviewsNeutral', 'reviewsBelowThreshold']
    .filter((c) => !place[`${c}_one`] || !place[`${c}_other`]);
  verifier(
    langue,
    manquantes.length === 0 && pluriels.length === 0,
    manquantes.length || pluriels.length
      ? `manque ${[...manquantes, ...pluriels.map((p) => `${p}_one/_other`)].join(', ')}`
      : `${clefs.length + 8} clefs`,
  );
}

console.log(
  fautes === 0
    ? '\nLa synthese << Fiche VIP Premium >> est appliquee, sous-exigence par sous-exigence.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
