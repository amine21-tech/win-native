/**
 * UNE ADRESSE VIP SE SUPPRIME ET SE CORRIGE COMME UNE AUTRE — point du 24 novembre.
 *
 *   << La suppression, les modifications des adresses VIP ne fonctionnent toujours pas. Le
 *   point c'est que l'adresse VIP et non VIP sera supprimee. Et des modifications
 *   fonctionnelles a tous les points. >>
 *
 * CE QUI SE PASSAIT, ET POURQUOI CELA NE SE VOYAIT PAS A LA RELECTURE. Une fiche partenaire ne
 * pouvait etre retiree que par son AUTEUR, et le client cree ses fiches d'essai depuis le
 * site : son telephone n'en est donc l'auteur d'aucune. L'ecran grisait la ligne, le serveur
 * refusait avec un 403, et les deux etaient d'accord entre eux — ce qui est la pire facon de
 * se tromper, puisque rien ne depasse.
 *
 * Ce fichier controle les trois faces de la correction : l'ecran laisse faire, le serveur
 * laisse faire, et ce qui protegeait vraiment — la suppression logique et le journal — est
 * toujours la. Il verifie aussi le garde-fou qui empeche une correction d'effacer un numero
 * que l'ecran n'avait pas encore recu.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-suppression-vip.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/* LES FINS DE LIGNE SONT NORMALISEES A LA LECTURE, et ce n'est pas de la coquetterie : un
 * aller-retour par git (un `stash`, une recuperation de branche) rend les fichiers en CRLF sur
 * Windows. Les motifs ecrits ici avec un saut de ligne cessaient alors de correspondre, et ce
 * fichier annoncait << la route de retrait n'a pas ete trouvee >> alors que la route n'avait
 * pas bouge d'une ligne. Un verificateur qui depend de la facon dont le fichier a ete pose sur
 * le disque ne verifie rien. */
