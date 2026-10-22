import argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { adminLoginInput } from '@win/shared';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { HttpError, notFound, parse } from '../lib/http.js';

/**
 * Les etats qu'un ecran peut demander. `handled` n'existe pas en base : c'est le raccourci
 * pour << tout ce qui a ete classe >>, accepte comme refuse.
 *
 * POURQUOI UNE LISTE FERMEE. Le parametre venait de la requete et partait tel quel dans le
 * SQL. Il etait passe en PARAMETRE, donc rien d'injectable — mais une valeur fantaisiste
 * renvoyait une liste vide, soit exactement l'apparence de << il n'y a rien a traiter >>. Un
 * etat inconnu doit etre refuse, pas confondu avec le vide.
 */
const ETATS_CORRECTION = ['pending', 'accepted', 'rejected', 'handled'] as const;

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

  /**
   * Corrections d'adresse.
   *
   * `reviewedAt` et `reviewedByName` ne sont pas decoratifs : apres avoir classe une remarque,
   * l'administrateur n'avait AUCUN moyen de revoir ce qu'il avait fait — la ligne disparaissait
   * et c'etait tout. Le client l'a rapporte comme << rien ne s'est passe >> alors que ses cinq
   * clics avaient bien ete enregistres. Qui a classe quoi, et quand, est ce qui transforme une
   * liste qui se vide en un travail dont on garde la trace.
   */
  app.get('/admin/corrections', { preHandler: [app.requireAdmin] }, async (req) => {
    const demande = (req.query as { status?: string }).status ?? 'pending';
    if (!(ETATS_CORRECTION as readonly string[]).includes(demande)) {
      throw new HttpError(
        400,
        'etat_invalide',
        `Etat attendu : ${ETATS_CORRECTION.join(', ')}.`,
      );
    }

    const filtre =
      demande === 'handled'
        ? sql`c.status IN ('accepted', 'rejected')`
        : sql`c.status = ${demande}`;

    /* Les remarques classees se relisent par date de TRAITEMENT, les autres par date d'arrivee :
     * on cherche << qu'ai-je fait recemment >> dans un cas, << qu'est-ce qui attend >> dans
     * l'autre. */
    const ordre =
      demande === 'pending' ? sql`c.created_at DESC` : sql`c.reviewed_at DESC NULLS LAST`;

    const rows = await db.execute(sql`
      SELECT c.id, c.message, c.payload, c.status, c.created_at AS "createdAt",
             c.place_id AS "placeId", p.name AS "placeName",
             c.reviewed_at AS "reviewedAt", a.display_name AS "reviewedByName",
             ST_Y(c.geom::geometry) AS lat, ST_X(c.geom::geometry) AS lon
      FROM corrections c
      LEFT JOIN places p ON p.id = c.place_id
      LEFT JOIN admins a ON a.id = c.reviewed_by
      WHERE ${filtre}
      ORDER BY ${ordre}
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

  /**
   * Photos signalees comme incorrectes.
   *
   * Chaque ligne porte l'adresse de la photo visee : le moderateur doit la VOIR pour trancher,
   * et aller la chercher ailleurs rendrait le traitement inutilisable. Les signalements d'une
   * meme photo sont regroupes, avec leur nombre : trois personnes qui signalent la meme image
   * ne font pas trois dossiers.
   */
  app.get('/admin/photo-reports', { preHandler: [app.requireAdmin] }, async (req) => {
    const status = (req.query as { status?: string }).status ?? 'pending';
    const rows = await db.execute(sql`
      SELECT r.photo_id                         AS "photoId",
             r.place_id                         AS "placeId",
             p.name                             AS "placeName",
             ${env.PUBLIC_BASE_URL} || '/uploads/' || f.storage_key AS "photoUrl",
             count(*)::int                      AS "reportCount",
             min(r.created_at)                  AS "firstAt",
             max(r.created_at)                  AS "lastAt",
             array_agg(DISTINCT r.reason)       AS reasons,
             array_remove(array_agg(r.message), NULL) AS messages
      FROM photo_reports r
      JOIN place_photos f ON f.id = r.photo_id
      LEFT JOIN places p  ON p.id = r.place_id
      WHERE r.status = ${status}
      GROUP BY r.photo_id, r.place_id, p.name, f.storage_key
      ORDER BY max(r.created_at) DESC
      LIMIT 200
    `);
    return { items: rows };
  });

  /**
   * Decision du moderateur sur une photo signalee.
   *
   * `accepted` veut dire « le signalement est fonde » : la photo est alors RETIREE du lieu. Les
   * signalements qui la visaient disparaissent avec elle, par cascade — ils n'ont plus d'objet.
   * `rejected` conserve la photo et clot les signalements, de sorte qu'ils ne reviennent pas
   * encombrer la liste a chaque ouverture.
   */
  app.post<{ Params: { photoId: string }; Body: { status: 'accepted' | 'rejected' } }>(
    '/admin/photo-reports/:photoId/status',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const status = req.body?.status;
      if (status !== 'accepted' && status !== 'rejected') {
        throw new HttpError(400, 'statut_invalide', 'Statut attendu : accepted ou rejected.');
      }

      const rows = (await db.execute(sql`
        UPDATE photo_reports
        SET status = ${status}, handled_by = ${req.admin!.id}
        WHERE photo_id = ${req.params.photoId} AND status = 'pending'
        RETURNING id
      `)) as unknown as { id: string }[];
      if (rows.length === 0) throw notFound();

      if (status === 'accepted') {
        await db.execute(sql`DELETE FROM place_photos WHERE id = ${req.params.photoId}`);
        await db.execute(sql`
          INSERT INTO moderation_log (entity_type, entity_id, action, admin_id)
          VALUES ('photo', ${req.params.photoId}, 'delete', ${req.admin!.id})
        `);
      }
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
      /* TOUTES les suppressions se restaurent, pas seulement celles des moderateurs.
       *
       * Ce filtre ne retenait que `action = 'delete'`, le retrait fait depuis l'administration.
       * Les retraits faits depuis l'application portaient deja un autre nom et n'etaient donc
       * PAS restaurables — un angle mort sans gravite tant que seul l'auteur pouvait supprimer,
       * et qui devient le filet de securite principal depuis que tout le monde le peut. */
      const rows = (await db.execute(sql`
        SELECT entity_type AS "entityType", entity_id AS "entityId"
        FROM moderation_log
        WHERE id = ${req.params.id}
          AND action IN ('delete', 'author_delete', 'user_delete', 'contributor_delete')
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
