import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  checkDuplicateQuery,
  createPlaceInput,
  DUPLICATE_RADIUS_M,
  searchPlacesQuery,
  updatePlaceInput,
  contributorCheckInput,
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

/** Compare un code en temps constant : la duree de la reponse ne revele pas combien de
 * chiffres sont justes. */
function codeMatches(saisi: string, attendu: string): boolean {
  const a = Buffer.from(saisi);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

const vipCodeMatches = (code: string) => codeMatches(code, env.VIP_CODE);
const contributorCodeMatches = (code: string) => codeMatches(code, env.CONTRIBUTOR_CODE);

/**
 * Limite des essais de code VIP, par adresse IP et non par appareil : un appareil se recree
 * en une requete, une adresse non. Un code a quatre chiffres ne resiste pas a un essai
 * systematique ; cette limite le rend simplement tres long.
 */
/** La fiche a-t-elle ete creee depuis cet appareil ? */
async function estAuteur(placeId: string, deviceId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT 1 AS ok FROM places WHERE id = ${placeId} AND created_by = ${deviceId} AND deleted_at IS NULL
  `)) as unknown as unknown[];
  return rows.length > 0;
}

/**
 * Etat de la fiche avant le geste, pour le journal.
 *
 * Ce n'est pas de la comptabilite : c'est ce qui permet de REMETTRE une fiche comme elle etait,
 * le jour ou un contributeur se trompe ou abuse. Sans cela, on saurait que quelque chose a ete
 * change sans savoir quoi — et une carte qu'on ne peut pas reparer se degrade a sens unique.
 */
async function etatFiche(placeId: string): Promise<unknown | null> {
  const rows = (await db.execute(sql`
    SELECT name, category, house_number, street, city, postal_code, wilaya,
           phone_fixe, phone_mobile, whatsapp, email, enseigne,
           ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon,
           created_by, is_partner
    FROM places WHERE id = ${placeId}
  `)) as unknown as unknown[];
  return rows[0] ?? null;
}

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

  /**
   * Ouverture du droit de contribuer, sur presentation du code.
   *
   * Le droit est inscrit sur l'APPAREIL, et non rendu sous forme de jeton a conserver : un
   * jeton se recopie d'un telephone a l'autre, une ligne en base se retire d'un UPDATE le jour
   * ou quelqu'un abuse.
   */
  app.post(
    '/places/contributor-check',
    { preHandler: [app.requireDevice], config: VIP_RATE_LIMIT },
    async (req) => {
      const { code } = parse(contributorCheckInput, req.body);
      if (!contributorCodeMatches(code)) {
        throw new HttpError(403, 'code_contributeur_invalide', 'Code contributeur incorrect.');
      }
      await db.execute(sql`
        UPDATE devices
        SET is_contributor = true,
            contributor_granted_at = COALESCE(contributor_granted_at, now())
        WHERE id = ${req.deviceId!}
      `);
      return { ok: true };
    },
  );

  /** L'appareil a-t-il le droit d'enregistrer des lieux ? */
  app.get('/places/contributor', { preHandler: [app.requireDevice] }, async (req) => {
    const rows = (await db.execute(sql`
      SELECT is_contributor AS "isContributor" FROM devices WHERE id = ${req.deviceId!}
    `)) as unknown as { isContributor: boolean }[];
    return { isContributor: rows[0]?.isContributor === true };
  });

  app.post('/places', { preHandler: [app.requireDevice] }, async (req, reply) => {
    const input = parse(createPlaceInput, req.body);
    const deviceId = req.deviceId!;

    /* Seul un contributeur enregistre un lieu.
     *
     * Le controle est ICI, et pas seulement dans l'application : une route ouverte reste
     * appelable directement, et c'est precisement ce qu'on veut empecher. Un code VIP valide
     * vaut aussi droit d'ecrire — un partenaire commercial est, par construction, quelqu'un
     * que l'equipe connait. */
    /* AJOUTER est ouvert a tous ; CORRIGER et SUPPRIMER sont reserves aux contributeurs.
     *
     * La restriction etait au depart posee a l'entree : personne ne pouvait enregistrer un lieu
     * sans etre contributeur. Elle est maintenant posee a la CURATION, et c'est un autre
     * equilibre : n'importe qui apporte ce qu'il connait — le commerce de son quartier, l'ecole
     * de ses enfants, l'adresse que les cartes ignorent — et un petit nombre de personnes de
     * confiance corrige ou retire ce qui ne va pas.
     *
     * C'est le choix du client, et c'est celui de toutes les cartes qui ont fini par couvrir un
     * pays : fermer l'ecriture protege la qualite de ce qui est ecrit, mais garantit surtout
     * qu'il n'y aura presque rien d'ecrit. */
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

  /* ------------------------------------------------------------------ */
  /* Gestion par l'AUTEUR de la fiche                                     */
  /*                                                                      */
  /* Jusqu'ici, seuls les moderateurs pouvaient corriger ou retirer un    */
  /* lieu : un contributeur qui s'etait trompe d'adresse ou de nom devait */
  /* nous ecrire et attendre. Or la colonne `created_by` porte deja       */
  /* l'appareil qui a cree la fiche — l'auteur peut donc etre reconnu     */
  /* sans rien ajouter au modele. Il ne touche QUE ses propres fiches :   */
  /* la condition est dans la requete SQL, pas seulement dans un test en  */
  /* amont, de sorte qu'aucune course entre deux appels ne puisse         */
  /* l'ouvrir sur la fiche d'un autre.                                    */
  /* ------------------------------------------------------------------ */

  /** Les lieux crees par cet appareil — la section « Mes enregistrements ». */
  app.get('/places/mine', { preHandler: [app.requireDevice] }, async (req) => {
    const rows = await db.execute(sql`
      SELECT ${placeColumns}
      FROM places p
      ${photosJoin}
      WHERE p.created_by = ${req.deviceId!}
        AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT 200
    `);
    return { items: rows };
  });

  /**
   * Correction par l'auteur : nom, categorie, position, adresse, contacts.
   *
   * Le statut partenaire et la promotion restent hors de portee — ce sont des engagements
   * commerciaux, pas des informations que le contributeur a saisies.
   */
  app.patch<{ Params: { id: string } }>(
    '/places/:id/mine',
    { preHandler: [app.requireDevice] },
    async (req) => {
      const input = parse(updatePlaceInput, req.body);

      /* CORRIGER UNE FICHE EST OUVERT A TOUS — decision du client, 19 octobre 2026.
       *
       * Le droit etait reserve aux contributeurs designes. Le client l'a tranche autrement :
       * << n'importe quel utilisateur peut faire cette action >>. C'est le fonctionnement des
       * cartes communautaires, et c'est ce qui permet a une adresse fausse d'etre reparee par
       * la premiere personne qui passe devant, au lieu d'attendre qu'un contributeur la voie.
       *
       * Ce que cela coute, et qui a ete dit avant d'etre decide : n'importe qui peut aussi
       * abimer le travail de n'importe qui. Deux choses le rendent rattrapable, et elles ne
       * sont pas facultatives — l'etat PRECEDENT de la fiche part dans le journal a chaque
       * geste, et la suppression reste logique, donc reversible.
       */
      const surAutrui = !(await estAuteur(req.params.id, req.deviceId!));

      /* L'etat d'avant est garde MEME quand on corrige sa propre fiche. Il ne l'etait que pour
       * les fiches d'autrui, du temps ou ce cas etait l'exception ; il est desormais la regle,
       * et un auteur peut aussi bien effacer par megarde ce qu'il avait saisi correctement. */
      const avant = await etatFiche(req.params.id);

      const rows = (await db.execute(sql`
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
          geom         = CASE WHEN ${input.lat ?? null}::double precision IS NOT NULL
                              THEN ST_SetSRID(ST_MakePoint(${input.lon ?? null}, ${input.lat ?? null}), 4326)::geography
                              ELSE geom END,
          updated_at   = now()
        WHERE id = ${req.params.id}
          AND deleted_at IS NULL
        RETURNING id
      `)) as unknown as unknown[];
      if (rows.length === 0) throw notFound();

      /* CHANGER LA PHOTO D'UNE FICHE (point 12 du client).
       *
       * Les photos ne pouvaient etre attachees qu'a la CREATION : corriger l'image d'un lieu
       * demandait donc de supprimer la fiche et de tout ressaisir. Un contributeur qui repasse
       * devant une adresse avec une meilleure photo ne devrait pas avoir a faire cela.
       *
       * `photoIds` absent ne touche a rien — les champs de cette route sont tous facultatifs et
       * une correction de nom ne doit pas effacer l'image. Present, il REMPLACE : les photos
       * actuelles sont detachees, les nouvelles prennent leur place. Detachees et non
       * supprimees : le fichier reste sur le disque, et le journal ci-dessous garde la trace du
       * geste. Une photo retiree par erreur se rattache donc, alors qu'elle ne se ressusciterait
       * pas.
       */
      if (input.photoIds?.length) {
        // Liste explicite plutot que `= ANY($1::uuid[])` : le modele `sql` de drizzle ETALE un
        // tableau JavaScript en parametres separes, et Postgres recevait une seule chaine la ou
        // il attendait un tableau (meme piege qu'a la creation).
        const ids = sql.join(
          input.photoIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        );
        await db.execute(sql`
          UPDATE place_photos SET place_id = NULL WHERE place_id = ${req.params.id}
        `);
        await db.execute(sql`
          UPDATE place_photos SET place_id = ${req.params.id}
          WHERE id IN (${ids}) AND place_id IS NULL
        `);
      }

      await db.execute(sql`
        INSERT INTO moderation_log (entity_type, entity_id, action, before, after, device_id)
        VALUES (
          'place',
          ${req.params.id},
          ${surAutrui ? 'user_update' : 'author_update'},
          ${avant ? JSON.stringify(avant) : null}::jsonb,
          ${JSON.stringify(input)}::jsonb,
          ${req.deviceId!}
        )
      `);
      return { ok: true };
    },
  );

  /**
   * Retrait d'une fiche. Suppression LOGIQUE, comme celle des moderateurs : une fiche
   * effacee par erreur doit pouvoir etre retrouvee, et le journal garde la trace de qui a
   * fait quoi. L'adresse de la route garde son suffixe `/mine` pour ne pas casser les
   * versions de l'application deja installees ; elle ne designe plus << les miennes >>.
   */
  app.delete<{ Params: { id: string } }>(
    '/places/:id/mine',
    { preHandler: [app.requireDevice] },
    async (req) => {
      /* RETIRER UNE FICHE EST OUVERT A TOUS — meme decision que pour la correction ci-dessus.
       *
       * La suppression est LOGIQUE (`deleted_at`), jamais destructive : la fiche disparait de
       * la carte, ses donnees restent. C'est ce qui rend la decision tenable — un retrait abusif
       * se defait depuis le journal de moderation. */
      const surAutrui = !(await estAuteur(req.params.id, req.deviceId!));
      const avant = await etatFiche(req.params.id);

      /* Une fiche PARTENAIRE reste la seule exception, et elle le reste meme maintenant que
       * tout le monde peut supprimer. Elle a ete payee : la retirer coute de l'argent a
       * quelqu'un, et le geste ne se repare pas par un simple << oups >>. Son auteur et
       * l'equipe peuvent toujours le faire, un passant non. */
      const partenaire = (avant as { is_partner?: boolean } | null)?.is_partner === true;
      if (partenaire && surAutrui) {
        throw new HttpError(
          403,
          'fiche_partenaire',
          "Cette adresse appartient a un partenaire WIN : son retrait passe par l'equipe.",
        );
      }

      const rows = (await db.execute(sql`
        UPDATE places SET deleted_at = now()
        WHERE id = ${req.params.id}
          AND deleted_at IS NULL
          AND (created_by = ${req.deviceId!} OR is_partner = false)
        RETURNING id
      `)) as unknown as unknown[];
      if (rows.length === 0) throw notFound();

      await db.execute(sql`
        INSERT INTO moderation_log (entity_type, entity_id, action, before, device_id)
        VALUES (
          'place',
          ${req.params.id},
          ${surAutrui ? 'user_delete' : 'author_delete'},
          ${avant ? JSON.stringify(avant) : null}::jsonb,
          ${req.deviceId!}
        )
      `);
      return { ok: true };
    },
  );

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
