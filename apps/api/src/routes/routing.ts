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
  /**
   * Cap du vehicule au depart, en degres. Transmis a Valhalla avec une tolerance : le moteur
   * part alors dans le sens ou l'on roule deja. Sans lui, un recalcul apres une sortie manquee
   * propose volontiers un demi-tour immediat pour rejoindre le trace abandonne — exactement ce
   * qu'un conducteur ne fera pas.
   */
  heading: z.number().min(0).max(360).optional(),

  /* Preferences du conducteur (document 143, point 2). Elles comptent particulierement en
   * Algerie, ou la qualite des routes varie beaucoup d'un axe a l'autre. */
  avoidTolls: z.boolean().default(false),
  avoidUnpaved: z.boolean().default(false),
  preferHighways: z.boolean().default(false),
});

/**
 * Reglages de cout transmis a Valhalla.
 *
 * La vitesse de marche est celle du site (4,5 km/h au lieu de 5,1). Les peages, en revanche,
 * reviennent a la valeur NEUTRE de Valhalla.
 *
 * Le site envoie 0,3, ce qui ne veut pas dire « un peu moins de peages » mais « evite-les
 * autant que possible » : mesure faite sur notre propre moteur, un Paris-Lyon passe de 4 h
 * (239 min) a 5 h 40 (340 min) entre 1 et 0, et 0,3 donne le meme resultat que 0. Ce reglage
 * est inoffensif en Algerie, qui n'a quasiment pas de peages — il est tres couteux en France.
 *
 * Il avait de plus un effet pervers depuis que l'application expose un bouton « Sans peage » :
 * le trajet les evitant deja, le bouton ne pouvait rien changer. La valeur par defaut est donc
 * 0,5, celle de Valhalla, et le bouton descend a 0. Le choix de l'utilisateur redevient visible.
 *
 * Les preferences ne font que deplacer ces curseurs : zero pour refuser, un pour privilegier.
 * `exclude_unpaved` accompagne `use_tracks` car les deux ne visent pas la meme chose — l'un
 * ecarte les chemins de terre, l'autre les pistes forestieres et agricoles.
 */
function costingOptions(input: {
  mode: 'auto' | 'pedestrian';
  avoidTolls: boolean;
  avoidUnpaved: boolean;
  preferHighways: boolean;
}) {
  if (input.mode === 'pedestrian') return { pedestrian: { walking_speed: 4.5 } };
  return {
    auto: {
      use_highways: input.preferHighways ? 1 : 0.5,
      use_tolls: input.avoidTolls ? 0 : 0.5,
      ...(input.avoidUnpaved ? { use_tracks: 0, exclude_unpaved: true } : {}),
    },
  };
}

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
          {
            lat: input.from.lat,
            lon: input.from.lon,
            ...(input.heading !== undefined
              ? // 45 deg de part et d'autre : assez large pour un GPS imprecis a l'arret, assez
                // etroit pour exclure le sens oppose.
                { heading: Math.round(input.heading), heading_tolerance: 45 }
              : {}),
          },
          { lat: input.to.lat, lon: input.to.lon },
        ],
        costing: input.mode,
        costing_options: costingOptions(input),
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
