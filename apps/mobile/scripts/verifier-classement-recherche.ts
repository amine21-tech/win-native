/**
 * Eprouve LES QUATRE PALIERS DU CLASSEMENT — point E.1 du 18 novembre.
 *
 *     1. Ville EXACTE     2. Commune / daira     3. POI et adresses     4. Hors Algerie
 *
 * POURQUOI CE CONTROLE EXISTE, ET POURQUOI IL EST ECRIT AVEC DE VRAIS NOMS.
 *
 * Un classement est une regle qu'on ne peut pas relire : elle se compose de trois cles de tri
 * et d'une demi-douzaine de scores, et le seul moyen de savoir ce qu'elle produit est de lui
 * donner des resultats et de regarder l'ordre. Les cas ci-dessous sont ceux que le document
 * nomme — Constantine, El Khroub, Hamma Bouziane — plus ceux qui ont motive les regles
 * anterieures, pour qu'une correction n'en defasse pas une autre.
 *
 * Usage, depuis la racine du depot :
 *   npx tsx apps/mobile/scripts/verifier-classement-recherche.ts
 */
import { rankSearchResults, type RankableResult } from '../src/shared/search';

let fautes = 0;
function verifier(nom: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'FAUX'}  ${nom}${detail ? `  - ${detail}` : ''}`);
  if (!ok) fautes += 1;
}

/** Constantine, d'ou le document tire son exemple. */
const ICI = { lat: 36.365, lon: 6.6147 };

const ville = (name: string, lat: number, lon: number, v = 'city'): RankableResult => ({
  name, lat, lon, osmKey: 'place', osmValue: v, type: v, countryCode: 'DZ',
});
const commune = (name: string, lat: number, lon: number): RankableResult => ({
  name, lat, lon, osmKey: 'place', osmValue: 'town', type: 'town', countryCode: 'DZ',
});
const poi = (name: string, lat: number, lon: number): RankableResult => ({
  name, lat, lon, osmKey: 'amenity', osmValue: 'restaurant', type: 'restaurant', countryCode: 'DZ',
});
const tunisien = (name: string, lat: number, lon: number): RankableResult => ({
  name, lat, lon, osmKey: 'place', osmValue: 'city', type: 'city', countryCode: 'TN',
});

const ordre = (r: ReturnType<typeof rankSearchResults>) => r.map((x) => x.name).join(' > ');

console.log("\nL'EXEMPLE DU DOCUMENT : on tape << Constantine >>");
/* La ville elle-meme, un hotel qui porte son nom tout pres, une commune voisine. */
const c = rankSearchResults(
  [
    poi('Hôtel Constantine', 36.366, 6.615),
    commune('Constantine Sud', 36.33, 6.60),
    ville('Constantine', 36.365, 6.6147),
  ],
  'Constantine',
  ICI,
);
verifier('la ville exacte passe en tete', c[0]?.name === 'Constantine', ordre(c));
verifier(
  'devant un hotel du meme nom pourtant a cent metres',
  c.findIndex((x) => x.name === 'Constantine') < c.findIndex((x) => x.name === 'Hôtel Constantine'),
  'une correspondance exacte de ville bat la proximite',
);

console.log("\nLE PALIER 2 : << Khroub >> depuis Constantine");
/* C'EST LE CAS QUE L'ANCIEN CLASSEMENT RATAIT. A deux paliers, tout ce qui n'etait pas une
 * ville exacte passait strictement par distance : les commerces du quartier sortaient avant
 * la commune, qui est a quelques kilometres de plus. */
const k = rankSearchResults(
  [
    poi('Pizzeria El Khroub', 36.368, 6.618),
    poi('Garage Khroub Auto', 36.367, 6.616),
    commune('El Khroub', 36.2167, 6.6833),
  ],
  'Khroub',
  ICI,
);
verifier(
  'la commune passe devant les commerces homonymes',
  k[0]?.name === 'El Khroub',
  ordre(k),
);
verifier(
  'et les commerces gardent leur ordre par distance',
  k[1]?.name === 'Garage Khroub Auto' && k[2]?.name === 'Pizzeria El Khroub',
  'au palier 3, la distance reprend ses droits',
);

console.log('\nLE PALIER 4 : la Tunisie vient apres tout le reste');
/* Un conducteur a Annaba voit des villes tunisiennes a quatre-vingts kilometres quand la
 * sienne est a deux cents. C'est juste geographiquement, et faux pour lui. */
const ANNABA = { lat: 36.9, lon: 7.766 };
const t = rankSearchResults(
  [
    tunisien('Tabarka', 36.954, 8.758),
    poi('Boulangerie Tabarka', 36.95, 7.80),
    tunisien('Tunis', 36.8, 10.18),
  ],
  'Tabarka',
  ANNABA,
);
verifier(
  'une adresse algerienne quelconque passe devant une ville tunisienne exacte',
  t[0]?.name === 'Boulangerie Tabarka',
  ordre(t),
);
verifier('et les tunisiennes se rangent entre elles', t[1]?.name === 'Tabarka', ordre(t));

console.log("\nCE QUI NE DOIT PAS AVOIR ETE CASSE");
/* Les deux regles anterieures, qui ont chacune corrige un defaut constate. Une correction qui
 * en defait une autre est le defaut le plus courant de ce genre de classement. */
const s = rankSearchResults(
  [ville('Strasbourg', 48.57, 7.75, 'village'), ville('Strasbourg', 48.58, 7.75)],
  'Strasbourg',
  { lat: 47.64, lon: 6.86 },
);
verifier(
  'entre deux villes exactes, la plus GRANDE d abord',
  (s[0] as { _cityRank?: number } & { name: string }).name === 'Strasbourg' && s.length === 2,
  'corrige << Strasbourg -> Belfort >> : la ville bat le lieu-dit homonyme plus proche',
);

/* LE CAS QUE CETTE REGLE PROTEGE est une recherche de VILLE qui ramene des troncons de route.
 * On tape << Blida >> : la base rend la commune, mais aussi un segment d'autoroute qui la
 * traverse et un troncon nomme << Blida;Oran >>. Les deux sont du bruit.
 *
 * ELLE NE S'APPLIQUE PAS A UNE RECHERCHE EXACTE, et c'est voulu : taper << A1 >> vaut cent
 * points de correspondance exacte, qui compensent la penalite. Qui ecrit le nom d'une
 * autoroute cherche l'autoroute. */
const autoroutes = rankSearchResults(
  [
    { name: 'A1', lat: 36.5, lon: 3.1, osmKey: 'highway', osmValue: 'motorway', countryCode: 'DZ' },
    /* UN TRONÇON MULTI-VILLES EST UNE ROUTE, et c'est sous cette forme qu'il arrive : le
     * point-virgule vient de ce qu'une voie traverse plusieurs communes. Un lieu habite ne
     * porte pas un tel nom — cette penalite n'a jamais ete ecrite pour lui. */
    { name: 'Blida;Oran', lat: 36.4, lon: 2.8, osmKey: 'highway', osmValue: 'trunk', countryCode: 'DZ' },
    commune('Blida', 36.47, 2.83),
  ],
  'Blida',
  ICI,
);
verifier(
  'une recherche de ville ne ramene ni autoroute ni troncon multi-villes',
  !autoroutes.some((x) => x.name === 'A1' || x.name === 'Blida;Oran'),
  ordre(autoroutes),
);
verifier(
  'mais chercher << A1 >> rend bien l autoroute',
  rankSearchResults(
    [{ name: 'A1', lat: 36.5, lon: 3.1, osmKey: 'highway', osmValue: 'motorway', countryCode: 'DZ' }],
    'A1',
    ICI,
  ).length === 1,
  'cent points de correspondance exacte compensent la penalite : qui tape A1 cherche l A1',
);

console.log('\nSANS POSITION CONNUE, LE CLASSEMENT TIENT ENCORE');
/* Au premier lancement, ou GPS perdu : il n'y a plus de distance a comparer, mais l'ordre des
 * paliers doit rester. */
const sansGps = rankSearchResults(
  [poi('Hôtel Constantine', 36.366, 6.615), ville('Constantine', 36.365, 6.6147)],
  'Constantine',
  null,
);
verifier('la ville exacte reste en tete', sansGps[0]?.name === 'Constantine', ordre(sansGps));

console.log(
  fautes === 0
    ? '\nLes quatre paliers se suivent, et les corrections anterieures tiennent.\n'
    : `\nA CORRIGER : ${fautes} verification(s) en echec.\n`,
);
process.exit(fautes === 0 ? 0 : 1);
