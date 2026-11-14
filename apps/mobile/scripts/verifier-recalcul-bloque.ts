/**
 * Verifie qu'un appel reseau ne peut PAS figer l'ecran de navigation.
 *
 * LE BUG DU 14 NOVEMBRE, ET POURQUOI IL A FAIT TROIS DEGATS AVEC UNE SEULE CAUSE.
 *
 * `loadRoute` leve `recalculating` avant l'appel reseau et le rabaisse dans son `finally`. Le
 * `fetch` de React Native n'avait aucune echeance — il est bati sur XMLHttpRequest, dont le
 * `timeout` vaut zero tant qu'on ne le regle pas, et zero veut dire attendre indefiniment. Une
 * socket qui s'ouvre puis se tait, ce qui arrive a chaque passage de cellule, et la promesse ne
 * se resout jamais : le `finally` n'arrive pas, l'etat reste leve.
 *
 * Or cet etat ne fait pas qu'afficher une pastille. Il MASQUE le guidage de voie et il MASQUE
 * le message d'echec. Le conducteur se retrouvait donc devant << Recalcul en cours >> fige,
 * sans fleches de voie, sans explication, et sans nouvel itineraire. Arsanne l'a rapporte comme
 * trois bugs distincts ; c'en etait un.
 *
 * CE QUE CE SCRIPT GARDE :
 *   - l'echeance par defaut du client HTTP, qui est la barriere ;
 *   - l'echeance propre au calcul d'itineraire, plus courte, parce qu'un conducteur attend ;
 *   - le `finally` qui rabaisse l'etat, qui est ce que l'echeance rend atteignable ;
 *   - le plafond de securite, qui est la seconde barriere ;
 *   - et le COUPLAGE lui-meme, documente ici pour que celui qui ajoutera demain une troisieme
 *     chose masquee par `recalculating` sache ce qu'il engage.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-recalcul-bloque.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(__dirname, '..');
const lire = (...p: string[]) => readFileSync(join(RACINE, ...p), 'utf8');

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

const client = lire('src', 'api', 'client.ts');
const routing = lire('src', 'navigation', 'routing.ts');
const session = lire('src', 'navigation', 'useNavigationSession.ts');
const overlay = lire('src', 'components', 'NavigationOverlay.tsx');

console.log("\nTOUT APPEL API FINIT PAR ABANDONNER");
const defaut = /const DELAI_DEFAUT_MS = (\d+)_(\d+)/.exec(client);
verifier(
  'le client HTTP arme une echeance par defaut',
  defaut !== null,
  defaut ? `${defaut[1]}${defaut[2]} ms` : "aucun DELAI_DEFAUT_MS : un appel peut attendre pour toujours",
);
verifier(
  'elle est reellement branchee sur le fetch',
  /new AbortController\(\)/.test(client) && /signal,/.test(client),
  "un minuteur qu'on n'attache a rien ne protege de rien",
);
/* L'ECHEANCE COUVRE AUSSI LA LECTURE DU CORPS. Un serveur peut envoyer ses entetes puis se
 * taire : `fetch` a deja rendu la main et c'est `response.text()` qui attend sans fin. Desarmer
 * le minuteur des la reponse recue rouvrirait la meme panne deux lignes plus bas. */
const posTexte = client.indexOf('await response.text()');
const posClear = client.indexOf('clearTimeout(echeance)', posTexte);
verifier(
  'et elle couvre la lecture du corps, pas seulement les entetes',
  posTexte > 0 && posClear > posTexte,
  'le minuteur se desarme APRES text(), pas avant',
);

console.log("\nLE CALCUL D'ITINERAIRE A LA SIENNE, PLUS COURTE");
const route = /timeoutMs: opts\.quick \? (\d+)_(\d+) : (\d+)_(\d+)/.exec(routing);
verifier(
  'fetchRoute impose son echeance',
  route !== null,
  route ? `${route[1]}${route[2]} ms presse, ${route[3]}${route[4]} ms complet` : 'aucune',
);

console.log("\nL'ETAT DE RECALCUL NE PEUT PAS RESTER LEVE");
/* Le `finally` est ce qui rabaisse l'etat ; l'echeance est ce qui garantit qu'on l'atteint.
 * Les deux sont necessaires et aucun ne suffit : sans `finally`, une erreur laisserait l'etat
 * leve ; sans echeance, le `finally` ne serait jamais atteint. */
verifier(
  'loadRoute le rabaisse dans un finally',
  /} finally \{[\s\S]{0,400}setRecalculating\(false\)/.test(session),
  'une erreur reseau ne doit pas laisser la pastille a l ecran',
);
const plafond = /const PLAFOND_RECALCUL_MS = (\d+)_(\d+)/.exec(session);
verifier(
  'un plafond de securite existe malgre tout',
  plafond !== null && /setTimeout\(\(\) => setRecalculating\(false\), PLAFOND_RECALCUL_MS\)/.test(session),
  plafond ? `${plafond[1]}${plafond[2]} ms` : 'aucun PLAFOND_RECALCUL_MS',
);
/* LE PLAFOND DOIT ETRE PLUS LONG QUE L'ECHEANCE LA PLUS LONGUE, sinon il coupe des calculs qui
 * allaient aboutir — et le conducteur perd un itineraire valide au lieu de gagner un ecran
 * vivant. C'est la seule relation entre ces deux nombres, et elle est facile a casser en
 * rallongeant l'un sans regarder l'autre. */
const plafondMs = plafond ? Number(`${plafond[1]}${plafond[2]}`) : 0;
const calculMs = route ? Number(`${route[3]}${route[4]}`) : 0;
verifier(
  'et il laisse au calcul le temps de repondre',
  plafondMs > calculMs,
  `${plafondMs} ms de plafond contre ${calculMs} ms d'echeance`,
);

console.log('\nCE QUE CET ETAT MASQUE, ET QUI FAIT LE PRIX D UN BLOCAGE');
/* Ces deux controles ne protegent pas d'un defaut : ils mesurent l'ENJEU. Tant que
 * `recalculating` masque le guidage de voie et le message d'echec, un blocage ne fait pas que
 * laisser une pastille a l'ecran — il eteint ce qui reste pour comprendre la situation. Si
 * quelqu'un ajoute demain un troisieme element a cette liste, ce compte le dira. */
const masques = [...overlay.matchAll(/!recalculating \?/g)].length;
verifier(
  'le guidage de voie disparait pendant un recalcul',
  /!arrived && !recalculating \?[\s\S]{0,120}<LaneGuidance/.test(overlay),
  "c'est voulu : des fleches calculees sur un trace perime designeraient la mauvaise voie",
);
verifier(
  "le message d'echec aussi",
  /erreurItineraire && !recalculating \?/.test(overlay),
  `${masques} elements masques en tout — autant de choses eteintes si l etat reste leve`,
);

console.log(
  fautes === 0
    ? "\nUn appel sans reponse ne peut plus figer l'ecran.\n"
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
