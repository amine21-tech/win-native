import fastifyJwt from '@fastify/jwt';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { db } from '../db/client.js';
import { env } from '../env.js';

/**
 * Deux identites coexistent :
 *
 *  - l'appareil, anonyme, obtenu a l'inscription et conserve dans le stockage
 *    local de l'application. Il remplace la cle `win_uid` de la v83, qui etait
 *    en clair et pouvait donc etre recopiee pour voter plusieurs fois ;
 *  - l'administrateur, qui se connecte avec un vrai compte. Il remplace le
 *    code `1154` ecrit en dur dans index.html — donc lisible par quiconque
 *    ouvrait le code source de la page.
 */
export type DeviceClaims = { sub: string; kind: 'device' };
export type AdminClaims = { sub: string; kind: 'admin'; role: 'moderator' | 'admin' };
export type Claims = DeviceClaims | AdminClaims;

declare module 'fastify' {
  interface FastifyRequest {
    deviceId?: string;
    admin?: { id: string; role: 'moderator' | 'admin' };
  }
  interface FastifyInstance {
    /** Exige un jeton appareil valide. */
    requireDevice: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Exige un jeton administrateur valide. */
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Lit le jeton s'il est present, sans jamais refuser la requete. */
    optionalDevice: (req: FastifyRequest) => Promise<void>;
    signDeviceToken: (deviceId: string) => string;
    signAdminToken: (adminId: string, role: 'moderator' | 'admin') => string;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256' },
  });

  app.decorate('signDeviceToken', (deviceId: string) =>
    app.jwt.sign({ sub: deviceId, kind: 'device' } satisfies DeviceClaims, { expiresIn: '400d' }),
  );

  app.decorate('signAdminToken', (adminId: string, role: 'moderator' | 'admin') =>
    app.jwt.sign({ sub: adminId, kind: 'admin', role } satisfies AdminClaims, {
      expiresIn: '12h',
    }),
  );

  app.decorate('requireDevice', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const claims = await req.jwtVerify<Claims>();
      if (claims.kind !== 'device') throw new Error('mauvais type de jeton');
      req.deviceId = claims.sub;

      // La ligne `devices` est recreee si elle a disparu.
      //
      // Un jeton d'appareil est signe pour 400 jours. Entre-temps la base peut avoir ete
      // remigree, ou l'appareil purge : le jeton reste alors parfaitement valide, mais
      // chaque contribution qui le reference (places.created_by, place_photos.uploaded_by,
      // contributors.device_id) violait une cle etrangere et repondait 500.
      //
      // Une insertion idempotente suffit a fermer definitivement cette classe de panne. La
      // plateforme n'est pas connue a cet instant — le jeton ne la porte pas — d'ou la
      // valeur de repli : c'est une REPARATION, pas une inscription, et elle ne sert qu'a
      // satisfaire la contrainte. Le cout est une recherche sur cle primaire qui n'ecrit
      // rien dans le cas normal.
      await db.execute(sql`
        INSERT INTO devices (id, platform) VALUES (${claims.sub}, 'android')
        ON CONFLICT (id) DO NOTHING
      `);
    } catch {
      await reply
        .code(401)
        .send({ error: 'device_token_requis', message: "Appareil non identifie." });
    }
  });

  app.decorate('optionalDevice', async (req: FastifyRequest) => {
    try {
      const claims = await req.jwtVerify<Claims>();
      if (claims.kind === 'device') req.deviceId = claims.sub;
    } catch {
      /* requete anonyme : on continue */
    }
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const claims = await req.jwtVerify<Claims>();
      if (claims.kind !== 'admin') throw new Error('mauvais type de jeton');
      req.admin = { id: claims.sub, role: claims.role };
    } catch {
      await reply
        .code(401)
        .send({ error: 'admin_token_requis', message: 'Connexion administrateur requise.' });
    }
  });
};

export default fp(plugin, { name: 'win-auth' });
