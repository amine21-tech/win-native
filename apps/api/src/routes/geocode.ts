import type { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { latitudeQuery, longitudeQuery } from '@win/shared';
import { env } from '../env.js';
import { parse } from '../lib/http.js';

/**
 * GEOCODAGE : LE TELEPHONE NE PARLE PLUS AUX SERVICES PUBLICS, C'EST NOUS QUI LE FAISONS.
 *
 * Pourquoi ce passe-plat existe, mesures a l'appui.
 *
 * L'application interrogeait photon.komoot.io et nominatim.openstreetmap.org DIRECTEMENT,
 * depuis chaque telephone, avec un abandon a six secondes. Releve le 20 octobre 2026 sur cinq
 * appels consecutifs a Photon : 7,2 s — 3,2 s — 3,8 s — 14,8 s — sans reponse. Trois sur cinq
 * depassaient donc le delai d'abandon. Nominatim : 11,7 s et un abandon. Ces services sont
 * gratuits, mutualises entre le monde entier, et personne ne leur a rien promis.
 *
 * Consequence vue par l'utilisateur, et c'est le defaut que le client a signale : quand le
 * geocodeur ne repond pas, il ne reste que nos propres fiches. << Le moteur n'affiche plus que
 * les adresses ajoutees par des utilisateurs WIN. >>
 *
 * Trois choses changent en passant par ici.
 *
 *   1. UN CACHE PARTAGE. Le premier qui cherche << Boumerdes >> attend la reponse du service
 *      public ; tous les suivants la recoivent de notre Redis, en quelques millisecondes. Une
 *      recherche n'est lente qu'une fois pour toute l'Algerie, au lieu d'etre lente une fois
 *      par telephone. C'est ce qui rapproche vraiment du niveau exige par le client.
 *
 *   2. UN SEUL CLIENT AU LIEU DE MILLIERS. Les services publics limitent le debit par
 *      adresse. Des milliers de telephones qui tapent en meme temps se font ecarter ; un seul
 *      serveur, identifie, qui ne redemande jamais deux fois la meme chose, passe.
 *
 *   3. UNE ATTENTE QUI NE COUTE RIEN. Ici on peut patienter quinze secondes sans que personne
 *      regarde l'ecran : c'est le prix d'un seul defaut de cache. Sur le telephone, six
 *      secondes d'attente etaient deja insupportables — d'ou l'abandon, d'ou le vide.
 *
 * Et accessoirement, cela ferme une faille de confidentialite : les recherches des
 * utilisateurs ne partent plus vers deux societes tierces depuis leur appareil.
 */

/** Delai cote serveur. Genereux : personne n'attend devant l'ecran pendant ce temps-la. */
const TIMEOUT_MS = 15_000;

/** Les services publics demandent une identification honnete. Nominatim refuse sans. */
const USER_AGENT = 'WIN-DZ/1.0 (application de navigation, Algerie; contact@windz.app)';

/**
 * Duree de vie des reponses en cache.
 *
 * Une adresse ne bouge pas. Vingt-quatre heures pour une recherche, c'est deja prudent :
 * OpenStreetMap met des jours a propager une correction jusqu'aux index de Photon. Le
 * geocodage inverse, lui, tient une semaine — une rue ne change pas de nom.
 */
const TTL_RECHERCHE_S = 24 * 60 * 60;
const TTL_INVERSE_S = 7 * 24 * 60 * 60;

/** Au-dela, on considere que le cache n'a pas repondu et on part sur le reseau. */
const TIMEOUT_CACHE_MS = 300;

let redis: Redis | null = null;

/**
 * Connexion paresseuse, et qui ne fait jamais tomber la route.
 *
 * Redis est un accelerateur, pas une dependance : s'il est absent ou lent, le geocodage doit
 * continuer de fonctionner en interrogeant directement le service public. C'est exactement ce
 * que fait le reste de l'API avec l'adaptateur temps reel.
 */
function cache(): Redis | null {
  if (redis) return redis;
  try {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on('error', () => {
      /* Silencieux a dessein : un Redis absent ne doit pas remplir le journal a chaque frappe. */
    });
    void redis.connect().catch(() => undefined);
    return redis;
  } catch {
    return null;
  }
}

async function lireCache(cle: string): Promise<unknown | null> {
  const r = cache();
  if (!r) return null;
  try {
    const brut = await Promise.race([
      r.get(cle),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_CACHE_MS)),
    ]);
    return brut ? (JSON.parse(brut) as unknown) : null;
  } catch {
    return null;
  }
}

