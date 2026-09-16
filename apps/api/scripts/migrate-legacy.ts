/**
 * Migration des donnees de l'ancien backend (fichiers JSON) vers PostGIS.
 *
 *   npm run migrate:legacy -- --source ../../legacy-data
 *   npm run migrate:legacy -- --source ... --dry-run
 *
 * Le script est rejouable : chaque enregistrement importe garde son
 * identifiant d'origine dans la colonne `legacy_id`, et un second passage ne
 * cree pas de doublon. Lancez-le d'abord en --dry-run et lisez le rapport :
 * on ne bascule que lorsque les compteurs correspondent.
 *
 * Source attendue : une copie de ~/winbackend/data/db/ prise sur le VPS.
 * Attention, la copie presente dans Downloads date du 9 aout et ne contient
 * pas tout ce que la production a enregistre depuis.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { sqlClient } from '../src/db/client.js';

const { values } = parseArgs({
  options: {
    source: { type: 'string', default: './legacy-data' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const SOURCE = values.source!;
const DRY = values['dry-run']!;

type Row = Record<string, unknown>;

const report: { fichier: string; lus: number; importes: number; ignores: string[] }[] = [];

async function readJson(name: string): Promise<Row[]> {
  try {
    const raw = await readFile(join(SOURCE, name), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`  !  ${name} absent, ignore.`);
      return [];
    }
    throw error;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};
/** Les JSON melangent lat/lon, latitude/longitude et coords imbriquees. */
function coords(row: Row): { lat: number; lon: number } | null {
  const nested = (row.coords ?? row.position ?? {}) as Row;
  const lat = num(row.lat ?? row.latitude ?? nested.lat ?? nested.latitude);
  const lon = num(row.lon ?? row.lng ?? row.longitude ?? nested.lon ?? nested.lng);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}
