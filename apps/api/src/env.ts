import { existsSync } from 'node:fs';
import { z } from 'zod';

// En developpement, un fichier .env a la racine du paquet est charge
// automatiquement. En production, les variables viennent de l'environnement
// du conteneur — jamais d'un fichier committe par erreur.
if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* Node < 21.7 : on continue avec l'environnement tel quel */
  }
}

/**
 * Toute la configuration passe par ici et est validee au demarrage.
 *
 * L'ancien backend lisait ses variables depuis l'environnement PM2, fige par
 * `pm2 save`. Un `pm2 delete` suivi d'un `pm2 start` sans variables les
 * perdait en silence. Ici, une variable manquante arrete le serveur avec un
 * message explicite plutot que de le laisser demarrer a moitie configure.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),

  /** Secret de signature des jetons appareil et administrateur. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caracteres'),

  /** Base publique servie au client pour construire les URL de photos. */
  PUBLIC_BASE_URL: z.string().url(),

  /** Dossier de stockage des photos (avant bascule vers un stockage objet). */
  UPLOAD_DIR: z.string().default('./data/uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().default(8 * 1024 * 1024),

  /** Base Valhalla. Le conteneur existant reste inchange. */
  VALHALLA_URL: z.string().url().default('http://127.0.0.1:8002'),

  /**
   * Second moteur Valhalla, dedie a l'Europe (France). Facultatif : sans lui, tout passe par
   * le moteur historique, exactement comme avant. Voir routes/routing.ts.
   */
  VALHALLA_EU_URL: z.string().url().optional(),

  /**
   * Code du service VIP (ajout d'un lieu comme partenaire VIP). Modifiable sur le serveur sans
   * republier l'application : il suffit de changer la variable et de redemarrer l'API.
   */
  VIP_CODE: z.string().min(4).default('0000'),

  /** Origines autorisees, separees par des virgules. `*` en developpement. */
  CORS_ORIGINS: z.string().default('*'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')} : ${i.message}`)
    .join('\n');
  console.error(`Configuration invalide, le serveur ne peut pas demarrer :\n${details}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
