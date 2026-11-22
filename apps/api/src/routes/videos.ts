import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { badRequest } from '../lib/http.js';

/**
 * ENVOI DE LA VIDEO DE PRESENTATION D'UNE FICHE VIP — document du 24 novembre, priorite 2.
 *
 *   « 1 VIDEO 30 SECONDES MAX — enregistree en direct OU importee depuis la galerie. »
 *
 * LE JUMEAU DE routes/photos.ts, ET VOLONTAIREMENT SON JUMEAU : meme stockage disque, meme
 * decoupage en sous-dossiers, meme table en attente de rattachement. Ce qui vaut pour les
 * photos vaudra pour les videos le jour du passage a un stockage objet — un seul fichier a
 * reprendre de chaque cote, et le reste de l'API ne manipule que des cles de stockage.
 *
 * TROIS DIFFERENCES, ET ELLES ONT TOUTES UNE RAISON.
 *
 * 1. AUCUN RE-ENCODAGE. Les photos passent par `sharp`, qui les redimensionne et fabrique une
 *    vignette. L'equivalent pour une video serait ffmpeg : un binaire de cent megaoctets sur le
 *    VPS, plusieurs secondes de calcul par envoi, et un service qui tombe quand deux partenaires
 *    s'inscrivent en meme temps. On stocke donc le fichier tel que le telephone l'a produit.
 *    C'est la DUREE qui est bornee — a la prise de vue, par l'application — et le POIDS, ici.
 *
 * 2. UNE LIMITE DE TAILLE A ELLE (`VIDEO_MAX_BYTES`). Trente secondes filmees par un telephone
 *    recent pesent entre cinq et vingt megaoctets selon la definition. La limite des photos
 *    (8 Mo) refuserait la moitie des videos legitimes ; l'elever pour tout le monde ferait
 *    entrer des photos de 24 Mo qui n'ont aucune raison d'exister.
 *
 * 3. PAS DE VIGNETTE. La fiche affiche la premiere image de la video, que le lecteur extrait
 *    lui-meme. Fabriquer un fichier de plus pour la meme information demanderait, encore,
 *    ffmpeg.
 *
 * CE QUI EST REFUSE L'EST AVANT LA LECTURE DU FICHIER : un type qui n'est pas `video/*` ne
 * doit pas etre charge en memoire pour qu'on s'en apercoive ensuite.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.post('/videos', { preHandler: [app.requireDevice] }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: env.VIDEO_MAX_BYTES } });
    if (!file) throw badRequest('fichier_manquant', 'Aucune video recue.');
    if (!file.mimetype.startsWith('video/')) {
      throw badRequest('type_invalide', 'Le fichier envoye n’est pas une video.');
    }

    const buffer = await file.toBuffer();
    /* `truncated` est le SEUL signe qu'un fichier trop lourd a ete coupe : `toBuffer()` rend
     * sans erreur ce qu'il a pu lire. Sans ce test, on enregistrerait une video tronquee,
     * illisible, et le partenaire ne le decouvrirait qu'en regardant sa propre fiche. */
    if (file.file.truncated) {
      throw badRequest(
        'video_trop_lourde',
        `La video depasse ${Math.round(env.VIDEO_MAX_BYTES / (1024 * 1024))} Mo.`,
      );
    }

    /* L'extension vient du type MIME et non du nom de fichier envoye par le telephone : un nom
     * est choisi par le client, donc il peut contenir n'importe quoi — y compris des `..` ou
     * une seconde extension. Ici, trois valeurs possibles et aucune autre. */
    const ext = file.mimetype.includes('quicktime') ? 'mov' : file.mimetype.includes('webm') ? 'webm' : 'mp4';

    const id = randomUUID();
    const dir = join(env.UPLOAD_DIR, id.slice(0, 2));
    await mkdir(dir, { recursive: true });
    const storageKey = join(id.slice(0, 2), `${id}.${ext}`);
    await writeFile(join(env.UPLOAD_DIR, storageKey), buffer);

    /* Duree annoncee par le telephone, quand il la connait. Jamais crue sur parole : elle est
     * bornee ici comme elle l'est a la prise de vue, et un champ absent ou aberrant devient
     * NULL plutot que de faire echouer un envoi par ailleurs valable. */
    const dureeBrute = Number((file.fields?.duree as { value?: string } | undefined)?.value);
    const duree = Number.isFinite(dureeBrute) && dureeBrute > 0 && dureeBrute <= 600 ? dureeBrute : null;

    await db.execute(sql`
      INSERT INTO place_videos (id, storage_key, bytes, duree_s, uploaded_by)
      VALUES (${id}, ${storageKey.replace(/\\/g, '/')}, ${buffer.byteLength}, ${duree}, ${req.deviceId!})
    `);

    return reply.code(201).send({
      id,
      url: `${env.PUBLIC_BASE_URL}/uploads/${storageKey.replace(/\\/g, '/')}`,
    });
  });
};

export default routes;
