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

console.log('\nLE DARIJA EN PREMIER — correction du 22 novembre');
/* << Derija en 1er car langue la plus parlee en Algerie >>. L'ordre etait inverse la veille, et
 * ces quatre lignes sont la pour qu'un retour en arriere se voie tout de suite : elles lisent la
 * liste elle-meme, et non la suite d'appuis qu'elle produit. */
verifier('le cycle commence par le darija', CYCLE[0] === 'dz', String(CYCLE[0]));
verifier('et finit par le tamazight', CYCLE[1] === 'kab', String(CYCLE[1]));
verifier('deux langues, pas plus', CYCLE.length === 2, String(CYCLE.length));

console.log('\nLES TROIS APPUIS DU DOCUMENT, DEPUIS UNE LANGUE HORS CYCLE');
/* C'est le cas normal, et le seul que le document decrive : le conducteur roule en francais,
 * en arabe ou en anglais, et veut entendre sa langue sans quitter le trajet. */
for (const depart of ['fr', 'ar', 'en'] as Language[]) {
  const suite = appuyer(depart, 3);
  verifier(
    `depuis ${depart} : dz, kab, puis retour a ${depart}`,
    suite.join(' > ') === `dz > kab > ${depart}`,
    suite.join(' > '),
  );
}

console.log('\nLE QUATRIEME APPUI REPART DU DEBUT');
/* Apres le retour, le cycle doit DORMIR a nouveau : s'il gardait son compteur, le quatrieme
 * appui sauterait le kabyle, et le bouton deviendrait imprevisible a l'usage. */
verifier(
  'depuis fr, quatre appuis : dz, kab, fr, dz',
  appuyer('fr', 4).join(' > ') === 'dz > kab > fr > dz',
  appuyer('fr', 4).join(' > '),
);
verifier(
  'depuis fr, six appuis : deux tours identiques',
  appuyer('fr', 6).join(' > ') === 'dz > kab > fr > dz > kab > fr',
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
verifier('premier appui depuis fr : dz', premier.langue === 'dz', premier.langue);
verifier('le cycle a retenu fr', premier.etat.avant === 'fr', String(premier.etat.avant));
const second = appuiLangue(premier.etat, 'en'); // l'utilisateur est passe a l'anglais entre-temps
verifier('deuxieme appui, langue reelle en : kab', second.langue === 'kab', second.langue);
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
/* DES MOTS, ET NON DES SIGLES — l'autre correction du 22 novembre. Le bouton affichait
 * << DZ >> et le caractere tifinagh << ⵣ >> ; le client demande << Derija >> et
 * << Tamazight >> en toutes lettres. Les trois langues de RETOUR gardent leur sigle : elles ne
 * sont jamais une destination du cycle. */
verifier(
  'depuis fr, le bouton annonce Derija',
  libelleProchain(AU_REPOS, 'fr') === 'Derija',
  libelleProchain(AU_REPOS, 'fr'),
);
verifier(
  'au palier darija, il annonce Tamazight',
  libelleProchain(premier.etat, 'dz') === 'Tamazight',
  libelleProchain(premier.etat, 'dz'),
);
verifier(
  'au palier tamazight, il annonce la langue de retour',
  libelleProchain(second.etat, 'kab') === 'FR',
  libelleProchain(second.etat, 'kab'),
);
/* Aucun libelle ne doit etre vide : un bouton muet au volant est un bouton casse. */
for (const depart of LANGUAGES) {
  verifier(
    `depuis ${depart}, le bouton porte un mot`,
    libelleProchain(AU_REPOS, depart).length > 0,
    libelleProchain(AU_REPOS, depart),
  );
}

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
