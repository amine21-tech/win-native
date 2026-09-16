import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import sharp from 'sharp';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { badRequest } from '../lib/http.js';

/**
 * Envoi des photos de lieux.
 *
 * Deux differences avec la v83 : la photo arrive en multipart plutot qu'en
 * base64 dans le corps JSON (la limite de 15 Mo d'Express etait atteinte par
 * les photos de telephones recents), et une vignette est produite a l'envoi
 * pour que la liste de resultats ne telecharge pas des images pleine taille.
 *
 * Le stockage disque reste volontairement simple. Le passage a un stockage
 * objet ne changera que ce fichier : le reste de l'API ne manipule que des
 * cles de stockage.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.post('/photos', { preHandler: [app.requireDevice] }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: env.UPLOAD_MAX_BYTES } });
    if (!file) throw badRequest('fichier_manquant', 'Aucune image recue.');
    if (!file.mimetype.startsWith('image/')) {
      throw badRequest('type_invalide', 'Le fichier envoye n’est pas une image.');
    }

    const buffer = await file.toBuffer();
    const id = randomUUID();
    const dir = join(env.UPLOAD_DIR, id.slice(0, 2));
    await mkdir(dir, { recursive: true });

    const image = sharp(buffer).rotate();
    const meta = await image.metadata();

    const full = await image
      .clone()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const thumb = await image
      .clone()
      .resize({ width: 320, height: 320, fit: 'cover' })
      .jpeg({ quality: 74, mozjpeg: true })
      .toBuffer();

    const storageKey = join(id.slice(0, 2), `${id}.jpg`);
    const thumbKey = join(id.slice(0, 2), `${id}_t.jpg`);
    await writeFile(join(env.UPLOAD_DIR, storageKey), full);
    await writeFile(join(env.UPLOAD_DIR, thumbKey), thumb);

    // La photo est enregistree sans lieu : elle sera rattachee au moment de
    // l'enregistrement du formulaire, ce qui evite de creer un lieu a moitie
    // saisi si l'utilisateur abandonne.
    await db.execute(sql`
      INSERT INTO place_photos (id, storage_key, thumb_key, width, height, bytes, uploaded_by)
      VALUES (${id}, ${storageKey.replace(/\\/g, '/')}, ${thumbKey.replace(/\\/g, '/')},
              ${meta.width ?? null}, ${meta.height ?? null}, ${full.byteLength}, ${req.deviceId!})
    `);

    return reply.code(201).send({
      id,
      url: `${env.PUBLIC_BASE_URL}/uploads/${storageKey.replace(/\\/g, '/')}`,
      thumbUrl: `${env.PUBLIC_BASE_URL}/uploads/${thumbKey.replace(/\\/g, '/')}`,
    });
  });
};

export default routes;
