import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { correctionInput, partnerLeadInput } from '@win/shared';
import { db } from '../db/client.js';
import { parse } from '../lib/http.js';

const routes: FastifyPluginAsync = async (app) => {
  /** Signalement d'une erreur sur une adresse. */
  app.post('/corrections', { preHandler: [app.optionalDevice] }, async (req, reply) => {
    const input = parse(correctionInput, req.body);
    const hasPoint = input.lat !== undefined && input.lon !== undefined;

    const rows = (await db.execute(sql`
      INSERT INTO corrections (place_id, geom, message, payload, device_id)
      VALUES (${input.placeId ?? null},
              ${
                hasPoint
                  ? sql`ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography`
                  : sql`NULL::geography`
              },
              ${input.message},
              ${JSON.stringify(input.payload ?? {})}::jsonb,
              ${req.deviceId ?? null})
      RETURNING id
    `)) as unknown as { id: string }[];

    return reply.code(201).send({ id: rows[0]!.id });
  });

  /** Candidature d'un commerce souhaitant devenir partenaire. */
  app.post('/partner-leads', { preHandler: [app.optionalDevice] }, async (req, reply) => {
    const input = parse(partnerLeadInput, req.body);
    const rows = (await db.execute(sql`
      INSERT INTO partner_leads (name, phone, email, city, message, device_id)
      VALUES (${input.name}, ${input.phone}, ${input.email ?? null}, ${input.city ?? null},
              ${input.message ?? null}, ${req.deviceId ?? null})
      RETURNING id
    `)) as unknown as { id: string }[];

    return reply.code(201).send({ id: rows[0]!.id });
  });

  /**
   * Classement national anonyme.
   *
   * Le rang est calcule en base par une fonction de fenetrage, la ou la v83
   * rechargeait contributors.json et triait en memoire a chaque consultation.
   */
  app.get('/contributors/me', { preHandler: [app.requireDevice] }, async (req) => {
    const rows = (await db.execute(sql`
      WITH classement AS (
        SELECT device_id,
               places_count   AS "placesCount",
               reports_count  AS "reportsCount",
               confirms_count AS "confirmsCount",
               score,
               rank() OVER (ORDER BY score DESC) AS rang,
               count(*) OVER ()                  AS total
        FROM contributors
      )
      SELECT "placesCount", "reportsCount", "confirmsCount", score,
             rang::int AS rank, total::int AS total
      FROM classement WHERE device_id = ${req.deviceId!}
    `)) as unknown as Record<string, number>[];

    return (
      rows[0] ?? {
        placesCount: 0,
        reportsCount: 0,
        confirmsCount: 0,
        score: 0,
        rank: 0,
        total: 0,
      }
    );
  });

  /** Tableau des meilleurs contributeurs, sans aucune donnee nominative. */
  app.get('/contributors/top', async () => {
    const rows = await db.execute(sql`
      SELECT score,
             places_count  AS "placesCount",
             reports_count AS "reportsCount",
             rank() OVER (ORDER BY score DESC)::int AS rank
      FROM contributors
      ORDER BY score DESC
      LIMIT 50
    `);
    return { items: rows };
  });
};

export default routes;
