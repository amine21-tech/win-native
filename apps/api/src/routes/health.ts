import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { noStore } from '../lib/http.js';

const startedAt = Date.now();

const routes: FastifyPluginAsync = async (app) => {
  /** Sonde simple, utilisee par Nginx et par l'ecran de diagnostic reseau. */
  app.get('/status', async (_req, reply) => {
    noStore(reply);
    return { ok: true, service: 'win-api', uptimeS: Math.round((Date.now() - startedAt) / 1000) };
  });

  /**
   * Sonde complete : base, PostGIS et Valhalla.
   * Le controle Valhalla est volontairement borne dans le temps — le conteneur
   * met parfois plusieurs secondes a repondre au premier appel apres un
   * redemarrage, et cela ne doit pas bloquer la sonde.
   */
  app.get('/status/full', async (_req, reply) => {
    noStore(reply);

    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    try {
      const rows = (await db.execute(
        sql`SELECT PostGIS_Lib_Version() AS version`,
      )) as unknown as { version: string }[];
      checks.database = { ok: true, detail: `PostGIS ${rows[0]?.version ?? '?'}` };
    } catch (error) {
      checks.database = { ok: false, detail: (error as Error).message };
    }

    try {
      const response = await fetch(`${env.VALHALLA_URL}/status`, {
        signal: AbortSignal.timeout(2500),
      });
      checks.valhalla = { ok: response.ok, detail: `HTTP ${response.status}` };
    } catch (error) {
      checks.valhalla = { ok: false, detail: (error as Error).message };
    }

    const ok = Object.values(checks).every((c) => c.ok);
    return reply.code(ok ? 200 : 503).send({ ok, checks });
  });
};

export default routes;
