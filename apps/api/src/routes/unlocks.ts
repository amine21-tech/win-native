import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { phone, uuid } from '@win/shared';
import { db } from '../db/client.js';
import { notFound, parse } from '../lib/http.js';

/**
 * Deblocage de la Tunisie : 200 DA, acces illimite a vie, paye par BaridiMob.
 *
 * Parcours :
 *   1. l'application affiche le prix et le compte de reception (GET /unlocks) ;
 *   2. le client vire 200 DA en mettant son numero de telephone en reference, puis le saisit
 *      dans l'application (POST /unlocks/TN/request) — la demande passe « en attente » ;
 *   3. un administrateur verifie la reception du virement et valide la demande
 *      (POST /admin/unlocks/:id/approve) — l'acces s'ouvre sur l'appareil.
 *
 * L'acces est lie a l'APPAREIL et non au numero : sinon il suffirait de saisir le numero d'un
 * client ayant deja paye pour obtenir l'acces gratuitement.
 */
const TN_PRICE_DA = 200;

type UnlockStatus = 'none' | 'pending' | 'paid';

async function statusFor(deviceId: string): Promise<UnlockStatus> {
  const rows = (await db.execute(sql`
    SELECT status FROM country_unlocks
    WHERE device_id = ${deviceId} AND country = 'TN' AND status IN ('pending', 'paid')
  `)) as unknown as { status: 'pending' | 'paid' }[];
  if (rows.some((r) => r.status === 'paid')) return 'paid';
  if (rows.some((r) => r.status === 'pending')) return 'pending';
  return 'none';
}

const routes: FastifyPluginAsync = async (app) => {
  /** Etat du deblocage pour cet appareil, prix, et compte ou envoyer le paiement. */
  app.get('/unlocks', { preHandler: [app.requireDevice] }, async (req) => {
    const account = (await db.execute(sql`
      SELECT type, account_number AS "accountNumber", holder_name AS "holderName"
      FROM payout_accounts
      ORDER BY updated_at DESC
      LIMIT 1
    `)) as unknown as { type: string; accountNumber: string; holderName: string }[];

    return {
      TN: await statusFor(req.deviceId!),
      priceDa: TN_PRICE_DA,
      // Le compte de reception DOIT etre visible du client : c'est la qu'il envoie l'argent.
      // Seule sa MODIFICATION est reservee aux administrateurs (routes/payments.ts).
      payout: account[0] ?? null,
    };
  });

  /** « J'ai paye » : enregistre la demande avec le numero qui sert de reference du virement. */
  app.post(
    '/unlocks/TN/request',
    {
      preHandler: [app.requireDevice],
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (req) => {
      const input = parse(z.object({ phone }), req.body);
      const deviceId = req.deviceId!;

      const current = await statusFor(deviceId);
      if (current === 'paid') return { TN: 'paid' as const };

      // Une seule demande en attente par appareil : on met a jour le numero plutot que d'en
      // empiler une nouvelle a chaque appui.
      await db.execute(sql`
        INSERT INTO country_unlocks (device_id, country, amount_da, phone, status)
        VALUES (${deviceId}, 'TN', ${TN_PRICE_DA}, ${input.phone}, 'pending')
        ON CONFLICT (device_id, country, status)
        DO UPDATE SET phone = EXCLUDED.phone, created_at = now()
      `);
      return { TN: 'pending' as const };
    },
  );

  /** Demandes en attente de verification, les plus recentes d'abord. */
  app.get('/admin/unlocks', { preHandler: [app.requireAdmin] }, async () => {
    const rows = await db.execute(sql`
      SELECT id, phone, amount_da AS "amountDa", created_at AS "createdAt"
      FROM country_unlocks
      WHERE country = 'TN' AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 200
    `);
    return { items: rows };
  });

  /** Paiement recu : l'acces s'ouvre sur l'appareil du client. */
  app.post<{ Params: { id: string } }>(
    '/admin/unlocks/:id/approve',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const id = parse(uuid, req.params.id);
      const rows = (await db.execute(sql`
        SELECT device_id AS "deviceId" FROM country_unlocks
        WHERE id = ${id} AND status = 'pending'
      `)) as unknown as { deviceId: string }[];
      if (rows.length === 0) throw notFound('Demande introuvable ou deja traitee.');

      // Un appareil deja debloque (paiement valide deux fois) : on retire simplement la demande
      // en double plutot que de heurter la contrainte d'unicite.
      if ((await statusFor(rows[0]!.deviceId)) === 'paid') {
        await db.execute(sql`DELETE FROM country_unlocks WHERE id = ${id}`);
        return { ok: true };
      }

      await db.execute(sql`
        UPDATE country_unlocks
        SET status = 'paid', paid_at = now(), validated_by = ${req.admin!.id}
        WHERE id = ${id}
      `);
      return { ok: true };
    },
  );

  /** Aucun paiement recu : la demande est retiree, le client pourra en refaire une. */
  app.post<{ Params: { id: string } }>(
    '/admin/unlocks/:id/reject',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const id = parse(uuid, req.params.id);
      await db.execute(sql`DELETE FROM country_unlocks WHERE id = ${id} AND status = 'pending'`);
      return { ok: true };
    },
  );
};

export default routes;
