import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { registerDeviceInput } from '@win/shared';
import { db } from '../db/client.js';
import { parse } from '../lib/http.js';

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Inscription anonyme d'un appareil.
   *
   * L'application appelle cette route une seule fois, a la premiere ouverture,
   * et conserve le jeton. `legacyUid` permet de rattacher les contributions
   * faites sous l'ancien identifiant `win_uid` de la version web, pour qu'un
   * testeur ne perde pas son classement en passant a l'application native.
   */
  app.post('/devices/register', async (req, reply) => {
    const input = parse(registerDeviceInput, req.body);
    const legacyUid = (req.body as { legacyUid?: string } | undefined)?.legacyUid ?? null;

    const rows = (await db.execute(sql`
      INSERT INTO devices (platform, app_version, language, legacy_uid)
      VALUES (${input.platform}, ${input.appVersion ?? null}, ${input.language ?? null}, ${legacyUid})
      ON CONFLICT (legacy_uid) DO UPDATE
        SET last_seen_at = now(),
            app_version  = EXCLUDED.app_version,
            language     = COALESCE(EXCLUDED.language, devices.language)
      RETURNING id
    `)) as unknown as { id: string }[];

    const deviceId = rows[0]!.id;
    return reply.code(201).send({ deviceId, token: app.signDeviceToken(deviceId) });
  });

  /** Signal de vie, appele au demarrage de l'application. */
  app.post('/devices/heartbeat', { preHandler: [app.requireDevice] }, async (req) => {
    await db.execute(sql`
      UPDATE devices SET last_seen_at = now() WHERE id = ${req.deviceId!}
    `);
    return { ok: true };
  });
};

export default routes;
