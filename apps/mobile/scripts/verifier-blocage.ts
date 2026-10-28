/**
 * Eprouve les regles de la ROUTE BLOQUEE (point 12 du client, 28 octobre).
 *
 * POURQUOI CE SCRIPT. Ces regles decident de DETOURNER un conducteur, parfois de vingt
 * kilometres. Se tromper dans un sens coupe une nationale ouverte pour tout le monde ; se
 * tromper dans l'autre renvoie le conducteur droit dans la barriere qu'un autre vient de
 * signaler. Aucun des deux ne se voit en relisant le code, et le second ne se voit meme pas en
 * roulant — il faut une route reellement barree.
 *
 * Trois choses sont verifiees ici :
 *   - le SEUIL DE CONFIRMATION : un temoin laisse en attente, deux confirment ;
 *   - le SEUIL DE DEGAGEMENT : deux votes pour un blocage, trois pour les autres permanents ;
 *   - la DUREE : un blocage n'expire plus, contrairement a tous les autres temporaires.
 *
 * Le comptage des temoins, lui, se fait en SQL et ne peut pas etre eprouve sans base : il est
 * decrit en detail au-dessus de `temoinsColumn` dans apps/api/src/routes/reports.ts.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-blocage.ts
 */
import {
  ABSENT_VOTE_THRESHOLD,
  blocageConfirme,
  PERMANENT_KINDS,
  REPORT_KINDS,
  seuilDegagement,
  TEMOINS_BLOCAGE,
  TEMPORARY_TTL_MINUTES,
  VOTES_DEGAGEMENT,
  type ReportKind,
} from '../src/shared/constants';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

console.log('\nSEUIL DE CONFIRMATION — un temoin ne detourne personne');
verifier('aucun temoin connu (vieille application) : EN ATTENTE', !blocageConfirme(undefined));
verifier('temoins inconnus (null) : EN ATTENTE', !blocageConfirme(null));
verifier('1 temoin : EN ATTENTE, le trajet n\'est pas modifie', !blocageConfirme(1));
verifier('2 temoins : CONFIRME, le segment sort des calculs', blocageConfirme(2));
verifier('3 temoins : CONFIRME', blocageConfirme(3));
verifier(
  `le seuil annonce au client est bien de ${TEMOINS_BLOCAGE}`,
  TEMOINS_BLOCAGE === 2,
  `${TEMOINS_BLOCAGE}`,
);

console.log('\nSEUIL DE DEGAGEMENT — une route rendue doit redevenir utilisable vite');
verifier(
  `route bloquee : ${VOTES_DEGAGEMENT} votes « plus la » suffisent`,
  seuilDegagement('block') === 2,
  `${seuilDegagement('block')}`,
);
verifier(
  `les autres permanents en demandent ${ABSENT_VOTE_THRESHOLD}`,
  seuilDegagement('radar') === ABSENT_VOTE_THRESHOLD &&
    seuilDegagement('bump') === ABSENT_VOTE_THRESHOLD &&
    seuilDegagement('pothole') === ABSENT_VOTE_THRESHOLD,
);
verifier(
  'le degagement est plus facile que la confirmation n\'est stricte',
  seuilDegagement('block') <= ABSENT_VOTE_THRESHOLD,
  'il est plus grave de laisser fermee une route ouverte que l\'inverse',
);
/* Chaque type doit rendre un seuil utilisable : un zero ou un negatif ferait disparaitre un
 * signalement au premier vote, voire sans aucun vote. */
for (const kind of REPORT_KINDS) {
  const seuil = seuilDegagement(kind as ReportKind);
  if (seuil >= 2) continue;
  verifier(`« ${kind} » a un seuil de degagement utilisable`, false, `${seuil}`);
}

console.log('\nDUREE DE VIE — « indeterminee, jusqu\'a confirmation de degagement »');
verifier('la route bloquee est un signalement PERMANENT', PERMANENT_KINDS.includes('block'));
verifier(
  'elle n\'a plus aucune echeance',
  TEMPORARY_TTL_MINUTES.block === 0,
  `${TEMPORARY_TTL_MINUTES.block} minute(s)`,
);
/* Le piege exact qui existait avant : un type declare permanent mais avec une duree de vie non
 * nulle recevait quand meme une echeance au depot, et s'effacait tout seul. Les deux tables
 * doivent se repondre, pour TOUS les types. */
for (const kind of PERMANENT_KINDS) {
  const ttl = TEMPORARY_TTL_MINUTES[kind];
  if (ttl === 0) continue;
  verifier(`« ${kind} » est permanent mais porte une duree de ${ttl} min`, false);
}
for (const kind of REPORT_KINDS) {
  const permanent = PERMANENT_KINDS.includes(kind as ReportKind);
  const ttl = TEMPORARY_TTL_MINUTES[kind as ReportKind];
  if (!permanent && ttl === 0) {
    verifier(`« ${kind} » n'est pas permanent mais n'expire jamais`, false);
  }
}

/* L'inondation reste volontairement a l'ecart du seuil de confirmation : le client ne parle
 * que de la route bloquee, personne ne signale une inondation par erreur, et s'y engager ne se
 * repare pas. Ce test est la pour que le choix soit DELIBERE et non oublie. */
console.log('\nL\'INONDATION N\'EST PAS SOUMISE AU SEUIL');
verifier(
  'elle reste temporaire, et donc hors du mecanisme de temoins',
  !PERMANENT_KINDS.includes('flood') && TEMPORARY_TTL_MINUTES.flood > 0,
  `${TEMPORARY_TTL_MINUTES.flood} minutes`,
);

console.log(
  fautes === 0
    ? '\nLes regles de la route bloquee se tiennent.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