const when = (v: unknown): string | null => {
  if (typeof v === 'number') return new Date(v).toISOString();
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

/** Retrouve ou cree l'appareil correspondant a un ancien win_uid. */
async function deviceFor(legacyUid: unknown): Promise<string | null> {
  const uid = str(legacyUid);
  if (!uid) return null;
  const rows = await sqlClient<{ id: string }[]>`
    INSERT INTO devices (platform, legacy_uid)
    VALUES ('web', ${uid})
    ON CONFLICT (legacy_uid) DO UPDATE SET last_seen_at = devices.last_seen_at
    RETURNING id`;
  return rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------ */

async function migratePlaces(): Promise<void> {
  const rows = await readJson('addresses.json');
  const ignores: string[] = [];
  let importes = 0;

  for (const row of rows) {
    const legacyId = str(row.id) ?? str(row._id);
    const point = coords(row);
    const name = str(row.name) ?? str(row.nom) ?? str(row.enseigne);

    if (!legacyId) { ignores.push('enregistrement sans identifiant'); continue; }
    if (!point) { ignores.push(`${legacyId} : coordonnees absentes ou hors bornes`); continue; }
    if (!name) { ignores.push(`${legacyId} : nom vide`); continue; }

    if (DRY) { importes += 1; continue; }

    const deviceId = await deviceFor(row.uid ?? row.deviceId ?? row.author);
    await sqlClient`
      INSERT INTO places (name, category, geom, house_number, street, city, postal_code,
                          wilaya, country, phone_fixe, phone_mobile, whatsapp, email,
                          enseigne, promo, created_by, legacy_id, created_at)
      VALUES (${name},
              ${str(row.cat) ?? str(row.category) ?? 'autre'},
              ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography,
              ${str(row.houseNum) ?? str(row.numero)}, ${str(row.street) ?? str(row.rue)},
              ${str(row.city) ?? str(row.ville)}, ${str(row.postal) ?? str(row.cp)},
              ${str(row.wilaya)}, ${str(row.country) ?? 'DZ'},
              ${str(row.phoneFixe) ?? str(row.tel)}, ${str(row.phoneMobile) ?? str(row.mobile)},
              ${str(row.wa) ?? str(row.whatsapp)}, ${str(row.email)},
              ${str(row.enseigne)}, ${str(row.promo)},
              ${deviceId}, ${legacyId}, ${when(row.createdAt ?? row.date ?? row.ts) ?? new Date().toISOString()})
      ON CONFLICT (legacy_id) DO NOTHING`;
    importes += 1;
  }

  report.push({ fichier: 'addresses.json', lus: rows.length, importes, ignores });
}

async function migrateReports(): Promise<void> {
  const rows = await readJson('signalements-permanents.json');
  const ignores: string[] = [];
  let importes = 0;

  // Correspondance entre les libelles de la v82 et les types normalises.
  const kindMap: Record<string, string> = {
    radar: 'radar',
    dosdane: 'bump',
    'dos-dane': 'bump',
    bump: 'bump',
    ralentisseur: 'bump',
    trou: 'pothole',
    pothole: 'pothole',
    nidpoule: 'pothole',
  };

  for (const row of rows) {
    const legacyId = str(row.id) ?? str(row.ts);
    const point = coords(row);
    const raw = (str(row.type) ?? str(row.kind) ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const kind = kindMap[raw];

    if (!legacyId) { ignores.push('signalement sans identifiant'); continue; }
    if (!point) { ignores.push(`${legacyId} : coordonnees absentes`); continue; }
    if (!kind) { ignores.push(`${legacyId} : type inconnu « ${raw} »`); continue; }

    if (DRY) { importes += 1; continue; }

    const deviceId = await deviceFor(row.uid ?? row.deviceId);
    await sqlClient`
      INSERT INTO reports (kind, permanent, geom, heading, speed_limit, created_by,
                           legacy_id, created_at)
      VALUES (${kind}, true,
              ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography,
              ${num(row.heading ?? row.cap)}, ${num(row.limite ?? row.speedLimit)},
              ${deviceId}, ${legacyId},
              ${when(row.createdAt ?? row.ts ?? row.date) ?? new Date().toISOString()})
      ON CONFLICT (legacy_id) DO NOTHING`;
    importes += 1;
  }

  report.push({ fichier: 'signalements-permanents.json', lus: rows.length, importes, ignores });
}

async function migrateSimple(
  file: string,
  handler: (row: Row, legacyId: string) => Promise<void>,
): Promise<void> {
  const rows = await readJson(file);
  const ignores: string[] = [];
  let importes = 0;

  for (const [index, row] of rows.entries()) {
    const legacyId = str(row.id) ?? str(row.ts) ?? `${file}#${index}`;
    try {
      if (!DRY) await handler(row, legacyId);
      importes += 1;
    } catch (error) {
      ignores.push(`${legacyId} : ${(error as Error).message}`);
    }
  }

  report.push({ fichier: file, lus: rows.length, importes, ignores });
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log(`\nSource : ${SOURCE}`);
  console.log(DRY ? 'Mode essai — aucune ecriture en base.\n' : 'Mode reel — ecriture en base.\n');

  await migratePlaces();
  await migrateReports();

  await migrateSimple('address-corrections.json', async (row, legacyId) => {
    const deviceId = await deviceFor(row.uid ?? row.deviceId);
    const point = coords(row);
    await sqlClient`
      INSERT INTO corrections (message, payload, geom, status, device_id, legacy_id, created_at)
      VALUES (${str(row.message) ?? str(row.texte) ?? '(message vide)'},
              ${sqlClient.json(row as never)},
              ${point ? sqlClient`ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography` : null},
              ${str(row.status) ?? 'pending'}, ${deviceId}, ${legacyId},
              ${when(row.createdAt ?? row.ts) ?? new Date().toISOString()})
      ON CONFLICT (legacy_id) DO NOTHING`;
  });

  await migrateSimple('partner-suggestions.json', async (row, legacyId) => {
    const deviceId = await deviceFor(row.uid ?? row.deviceId);
    await sqlClient`
      INSERT INTO partner_leads (name, phone, email, city, message, device_id, legacy_id, created_at)
      VALUES (${str(row.name) ?? str(row.nom) ?? '(sans nom)'},
              ${str(row.phone) ?? str(row.tel)}, ${str(row.email)},
              ${str(row.city) ?? str(row.ville)}, ${str(row.message)},
              ${deviceId}, ${legacyId},
              ${when(row.createdAt ?? row.ts) ?? new Date().toISOString()})
      ON CONFLICT (legacy_id) DO NOTHING`;
  });

  await migrateSimple('partners.json', async (row, legacyId) => {
    await sqlClient`
      INSERT INTO partners (name, tier, phone, email, legacy_id)
      VALUES (${str(row.name) ?? '(sans nom)'}, ${str(row.tier) ?? 'standard'},
              ${str(row.phone) ?? str(row.tel)}, ${str(row.email)}, ${legacyId})
      ON CONFLICT (legacy_id) DO NOTHING`;
  });

  await migrateSimple('contributors.json', async (row) => {
    const deviceId = await deviceFor(row.uid ?? row.id);
    if (!deviceId) throw new Error('identifiant contributeur absent');
    await sqlClient`
      INSERT INTO contributors (device_id, places_count, reports_count, confirms_count, score)
      VALUES (${deviceId}, ${num(row.adresses ?? row.places) ?? 0},
              ${num(row.alertes ?? row.reports) ?? 0},
              ${num(row.confirmations ?? row.confirms) ?? 0},
              ${num(row.score) ?? 0})
      ON CONFLICT (device_id) DO UPDATE
        SET places_count   = EXCLUDED.places_count,
            reports_count  = EXCLUDED.reports_count,
            confirms_count = EXCLUDED.confirms_count,
            score          = EXCLUDED.score`;
  });

  /* ---------------------------- rapport ---------------------------- */

  console.log('\n  Fichier                          Lus   Importes   Ignores');
  console.log('  ' + '-'.repeat(60));
  let totalIgnores = 0;
  for (const line of report) {
    totalIgnores += line.ignores.length;
    console.log(
      `  ${line.fichier.padEnd(32)}${String(line.lus).padStart(4)}${String(line.importes).padStart(11)}${String(line.ignores.length).padStart(10)}`,
    );
  }

  if (totalIgnores > 0) {
    console.log('\n  Enregistrements ignores :');
    for (const line of report) {
      for (const reason of line.ignores.slice(0, 20)) {
        console.log(`    ${line.fichier} — ${reason}`);
      }
      if (line.ignores.length > 20) {
        console.log(`    ${line.fichier} — ... et ${line.ignores.length - 20} autres`);
      }
    }
  }

  console.log(
    DRY
      ? '\nEssai termine. Relancez sans --dry-run quand le rapport est propre.\n'
      : '\nMigration terminee.\n',
  );

  await sqlClient.end();
}

main().catch(async (error: unknown) => {
  console.error('\nMigration interrompue :', error);
  await sqlClient.end({ timeout: 2 }).catch(() => {});
  process.exit(1);
});
