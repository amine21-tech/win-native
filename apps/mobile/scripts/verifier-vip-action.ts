/**
 * Verifie la route de GESTION D'UNE ADRESSE VIP — point B du 18 novembre.
 *
 * << 2 actions possibles via code 0000 : (1) Supprimer definitivement ; (2) Declasser en
 * adresse normale — garde l'adresse, retire uniquement le statut VIP. >>
 *
 * POURQUOI CETTE ROUTE MERITE UN CONTROLE A ELLE SEULE. Elle est la seule de l'application
 * qui permette de toucher a une fiche PAYEE, et elle s'ouvre avec quatre chiffres. Trois
 * choses peuvent mal tourner, et aucune ne se verrait a la relecture :
 *
 *   - LE CODE N'EST PLUS VERIFIE : n'importe qui efface une fiche partenaire.
 *   - LE DECLASSEMENT EFFACE TROP : le commerce perd son telephone, et la carte une
 *     information vraie, pour une facture impayee.
 *   - L'ACTION N'EST PAS TRACEE : un retrait abusif devient irreparable, alors que toute
 *     suppression de ce depot est logique et se defait depuis le journal de moderation.
 *
 * Le controle lit la route plutot que de l'executer : il n'y a pas de Postgres sur la machine
 * de developpement, et ces trois proprietes se lisent dans le code qui les porte.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-vip-action.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { vipActionInput } from '../src/shared/schemas';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

const route = readFileSync(
  join(__dirname, '..', '..', 'api', 'src', 'routes', 'places.ts'),
  'utf8',
);
/* On isole LA route : chercher dans le fichier entier ferait passer pour juste une
 * verification de code qui se trouve dans une autre route. */
const debut = route.indexOf("'/places/:id/vip-action'");
const fin = route.indexOf("app.post('/places/vip-check'", debut);
const bloc = debut >= 0 && fin > debut ? route.slice(debut, fin) : '';

console.log("\nLA ROUTE EXISTE, ET ELLE DEMANDE LE CODE");
verifier('elle est declaree', bloc.length > 0);
verifier(
  'le code est verifie AVANT toute action',
  bloc.indexOf('vipCodeMatches') > 0 &&
    bloc.indexOf('vipCodeMatches') < bloc.indexOf('UPDATE places'),
  "c'est la seule route qui touche a une fiche payee",
);
verifier(
  'elle est soumise a la limite d essais du code VIP',
  /config: VIP_RATE_LIMIT/.test(bloc),
  'un code a quatre chiffres ne resiste pas a un essai systematique',
);

console.log('\nLES DEUX ACTIONS, ET RIEN D AUTRE');
verifier(
  'le schema n accepte que supprimer ou declasser',
  vipActionInput.safeParse({ code: '0000', action: 'supprimer' }).success &&
    vipActionInput.safeParse({ code: '0000', action: 'declasser' }).success &&
    !vipActionInput.safeParse({ code: '0000', action: 'autre' }).success,
);
verifier(
  'un code trop court est refuse par le schema',
  !vipActionInput.safeParse({ code: '00', action: 'supprimer' }).success,
);

console.log('\nLE DECLASSEMENT GARDE L ADRESSE');
/* C'est la raison d'etre de cette action : un partenaire qui ne renouvelle pas garde un
 * commerce, une adresse, un numero. Effacer la fiche ferait perdre une information vraie et
 * obligerait quelqu'un a la ressaisir. */
const declassement = bloc.slice(bloc.indexOf('} else {'));
verifier(
  'il retire le statut et la promotion',
  /is_partner = false/.test(declassement) && /promo = NULL/.test(declassement),
);
for (const champ of ['name', 'geom', 'phone_mobile', 'whatsapp', 'street', 'city']) {
  verifier(
    `il ne touche pas a ${champ}`,
    !new RegExp(`${champ}\\s*=`).test(declassement),
    champ === 'phone_mobile' || champ === 'whatsapp'
      ? 'le document les listait : ce sont des champs d adresse ordinaire, pas de statut'
      : '',
  );
}
verifier(
  'et il ne supprime pas la fiche',
  !/deleted_at = now\(\)/.test(declassement),
  'declasser et supprimer sont deux gestes, pas un avec une option',
);

console.log('\nLA SUPPRESSION RESTE LOGIQUE, DONC REPARABLE');
const suppression = bloc.slice(bloc.indexOf("if (action === 'supprimer')"), bloc.indexOf('} else {'));
verifier(
  'elle pose deleted_at et ne detruit rien',
  /deleted_at = now\(\)/.test(suppression) && !/DELETE FROM/.test(suppression),
  'la fiche quitte la carte, ses donnees restent',
);

console.log('\nLES DEUX ACTIONS SONT TRACEES');
verifier(
  'le journal de moderation recoit l etat d avant',
  /INSERT INTO moderation_log/.test(bloc) && /\$\{JSON\.stringify\(avant\)\}/.test(bloc),
  "sans l'etat d'avant, un retrait abusif ne se defait pas",
);
verifier(
  'et il distingue les deux gestes',
  /vip_delete/.test(bloc) && /vip_downgrade/.test(bloc),
);

console.log(
  fautes === 0
    ? "\nLa porte des fiches VIP s'ouvre avec le code, et seulement avec lui.\n"
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
