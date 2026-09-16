import { createAdapter } from '@socket.io/redis-adapter';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import { realtimeCellsAround, type RealtimeEvent } from '@win/shared';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketServer;
    /** Diffuse un evenement aux seuls appareils situes autour du point. */
    broadcastAround: (lat: number, lon: number, event: RealtimeEvent) => void;
  }
}

/**
 * Diffusion temps reel des signalements.
 *
 * La v83 envoyait chaque alerte a tous les clients connectes. Ici, la carte est
 * decoupee en cellules de 0,1 degre et un appareil ne recoit que ce qui se
 * passe dans les neuf cellules autour de lui. A l'echelle du pays, cela evite
 * qu'un utilisateur d'Oran soit reveille par un dos d'ane a Annaba.
 */
const plugin: FastifyPluginAsync = async (app) => {
  const io = new SocketServer(app.server, {
    cors: { origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',') },
    path: '/socket.io/',
    serveClient: false,
  });

  // L'adaptateur Redis permet de faire tourner plusieurs processus API
  // derriere Nginx sans perdre la diffusion entre eux.
  const pub = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  const sub = pub.duplicate();
  try {
    await pub.connect();
    await sub.connect();
    io.adapter(createAdapter(pub, sub));
    app.log.info('Temps reel : adaptateur Redis actif.');
  } catch (error) {
    app.log.warn({ err: error }, 'Redis indisponible, diffusion limitee a ce processus.');
  }

  io.on('connection', (socket) => {
    // L'application envoie sa position a chaque deplacement notable ;
    // le serveur ajuste les cellules auxquelles elle est abonnee.
    socket.on('subscribe', (payload: { lat?: number; lon?: number; radius?: number }) => {
      const { lat, lon, radius } = payload ?? {};
      if (typeof lat !== 'number' || typeof lon !== 'number') return;

      for (const room of socket.rooms) {
        if (room.startsWith('cell:')) void socket.leave(room);
      }
      for (const cell of realtimeCellsAround(lat, lon, radius)) {
        void socket.join(cell);
      }
    });

    socket.on('disconnect', () => {
      /* rien a nettoyer : socket.io retire le socket de ses salles */
    });
  });

  app.decorate('io', io);
  app.decorate('broadcastAround', (lat: number, lon: number, event: RealtimeEvent) => {
    for (const cell of realtimeCellsAround(lat, lon, 0)) {
      io.to(cell).emit(event.type, event);
    }
  });

  app.addHook('onClose', async () => {
    await io.close();
    pub.disconnect();
    sub.disconnect();
  });
};

export default fp(plugin, { name: 'win-realtime' });
