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

  /**
   * Recalcul en roulant : le conducteur attend, la voiture avance. On raccourcit l'attente et
   * on reessaie une fois plutot que de rendre une erreur au bout de douze secondes — au-dela,
   * la reponse arriverait de toute facon trop tard pour la prochaine intersection.
   */
  quick: z.boolean().default(false),

  /**
   * Points a EVITER : les signalements « route barree / coupee » encore actifs que
   * l'application connait deja (point 5F). Sans eux, le recalcul propose a nouveau la route
   * barree que le conducteur vient justement de signaler.
   *
   * Plafonne a vingt : Valhalla refuse une liste trop longue, et vingt barrages sur un meme
   * trajet releveraient de toute facon de l'evenement exceptionnel.
   */
  avoid: z.array(z.object({ lat: latitude, lon: longitude })).max(20).default([]),
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

      /* « Routes carrossables uniquement » (point 5D du client).
       *
       * Valhalla ne propose jamais de chemin pietonnier a une voiture : ce point-la est acquis.
       * En revanche il accepte volontiers les PISTES (`track` : chemins agricoles, forestiers)
       * et les voies de desserte (`service` : parkings, allees) pour gagner quelques minutes.
       * En Algerie, le raccourci ainsi propose est souvent une piste de terre qu'une berline ne
       * passe pas — et le conducteur, lui, decouvre le probleme sur place.
       *
       * 0,1 et non 0 : a zero, Valhalla s'interdirait aussi d'ARRIVER chez quelqu'un dont la
       * maison est au bout d'une piste. Le penaliser fortement laisse le moteur l'emprunter
       * quand il n'existe aucune autre facon d'atteindre la destination, et jamais pour gagner
       * du temps. Meme raisonnement pour la penalite de desserte, en secondes de detour fictif.
       */
      use_tracks: input.avoidUnpaved ? 0 : 0.1,
      service_penalty: 120,
      service_factor: 1.3,
      ...(input.avoidUnpaved ? { exclude_unpaved: true } : {}),
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
        /**
         * Voies a prendre aux bifurcations (point 4 du client). Valhalla ne les renvoie que si
         * on les demande — et seulement a partir de sa version 3.6. Sur un moteur plus ancien,
         * l'option est ignoree et la reponse est exactement celle d'avant : l'application
         * n'affiche alors simplement aucune fleche de voie.
         */
        turn_lanes: true,
        ...(input.avoid.length > 0
          ? { exclude_locations: input.avoid.map((p) => ({ lat: p.lat, lon: p.lon })) }
          : {}),
        directions_options: { units: 'kilometers', language: input.language },
      };

      const timeoutMs = input.quick ? 5_000 : 12_000;

      const ask = async (body: unknown): Promise<Response> =>
        fetch(`${valhallaFor(input.from, input.to)}/route`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

      let response: Response;
      try {
        response = await ask(payload);
        // Une seule reprise, et seulement en recalcul : le reseau algerien a des trous d'une
        // seconde ou deux. Au-dela d'un essai de plus, mieux vaut rendre la main — le conducteur
        // a deja depasse l'intersection.
        if (!response.ok && input.quick && response.status >= 500) response = await ask(payload);
      } catch (error) {
        throw new HttpError(
          503,
          'routage_indisponible',
          "Le service d'itineraire ne repond pas.",
          { cause: (error as Error).message },
        );
      }

      /* Un point a eviter que Valhalla n'arrive pas a rattacher a une route fait echouer TOUT
       * le calcul. Un signalement pose a cote de la chaussee, ou sur une route que le moteur ne
       * connait pas, priverait alors le conducteur d'itineraire — c'est pire que de lui en
       * donner un qui passe par la route barree. On refait donc le calcul sans les evitements. */
      if (!response.ok && input.avoid.length > 0) {
        const { exclude_locations: _dropped, ...withoutAvoid } = payload as Record<string, unknown>;
        try {
          response = await ask(withoutAvoid);
        } catch {
          // On garde la reponse en echec d'origine : le message rendu plus bas reste le bon.
        }
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
