import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { HttpError, notFound, parse } from '../lib/http.js';

/**
 * MODULE EMPLOI — offres geolocalisees (point 11 du client, 27 octobre).
 *
 * Un employeur publie une annonce payante ; les conducteurs voient celles qui sont dans un
 * rayon de cinquante kilometres autour d'eux et contactent directement. Le paiement se fait
 * hors de l'application, et un administrateur active l'annonce apres avoir constate le
 * versement — meme mecanique que le deblocage de la Tunisie, pour la meme raison : aucun
 * fournisseur de paiement en ligne n'est encore raccorde.
 */

/** Cinquante kilometres, valeur du client. Une annonce au-dela ne concerne plus le conducteur. */
const RAYON_M = 50_000;

/** Duree de visibilite d'une annonce activee, en jours. */
const DUREE_JOURS = 30;

const SECTEURS = ['btp', 'commerce', 'transport', 'restauration', 'industrie', 'bureaux', 'services'] as const;

const creationInput = z.object({
  sector: z.enum(SECTEURS),
  title: z.string().trim().min(3).max(120),
  company: z.string().trim().max(120).optional(),
  contract: z.enum(['cdi', 'cdd', 'mission']).default('cdi'),
  salary: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2_000).optional(),
  /* Le telephone est le SEUL contact obligatoire : une annonce sans numero ne sert a personne,
   * un employeur sans Viber reste joignable. */
  phone: z.string().trim().min(6).max(30),
  whatsapp: z.string().trim().max(30).optional(),
  viber: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(160).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  wilaya: z.string().trim().max(60).optional(),
  paymentMethod: z.enum(['baridimob', 'virement', 'email']).optional(),
  paymentRef: z.string().trim().max(80).optional(),
});

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Les offres autour de moi.
   *
   * LE TRI SE FAIT EN BASE, PAS SUR LE TELEPHONE. PostGIS sait ordonner par distance en se
   * servant de l'index geographique ; rapatrier toutes les annonces du pays pour les trier
   * ensuite ferait passer des centaines de lignes sur une connexion mobile pour n'en afficher
   * que quelques-unes.
   *
   * La distance est renvoyee avec chaque offre : l'ecran l'affiche, et la recalculer cote
   * telephone donnerait un chiffre legerement different de celui qui a servi au tri.
   */
  app.get('/jobs', async (req) => {
    const q = req.query as { lat?: string; lon?: string; sector?: string };
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new HttpError(400, 'position_requise', 'Latitude et longitude sont necessaires.');
    }
    if (q.sector && !(SECTEURS as readonly string[]).includes(q.sector)) {
      throw new HttpError(400, 'secteur_invalide', `Secteur attendu : ${SECTEURS.join(', ')}.`);
    }

    const moi = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;
    const filtreSecteur = q.sector ? sql`AND sector = ${q.sector}` : sql``;

    const rows = await db.execute(sql`
      SELECT id, sector, title, company, contract, salary, description,
             phone, whatsapp, viber, email, wilaya,
             ST_Y(geom::geometry) AS lat,
             ST_X(geom::geometry) AS lon,
             ROUND(ST_Distance(geom, ${moi}))::int AS "distanceM",
             created_at AS "createdAt",
             expires_at AS "expiresAt"
      FROM job_offers
      WHERE status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
        AND ST_DWithin(geom, ${moi}, ${RAYON_M})
        ${filtreSecteur}
      ORDER BY ST_Distance(geom, ${moi})
      LIMIT 100
    `);
    return { items: rows, radiusM: RAYON_M };
  });

  /**
   * Publier une annonce. Elle n'est PAS visible avant d'avoir ete payee et activee.
   *
   * On le dit dans la reponse plutot que de laisser l'employeur le decouvrir : il vient de
   * remplir huit champs, il doit savoir immediatement ce qui lui reste a faire et combien.
   */
  app.post('/jobs', { preHandler: [app.requireDevice] }, async (req, reply) => {
    const input = parse(creationInput, req.body);

    const rows = (await db.execute(sql`
      INSERT INTO job_offers (
        sector, title, company, contract, salary, description,
        phone, whatsapp, viber, email, wilaya, geom,
        payment_method, payment_ref, created_by
      ) VALUES (
        ${input.sector}, ${input.title}, ${input.company ?? null}, ${input.contract},
        ${input.salary ?? null}, ${input.description ?? null},
        ${input.phone}, ${input.whatsapp ?? null}, ${input.viber ?? null}, ${input.email ?? null},
        ${input.wilaya ?? null},
        ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
        ${input.paymentMethod ?? null}, ${input.paymentRef ?? null}, ${req.deviceId!}
      )
      RETURNING id
    `)) as unknown as { id: string }[];

    return reply.code(201).send({
      id: rows[0]!.id,
      status: 'pending',
      priceDa: 1_500,
      durationDays: DUREE_JOURS,
    });
  });

  /** Mes annonces : un employeur doit pouvoir suivre ce qu'il a publie et son etat. */
  app.get('/jobs/mine', { preHandler: [app.requireDevice] }, async (req) => {
    const rows = await db.execute(sql`
      SELECT id, sector, title, status, created_at AS "createdAt", expires_at AS "expiresAt"
      FROM job_offers
      WHERE created_by = ${req.deviceId!}
      ORDER BY created_at DESC
      LIMIT 50
    `);
    return { items: rows };
  });

  /* ----------------------------------------------------------------- administration */

  /** Annonces en attente de verification du paiement. */
  app.get('/admin/jobs', { preHandler: [app.requireAdmin] }, async (req) => {
    const statut = (req.query as { status?: string }).status ?? 'pending';
    if (!['pending', 'active', 'rejected'].includes(statut)) {
      throw new HttpError(400, 'etat_invalide', 'Etat attendu : pending, active ou rejected.');
    }
    const rows = await db.execute(sql`
      SELECT j.id, j.sector, j.title, j.company, j.phone, j.wilaya, j.status,
             j.payment_method AS "paymentMethod", j.payment_ref AS "paymentRef",
             j.created_at AS "createdAt", j.expires_at AS "expiresAt",
             a.display_name AS "activatedByName"
      FROM job_offers j
      LEFT JOIN admins a ON a.id = j.activated_by
      WHERE j.status = ${statut}
      ORDER BY j.created_at DESC
      LIMIT 200
    `);
    return { items: rows };
  });

  /**
   * Activer une annonce dont le paiement est constate.
   *
   * C'EST ICI QUE LES TRENTE JOURS COMMENCENT, et non a la creation : une annonce payee trois
   * jours apres avoir ete redigee ne doit pas etre amputee de ces trois jours. L'employeur paie
   * trente jours de visibilite, il les obtient.
   */
  app.post<{ Params: { id: string } }>(
    '/admin/jobs/:id/activate',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const rows = (await db.execute(sql`
        UPDATE job_offers
        SET status = 'active',
            activated_by = ${req.admin!.id},
            activated_at = now(),
            expires_at = now() + ${`${DUREE_JOURS} days`}::interval
        WHERE id = ${req.params.id} AND status = 'pending'
        RETURNING id, expires_at AS "expiresAt"
      `)) as unknown as { id: string; expiresAt: string }[];
      if (rows.length === 0) throw notFound();
      return rows[0];
    },
  );

  /** Refuser une annonce : le versement n'est jamais arrive, ou l'annonce est irrecevable. */
  app.post<{ Params: { id: string } }>(
    '/admin/jobs/:id/reject',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const rows = (await db.execute(sql`
        UPDATE job_offers
        SET status = 'rejected', activated_by = ${req.admin!.id}, activated_at = now()
        WHERE id = ${req.params.id} AND status = 'pending'
        RETURNING id
      `)) as unknown as { id: string }[];
      if (rows.length === 0) throw notFound();
      return { ok: true };
    },
  );
};

export default routes;
