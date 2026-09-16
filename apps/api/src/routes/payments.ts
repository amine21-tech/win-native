import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { payoutAccountInput } from '@win/shared';
import { db } from '../db/client.js';
import { notFound, parse } from '../lib/http.js';

/**
 * Compte de reception des paiements de deblocage Tunisie (voir migration
 * 0001_payout_account.sql). Reserve aux administrateurs : jamais expose ni
 * modifiable depuis l'app cote contributeur.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.get('/admin/payout-account', { preHandler: [app.requireAdmin] }, async () => {
    const rows = (await db.execute(sql`
      SELECT id, type, account_number AS "accountNumber", holder_name AS "holderName",
             updated_at AS "updatedAt"
      FROM payout_accounts
      ORDER BY updated_at DESC
      LIMIT 1
    `)) as unknown as unknown[];

    if (rows.length === 0) throw notFound('Aucun compte de reception configure pour le moment.');
    return rows[0];
  });

  app.put('/admin/payout-account', { preHandler: [app.requireAdmin] }, async (req) => {
    const input = parse(payoutAccountInput, req.body);

    const rows = (await db.execute(sql`
      INSERT INTO payout_accounts (type, account_number, holder_name, updated_by)
      VALUES (${input.type}, ${input.accountNumber}, ${input.holderName}, ${req.admin!.id})
      RETURNING id, type, account_number AS "accountNumber", holder_name AS "holderName",
                updated_at AS "updatedAt"
    `)) as unknown as unknown[];

    return rows[0];
  });
};

export default routes;
