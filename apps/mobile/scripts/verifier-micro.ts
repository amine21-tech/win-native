/**
 * Eprouve LE GESTE DU MICRO VOCAL — point 8 du 22 novembre.
 *
 * << Appui simple -> icone rouge -> 5 s d'ecoute -> reconnaissance automatique -> resultat
 * affiche. >> << Remplacement de l'appui long (peu intuitif). >>
 *
 * CE QU'UN ESSAI AU DOIGT NE TROUVE PAS, ET QUI SE JOUE ICI. Le geste a l'air trop simple pour
 * meriter un controle, et c'est exactement pourquoi il en faut un : ce qui casse une commande
 * minutee ne se voit jamais a l'essai normal. Deux appuis trop rapproches, une minuterie de la
 * dictee precedente encore armee, un ecran quitte pendant l'ecoute — chacun demande une
 * manipulation precise, et chacun laisse le micro allume ou coupe la dictee suivante.
 *
 * CE CONTROLE PORTE SUR DEUX CHOSES. D'abord la REGLE, dans `search/micro`, qui est de
 * l'arithmetique pure. Ensuite, par lecture des sources, les trois ANNULATIONS de la minuterie
 * et le fait que l'ancien geste a bien disparu partout : un `onPressIn` oublie dans un seul des
 * trois appelants laisserait deux gestes pour un meme bouton.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-micro.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { appuiMicro, ECOUTE_MS, phraseUtilisable } from '../src/search/micro';

const fautes: string[] = [];

function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? '  - ' + detail : ''}`);
  if (!ok) fautes.push(nom);
}

function lire(...bouts: string[]): string {
  return readFileSync(resolve(__dirname, '..', ...bouts), 'utf8');
}

console.log('\nCINQ SECONDES, LA VALEUR DU DOCUMENT');
verifier('la duree d ecoute vaut 5 000 ms', ECOUTE_MS === 5000, `${ECOUTE_MS} ms`);
/* << Noms de villes algeriennes composes : Draa El Mizan, Ain Temouchent, Bordj Bou Arreridj
 * -> 3 a 4 s. >> La duree doit laisser passer le plus long des trois, avec de la marge. */
verifier(
  'elle laisse prononcer << Bordj Bou Arreridj >> (4 s) avec de la marge',
  ECOUTE_MS >= 4500,
  'le client cite 3 a 4 s pour les noms composes',
);
verifier(
  'et elle ne fait pas attendre pour rien au-dela de six secondes',
  ECOUTE_MS <= 6000,
  '<< pas d attente inutile >>',
);

console.log('\nLE PREMIER APPUI ECOUTE, LE SECOND FINALISE');
verifier('au repos, un appui demarre l ecoute', appuiMicro(false) === 'demarrer');
/* LE SECOND APPUI N'EST PAS DANS LE DOCUMENT, ET IL EST NECESSAIRE : sans lui, le bouton
 * ignore les appuis pendant cinq secondes. On a dit << Alger >> en une seconde, et il reste
 * quatre secondes devant un bouton rouge qui ne repond pas — au volant, on le presse encore. */
verifier('pendant l ecoute, un appui finalise tout de suite', appuiMicro(true) === 'finir');
verifier(
  'la regle n a que ces deux issues',
  (['demarrer', 'finir'] as const).includes(appuiMicro(false)) &&
    (['demarrer', 'finir'] as const).includes(appuiMicro(true)),
);
verifier(
  'et elle ne depend que de l etat : deux appels de suite donnent le meme resultat',
  appuiMicro(false) === appuiMicro(false) && appuiMicro(true) === appuiMicro(true),
);

console.log('\nCE QUI MERITE DE LANCER UNE RECHERCHE');
/* Le moteur rend parfois une lettre sur un souffle ou un bruit de moteur. Chercher << a >>
 * renvoie n'importe quoi, et le conducteur croit que le micro a mal compris. */
verifier('un nom de ville passe', phraseUtilisable('Alger'));
verifier('un nom compose passe', phraseUtilisable('Bordj Bou Arreridj'));
verifier('deux caracteres suffisent', phraseUtilisable('Ai'));
verifier('une seule lettre ne passe pas', !phraseUtilisable('a'));
verifier('du vide ne passe pas', !phraseUtilisable(''));
verifier('des espaces seuls ne passent pas', !phraseUtilisable('   '));
verifier(
  'une lettre entouree d espaces ne passe pas non plus',
  !phraseUtilisable('  a  '),
  'le texte est rogne avant d etre compte',
);

