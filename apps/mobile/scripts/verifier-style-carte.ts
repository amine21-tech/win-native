/**
 * Verifie, contre les styles REELLEMENT servis par OpenFreeMap, que nos trois ajouts au fond de
 * carte se placent au bon endroit :
 *
 *   - l'itineraire passe SOUS les panneaux et les noms de route (point 3 du client) ;
 *   - le relief ombre passe SOUS les routes (point 6A) ;
 *   - les pictogrammes de lieux passent AU-DESSUS de l'itineraire (point 6B).
 *
 * Ce controle ne peut pas se faire a la lecture du code : les deux styles d'OpenFreeMap n'ont
 * ni les memes couches, ni les memes noms, ni le meme nombre de couches (111 contre 47), et ils
 * evoluent sans nous prevenir. C'est aussi pour cela que rien n'est code en dur dans
 * useMapStyle : ce script dit si la detection tient encore.
 *
 *   cd apps/mobile && npx tsx scripts/verifier-style-carte.ts
 */
import { addWinLayers, routeAnchorFor } from '../src/map/useMapStyle';
import { MAP_STYLES } from '../src/map/style';

type Couche = {
  id: string;
  type: string;
  source?: string;
  'source-layer'?: string;
  minzoom?: number;
  maxzoom?: number;
};

let echecs = 0;

function verifier(libelle: string, vrai: boolean) {
  console.log(`  ${vrai ? 'OK  ' : 'ECHEC'}  ${libelle}`);
  if (!vrai) echecs++;
}

async function controler(url: string, nuit: boolean) {
  const style = (await (await fetch(url)).json()) as { layers: Couche[]; sources: Record<string, unknown> };
  const avant = style.layers.length;
  addWinLayers(style as never, nuit);
  const couches = style.layers;
  const index = (id: string) => couches.findIndex((c) => c.id === id);

  const ancrage = routeAnchorFor(style as never);
  const ancrageAt = ancrage ? index(ancrage) : -1;
  const derniereRoute = couches.reduce(
    (acc, c, i) => (c.type !== 'symbol' && c['source-layer'] === 'transportation' ? i : acc),
    -1,
  );
  const premiereRoute = couches.findIndex((c) => c['source-layer'] === 'transportation');

  console.log(`\n=== ${url} ${nuit ? '(nuit)' : '(jour)'} — ${avant} couches, ${couches.length} apres ajout`);
  console.log(`  ancrage de l'itineraire : ${ancrage ?? '(aucun)'} [${ancrageAt}]`);
  console.log(`  derniere couche de route : ${couches[derniereRoute]?.id} [${derniereRoute}]`);

  verifier('un ancrage a ete trouve', ancrageAt >= 0);
  verifier("l'itineraire passe AU-DESSUS de toutes les routes", ancrageAt > derniereRoute);
  verifier('la source de relief existe', Boolean(style.sources['win-dem']));
  verifier('le relief passe SOUS les routes', index('win-hillshade') >= 0 && index('win-hillshade') < premiereRoute);
  verifier('la couche de lieux existe', index('win-poi-essential') >= 0);
  verifier("les lieux passent AU-DESSUS de l'itineraire", index('win-poi-essential') >= ancrageAt);

  const poi = couches[index('win-poi-essential')]!;
  console.log(`  lieux : source=${poi.source} couche=${poi['source-layer']} zoom ${poi.minzoom} a ${poi.maxzoom}`);
}

(async () => {
  await controler(MAP_STYLES.day, false);
  await controler(MAP_STYLES.night, true);
  console.log(echecs === 0 ? '\nTout est en place.\n' : `\n${echecs} controle(s) en echec.\n`);
  process.exitCode = echecs === 0 ? 0 : 1;
})();
