import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { env, isProduction } from './env.js';
import auth from './plugins/auth.js';
import errors from './plugins/errors.js';
import realtime from './realtime/index.js';
import adminRoutes from './routes/admin.js';
import contributionRoutes from './routes/contributions.js';
import adminStatsRoutes from './routes/adminStats.js';
import jobRoutes from './routes/jobs.js';
import alerteRoutes from './routes/alertesOfficielles.js';
import contributorCodeRoutes from './routes/contributorCodes.js';
import deviceRoutes from './routes/devices.js';
import geocodeRoutes from './routes/geocode.js';
import healthRoutes from './routes/health.js';
import partnerRoutes from './routes/partners.js';
import paymentRoutes from './routes/payments.js';
import placeRoutes from './routes/places.js';
import photoRoutes from './routes/photos.js';
import videoRoutes from './routes/videos.js';
import reportRoutes from './routes/reports.js';
import routingRoutes from './routes/routing.js';
import unlockRoutes from './routes/unlocks.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(isProduction
        ? {}
        : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }),
    },
    trustProxy: true,
    // Doit rester au-dessus de UPLOAD_MAX_BYTES (8 Mo par defaut) : ce plafond s'applique AVANT
    // le parsing multipart, donc une valeur plus basse rejette une photo de telephone pourtant
    // sous la limite annoncee — silencieusement du point de vue de l'app (voir formulaire
    // d'ajout de lieu, qui semblait "ne rien faire" a l'enregistrement).
    /* MONTE AVEC LA VIDEO (24 Mo par defaut) depuis le 24 novembre. Le commentaire ci-dessus
     * garde toute sa valeur : ce plafond s'applique AVANT le parsing multipart, donc une
     * valeur trop basse rejette un fichier pourtant sous la limite annoncee, et sans rien dire
     * du point de vue de l'application. Les deux megaoctets de rabiot couvrent les entetes
     * multipart et les champs du formulaire, qui comptent dans ce total. */
    bodyLimit: Math.max(env.UPLOAD_MAX_BYTES, env.VIDEO_MAX_BYTES) + 2 * 1024 * 1024,
  });

  await app.register(errors);

  await app.register(cors, {
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    // La cle est l'appareil quand il est identifie, sinon l'adresse IP : en
    // Algerie, beaucoup d'utilisateurs partagent la meme sortie operateur.
    keyGenerator: (req) => req.deviceId ?? req.ip,
  });

  /* LE PLAFOND GENERAL EST CELUI DE LA VIDEO, LE PLUS HAUT DES DEUX — et ce n'est pas un
   * relachement de la limite des photos : chaque route repasse la sienne a `req.file()`, qui
   * l'emporte sur celle-ci. routes/photos.ts borne donc toujours a `UPLOAD_MAX_BYTES`. Laisser
   * ici la valeur des photos aurait coupe toutes les videos avant meme d'atteindre leur
   * route. */
  await app.register(multipart, {
    limits: { fileSize: Math.max(env.UPLOAD_MAX_BYTES, env.VIDEO_MAX_BYTES), files: 1 },
  });

  await app.register(auth);
  await app.register(realtime);

  const uploadDir = resolve(env.UPLOAD_DIR);
  await mkdir(uploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
    maxAge: '30d',
    immutable: true,
  });

  await app.register(healthRoutes);
  await app.register(deviceRoutes);
  await app.register(placeRoutes);
  await app.register(reportRoutes);
  await app.register(contributionRoutes);
  await app.register(contributorCodeRoutes);
  await app.register(partnerRoutes);
  await app.register(photoRoutes);
  await app.register(videoRoutes);
  await app.register(routingRoutes);
  await app.register(geocodeRoutes);
  await app.register(adminRoutes);
  await app.register(adminStatsRoutes);
  await app.register(jobRoutes);
  await app.register(alerteRoutes);
  await app.register(paymentRoutes);
  await app.register(unlockRoutes);

  return app;
}
