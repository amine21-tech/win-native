/**
 * Rejoue de VRAIES CHRONOLOGIES de la pastille << Recalcul en cours >>.
 *
 * POURQUOI CE SCRIPT EXISTE, ET POURQUOI IL REJOUE LE TEMPS.
 *
 * La version precedente de cette pastille tenait en six lignes de `useEffect`, et je les avais
 * relues. Elles sont justes — tant que le calcul dure plus longtemps que le minimum d'affichage.
 * Quand il est PLUS RAPIDE, `visible` retombe avant l'echeance, React rejoue l'effet, son
 * nettoyage annule le minuteur, et le corps ressort immediatement sans jamais rabaisser le
 * drapeau : la pastille reste a l'ecran POUR TOUJOURS.
 *
 * Le defaut n'etait donc pas dans ce qu'on lit, mais dans un ORDRE D'EVENEMENTS. Aucune
 * relecture ne l'attrape, et aucune assertion sur le texte du code non plus — il faut faire
 * passer le temps et regarder. C'est ce que fait ce script.
 *
 * LA CHRONOLOGIE QUI A CASSE est la premiere ci-dessous, et c'est le cas le PLUS COURANT : un
 * recalcul Valhalla aboutit en quatre cents millisecondes. La pastille collait donc d'autant
 * plus surement que l'application allait vite.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-pastille-recalcul.ts
 */
import {
  DUREE_MINIMALE_MS,
  PASTILLE_ETEINTE,
  prochainReveil,
  suivante,
  visible,
  type EtatPastille,
} from '../src/components/pastilleRecalcul';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/**
 * Fait tourner la pastille sur une chronologie, comme le composant le ferait.
 *
 * `calculs` donne, pour chaque instant, si un calcul est en cours. On avance milliseconde par
 * milliseconde : c'est grossier, mais cela reproduit fidelement ce que React fait — rejouer
 * l'effet a chaque changement de `visible`, et armer le reveil qu'on lui demande.
 *
 * On retourne les instants ou la pastille est VUE, et ce que valait le prochain reveil : un
 * reveil nul ou negatif serait un minuteur qui se rearme a chaque image.
 */
function jouer(calculs: (t: number) => boolean, duree: number): { vue: boolean[]; reveils: number[] } {
  let etat: EtatPastille = PASTILLE_ETEINTE;
  let precedent = false;
  const vue: boolean[] = [];
  const reveils: number[] = [];

  for (let t = 0; t <= duree; t += 1) {
    const enCours = calculs(t);
    /* L'effet du composant ne se rejoue QUE si `visible` a change — c'est sa liste de
     * dependances. Un etat qui aurait besoin d'etre rafraichi a chaque rendu pour rester juste
     * serait deja faux. */
    if (enCours !== precedent) {
      etat = suivante(etat, enCours, t);
      precedent = enCours;
    }
    /* Le reveil, lui, est arme par le second effet. On le declenche a l'heure dite. */
    const reveil = prochainReveil(etat, enCours, t);
    if (reveil !== null) reveils.push(reveil);
    if (reveil === null && !enCours) etat = suivante(etat, false, t);

    vue.push(visible(etat, enCours, t));
  }
  return { vue, reveils };
}

const dernier = (v: boolean[]) => v[v.length - 1] ?? false;
const premierFaux = (v: boolean[], depuis: number) => {
  for (let i = depuis; i < v.length; i += 1) if (!v[i]) return i;
  return -1;
};

console.log('\nLE CAS QUI A CASSE : un calcul PLUS RAPIDE que le minimum');
/* Quatre cents millisecondes, la duree courante d'un recalcul Valhalla. C'est exactement ce
 * qu'arsanne declenche en changeant de destination depuis la loupe, en pleine navigation. */
{
  const { vue, reveils } = jouer((t) => t < 400, 6_000);
  verifier('la pastille apparait', vue[10] === true);
  verifier(
    'elle tient les deux secondes du document',
    vue[1_900] === true,
    "elle doit survivre a la fin du calcul, sinon l'oeil ne la trouve jamais",
  );
  const efface = premierFaux(vue, 1);
  verifier(
    'ET ELLE FINIT PAR S EFFACER',
    efface > 0,
    efface > 0 ? `a ${efface} ms` : 'JAMAIS — c est le bug du 14 novembre',
  );
  verifier(
    "elle s'efface au bout des deux secondes, pas plus tard",
    efface >= DUREE_MINIMALE_MS && efface <= DUREE_MINIMALE_MS + 5,
    `${efface} ms pour un minimum de ${DUREE_MINIMALE_MS}`,
  );
  verifier('et rien ne reste affiche a la fin', dernier(vue) === false);
  verifier(
    'aucun reveil nul ni negatif',
    reveils.every((r) => r > 0),
    `${reveils.length} reveils, le plus court a ${Math.min(...reveils)} ms`,
  );
}