console.log('\nLA MINUTERIE EST ANNULEE DANS LES TROIS SORTIES');
/* Une minuterie oubliee appelle `stop()` cinq secondes plus tard — sur un moteur deja arrete,
 * ou, pire, sur la dictee SUIVANTE : l'utilisateur relance le micro et son ecoute est coupee
 * par la minuterie de la precedente. Les trois sorties sont la fin normale, l'erreur du moteur,
 * et le demontage de l'ecran. */
const hook = lire('src', 'search', 'useVoiceSearch.ts');
verifier(
  'la minuterie existe et porte la duree du document',
  hook.includes('setTimeout(stop, ECOUTE_MS)'),
);
verifier('il y a une fonction d annulation unique', hook.includes('const annulerMinuterie'));
verifier(
  'la fin normale l annule',
  /useSpeechRecognitionEvent\('end'[\s\S]{0,200}?annulerMinuterie\(\)/.test(hook),
);
verifier(
  "l erreur du moteur l annule",
  /useSpeechRecognitionEvent\('error'[\s\S]{0,200}?annulerMinuterie\(\)/.test(hook),
);
verifier(
  'le demontage de l ecran l annule',
  /useEffect\(\(\) => annulerMinuterie/.test(hook),
);
verifier(
  'et `stop` l annule aussi, pour le second appui',
  /const stop = useCallback\(\(\) => \{[\s\S]{0,300}?annulerMinuterie\(\)/.test(hook),
);
/* DEUX APPUIS RAPPROCHES NE DOIVENT PAS LANCER DEUX DICTEES. `start()` est asynchrone : entre
 * l'appui et le `setListening(true)` qu'il declenche il y a un cycle de rendu, et un doigt
 * impatient y passe deux fois. La decision doit donc lire une reference ecrite tout de suite,
 * et non l'etat React. */
verifier(
  'la decision lit une reference immediate, et non l etat React',
  hook.includes('appuiMicro(ecouteDemandee.current)'),
  'sinon deux appuis rapproches reclament le micro deux fois',
);
verifier(
  'cette reference est remise a zero aux trois sorties',
  (hook.match(/ecouteDemandee\.current = false/g) ?? []).length >= 3,
  `${(hook.match(/ecouteDemandee\.current = false/g) ?? []).length} remises a zero`,
);

console.log('\nL ANCIEN GESTE A DISPARU DE TOUS LES APPELANTS');
/* Un `onPressIn` oublie dans un seul des trois appelants laisserait DEUX gestes pour le meme
 * bouton : l'appui simple et l'appui maintenu, tous deux branches sur le meme moteur. */
for (const [nom, bouts] of [
  ['la barre de recherche', ['src', 'components', 'SearchBar.tsx']],
  ['la carte de navigation', ['src', 'components', 'NavDestinationPicker.tsx']],
  ["l ecran d accueil", ['app', 'index.tsx']],
] as const) {
  const source = lire(...bouts);
  /* ON CHERCHE LES USAGES, PAS LES MENTIONS : `onMicPressIn=` (passe en JSX), `onMicPressIn:`
   * (declare dans un type) ou `onMicPressIn,` (deballe d'un objet). Les deux anciens noms sont
   * cites en toutes lettres dans les commentaires qui expliquent leur remplacement, et une
   * recherche de texte brut y verrait un reste de code. */
  const usage = /onMicPress(In|Out)\s*[=:,]/;
  verifier(
    `${nom} : plus aucun onMicPressIn / onMicPressOut utilise`,
    !usage.test(source),
    (source.match(usage) ?? ['aucun'])[0],
  );
  verifier(`${nom} : elle parle bien d un appui simple`, source.includes('onMicPress'));
}
const barre = lire('src', 'components', 'SearchBar.tsx');
verifier(
  'le bouton reagit a onPress, et non a onPressIn',
  barre.includes('onPress={onMicPress}') && !barre.includes('onPressIn='),
);
verifier(
  "le micro clignote pendant l'ecoute, et non seulement en rouge fixe",
  barre.includes('Animated.Text') && barre.includes('opacity: battement'),
  '<< Rouge clignotant pendant ecoute >>',
);
verifier(
  'et son dessin a grandi',
  /micGlyph: \{ fontSize: (2[0-9]|3[0-9])/.test(barre),
  (barre.match(/micGlyph: \{ fontSize: [0-9.]+/) ?? ['?'])[0],
);

console.log('');
if (fautes.length > 0) {
  console.log(`A CORRIGER : ${fautes.length} verification(s) en echec.\n`);
  process.exit(1);
}
console.log(
  'Un appui, cinq secondes, le resultat — et la minuterie ne survit a aucune des trois sorties.\n',
);
