import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { latitude, longitude } from '@win/shared';
import { env } from '../env.js';
import { HttpError, parse } from '../lib/http.js';

const routeRequest = z.object({
  from: z.object({ lat: latitude, lon: longitude }),
  to: z.object({ lat: latitude, lon: longitude }),
  mode: z.enum(['auto', 'pedestrian']).default('auto'),
  alternates: z.number().int().min(0).max(2).default(2),
  language: z.string().default('fr-FR'),
});

/**
 * Zone couverte par le moteur europeen, quand il existe (VALHALLA_EU_URL).
 *
 * Un moteur Valhalla ne connait que les routes de ses propres tuiles. Plutot que de tout
 * reconstruire dans un seul graphe geant — ce qui met le service algerien en jeu a chaque
 * mise a jour — on laisse le moteur historique (Algerie, Tunisie) intact et on interroge un
 * SECOND moteur pour l'Europe. Aucun itineraire ne traverse la Mediterranee en voiture : il
 * n'y a donc rien a perdre a les separer.
 */
const EU_BOUNDS = { minLat: 41, maxLat: 71, minLon: -10, maxLon: 32 };

function inEurope(p: { lat: number; lon: number }): boolean {
  return (
    p.lat >= EU_BOUNDS.minLat &&
    p.lat <= EU_BOUNDS.maxLat &&
    p.lon >= EU_BOUNDS.minLon &&
    p.lon <= EU_BOUNDS.maxLon
  );
}

/**
 * Moteur a interroger pour ce trajet : l'europeen quand il est configure ET que les DEUX
 * points y sont, le moteur historique sinon. Les deux points, parce qu'un trajet dont une
 * extremite est hors zone ne peut de toute facon pas etre calcule par ce moteur-la.
 */
function valhallaFor(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  if (env.VALHALLA_EU_URL && inEurope(from) && inEurope(to)) return env.VALHALLA_EU_URL;
  return env.VALHALLA_URL;
}

/**
 * Passe-plat vers Valhalla.
 *
 * Le conteneur ecoute sur 127.0.0.1:8002 et n'est pas joignable depuis un
 * telephone. Plutot que de l'ouvrir sur l'exterieur, l'API l'expose derriere
 * son propre controle de debit. Valhalla lui-meme reste inchange.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.post(
    '/routing/route',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req) => {
      const input = parse(routeRequest, req.body);

      const payload = {
        locations: [
          { lat: input.from.lat, lon: input.from.lon },
          { lat: input.to.lat, lon: input.to.lon },
        ],
        costing: input.mode,
        alternates: input.alternates,
        directions_options: { units: 'kilometers', language: input.language },
      };

      let response: Response;
      try {
        response = await fetch(`${valhallaFor(input.from, input.to)}/route`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12_000),
        });
      } catch (error) {
        throw new HttpError(
          503,
          'routage_indisponible',
          "Le service d'itineraire ne repond pas.",
          { cause: (error as Error).message },
        );
      }

      if (!response.ok) {
        throw new HttpError(
          response.status === 400 ? 400 : 502,
          'routage_echec',
          "Aucun itineraire n'a pu etre calcule entre ces deux points.",
        );
      }

      return response.json();
    },
  );

  /**
   * Limite de vitesse reglementaire du troncon le plus proche, quand OpenStreetMap la connait.
   *
   * Valhalla la conserve dans ses tuiles (`edge_info.speed_limit`, en km/h ; `0` = non
   * renseignee). L'application interroge cette route rarement — au plus une fois toutes les
   * vingt secondes et apres 250 m parcourus — et se rabat sinon sur le type de route lu dans
   * les tuiles deja affichees. Aucune limite inventee : `null` quand on ne sait pas.
   */
  app.get('/routing/speed-limit', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req) => {
    const { lat, lon } = parse(
      z.object({ lat: latitude, lon: longitude }),
      { lat: Number((req.query as Record<string, string>).lat), lon: Number((req.query as Record<string, string>).lon) },
    );

    try {
      const response = await fetch(`${valhallaFor({ lat, lon }, { lat, lon })}/locate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locations: [{ lat, lon }], costing: 'auto', verbose: true }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) return { limitKmh: null };

      const data = (await response.json()) as
        | { edges?: { edge_info?: { speed_limit?: number } }[] }[]
        | undefined;
      const limit = data?.[0]?.edges?.[0]?.edge_info?.speed_limit ?? 0;
      return { limitKmh: limit > 0 ? limit : null };
    } catch {
      // Moteur injoignable ou trop lent : pas de limite plutot qu'une erreur. Ce n'est qu'un
      // affichage d'appoint, il ne doit jamais gener la navigation.
      return { limitKmh: null };
    }
  });
};

export default routes;
