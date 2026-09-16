import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { notFound } from '../lib/http.js';

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Partenaires actifs et leurs lieux.
   *
   * En v83, partners.json etait vide : les deux pharmacies visibles dans
   * l'application etaient ecrites en dur dans index.html. La migration les
   * fait enfin exister comme donnees, ce qui rend le declassement possible.
   */
  app.get('/partners', async () => {
    const rows = await db.execute(sql`
      SELECT pa.id, pa.name, pa.tier, pa.starts_on AS "startsOn", pa.ends_on AS "endsOn",
             COALESCE(pl.lieux, '[]'::json) AS places
      FROM partners pa
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
                 'id', p.id,
                 'name', p.name,
                 'lat', ST_Y(p.geom::geometry),
                 'lon', ST_X(p.geom::geometry),
                 'promo', p.promo,
                 'category', p.category
               )) AS lieux
        FROM places p
        WHERE p.partner_id = pa.id AND p.deleted_at IS NULL
      ) pl ON true
      WHERE pa.status = 'active'
        AND (pa.ends_on IS NULL OR pa.ends_on >= current_date)
      ORDER BY pa.tier DESC, pa.name
    `);
    return { items: rows };
  });

  /** Declassement d'un partenaire : il perd son badge sans etre efface. */
  app.post<{ Params: { id: string } }>(
    '/partners/:id/declass',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const rows = (await db.execute(sql`
        UPDATE partners
        SET status = 'declassed', declassed_at = now(), declassed_by = ${req.admin!.id}
        WHERE id = ${req.params.id} AND status = 'active'
        RETURNING id
      `)) as unknown as { id: string }[];
      if (rows.length === 0) throw notFound('Partenaire introuvable ou deja declasse.');

      await db.execute(sql`
        UPDATE places SET is_partner = false WHERE partner_id = ${req.params.id}
      `);
      await db.execute(sql`
        INSERT INTO moderation_log (entity_type, entity_id, action, admin_id)
        VALUES ('partner', ${req.params.id}, 'declass', ${req.admin!.id})
      `);

      return { ok: true };
    },
  );

  /** Reclassement, symetrique du precedent. */
  app.post<{ Params: { id: string } }>(
    '/partners/:id/reclass',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const rows = (await db.execute(sql`
        UPDATE partners
        SET status = 'active', declassed_at = NULL, declassed_by = NULL
        WHERE id = ${req.params.id} AND status = 'declassed'
        RETURNING id
      `)) as unknown as { id: string }[];
      if (rows.length === 0) throw notFound('Partenaire introuvable ou deja actif.');

      await db.execute(sql`
        UPDATE places SET is_partner = true WHERE partner_id = ${req.params.id}
      `);
      return { ok: true };
    },
  );
};

export default routes;
