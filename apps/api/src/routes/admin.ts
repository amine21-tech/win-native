import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { adminLoginInput } from '@win/shared';
import { db } from '../db/client.js';
import { HttpError, notFound, parse } from '../lib/http.js';

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Connexion administrateur.
   *
   * Remplace le code `1154` ecrit en dur dans index.html — donc visible par
   * quiconque affichait le code source de la page — et la cle ADMIN_KEY restee
   * a sa valeur d'exemple depuis la mise en ligne.
   */
  app.post(
    '/admin/login',
    { config: { rateLimit: { max: 8, timeWindow: '5 minutes' } } },
    async (req) => {
      const { email, password } = parse(adminLoginInput, req.body);

      const rows = (await db.execute(sql`
        SELECT id, password_hash AS "passwordHash", role, display_name AS "displayName"
        FROM admins WHERE email = lower(${email}) LIMIT 1
      `)) as unknown as {
        id: string;
        passwordHash: string;
        role: 'moderator' | 'admin';
        displayName: string;
      }[];

      const account = rows[0];
      // Verification systematique meme si le compte n'existe pas, pour ne pas
      // reveler par le temps de reponse quels courriels sont enregistres.
      const valid = account
        ? await argon2.verify(account.passwordHash, password).catch(() => false)
        : await argon2
            .hash(password)
            .then(() => false)
            .catch(() => false);

      if (!account || !valid) {
        throw new HttpError(401, 'identifiants_invalides', 'Courriel ou mot de passe incorrect.');
      }

      await db.execute(sql`UPDATE admins SET last_login_at = now() WHERE id = ${account.id}`);

      return {
        token: app.signAdminToken(account.id, account.role),
        admin: { id: account.id, displayName: account.displayName, role: account.role },
      };
    },
  );

  /** Corrections d'adresse en attente de traitement. */
  app.get('/admin/corrections', { preHandler: [app.requireAdmin] }, async (req) => {
    const status = (req.query as { status?: string }).status ?? 'pending';
    const rows = await db.execute(sql`
      SELECT c.id, c.message, c.payload, c.status, c.created_at AS "createdAt",
             c.place_id AS "placeId", p.name AS "placeName",
             ST_Y(c.geom::geometry) AS lat, ST_X(c.geom::geometry) AS lon
      FROM corrections c
      LEFT JOIN places p ON p.id = c.place_id
      WHERE c.status = ${status}
      ORDER BY c.created_at DESC
      LIMIT 200
    `);
    return { items: rows };
  });

  app.post<{ Params: { id: string }; Body: { status: 'accepted' | 'rejected' } }>(
    '/admin/corrections/:id/status',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const status = req.body?.status;
      if (status !== 'accepted' && status !== 'rejected') {
        throw new HttpError(400, 'statut_invalide', 'Statut attendu : accepted ou rejected.');
      }
      const rows = (await db.execute(sql`
        UPDATE corrections
        SET status = ${status}, reviewed_by = ${req.admin!.id}, reviewed_at = now()
        WHERE id = ${req.params.id}
        RETURNING id
      `)) as unknown as { id: string }[];
      if (rows.length === 0) throw notFound();
      return { ok: true };
    },
  );

  /** Journal de moderation, avec la possibilite de restaurer une suppression. */
  app.get('/admin/moderation-log', { preHandler: [app.requireAdmin] }, async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 100), 500);
    const rows = await db.execute(sql`
      SELECT m.id, m.entity_type AS "entityType", m.entity_id AS "entityId", m.action,
             m.created_at AS "createdAt", a.display_name AS "adminName"
      FROM moderation_log m
      LEFT JOIN admins a ON a.id = m.admin_id
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `);
    return { items: rows };
  });

  /** Restauration d'un lieu supprime, a partir d'une entree du journal. */
  app.post<{ Params: { id: string } }>(
    '/admin/moderation-log/:id/restore',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const rows = (await db.execute(sql`
        SELECT entity_type AS "entityType", entity_id AS "entityId"
        FROM moderation_log WHERE id = ${req.params.id} AND action = 'delete'
      `)) as unknown as { entityType: string; entityId: string }[];

      const entry = rows[0];
      if (!entry) throw notFound("Cette entree du journal n'est pas une suppression.");
      if (entry.entityType !== 'place') {
        throw new HttpError(400, 'non_restaurable', 'Seuls les lieux peuvent etre restaures.');
      }

      await db.execute(sql`UPDATE places SET deleted_at = NULL WHERE id = ${entry.entityId}`);
      await db.execute(sql`
        INSERT INTO moderation_log (entity_type, entity_id, action, admin_id)
        VALUES ('place', ${entry.entityId}, 'restore', ${req.admin!.id})
      `);

      return { ok: true, placeId: entry.entityId };
    },
  );
};

export default routes;