const lire = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
/** Le code sans ses commentaires : le correctif CITE ce qu'il a retire. */
const sansCommentaires = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const fiche = lire('src', 'components', 'PlaceSheet.tsx');
const codeFiche = sansCommentaires(fiche);
const gerer = sansCommentaires(lire('src', 'components', 'GererFiche.tsx'));
const formulaire = lire('src', 'components', 'MyPlaceSheet.tsx');
const codeFormulaire = sansCommentaires(formulaire);
const routes = readFileSync(
  join(__dirname, '..', '..', 'api', 'src', 'routes', 'places.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

/* On isole LA route de retrait : places.ts porte quatre routes qui touchent une fiche, et
 * chercher dans le fichier entier ferait passer pour juste une condition qui vit ailleurs. */
const debutRetrait = routes.indexOf("app.delete<{ Params: { id: string } }>(\n    '/places/:id/mine'");
const finRetrait = routes.indexOf('app.patch', debutRetrait);
const retrait = sansCommentaires(
  debutRetrait >= 0 && finRetrait > debutRetrait ? routes.slice(debutRetrait, finRetrait) : '',
);

console.log('\n============================================================');
console.log("L'ECRAN LAISSE SUPPRIMER UNE FICHE PARTENAIRE");
console.log('============================================================');
verifier('la route de retrait a bien ete trouvee', retrait.length > 0);
verifier(
  'le droit de supprimer ne regarde plus le statut partenaire',
  /const peutSupprimer = peutGerer;/.test(codeFiche),
  'il valait `peutGerer && (isMine || !place.isPartner)`',
);
verifier(
  "plus aucune alerte ne refuse le retrait d'une fiche payee",
  !/partnerProtectedBody/.test(codeFiche) && !/expliquerDroit/.test(codeFiche),
  '<< son retrait passe par l equipe >> : c est ce qu il voyait a chaque essai',
);
verifier(
  'la confirmation dit tout de meme que la fiche est payee',
  /deletePartnerQuestion/.test(codeFiche),
  'un mot de plus a lire, pas un appui de plus a faire',
);
verifier(
  'et elle nomme toujours la fiche qu on va retirer',
  /nom=\{place\.name\}/.test(codeFiche),
  'boite du 28 octobre : on montre CE QU ON SUPPRIME',
);

console.log('\nLE CHEMIN DU CODE WIN N A PAS DISPARU AVEC L ALERTE');
verifier(
  'la gestion par code est une ligne a elle, dans << Gerer cette fiche >>',
  /onVip\s*\?/.test(gerer) && /vipManageAction/.test(gerer),
  'le declassement y vivait : sans cette ligne il devenait injoignable',
);
verifier(
  'elle ne parait que sur une fiche partenaire',
  /onVip=\{place\.isPartner && place\.placeId \? ouvrirGestionVip : undefined\}/.test(codeFiche),
);
verifier(
  'les deux presentations de la gestion la portent',
  (codeFiche.match(/onVip=\{place\.isPartner/g) ?? []).length === 2,
  'la fiche, et la feuille compacte de la navigation',
);
verifier(
  'la feuille VIP est toujours branchee',
  /<VipActionSheet/.test(fiche) && /setVipActionOpen\(true\)/.test(codeFiche),
);

console.log('\n============================================================');
console.log('LE SERVEUR LAISSE FAIRE, ET GARDE DE QUOI REVENIR EN ARRIERE');
console.log('============================================================');
verifier(
  'le refus 403 a disparu de la route de retrait',
  !/fiche_partenaire/.test(retrait),
  "c etait la moitie serveur du meme mur",
);
verifier(
  'et la condition de propriete a disparu de la requete',
  !/is_partner = false/.test(retrait) && !/created_by = /.test(retrait),
  'une fiche creee depuis le site appartient a un autre appareil que le telephone',
);
verifier(
  'LA SUPPRESSION RESTE LOGIQUE',
  /UPDATE places SET deleted_at = now\(\)/.test(retrait) && !/DELETE FROM places/.test(retrait),
  'rien n est detruit : c est ce qui rend la decision tenable',
);
verifier(
  "l'etat precedent de la fiche part dans le journal",
  /INSERT INTO moderation_log/.test(retrait) && /\$\{avant \? JSON\.stringify\(avant\) : null\}/.test(retrait),
  'un retrait abusif se defait d une ligne',
);
verifier(
  'et le journal dit quel appareil a agi',
  /\$\{req\.deviceId!\}/.test(retrait),
);
verifier(
  'le code WIN garde sa route a lui, et elle est intacte',
  /'\/places\/:id\/vip-action'/.test(routes) && /vipCodeMatches/.test(routes),
  'elle seule sait DECLASSER une fiche sans la retirer de la carte',
);

console.log('\n============================================================');
console.log('LES CONTACTS SE CORRIGENT — << modifications a tous les points >>');
console.log('============================================================');
for (const champ of ['phoneMobile', 'whatsapp', 'viber', 'email']) {
  verifier(
    `${champ} : champ a l ecran, et valeur transmise`,
    new RegExp(`placeholder=\\{t\\('addPlace\\.${champ}'\\)\\}`).test(codeFormulaire) &&
      new RegExp(`${champ}: ${champ}\\.trim\\(\\)`).test(codeFormulaire),
  );
}
verifier(
  'le serveur ecrivait deja ces quatre colonnes',
  ['phone_mobile', 'whatsapp', 'viber', 'email'].every((c) =>
    new RegExp(`${c}\\s*= COALESCE`).test(routes),
  ),
  'il manquait quatre champs a l ecran, pas une ligne au serveur',
);
verifier(
  'la fiche transmet les contacts au formulaire',
  /phoneMobile: place\.phoneMobile/.test(codeFiche) && /viber: place\.viber/.test(codeFiche),
  'sans eux les champs s ouvriraient vides',
);
verifier(
  'et viber arrive aussi par la carte',
  /viber: p\.viber/.test(sansCommentaires(lire('app', 'index.tsx'))),
  'il manquait a la fusion : la meme fiche le perdait selon la facon de l ouvrir',
);

console.log('\nLE GARDE-FOU : UNE CORRECTION N EFFACE PAS CE QU ELLE N A PAS VU');
verifier(
  'seuls les contacts REELLEMENT changes sont envoyes',
  /contactsModifies\(\)/.test(codeFormulaire) &&
    /valeur !== contactsInitiaux\.current/.test(codeFormulaire),
  "une fiche ouverte depuis la carte n a pas encore ses telephones",
);
verifier(
  "l'etat d'ouverture est garde a part",
  /contactsInitiaux = useRef/.test(codeFormulaire) &&
    /contactsInitiaux\.current = contacts/.test(codeFormulaire),
);
verifier(
  "et l'effacement volontaire fonctionne toujours",
  /const sortie: Record<string, string> = \{\};/.test(codeFormulaire),
  'vider un champ qui portait un numero EST un changement : il part, et il efface',
);

console.log(
  fautes === 0
    ? '\nUne adresse partenaire se retire et se corrige comme une autre, et tout geste se defait.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
