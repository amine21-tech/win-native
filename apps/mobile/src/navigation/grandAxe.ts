/**
 * << SOMMES-NOUS SUR UN GRAND AXE ? >> — correctif du 8 novembre, point 4.
 *
 * Le document demande que la voie recommandee clignote << sur autoroute ET ROUTE NATIONALE >>.
 * Le guidage de voie, lui, ne s'affichait que sur autoroute depuis le 3 novembre.
 *
 * LE PROBLEME : VALHALLA NE DIT PAS << NATIONALE >>. Il pose un seul drapeau de classe de
 * route, `highway`, qui couvre les `motorway` et les `trunk` d'OpenStreetMap. Beaucoup de
 * nationales algeriennes sont bien taguees `trunk` et entrent donc dedans — mais une large part
 * est taguee `primary`, et pour celles-la le drapeau est faux. Aucun autre champ de la reponse
 * ne porte la classe de la route.
 *
 * CE QU'IL DIT, EN REVANCHE, C'EST LE NOM. Et en Algerie le nom d'une nationale EST son
 * numero : << RN 12 >>, << N5 >>, << RN24 >>. C'est la seule information disponible, elle est
 * dans la reponse qu'on recoit deja, et elle est fiable dans le sens qui compte : un nom qui
 * ressemble a << RN 12 >> est une nationale a coup sur. L'inverse n'est pas vrai — une
 * nationale sans numero dans son nom ne sera pas reconnue — et c'est le bon sens de l'erreur :
 * on n'affiche pas un guidage de voie la ou on n'est pas sur, plutot que d'en afficher un
 * faux sur une rue de lotissement.
 *
 * Separe de l'ecran pour pouvoir etre eprouve : voir scripts/verifier-grand-axe.ts.
 */

/**
 * Noms de nationale algerienne, et uniquement eux.
 *
 * ACCEPTE : << RN 12 >>, << RN12 >>, << N 5 >>, << N5 >>, << Route Nationale 24 >>, et la
 * meme chose en arabe (<< الطريق الوطني 12 >>), avec un suffixe de direction eventuel
 * (<< RN 12 A >>).
 *
 * REFUSE : tout le reste, et notamment les deux pieges. << Rue Nationale >> sans numero n'est
 * pas une nationale — c'est un nom de rue courant en Algerie. Et << N >> seul suivi d'une
 * lettre (<< Nord >>, << Nouvelle ville >>) ne doit pas passer : d'ou le chiffre OBLIGATOIRE.
 */
const NATIONALE = /(^|[\s(,-])(rn|n|route\s+nationale|الطريق\s+الوطني)\s*-?\s*\d{1,3}([\sa-z]|$)/i;

/** Ce nom de voie designe-t-il une route nationale algerienne ? */
export function estNationale(nom: string | null | undefined): boolean {
  if (!nom) return false;
  return NATIONALE.test(nom.trim());
}

/**
 * La manoeuvre se fait-elle sur un GRAND AXE — autoroute, voie rapide ou nationale ?
 *
 * `surAutoroute` vient du drapeau `highway` de Valhalla ; `nomVoie` sert de second chemin pour
 * les nationales qu'il ne marque pas. Les deux sont volontairement independants : si Valhalla
 * se met un jour a marquer les `primary`, le premier suffira et le second ne genera pas.
 */
export function surGrandAxe(surAutoroute: boolean, nomVoie: string | null | undefined): boolean {
  return surAutoroute || estNationale(nomVoie);
}
