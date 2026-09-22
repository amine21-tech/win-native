import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  checkDuplicateQuery,
  createPlaceInput,
  DUPLICATE_RADIUS_M,
  searchPlacesQuery,
  updatePlaceInput,
  vipCheckInput,
} from '@win/shared';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db/client.js';
import { env } from '../env.js';
import { conflict, HttpError, notFound, parse } from '../lib/http.js';
import { fetchLegacyAddresses, mergeLegacyAddresses, type SearchedPlace } from '../lib/legacyAddresses.js';

/** Colonnes renvoyees a l'application, photos comprises. */
const placeColumns = sql`
  p.id,
  p.name,
  p.category,
  ST_Y(p.geom::geometry)          AS lat,
  ST_X(p.geom::geometry)          AS lon,
  p.house_number                  AS "houseNumber",
  p.street,
  p.city,
  p.postal_code                   AS "postalCode",
  p.wilaya,
  p.country,
  p.phone_fixe                    AS "phoneFixe",
  p.phone_mobile                  AS "phoneMobile",
  p.whatsapp,
  p.email,
  p.enseigne,
  p.promo,
  p.is_partner                    AS "isPartner",
  p.created_at                    AS "createdAt",
  p.updated_at                    AS "updatedAt",
  COALESCE(ph.photos, '[]'::json) AS photos
`;

/**
 * Photos d'un lieu, en ADRESSES COMPLETES.
 *
 * Elles etaient renvoyees sous forme de cles de stockage (`storageKey`), alors que
 * l'application — et le schema partage — attendent `url` et `thumbUrl`. Elle ne trouvait donc
 * rien a afficher : la photo ajoutee par un contributeur etait bien enregistree, bien servie
 * par le serveur, mais jamais montree dans la fiche du lieu. C'est le meme calcul que dans
 * routes/photos.ts, au moment de l'envoi.
 */
const photosJoin = sql`
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'id', f.id,
               'url', ${env.PUBLIC_BASE_URL} || '/uploads/' || f.storage_key,
               'thumbUrl', CASE
                             WHEN f.thumb_key IS NULL THEN NULL
                             ELSE ${env.PUBLIC_BASE_URL} || '/uploads/' || f.thumb_key
                           END,
               'credit', f.credit,
               'position', f.position
             ) ORDER BY f.position
           ) AS photos
    FROM place_photos f
    WHERE f.place_id = p.id
  ) ph ON true
`;

/** Mots vides ignores : ils apparaissent dans presque tous les noms et ne distinguent rien. */
const STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'el', 'al', 'the', 'of', 'and', 'et']);