function ecrireCache(cle: string, valeur: unknown, ttlS: number): void {
  const r = cache();
  if (!r) return;
  // Volontairement sans `await` : l'utilisateur n'a pas a attendre que l'on range.
  void r.set(cle, JSON.stringify(valeur), 'EX', ttlS).catch(() => undefined);
}

/**
 * Les moteurs a interroger, dans l'ordre, pour une recherche par texte.
 *
 * Le moteur LOCAL d'abord quand il existe : il repond en dizaines de millisecondes et ne
 * depend de personne. Le service public ensuite — pas par principe de precaution, mais parce
 * que l'index local date de juillet 2025 : une rue cartographiee depuis n'y est pas, et le
 * public, lui, la connait. Les deux ensemble couvrent donc plus que chacun seul.
 */
function moteursPhoton(): { nom: string; base: string }[] {
  const liste: { nom: string; base: string }[] = [];
  if (env.PHOTON_URL) liste.push({ nom: 'photon-local', base: env.PHOTON_URL.replace(/\/$/, '') });
  liste.push({ nom: 'photon', base: 'https://photon.komoot.io' });
  return liste;
}

async function demander(url: string): Promise<unknown> {
  const reponse = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!reponse.ok) throw new Error(`geocodeur indisponible (${reponse.status})`);
  return reponse.json();
}

/**
 * Normalisation de la saisie pour la CLE DE CACHE — et uniquement pour elle.
 *
 * << Boumerdes >>, << boumerdes >> et << Boumerdès >> designent la meme chose et doivent
 * partager la meme entree : c'est ce qui fait monter le taux de reussite du cache, donc la
 * vitesse ressentie. La requete envoyee au service public, elle, garde le texte exact.
 */
