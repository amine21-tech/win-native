/**
 * Applique les fichiers SQL de db/migrations dans l'ordre alphabetique et
 * garde trace de ceux deja passes.
 *
 * Choix volontaire d'un runner maison plutot que drizzle-kit : le schema
 * contient des extensions, des fonctions IMMUTABLE et des index GiST que les
 * generateurs automatiques rendent mal. Ici, ce qui est ecrit est ce qui part
 * en base.
 *
 *   npm run db:push
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqlClient } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Le dossier des migrations ne se trouve pas au meme endroit selon qu'on
 * execute les sources (src/db/) ou le build (dist/src/db/). On essaie les deux
 * plutot que de supposer, sinon la migration echoue en production alors
 * qu'elle passait en developpement.
 */
function findMigrationsDir(): string {
  const candidates = [
    join(here, '..', '..', 'db', 'migrations'),
    join(here, '..', '..', '..', 'db', 'migrations'),
    join(process.cwd(), 'db', 'migrations'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error(`Dossier db/migrations introuvable. Cherche dans :\n  ${candidates.join('\n  ')}`);
    process.exit(1);
  }
  return found;
}

const migrationsDir = findMigrationsDir();

async function run(): Promise<void> {
  await sqlClient`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;

  const applied = new Set(
    (await sqlClient<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name),
  );

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  =  ${file} (deja appliquee)`);
      continue;
    }
    const content = await readFile(join(migrationsDir, file), 'utf8');
    console.log(`  +  ${file}`);
    await sqlClient.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
    count += 1;
  }

  console.log(
    count === 0 ? 'Schema deja a jour.' : `${count} migration(s) appliquee(s).`,
  );
  await sqlClient.end();
}

run().catch(async (error: unknown) => {
  console.error('Migration interrompue :', error);
  await sqlClient.end({ timeout: 2 }).catch(() => {});
  process.exit(1);
});
