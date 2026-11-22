import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { latitude, longitude } from '@win/shared';
import { env } from '../env.js';
import { HttpError, parse } from '../lib/http.js';
import {
  optionsAuto,
  optionsBlocage,
  optionsPieton,
  profilDe,
  type ProfilItineraire,
} from '../lib/profilsItineraire.js';

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

  /**
   * Passer par l'autoroute, ou l'eviter. Remplace les trois preferences precedentes
   * (peage, piste, grands axes) — voir RoutePrefs dans l'application.
   *
   * `default(true)` fait aussi office de compatibilite : une version plus ancienne de
   * l'application envoie encore les trois anciens champs, que ce schema ignore. Elle obtient
   * alors un itineraire par l'autoroute, c'est-a-dire ce que son reglage par defaut donnait
   * deja.
   */
  autoroute: z.boolean().default(true),

  /**
   * LE PROFIL D'ITINERAIRE — trois choix, et « le plus court » par defaut (point 5A, 21 nov.).
   *
   * CE QUE LE CLIENT A CONSTATE : << sur un trajet vers l'aeroport d'Alger, le GPS affichait
   * 10-11 km alors que le conducteur etait a 2 km. Cause : use_highways trop eleve -> Valhalla
   * evite les secondaires meme si plus courtes. >> Le diagnostic est juste : a `use_highways: 1`
   * le moteur va chercher un grand axe, et en Alger cela veut dire faire le tour.
   *
   * POURQUOI UN CHAMP NOUVEAU PLUTOT QU'UN TROISIEME SENS DONNE A `autoroute`. Le booleen ne
   * sait dire que oui ou non ; << le plus court >> n'est ni l'un ni l'autre — il accepte
   * l'autoroute quand elle raccourcit vraiment. Un booleen a trois valeurs n'existe pas, et le
   * surcharger (true = autoroute, false = sans, absent = court) aurait fait dependre le
   * comportement de l'ABSENCE d'un champ : indiscernable d'une requete mal formee.
   *
   * ET SURTOUT, `optional()` SANS DEFAUT, POUR NE RIEN CASSER. Une application deja installee
   * n'envoie que `autoroute` : elle obtient alors EXACTEMENT ce qu'elle obtenait avant, parce
   * que le profil est deduit de ce booleen (voir `profilDe`). Le nouveau defaut ne s'applique
   * qu'aux applications qui connaissent ce champ et le disent. Un defaut cote serveur aurait,
   * lui, change l'itineraire de tous les telephones deja en service sans prevenir personne.
   */
  profil: z.enum(['court', 'autoroute', 'sansAutoroute']).optional(),

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

  /**
   * Ce calcul contourne-t-il une ROUTE BLOQUEE confirmee ? (point 12 du client, 28 octobre.)
   *
   * Il ne s'agit pas d'une preference de confort mais d'une contrainte : la route normale n'est
   * plus praticable, et le detour propose doit etre une route qu'une berline passe. Le client
   * demande une hierarchie explicite — Nationale d'abord, autoroute si elle s'y prete, chemin
   * de wilaya a defaut, et JAMAIS une piste ni un chemin secondaire. Voir `costingOptions`.
   *
   * `default(false)` : un recalcul ordinaire (sortie manquee, embouteillage) garde les reglages
   * habituels, et une application plus ancienne continue de fonctionner a l'identique.
   */
  blocage: z.boolean().default(false),
});

/**
 * Reglages de cout transmis a Valhalla.
 *
 * LES VALEURS ELLES-MEMES ONT DEMENAGE dans `lib/profilsItineraire.ts`, et ce n'est pas un
 * rangement : ce sont des nombres qui decident de la route que prend une voiture, et un 1 laisse
 * a la place d'un 0,5 ne provoque aucune erreur — il se voit en kilometres inutiles, chez un
 * conducteur qui n'a aucun moyen de savoir que le reglage est en cause. Isoles dans un module
 * qui n'importe ni Fastify ni la configuration, les trois profils s'eprouvent par
 * `verifier-profils-itineraire.ts` sans serveur et sans moteur. Il ne reste ici que le CHOIX du
 * profil, qui est la seule chose propre a cette requete.
 */
function costingOptions(input: {
  mode: 'auto' | 'pedestrian';
  autoroute: boolean;
  profil?: ProfilItineraire;
  blocage?: boolean;
}) {
  if (input.mode === 'pedestrian') return { pedestrian: optionsPieton() };
  const profil = profilDe(input);
  return { auto: input.blocage ? optionsBlocage(profil) : optionsAuto(profil) };
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
        /**
         * LES ROUTES BARREES PAR VOTE NE S'APPLIQUENT PLUS AU PIETON — point 5B du 21 novembre.
         *
         * << Ne concerne QUE le costing 'auto' (voiture). Le costing 'pedestrian' n'est PAS
         * affecte. [...] NE PAS appliquer applyReportedClosures() quand costing = 'pedestrian'. >>
         *
         * ET C'EST JUSTE, SUR LE FOND : un barrage de police, une route coupee a la circulation
         * ou un chantier se traversent a pied. Faire faire au marcheur le detour calcule pour une
         * voiture, c'est lui faire contourner a pied un obstacle qu'il franchit en trois pas — et
         * `exclude_locations` est une exclusion DURE chez Valhalla : elle ne rallonge pas le
         * trajet, elle peut le rendre introuvable et renvoyer << aucun itineraire >> a quelqu'un
         * qui voulait traverser la rue.
         */
        ...(input.avoid.length > 0 && input.mode !== 'pedestrian'
          ? { exclude_locations: input.avoid.map((p) => ({ lat: p.lat, lon: p.lon })) }
          : {}),
        directions_options: { units: 'kilometers', language: input.language },
      };

      /**
       * DEUX SECONDES ET DEMIE POUR UN RECALCUL EN ROULANT — point G du correctif v2 :
       * << Duree max du recalcul : 2 a 2,5 secondes. >> C'etait cinq.
       *
       * UNE ECHEANCE PLUS COURTE NE REND PAS VALHALLA PLUS RAPIDE : elle decide a partir de
       * quand sa reponse ne vaut plus la peine d'etre attendue. Et c'est la le fond de la
       * demande. A 110 km/h, cinq secondes font cent cinquante metres : l'itineraire qui arrive
       * part d'un endroit que le vehicule a quitte depuis longtemps, et il faudra le refaire.
       * Abandonner a 2,5 s pour repartir de la position reelle donne une reponse juste plus vite
       * qu'attendre une reponse perimee.
       *
       * LA REPRISE UNIQUE CI-DESSOUS RESTE, et le pire cas passe donc de dix secondes a cinq.
       * Le telephone, lui, patiente neuf secondes (voir mobile/navigation/routing.ts) : il laisse
       * toujours au serveur le temps de repondre LUI-MEME, parce que sa reponse dit pourquoi
       * quand la notre ne dirait que << pas de reponse >>.
       */
      const timeoutMs = input.quick ? 2_500 : 12_000;

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