console.log('\nUN CALCUL PLUS LONG QUE LE MINIMUM');
/* Trois secondes : une 3G algerienne, un trajet long. La pastille doit suivre le CALCUL, pas
 * le minimum — s'effacer a deux secondes laisserait le conducteur devant une consigne perimee
 * alors que le calcul tourne encore. */
{
  const { vue } = jouer((t) => t < 3_000, 7_000);
  verifier('elle reste pendant tout le calcul', vue[2_900] === true);
  verifier('elle ne s efface pas a deux secondes', vue[2_100] === true);
  const efface = premierFaux(vue, 1);
  verifier(
    'elle s efface apres, et pas tout de suite',
    efface >= 3_000,
    `a ${efface} ms pour un calcul de 3000 ms`,
  );
  verifier('et elle finit eteinte', dernier(vue) === false);
}

console.log('\nDEUX RECALCULS QUI SE SUIVENT');
/* Un ecart de trace, puis un second juste apres : la pastille ne doit ni clignoter entre les
 * deux, ni s'allonger indefiniment. */
{
  const { vue } = jouer((t) => (t < 300) || (t >= 800 && t < 1_100), 8_000);
  verifier('elle ne s eteint pas entre les deux', vue[500] === true);
  const efface = premierFaux(vue, 1);
  /* DEUX SECONDES A PARTIR DU DEBUT DU SECOND CALCUL, et non de sa fin.
   *
   * J'avais d'abord ecrit << apres la FIN du second calcul >>, et le controle m'a arrete. Il
   * avait raison : le document dit << la banniere est visible 2000 ms >>, pas << 2000 ms APRES
   * le calcul >>. Un calcul de trois cents millisecondes afficherait sinon la pastille deux
   * secondes trois cents, et deux calculs rapproches l'allongeraient a chaque fois. La duree
   * totale vaut donc max(duree du calcul, deux secondes) — comptee depuis son debut. */
  verifier(
    'le second recalcul repousse son echeance',
    efface === 800 + DUREE_MINIMALE_MS,
    `a ${efface} ms — deux secondes apres le DEBUT du second calcul, pas de sa fin`,
  );
  verifier(
    'et il la repousse vraiment : elle depasse celle du premier',
    efface > 0 + DUREE_MINIMALE_MS,
    `${efface} ms contre ${DUREE_MINIMALE_MS} ms si le second n avait rien change`,
  );
  verifier('et elle finit eteinte', dernier(vue) === false);
}

console.log("\nAUCUN CALCUL DU TOUT");
{
  const { vue } = jouer(() => false, 3_000);
  verifier('rien ne s affiche jamais', vue.every((v) => v === false));
}

console.log("\nET LE CONTROLE A DES DENTS : l ancienne logique se fait prendre");

/* ON REMET LE DEFAUT, EXPRES, ET ON EXIGE QU IL SOIT VU.
 *
 * Un test qui passe ne prouve rien tant qu'on n'a pas vu ce qu'il refuse. Celui-ci a ete ecrit
 * APRES le bug, donc contre un code deja corrige : rien ne garantissait qu'il aurait attrape
 * l'original. On rejoue donc la version du 11 novembre, trait pour trait, sur la chronologie
 * qui l'a cassee.
 *
 * `prolonge` est le drapeau d'alors ; le nettoyage de l'effet annule le minuteur quand
 * `visible` change, et le corps ressort aussitot par le `if (!visible) return`. Personne ne
 * rabaisse plus le drapeau. */
function ancienne(calculs: (t: number) => boolean, duree: number): boolean[] {
  let prolonge = false;
  let precedent = false;
  let echeance: number | null = null;
  const vue: boolean[] = [];

  for (let t = 0; t <= duree; t += 1) {
    const enCours = calculs(t);
    if (enCours !== precedent) {
      echeance = null; // le nettoyage de l'effet : clearTimeout
      if (enCours) {
        prolonge = true;
        echeance = t + DUREE_MINIMALE_MS; // setTimeout(() => setProlonge(false), 2000)
      }
      // sinon : le corps sort par `if (!visible) return` — et rien n'est arme
      precedent = enCours;
    }
    if (echeance !== null && t >= echeance) {
      prolonge = false;
      echeance = null;
    }
    vue.push(enCours || prolonge); // `if (!visible && !prolonge) return null`
  }
  return vue;
}

const ancienRapide = ancienne((t) => t < 400, 20_000);
verifier(
  'elle restait affichee pour toujours apres un calcul rapide',
  dernier(ancienRapide) === true && premierFaux(ancienRapide, 1) === -1,
  'vingt secondes apres un calcul de 400 ms, la pastille etait encore la',
);
/* ET ELLE MARCHAIT QUAND LE CALCUL ETAIT LENT : c'est pour cela que le defaut a survecu a sa
 * relecture et a trois versions. Le cas qui marchait etait celui qu'on regardait. */
const ancienLent = ancienne((t) => t < 3_000, 8_000);
verifier(
  "mais elle s'effacait correctement apres un calcul lent",
  dernier(ancienLent) === false,
  "le defaut ne se montrait que dans le cas le plus COURANT, jamais dans celui qu'on teste a la main",
);

console.log(
  fautes === 0
    ? "\nLa pastille s'efface dans tous les cas, y compris celui qui l'avait figee.\n"
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
