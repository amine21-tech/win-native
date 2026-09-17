import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  ABSENT_VOTE_THRESHOLD,
  createReportInput,
  nearbyReportsQuery,
  PERMANENT_KINDS,
  TEMPORARY_TTL_MINUTES,
  voteReportInput,
  type Report,
  type ReportKind,
} from '@win/shared';
import { db } from '../db/client.js';
import { conflict, notFound, parse } from '../lib/http.js';

const reportColumns = sql`
  r.id,
  r.kind,
  r.permanent,
  ST_Y(r.geom::geometry) AS lat,
  ST_X(r.geom::geometry) AS lon,
  r.heading,
  r.speed_limit AS "speedLimit",
  r.created_at  AS "createdAt",
  r.expires_at  AS "expiresAt",
  (SELECT count(*)::int FROM report_votes v WHERE v.report_id = r.id AND v.vote = 'confirm') AS "confirmCount",
  (SELECT count(*)::int FROM report_votes v WHERE v.report_id = r.id AND v.vote = 'absent')  AS "absentCount"
`;

async function loadReport(id: string): Promise<Report | null> {
  const rows = (await db.execute(sql`
    SELECT ${reportColumns} FROM reports r WHERE r.id = ${id} LIMIT 1
  `)) as unknown as Report[];
  return rows[0] ?? null;
}

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Signalements autour d'une position.
   *
   * Remplace GET /signalements/nearby, qui parcourait le fichier JSON entier.
   * Les signalements temporaires expires sont exclus a la lecture plutot que
   * supprimes par une tache de fond : rien a planifier, rien a oublier.
   */
  app.get('/reports/nearby', async (req) => {
    const { lat, lon, radius, kinds } = parse(nearbyReportsQuery, req.query);
    const point = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;

    const rows = await db.execute(sql`
      SELECT ${reportColumns},
             ST_Distance(r.geom, ${point}) AS "distanceM"
      FROM reports r
      WHERE r.status = 'active'
        AND (r.expires_at IS NULL OR r.expires_at > now())
        AND (${
          // Meme correction que dans places.ts : un tableau interpole est etale en
          // parametres separes, donc le transtypage `::text[]` echouait. Le defaut etait
          // encore invisible ici — l'application ne filtre jamais par type pour l'instant —
          // mais il aurait fait tomber la route au premier ecran qui s'en serait servi.
          kinds?.length
            ? sql`r.kind IN (${sql.join(
                kinds.map((kind) => sql`${kind}`),
                sql`, `,
              )})`
            : sql`true`
        })
        AND ST_DWithin(r.geom, ${point}, ${radius})
      ORDER BY "distanceM" ASC
      LIMIT 500
    `);

    return { items: rows };
  });

  /** Depot d'un signalement. */
  app.post('/reports', { preHandler: [app.requireDevice] }, async (req, reply) => {
    const input = parse(createReportInput, req.body);
    const deviceId = req.deviceId!;
    const permanent = PERMANENT_KINDS.includes(input.kind);
    const ttl = TEMPORARY_TTL_MINUTES[input.kind as ReportKind];

    // Un signalement identique a moins de 40 metres est traite comme une
    // confirmation du signalement existant plutot que comme un doublon.
    const existing = (await db.execute(sql`
      SELECT id FROM reports
      WHERE status = 'active'
        AND kind = ${input.kind}
        AND (expires_at IS NULL OR expires_at > now())
        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography, 40)
      LIMIT 1
    `)) as unknown as { id: string }[];

    if (existing.length > 0) {
      const id = existing[0]!.id;
      await db.execute(sql`
        INSERT INTO report_votes (report_id, device_id, vote)
        VALUES (${id}, ${deviceId}, 'confirm')
        ON CONFLICT DO NOTHING
      `);
      const updated = await loadReport(id);
      if (updated) app.broadcastAround(updated.lat, updated.lon, { type: 'report:updated', report: updated });
      return reply.code(200).send({ id, merged: true });
    }

    const rows = (await db.execute(sql`
      INSERT INTO reports (kind, permanent, geom, heading, speed_limit, created_by, expires_at)
      VALUES (${input.kind}, ${permanent},
              ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
              ${input.heading ?? null}, ${input.speedLimit ?? null}, ${deviceId},
              ${
                permanent || ttl === 0
                  ? sql`NULL::timestamptz`
                  : sql`now() + ${`${ttl} minutes`}::interval`
              })
      RETURNING id
    `)) as unknown as { id: string }[];

    const created = await loadReport(rows[0]!.id);

    await db.execute(sql`
      INSERT INTO contributors (device_id, reports_count, score)
      VALUES (${deviceId}, 1, 5)
      ON CONFLICT (device_id) DO UPDATE
        SET reports_count = contributors.reports_count + 1,
            score         = contributors.score + 5,
            updated_at    = now()
    `);

    if (created) app.broadcastAround(created.lat, created.lon, { type: 'report:new', report: created });
    return reply.code(201).send(created);
  });

  /**
   * Vote sur un signalement : « toujours la » ou « n'existe plus ».
   *
   * En v82 le seuil de suppression reposait sur un compteur. Ici, chaque vote
   * est une ligne rattachee a un appareil, donc un meme telephone ne peut plus
   * faire disparaitre un radar a lui seul, et l'historique reste auditable.
   */
  app.post<{ Params: { id: string } }>(
    '/reports/:id/vote',
    { preHandler: [app.requireDevice] },
    async (req) => {
      const { vote } = parse(voteReportInput, req.body);
      const deviceId = req.deviceId!;
      const report = await loadReport(req.params.id);
      if (!report) throw notFound("Ce signalement n'existe plus.");

      const inserted = (await db.execute(sql`
        INSERT INTO report_votes (report_id, device_id, vote)
        VALUES (${report.id}, ${deviceId}, ${vote})
        ON CONFLICT DO NOTHING
        RETURNING id
      `)) as unknown as { id: string }[];

      if (inserted.length === 0) {
        throw conflict('deja_vote', 'Vous avez deja vote pour ce signalement.');
      }

      /* « Toujours la » PROLONGE un signalement temporaire.
       *
       * Le cahier des charges du client distingue deux familles : les permanents (dos d'ane,
       * radar, trou), qui n'expirent jamais et ne disparaissent que sur trois votes « plus la »,
       * et les ephemeres (bouchon, accident, police...), qui expirent seuls mais sont
       * prolongeables par les confirmations. Sans cette prolongation, un bouchon confirme par
       * cinq conducteurs disparaissait quand meme a l'heure dite.
       *
       * La prolongation est bornee : une heure de plus que la duree de vie initiale du type,
       * jamais davantage. Un signalement ne peut donc pas devenir eternel a force de votes —
       * c'est ce qui distingue un ephemere d'un permanent.
       */
      if (vote === 'confirm' && !report.permanent) {
        await db.execute(sql`
          UPDATE reports
          SET expires_at = LEAST(
                created_at + ${`${(TEMPORARY_TTL_MINUTES[report.kind as ReportKind] ?? 60) + 60} minutes`}::interval,
                GREATEST(expires_at, now() + interval '30 minutes')
              )
          WHERE id = ${report.id} AND expires_at IS NOT NULL
        `);
      }

      if (vote === 'confirm') {
        await db.execute(sql`
          INSERT INTO contributors (device_id, confirms_count, score)
          VALUES (${deviceId}, 1, 2)
          ON CONFLICT (device_id) DO UPDATE
            SET confirms_count = contributors.confirms_count + 1,
                score          = contributors.score + 2,
                updated_at     = now()
        `);
      }

      const after = await loadReport(report.id);
      if (!after) throw notFound();

      if (after.absentCount >= ABSENT_VOTE_THRESHOLD) {
        await db.execute(sql`
          UPDATE reports SET status = 'removed', removed_at = now() WHERE id = ${report.id}
        `);
        app.broadcastAround(after.lat, after.lon, {
          type: 'report:removed',
          reportId: after.id,
        });
        return { removed: true, threshold: ABSENT_VOTE_THRESHOLD, report: after };
      }

      app.broadcastAround(after.lat, after.lon, { type: 'report:updated', report: after });
      return { removed: false, threshold: ABSENT_VOTE_THRESHOLD, report: after };
    },
  );
};

export default routes;
