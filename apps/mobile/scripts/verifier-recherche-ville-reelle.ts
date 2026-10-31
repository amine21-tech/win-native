/**
 * Eprouve le cas « Constantine » du client CONTRE LE VRAI GEOCODEUR, pas contre des donnees
 * inventees.
 *
 * POURQUOI CE SCRIPT EXISTE A COTE DE verifier-recherche-villes.ts. L'autre verifie le
 * CLASSEMENT, avec des fiches ecrites a la main. Il passait au vert pendant que le client
 * voyait exactement le defaut qu'il decrit — parce que le defaut n'etait pas dans le
 * classement.
 *
 * En transmettant la position de l'utilisateur au geocodeur, on lui demande des resultats
 * AUTOUR DE LUI. Depuis Alger, les douze places disponibles sont prises par le Gue de
 * Constantine, la rue de Constantine, la route du Gue de Constantine. La ville de Constantine
 * n'est pas dans la liste du tout — et aucun classement ne remonte un resultat absent.
 *
 * Un test sur donnees inventees ne pouvait pas trouver cela : il part de la liste, et c'est la
 * LISTE qui etait fausse. Celui-ci interroge le serveur de production et verifie ce qui en
 * revient reellement.
 *
 * Il a besoin du reseau. Lance sans, il le DIT et s'arrete sans echouer : un controle qui tombe
 * faute de connexion n'apprend rien a personne.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-recherche-ville-reelle.ts
 */
const BASE = 'https://51.77.194.25.nip.io/v2/geocode/search';

/** Alger, d'ou le client a fait son essai. */
const ALGER = { lat: 36.75, lon: 3.06 };

type Trouve = { nom: string; type: string; region: string };

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fautes++;
}

async function chercher(q: string, avecPosition: boolean): Promise<Trouve[]> {
  const params = new URLSearchParams({ q, limit: '12' });
  if (avecPosition) {
    params.set('lat', String(ALGER.lat));
    params.set('lon', String(ALGER.lon));
  }
  const reponse = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(25_000) });
  if (!reponse.ok) throw new Error(`le serveur a repondu ${reponse.status}`);
  const data = (await reponse.json()) as {
    features?: { properties: Record<string, string> }[];
  };
  return (data.features ?? []).map((f) => ({
    nom: f.properties.name ?? '',
    type: f.properties.osm_value ?? '',
    region: f.properties.state ?? f.properties.county ?? '',
  }));
}

/** Le resultat est-il LA ville cherchee, et non une rue qui porte son nom ? */
const estLaVille = (r: Trouve, ville: string) =>
  r.nom.toLowerCase() === ville.toLowerCase() && ['city', 'town'].includes(r.type);

async function main() {
  console.log('\nLE CAS DU CLIENT : « Constantine », tape depuis Alger');

  let avec: Trouve[];
  let sans: Trouve[];
  try {
    [avec, sans] = await Promise.all([chercher('Constantine', true), chercher('Constantine', false)]);
  } catch (e) {
    console.log(`\n  Controle IMPOSSIBLE : ${e instanceof Error ? e.message : String(e)}`);
    console.log('  (il demande le reseau et le serveur de production)\n');
    return;
  }

  console.log('\n  Avec la position — ce que la recherche de proximite rapporte :');
  for (const r of avec.slice(0, 5)) console.log(`     ${r.nom} · ${r.type} · ${r.region}`);

  verifier(
    'la ville est ABSENTE de la recherche de proximite',
    !avec.some((r) => estLaVille(r, 'Constantine')),
    "c'est le defaut : les douze places sont prises par des rues d'Alger",
  );

  console.log('\n  Sans la position — la seconde requete, ajoutee le 31 octobre :');
  for (const r of sans.slice(0, 5)) console.log(`     ${r.nom} · ${r.type} · ${r.region}`);

  verifier(
    'la ville de Constantine y est',
    sans.some((r) => estLaVille(r, 'Constantine')),
    'sans elle, aucun classement ne pourrait la faire remonter',
  );
  verifier(
    'et elle arrive en tete de cette seconde liste',
    estLaVille(sans[0] ?? { nom: '', type: '', region: '' }, 'Constantine'),
    sans[0]?.nom ?? 'liste vide',
  );

  /* Les deux listes reunies sont ce que l'application classe. La ville doit y figurer : c'est
   * la seule chose que ce script peut affirmer, le classement etant eprouve ailleurs. */
  const reunies = [...avec, ...sans];
  verifier(
    'la liste finale contient donc bien la ville',
    reunies.some((r) => estLaVille(r, 'Constantine')),
  );

  console.log('\nLE MEME ESSAI SUR DEUX AUTRES VILLES LOINTAINES');
  for (const ville of ['Oran', 'Annaba']) {
    try {
      const [a, s] = await Promise.all([chercher(ville, true), chercher(ville, false)]);
      const dansProximite = a.some((r) => estLaVille(r, ville));
      const dansPartout = s.some((r) => estLaVille(r, ville));
      verifier(
        `« ${ville} » figure dans la liste finale`,
        dansProximite || dansPartout,
        dansProximite ? 'deja presente par proximite' : 'rapportee par la seconde requete',
      );
    } catch (e) {
      console.log(`  (« ${ville} » non verifiee : ${e instanceof Error ? e.message : e})`);
    }
  }

  console.log(
    fautes === 0
      ? '\nLa ville cherchee est toujours dans la liste.\n'
      : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
  );
  process.exit(fautes === 0 ? 0 : 1);
}

void main();
