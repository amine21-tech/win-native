import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { phone, uuid } from '@win/shared';
import { db } from '../db/client.js';
import { notFound, parse } from '../lib/http.js';

/**
 * Abonnement Tunisie : 200 DA PAR AN, paye par BaridiMob ou CIB.
 *
 * Parcours :
 *   1. l'application affiche le prix et le compte de reception (GET /unlocks) ;
 *   2. le client vire 200 DA en mettant son numero de telephone en reference, puis le saisit
 *      dans l'application (POST /unlocks/TN/request) — la demande passe « en attente » ;
 *   3. un administrateur verifie la reception du virement et valide la demande
 *      (POST /admin/unlocks/:id/approve) — l'acces s'ouvre sur l'appareil pour UN AN.
 *
 * L'acces est lie a l'APPAREIL et non au numero : sinon il suffirait de saisir le numero d'un
 * client ayant deja paye pour obtenir l'acces gratuitement.
 *
 * ANNUEL DEPUIS LE 8 NOVEMBRE (point 9 : << 200 DA/an >>). C'etait un paiement unique donnant
 * un acces a vie, et c'est ce que le panneau annoncait au client avant qu'il ne vire l'argent.
 *
 * LES ABONNEMENTS DEJA PAYES RESTENT A VIE : leur `expires_at` est NULL, et NULL vaut << pas
 * d'echeance >> dans toutes les lectures ci-dessous. Le document decrit la nouvelle offre ; il ne
 * demande pas de retirer aux clients existants ce qu'ils ont achete, et le faire se verrait sous
 * la forme d'un acces qui se ferme sans explication. Voir la migration
 * 0012_abonnement_tunisie_annuel.sql.
 */
const TN_PRICE_DA = 200;

/** Duree d'un abonnement. Ecrite en SQL plutot qu'en millisecondes : c'est Postgres qui compte
 *  les annees bissextiles, pas nous. */
const DUREE_ABONNEMENT = sql`interval '1 year'`;

type UnlockStatus = 'none' | 'pending' | 'paid';

/**
 * Etat de l'abonnement d'un appareil.
 *
 * UN ABONNEMENT EXPIRE NE COMPTE PAS COMME PAYE, et c'est tout l'objet du changement : il rend
 * << none >>, donc l'appareil peut en redemander un. La ligne expiree, elle, reste en base — elle
 * est la preuve d'un paiement recu, et la supprimer effacerait l'historique comptable du client.
 */
async function statusFor(deviceId: string): Promise<UnlockStatus> {
  const rows = (await db.execute(sql`
    SELECT status FROM country_unlocks
    WHERE device_id = ${deviceId} AND country = 'TN' AND status IN ('pending', 'paid')
      AND (status <> 'paid' OR expires_at IS NULL OR expires_at > now())
  `)) as unknown as { status: 'pending' | 'paid' }[];
  if (rows.some((r) => r.status === 'paid')) return 'paid';
  if (rows.some((r) => r.status === 'pending')) return 'pending';
  return 'none';
}

/** Fin de l'abonnement en cours, ou `null` quand il n'y en a pas — ou qu'il est a vie. */
async function expirationFor(deviceId: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    SELECT expires_at AS "expiresAt" FROM country_unlocks
    WHERE device_id = ${deviceId} AND country = 'TN' AND status = 'paid'
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at DESC NULLS FIRST
    LIMIT 1
  `)) as unknown as { expiresAt: string | null }[];
  return rows[0]?.expiresAt ?? null;
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

    const deviceId = req.deviceId!;
    return {
      TN: await statusFor(deviceId),
      priceDa: TN_PRICE_DA,
      /* FIN DE L'ABONNEMENT, pour que l'application puisse la montrer et proposer le
       * renouvellement avant la coupure. `null` avec un etat << paid >> veut dire A VIE : c'est
       * le cas des clients d'avant le 8 novembre. */
      expiresAt: await expirationFor(deviceId),
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

      /* Une seule demande en attente par appareil : on met a jour le numero plutot que d'en
       * empiler une nouvelle a chaque appui.
       *
       * LE PREDICAT EST REPETE DANS LE `ON CONFLICT`, et il est obligatoire : depuis le passage
       * a l'abonnement annuel, l'unicite ne porte plus sur (device_id, country, status) mais sur
       * un index PARTIEL limite aux demandes en attente — les lignes payees, elles, s'empilent
       * d'une annee sur l'autre. Postgres n'infere un index partiel que si on lui redonne son
       * predicat. Voir la migration 0012_abonnement_tunisie_annuel.sql. */
      await db.execute(sql`
        INSERT INTO country_unlocks (device_id, country, amount_da, phone, status)
        VALUES (${deviceId}, 'TN', ${TN_PRICE_DA}, ${input.phone}, 'pending')
        ON CONFLICT (device_id, country) WHERE status = 'pending'
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

      const deviceId = rows[0]!.deviceId;

      // Un appareil deja abonne (paiement valide deux fois) : on retire simplement la demande
      // en double plutot que de heurter la contrainte d'unicite.
      if ((await statusFor(deviceId)) === 'paid') {
        await db.execute(sql`DELETE FROM country_unlocks WHERE id = ${id}`);
        return { ok: true };
      }

      /* L'ANCIENNE LIGNE PAYEE RESTE EN PLACE, et c'est voulu : elle atteste un paiement recu
       * et forme, d'une annee sur l'autre, l'historique de l'abonne. C'est la migration 0012
       * qui l'a rendu possible, en remplacant l'unicite sur (device_id, country, status) par un
       * index partiel limite aux demandes EN ATTENTE. Avec l'ancienne contrainte, le deuxieme
       * renouvellement aurait echoue — un an apres la mise en service. */
      await db.execute(sql`
        UPDATE country_unlocks
        SET status = 'paid',
            paid_at = now(),
            expires_at = now() + ${DUREE_ABONNEMENT},
            validated_by = ${req.admin!.id}
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