function normalizeText(txt: string): string {
  return txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Mots significatifs de la saisie (au moins 3 lettres, hors mots vides), 5 au plus. */
function searchWords(q: string): string[] {
  const words = normalizeText(q)
    .split(/[\s,;.'’-]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 5);
}

/**
 * Categories WIN evoquees par la saisie, dans les quatre langues.
 * Seules des expressions sans ambiguite sont reconnues : « salle » seul ne veut pas dire sport
 * (salle des fetes, salle de soins), « salle de sport » si.
 */
const CATEGORY_WORDS: Record<string, string[]> = {
  sport: ['salle de sport', 'salle de gym', 'sport', 'gym', 'fitness', 'musculation', 'stade', 'رياضة', 'رياضية', 'جيم', 'كمال الأجسام'],
  pharmacie: ['pharmacie', 'pharmacy', 'صيدلية', 'فارماسي'],
  hopital: ['hopital', 'hospital', 'مستشفى', 'سبيطار'],
  clinique: ['clinique', 'clinic', 'عيادة'],
  medecin: ['medecin', 'docteur', 'doctor', 'طبيب'],
  ecole: ['ecole', 'school', 'مدرسة'],
  universite: ['universite', 'university', 'جامعة'],
  mosquee: ['mosquee', 'mosque', 'مسجد', 'جامع'],
  banque: ['banque', 'bank', 'بنك'],
  poste: ['poste', 'post office', 'بريد'],
  restaurant: ['restaurant', 'مطعم'],
  cafe: ['cafe', 'coffee', 'مقهى'],
  hotel: ['hotel', 'فندق', 'أوتيل'],
  station_service: ['station service', 'station essence', 'gas station', 'محطة بنزين'],
  parking: ['parking', 'موقف'],
  garage: ['garage', 'mecanicien', 'mechanic', 'ميكانيكي'],
};

function categoriesInQuery(q: string): string[] {
  const text = ` ${normalizeText(q)} `;
  return Object.entries(CATEGORY_WORDS)
    .filter(([, words]) => words.some((w) => text.includes(` ${w} `)))
    .map(([category]) => category);
}

/** Compare le code VIP en temps constant : la duree de la reponse ne revele pas combien de
 * chiffres sont justes. */
function vipCodeMatches(code: string): boolean {
  const a = Buffer.from(code);
  const b = Buffer.from(env.VIP_CODE);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Limite des essais de code VIP, par adresse IP et non par appareil : un appareil se recree
 * en une requete, une adresse non. Un code a quatre chiffres ne resiste pas a un essai
 * systematique ; cette limite le rend simplement tres long.
 */
const VIP_RATE_LIMIT = {
  rateLimit: { max: 5, timeWindow: '10 minutes', keyGenerator: (req: { ip: string }) => req.ip },
};

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Recherche d'adresses.
   *
   * L'ancien backend relisait addresses.json en entier a chaque appel et
   * filtrait en memoire. Ici, deux index font le travail : trigrammes sur le
   * nom pour la tolerance aux fautes de frappe, GiST sur la position pour
   * remonter d'abord ce qui est proche de l'utilisateur.
   */
  app.get('/places/search', async (req) => {
    const { q, lat, lon, category, limit } = parse(searchPlacesQuery, req.query);
    const words = searchWords(q);
    const wantedCategories = categoriesInQuery(q);
    // Un mot tape, n'importe ou dans le nom : « salle gaia » trouve « Gaia », « sport » trouve
    // « Salle de sport El Nour ». La similarite trigramme compare le nom ENTIER a la saisie
    // entiere, et reste sous son seuil des qu'on ajoute un mot qui n'est pas dans le nom.
    const wordsMatch = words.length
      ? sql`OR ${sql.join(
          words.map((w) => sql`win_normalize(p.name) LIKE '%' || win_normalize(${w}) || '%'`),
          sql` OR `,
        )}`
      : sql``;
    // « salle de sport », « gym », « قاعة رياضة » : l'utilisateur decrit la CATEGORIE choisie a
    // l'ajout du lieu, pas son nom. Liste construite en TS puis jointe une valeur par parametre
    // (un tableau JS passe tel quel serait eclate par drizzle).
    const categoryMatch = wantedCategories.length
      ? sql`OR p.category IN (${sql.join(wantedCategories.map((c) => sql`${c}`), sql`, `)})`
      : sql``;
    /* Les adresses ajoutees DEPUIS LE SITE vivent encore dans l'ancien backend, qui n'a
     * jamais ete debranche : sans cette passerelle, une fiche creee sur le site — et la photo
     * qui va avec — reste introuvable dans l'application. L'appel part MAINTENANT, en meme
     * temps que la requete SQL ci-dessous, et n'echoue jamais. */
    const legacyPending = fetchLegacyAddresses(q, lat !== undefined && lon !== undefined ? { lat, lon } : null);

    const hasPosition = lat !== undefined && lon !== undefined;
    const reference = hasPosition
      ? sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`
      : sql`NULL::geography`;

    const rows = await db.execute(sql`
      SELECT ${placeColumns},
             similarity(win_normalize(p.name), win_normalize(${q}))       AS score,
             CASE WHEN ${hasPosition}
                  THEN ST_Distance(p.geom, ${reference})
             END                                                          AS "distanceM"
      FROM places p
      ${photosJoin}
      WHERE p.deleted_at IS NULL
        AND p.status = 'published'
        AND (${category ?? null}::text IS NULL OR p.category = ${category ?? null})
        AND (
              win_normalize(p.name)  % win_normalize(${q})
           OR win_normalize(p.name)  LIKE win_normalize(${q}) || '%'
           ${wordsMatch}
           ${categoryMatch}
           OR win_normalize(COALESCE(p.street, '')) LIKE win_normalize(${q}) || '%'
           OR win_normalize(COALESCE(p.city, ''))   LIKE win_normalize(${q}) || '%'
           OR win_normalize(COALESCE(p.enseigne, '')) % win_normalize(${q})
        )
      ORDER BY p.is_partner DESC,
               -- Le lieu dont le NOM contient ce qui a ete tape passe avant ceux qui ne
               -- remontent que par leur categorie.
               (${words.length ? sql.join(words.map((w) => sql`(win_normalize(p.name) LIKE '%' || win_normalize(${w}) || '%')::int`), sql` + `) : sql`0`}) DESC,
               score DESC,
               "distanceM" ASC NULLS LAST
      LIMIT ${limit}
    `);

    const items = mergeLegacyAddresses(rows as unknown as SearchedPlace[], await legacyPending);
    return { items: items.slice(0, limit) };
  });

  /**
   * Pre-verification anti-doublon, appelee avant l'enregistrement d'une
   * nouvelle adresse. Meme role que GET /addresses/check en v83, mais la
   * comparaison de proximite se fait en base.
   */
  app.get('/places/check-duplicate', async (req) => {
    const { name, lat, lon } = parse(checkDuplicateQuery, req.query);
    const rows = await db.execute(sql`
      SELECT p.id,
             p.name,
             ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) AS "distanceM",
             similarity(win_normalize(p.name), win_normalize(${name})) AS score
      FROM places p
      WHERE p.deleted_at IS NULL
        AND ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${DUPLICATE_RADIUS_M})
      ORDER BY score DESC
      LIMIT 5
    `);

    const candidates = rows as unknown as { score: number; distanceM: number }[];
    const duplicate = candidates.some((c) => Number(c.score) >= 0.45);
    return { duplicate, candidates: rows };
  });

  /** Fiche complete d'un lieu. */
  app.get<{ Params: { id: string } }>('/places/:id', async (req) => {
    const rows = (await db.execute(sql`
      SELECT ${placeColumns}
      FROM places p
      ${photosJoin}
      WHERE p.id = ${req.params.id} AND p.deleted_at IS NULL
      LIMIT 1
    `)) as unknown as unknown[];

    if (rows.length === 0) throw notFound("Ce lieu n'existe pas ou a ete supprime.");
    return rows[0];
  });

  /** Lieux dans la zone visible de la carte. */
  app.get('/places/in-bounds', async (req) => {
    const q = req.query as Record<string, string>;
    const [west, south, east, north] = (q.bbox ?? '').split(',').map(Number);
    if ([west, south, east, north].some((n) => !Number.isFinite(n))) {
      return { items: [] };
    }
    const rows = await db.execute(sql`
      SELECT ${placeColumns}
      FROM places p
      ${photosJoin}
      WHERE p.deleted_at IS NULL
        AND p.status = 'published'
        AND ST_Intersects(
              p.geom,
              ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)::geography
            )
      ORDER BY p.is_partner DESC
      LIMIT 300
    `);
    return { items: rows };
  });

  /** Ajout d'un lieu par un contributeur. */
  /** Verifie un code VIP avant d'ouvrir le formulaire VIP dans l'application. */
  app.post('/places/vip-check', { config: VIP_RATE_LIMIT }, async (req) => {
    const { code } = parse(vipCheckInput, req.body);
    if (!vipCodeMatches(code)) {
      throw new HttpError(403, 'code_vip_invalide', 'Code VIP incorrect.');
    }
    return { ok: true };
  });

  app.post('/places', { preHandler: [app.requireDevice] }, async (req, reply) => {
    const input = parse(createPlaceInput, req.body);
    const deviceId = req.deviceId!;
    // Le code est reverifie ici : l'etape vip-check ne sert qu'a l'affichage du formulaire, et
    // n'importe qui peut appeler cette route directement.
    const isVip = input.vipCode !== undefined;
    if (isVip && !vipCodeMatches(input.vipCode!)) {
      throw new HttpError(403, 'code_vip_invalide', 'Code VIP incorrect.');
    }

    const near = (await db.execute(sql`
      SELECT id FROM places
      WHERE deleted_at IS NULL
        AND similarity(win_normalize(name), win_normalize(${input.name})) >= 0.6
        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography, ${DUPLICATE_RADIUS_M})
      LIMIT 1
    `)) as unknown as { id: string }[];

    if (near.length > 0) {
      throw conflict(
        'lieu_existant',
        'Un lieu portant ce nom existe deja a moins de 60 metres.',
        { placeId: near[0]!.id },
      );
    }

    const rows = (await db.execute(sql`
      INSERT INTO places (name, category, geom, house_number, street, city, postal_code,
                          wilaya, country, phone_fixe, phone_mobile, whatsapp, email,
                          enseigne, promo, is_partner, created_by)
      VALUES (${input.name}, ${input.category},
              ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
              ${input.houseNumber ?? null}, ${input.street ?? null}, ${input.city ?? null},
              ${input.postalCode ?? null}, ${input.wilaya ?? null}, ${input.country},
              ${input.phoneFixe ?? null}, ${input.phoneMobile ?? null},
              ${input.whatsapp ?? null}, ${input.email ?? null},
              ${input.enseigne ?? null}, ${input.promo ?? null}, ${isVip}, ${deviceId})
      RETURNING id
    `)) as unknown as { id: string }[];

    const placeId = rows[0]!.id;

    if (input.photoIds?.length) {
      // Liste explicite plutot que `= ANY($1::uuid[])`.
      //
      // Le modele `sql` de drizzle ETALE un tableau JavaScript en autant de parametres
      // separes : `${input.photoIds}` ne transmettait donc pas un tableau, mais la premiere
      // chaine seule. Postgres recevait « 2172b747-... » la ou il attendait « {2172b747-...} »
      // et rejetait la requete avec `malformed array literal` (22P02) — c'est-a-dire une
      // erreur 500 a CHAQUE ajout de lieu accompagne d'une photo, alors meme que la photo
      // avait bien ete envoyee et enregistree juste avant.
      const ids = sql.join(
        input.photoIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      await db.execute(sql`
        UPDATE place_photos SET place_id = ${placeId}
        WHERE id IN (${ids}) AND place_id IS NULL
      `);
    }

    await db.execute(sql`
      INSERT INTO contributors (device_id, places_count, score)
      VALUES (${deviceId}, 1, 10)
      ON CONFLICT (device_id) DO UPDATE
        SET places_count = contributors.places_count + 1,
            score        = contributors.score + 10,
            updated_at   = now()
    `);

    await db.execute(sql`
      INSERT INTO moderation_log (entity_type, entity_id, action, after, device_id)
      VALUES ('place', ${placeId}, 'create', ${JSON.stringify({ ...input, vipCode: undefined, vip: isVip })}::jsonb, ${deviceId})
    `);

    return reply.code(201).send({ id: placeId });
  });

  /** Modification, reservee aux moderateurs. */
  app.patch<{ Params: { id: string } }>(
    '/places/:id',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const input = parse(updatePlaceInput, req.body);
      const id = req.params.id;

      const before = (await db.execute(
        sql`SELECT * FROM places WHERE id = ${id} AND deleted_at IS NULL`,
      )) as unknown as unknown[];
      if (before.length === 0) throw notFound();

      await db.execute(sql`
        UPDATE places SET
          name         = COALESCE(${input.name ?? null}, name),
          category     = COALESCE(${input.category ?? null}, category),
          house_number = COALESCE(${input.houseNumber ?? null}, house_number),
          street       = COALESCE(${input.street ?? null}, street),
          city         = COALESCE(${input.city ?? null}, city),
          postal_code  = COALESCE(${input.postalCode ?? null}, postal_code),
          wilaya       = COALESCE(${input.wilaya ?? null}, wilaya),
          phone_fixe   = COALESCE(${input.phoneFixe ?? null}, phone_fixe),
          phone_mobile = COALESCE(${input.phoneMobile ?? null}, phone_mobile),
          whatsapp     = COALESCE(${input.whatsapp ?? null}, whatsapp),
          email        = COALESCE(${input.email ?? null}, email),
          enseigne     = COALESCE(${input.enseigne ?? null}, enseigne),
          promo        = COALESCE(${input.promo ?? null}, promo),
          is_partner   = COALESCE(${input.isPartner ?? null}, is_partner),
          geom         = CASE WHEN ${input.lat ?? null}::double precision IS NOT NULL
                              THEN ST_SetSRID(ST_MakePoint(${input.lon ?? null}, ${input.lat ?? null}), 4326)::geography
                              ELSE geom END
        WHERE id = ${id}
      `);

      await db.execute(sql`
        INSERT INTO moderation_log (entity_type, entity_id, action, before, after, admin_id)
        VALUES ('place', ${id}, 'update',
                ${JSON.stringify(before[0])}::jsonb,
                ${JSON.stringify(input)}::jsonb,
                ${req.admin!.id})
      `);

      return { ok: true };
    },
  );

  /**
   * Suppression. Volontairement logique : la v78 a montre qu'une suppression
   * definitive rend toute restauration impossible, et le journal de moderation
   * existe justement pour pouvoir revenir en arriere.
   */
  app.delete<{ Params: { id: string } }>(
    '/places/:id',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const id = req.params.id;
      const before = (await db.execute(
        sql`SELECT * FROM places WHERE id = ${id} AND deleted_at IS NULL`,
      )) as unknown as unknown[];
      if (before.length === 0) throw notFound();

      await db.execute(sql`UPDATE places SET deleted_at = now() WHERE id = ${id}`);
      await db.execute(sql`
        INSERT INTO moderation_log (entity_type, entity_id, action, before, admin_id)
        VALUES ('place', ${id}, 'delete', ${JSON.stringify(before[0])}::jsonb, ${req.admin!.id})
      `);

      return { ok: true, restorable: true };
    },
  );
};

export default routes;
