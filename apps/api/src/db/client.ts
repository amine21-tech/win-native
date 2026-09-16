import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from '../env.js';
import * as schema from './schema.js';

/**
 * Connexion unique, partagee par tout le processus.
 * `max` reste bas : le VPS heberge aussi Valhalla et Nginx.
 */
export const sqlClient = postgres(env.DATABASE_URL, {
  max: isProduction ? 12 : 4,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle(sqlClient, { schema });

export type Database = typeof db;

export async function closeDatabase(): Promise<void> {
  await sqlClient.end({ timeout: 5 });
}

/** Verifie que la base repond et que PostGIS est bien installe. */
export async function checkDatabase(): Promise<{ postgis: string }> {
  const rows = await sqlClient<{ version: string }[]>`SELECT PostGIS_Lib_Version() AS version`;
  return { postgis: rows[0]?.version ?? 'inconnue' };
}
