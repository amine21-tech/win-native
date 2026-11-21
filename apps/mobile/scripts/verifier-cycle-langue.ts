/**
 * Eprouve LE CYCLE DU BOUTON DE LANGUE EN NAVIGATION — point 6 du 21 novembre.
 *
 * << 1er tap : Tamazight/Kabyle. 2e tap : Derija algerienne. 3e tap : retour a la langue active
 * avant le premier tap (FR, AR, EN...). >>
 *
 * POURQUOI CE CONTROLE EXISTE. Le bouton a de la MEMOIRE, et c'est tout le danger : son
 * troisieme appui doit ramener a une langue retenue deux appuis plus tot. Un etat mal remis a
 * zero ne se voit pas au premier essai — il se voit au dixieme, quand le bouton ramene a une
 * langue que le conducteur a quittee depuis longtemps. A la main, il faudrait appuyer trois fois
 * de suite depuis chacune des cinq langues ; ici, cela prend une seconde.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-cycle-langue.ts
 */
import { AU_REPOS, appuiLangue, CYCLE, libelleProchain, type EtatCycle } from '../src/i18n/cycleLangue';
import { LANGUAGES, type Language } from '../src/shared/constants';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/** Appuie `n` fois de suite en partant d'une langue, et rend la suite des langues traversees. */
function appuyer(depart: Language, n: number): Language[] {
  let etat: EtatCycle = AU_REPOS;
  let actuelle = depart;
  const suite: Language[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = appuiLangue(etat, actuelle);
    etat = r.etat;
    actuelle = r.langue;
    suite.push(actuelle);
  }
  return suite;
}

console.log('\nLES TROIS APPUIS DU DOCUMENT, DEPUIS UNE LANGUE HORS CYCLE');
/* C'est le cas normal, et le seul que le document decrive : le conducteur roule en francais,
 * en arabe ou en anglais, et veut entendre sa langue sans quitter le trajet. */
for (const depart of ['fr', 'ar', 'en'] as Language[]) {
  const suite = appuyer(depart, 3);
  verifier(
    `depuis ${depart} : kab, dz, puis retour a ${depart}`,
    suite.join(' > ') === `kab > dz > ${depart}`,
    suite.join(' > '),
  );
}

console.log('\nLE QUATRIEME APPUI REPART DU DEBUT');
/* Apres le retour, le cycle doit DORMIR a nouveau : s'il gardait son compteur, le quatrieme
 * appui sauterait le kabyle, et le bouton deviendrait imprevisible a l'usage. */
verifier(
  'depuis fr, quatre appuis : kab, dz, fr, kab',
  appuyer('fr', 4).join(' > ') === 'kab > dz > fr > kab',
  appuyer('fr', 4).join(' > '),
);
verifier(
  'depuis fr, six appuis : deux tours identiques',
  appuyer('fr', 6).join(' > ') === 'kab > dz > fr > kab > dz > fr',
  appuyer('fr', 6).join(' > '),
);

console.log('\nAUCUN APPUI NE RESTE SANS EFFET — le seul ecart voulu avec le document');
/* Pris au mot, le cycle fait qu'un conducteur deja en kabyle appuie une premiere fois pour
 * passer... en kabyle. Au volant, un bouton qui ne repond pas se presse une seconde fois, et on
 * quitte la route des yeux. On verifie donc la propriete GENERALE : quelle que soit la langue de
 * depart et le nombre d'appuis, la langue change a CHAQUE appui. */
for (const depart of LANGUAGES) {
  const suite = appuyer(depart, 8);
  let precedente: Language = depart;
  let immobile = '';
  for (const langue of suite) {
    if (langue === precedente) immobile = langue;
    precedente = langue;
  }
  verifier(
    `depuis ${depart} : huit appuis, huit changements`,
    immobile === '',
    immobile === '' ? suite.slice(0, 4).join(' > ') + ' ...' : `reste sur ${immobile}`,
  );
}

console.log('\nLES DEUX LANGUES DEMANDEES SONT BIEN ATTEINTES, DEPUIS N IMPORTE OU');
/* Le raccourci n'a qu'une raison d'etre : donner acces au kabyle et au darija. S'il fallait
 * connaitre sa langue de depart pour y arriver, il ne servirait a rien. */
for (const depart of LANGUAGES) {
  const suite = appuyer(depart, 4);
  verifier(
    `depuis ${depart} : kab et dz atteints en quatre appuis au plus`,
    CYCLE.every((l) => suite.includes(l)),
    suite.join(' > '),
  );
}

console.log('\nLA LANGUE DE DEPART EST RELUE A CHAQUE APPUI, JAMAIS SUPPOSEE');
/* ENTRE DEUX APPUIS, L'UTILISATEUR PEUT CHANGER DE LANGUE DEPUIS L'ACCUEIL. Le cycle doit alors
 * raisonner sur la langue REELLE, pas sur celle qu'il croit avoir posee — sinon il ramene le
 * conducteur a un choix qu'il vient d'abandonner. */
const premier = appuiLangue(AU_REPOS, 'fr');
verifier('premier appui depuis fr : kab', premier.langue === 'kab');
verifier('le cycle a retenu fr', premier.etat.avant === 'fr', String(premier.etat.avant));
const second = appuiLangue(premier.etat, 'en'); // l'utilisateur est passe a l'anglais entre-temps
verifier('deuxieme appui, langue reelle en : dz', second.langue === 'dz', second.langue);
const troisieme = appuiLangue(second.etat, second.langue);
verifier(
  'le retour ramene a fr, la langue d avant le premier appui',
  troisieme.langue === 'fr',
  troisieme.langue,
);
verifier('et le cycle se rendort', troisieme.etat.pas === 0 && troisieme.etat.avant === null);

console.log('\nLE LIBELLE ANNONCE LA DESTINATION, PAS L ETAT COURANT');
/* Comme le bouton drapeau de la carte : on lit ou l'on va. Un bouton qui affiche la langue
 * courante obligerait a se souvenir de ce qui vient apres. */
verifier("depuis fr, le bouton annonce le tifinagh", libelleProchain(AU_REPOS, 'fr') === 'ⵣ');
verifier('au palier kabyle, il annonce DZ', libelleProchain(premier.etat, 'kab') === 'DZ');
verifier(
  'au palier darija, il annonce la langue de retour',
  libelleProchain(second.etat, 'dz') === 'FR',
  libelleProchain(second.etat, 'dz'),
);

console.log('\nL ETAT AU REPOS EST UNE CONSTANTE, ET IL N EST JAMAIS MODIFIE EN PLACE');
/* `AU_REPOS` est partage par tous les appels : s'il etait mute, le premier appui d'un conducteur
 * deciderait de la langue de retour de tous les suivants. */
verifier('AU_REPOS inchange apres une dizaine d appuis', AU_REPOS.pas === 0 && AU_REPOS.avant === null);

console.log(
  fautes === 0
    ? '\nLe raccourci atteint le kabyle et le darija, revient d ou il vient, et ne reste jamais muet.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