function cleTexte(q: string): string {
  return q
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Position arrondie : deux decimales, environ un kilometre. Deux recherches faites dans le
 * meme quartier partagent ainsi leur reponse. */
function cleLieu(lat?: number, lon?: number): string {
  return lat === undefined || lon === undefined ? 'noloc' : `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

const rechercheQuery = z.object({
  q: z.string().trim().min(1).max(160),
  lat: latitudeQuery.optional(),
  lon: longitudeQuery.optional(),
  lang: z.enum(['fr', 'en', 'ar']).default('fr'),
  limit: z.coerce.number().int().min(1).max(40).default(12),
});

const autourQuery = z.object({
  lat: latitudeQuery,
  lon: longitudeQuery,
  /** Rayon en kilometres. */
  radius: z.coerce.number().min(1).max(200).default(50),
  /** Etiquettes OSM `cle:valeur`, separees par des virgules, cumulees en OU. */
  tags: z.string().trim().min(3).max(200),
  lang: z.enum(['fr', 'en', 'ar']).default('fr'),
  limit: z.coerce.number().int().min(1).max(40).default(40),
});

const inverseQuery = z.object({
  lat: latitudeQuery,
  lon: longitudeQuery,
  lang: z.enum(['fr', 'en', 'ar']).default('fr'),
});

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Recherche par texte. Photon d'abord, Nominatim en secours.
   *
   * Le secours n'est pas decoratif : c'est lui qui evite que l'application se retrouve avec
   * ses seules fiches quand Photon est muet. Les deux services ne tombent pas ensemble.
   */
  app.get('/geocode/search', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { q, lat, lon, lang, limit } = parse(rechercheQuery, req.query);
    const cle = `geo:s:${lang}:${limit}:${cleLieu(lat, lon)}:${cleTexte(q)}`;

    const enCache = await lireCache(cle);
    if (enCache) {
      void reply.header('x-win-cache', 'hit');
      return enCache;
    }
    void reply.header('x-win-cache', 'miss');

    const photon = new URLSearchParams({ q, limit: String(limit), lang });
    if (lat !== undefined && lon !== undefined) {
      photon.set('lat', String(lat));
      photon.set('lon', String(lon));
    } else {
      // Algerie + Tunisie + marge : sans position, on ne part pas chercher a l'autre bout du monde.
      photon.set('bbox', '-8.67,18.97,12.00,37.09');
    }

    for (const moteur of moteursPhoton()) {
      try {
        const data = (await demander(`${moteur.base}/api/?${photon.toString()}`)) as {
          features?: unknown[];
        };
        const resultat = { source: moteur.nom, features: data.features ?? [] };
        // On ne garde que ce qui a du contenu : mettre une liste vide en cache pour
        // vingt-quatre heures reviendrait a graver un echec passager. Et une reponse vide
        // n'est pas une reponse : on laisse sa chance au moteur suivant.
        if (resultat.features.length > 0) {
          ecrireCache(cle, resultat, TTL_RECHERCHE_S);
          return resultat;
        }
      } catch {
        /* Ce moteur-la est muet : on passe au suivant, sans rien dire a l'utilisateur. */
      }
    }

    const nominatim = new URLSearchParams({
      format: 'jsonv2',
      countrycodes: 'dz,tn,fr',
      addressdetails: '1',
      limit: String(limit),
      'accept-language': lang,
      q,
    });
    if (lat !== undefined && lon !== undefined) {
      const d = 0.45; // ~50 km autour de la position
      nominatim.set('viewbox', [lon - d, lat - d, lon + d, lat + d].join(','));
      nominatim.set('bounded', '0');
    }

    try {
      const data = (await demander(
        `https://nominatim.openstreetmap.org/search?${nominatim.toString()}`,
      )) as unknown[];
      const resultat = { source: 'nominatim', rows: Array.isArray(data) ? data : [] };
      if (resultat.rows.length > 0) ecrireCache(cle, resultat, TTL_RECHERCHE_S);
      return resultat;
    } catch {
      /* Les deux services sont muets. On le DIT, au lieu de rendre une liste vide : l'appelant
       * doit pouvoir distinguer << rien ne correspond >> de << je n'ai pas pu demander >>, et
       * surtout ne pas mettre ce vide-la en cache de son cote. */
      void reply.code(503);
      return { source: 'aucune', indisponible: true, features: [] };
    }
  });

  /**
   * Ce qu'il y a d'un TYPE donne autour d'un point — la bonne question pour une rubrique.
   * << Qu'y a-t-il comme gare autour de moi >> plutot que << qui s'appelle gare >>.
   */
  app.get('/geocode/nearby', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { lat, lon, radius, tags, lang, limit } = parse(autourQuery, req.query);
    const etiquettes = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^[a-z_]+:[a-z_]+$/i.test(t));
    if (etiquettes.length === 0) return { source: 'photon', features: [] };

    const cle = `geo:n:${lang}:${radius}:${limit}:${cleLieu(lat, lon)}:${etiquettes.sort().join('+')}`;
    const enCache = await lireCache(cle);
    if (enCache) {
      void reply.header('x-win-cache', 'hit');
      return enCache;
    }
    void reply.header('x-win-cache', 'miss');

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radius: String(radius),
      limit: String(limit),
      lang,
    });
    for (const t of etiquettes) params.append('osm_tag', t);

    for (const moteur of moteursPhoton()) {
      try {
        const data = (await demander(`${moteur.base}/reverse?${params.toString()}`)) as {
          features?: unknown[];
        };
        const resultat = { source: moteur.nom, features: data.features ?? [] };
        if (resultat.features.length > 0) {
          ecrireCache(cle, resultat, TTL_RECHERCHE_S);
          return resultat;
        }
      } catch {
        /* moteur suivant */
      }
    }
    void reply.code(503);
    return { source: 'aucune', indisponible: true, features: [] };
  });

  /** Nom d'un point a partir de ses coordonnees — pour la fiche de deviation en navigation. */
  app.get('/geocode/reverse', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { lat, lon, lang } = parse(inverseQuery, req.query);
    // Cinq decimales : environ un metre. Deux appuis sur le meme batiment partagent la reponse.
    const cle = `geo:r:${lang}:${lat.toFixed(5)},${lon.toFixed(5)}`;

    const enCache = await lireCache(cle);
    if (enCache) {
      void reply.header('x-win-cache', 'hit');
      return enCache;
    }
    void reply.header('x-win-cache', 'miss');

    try {
      const data = await demander(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&accept-language=${lang}`,
      );
      ecrireCache(cle, data, TTL_INVERSE_S);
      return data;
    } catch {
      void reply.code(503);
      return { indisponible: true };
    }
  });
};

export default routes;
