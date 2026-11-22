import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  blocageConfirme,
  createReportInput,
  JOURS_SANS_ISSUE,
  JOURS_TRAVAUX,
  nearbyReportsQuery,
  OUI_POUR_DEBLOQUER,
  PERMANENT_KINDS,
  phaseBlocage,
  praticableInput,
  PREUVE_PASSAGE_M,
  PROBATION_HEURES,
  QUESTIONS_PAR_EVENEMENT,
  RAYON_TEMOIN_M,
  seuilDegagement,
  TEMPORARY_TTL_MINUTES,
  voteReportInput,
  type Report,
  type ReportKind,
} from '@win/shared';
import { db } from '../db/client.js';
import { conflict, notFound, parse } from '../lib/http.js';

/**
 * TEMOINS INDEPENDANTS D'UN BLOCAGE (point 12 du client, 28 octobre).
 *
 * Un signalement de route bloquee ne modifie aucun itineraire tant qu'un seul appareil
 * l'affirme ; il faut deux temoins independants pour que le segment soit exclu des calculs.
 * Cette colonne les compte, et elle en compte TROIS SORTES — c'est tout l'interet :
 *
 *   1. l'AUTEUR du signalement ;
 *   2. les appareils qui ont repondu << toujours la >> dessus. Le depot d'un signalement
 *      identique a moins de 40 m est deja enregistre comme un tel vote (voir POST /reports) :
 *      le deuxieme conducteur qui appuie sur << route bloquee >> au meme endroit compte donc
 *      ici sans rien de special ;
 *   3. les appareils qui ont signale un blocage a moins de RAYON_TEMOIN_M, dans un signalement
 *      SEPARE. Devant une barriere la file s'etire : deux conducteurs arretes a cent metres
 *      l'un de l'autre decrivent le meme blocage, mais au-dela des 40 m de fusion le serveur
 *      en fait deux signalements distincts. Sans ce troisieme terme, deux temoins bien reels
 *      resteraient chacun seul et le blocage ne serait jamais confirme.
 *
 * CHAQUE APPAREIL NE COMPTE QU'UNE FOIS, et c'est la seule chose qui rend le seuil serieux :
 * sans cela, un unique telephone qui signale puis confirme vaudrait deux temoins et pourrait
 * couper une nationale a lui seul. D'ou la soustraction en cascade — on compte l'auteur, puis
 * les confirmations qui ne sont PAS de lui, puis les signalements voisins dont l'auteur n'est
 * ni lui ni deja compte parmi les confirmations.
 *
 * `IS DISTINCT FROM` et non `<>` : `created_by` est effacee quand l'appareil est supprime
 * (ON DELETE SET NULL). Avec `<>`, une comparaison a NULL rend NULL, la ligne sort du compte,
 * et un temoin bien reel disparait du total.
 *
 * Rien que des sous-requetes correlees ordinaires, volontairement : la premiere version
 * reposait sur un UNION dans un FROM referencant la requete englobante — une construction dont
 * la validite depend de la version de PostgreSQL, et que je ne peux pas eprouver d'ici faute
 * d'acces a la base. Celle-ci est plus longue a lire et ne peut pas surprendre.
 *
 * Calculee pour les SEULS blocages. Les autres types valent 1 et n'ont rien a prouver : ni un
 * dos d'ane ni un radar ne modifie un itineraire.
 */
/**
 * LA PREUVE DES DIX METRES — point H du correctif v2, phase 1.
 *
 *   << Condition : chaque utilisateur a depasse le segment de 10 m (preuve qu'il l'a vecu). >>
 *
 * UNE MESURE ABSENTE N'EST PAS UNE PREUVE REFUSEE, et c'est la clef de cet ajout. `parcourus_m`
 * est nulle sur tout ce qui a ete depose avant cette version de l'application. Exiger la mesure
 * aurait desarme, le jour de la mise en ligne, TOUS les blocages deposes par des telephones pas
 * encore mis a jour — une regression invisible, et payee par l'utilisateur pour une mise a jour
 * qu'il n'a pas faite. Ce qu'on ecarte, c'est une mesure PRESENTE et insuffisante : le
 * signalement depose a l'arret, trois cents metres avant, par quelqu'un qui croit savoir.
 *
 * Le meme fragment sert aux trois termes du compte, ce qui est tout l'interet de le nommer :
 * un temoin est un temoin, qu'il ait appuye sur << route bloquee >>, confirme, ou signale a
 * cent metres de la.
 */
const preuveVecueSql = (colonne: ReturnType<typeof sql.raw>) =>
  sql`(${colonne} IS NULL OR ${colonne} >= ${PREUVE_PASSAGE_M})`;

const temoinsColumn = sql`
  CASE WHEN r.kind = 'block' THEN
    (CASE WHEN ${preuveVecueSql(sql.raw('r.parcourus_m'))} THEN 1 ELSE 0 END)
    + (SELECT count(DISTINCT v.device_id)::int
         FROM report_votes v
        WHERE v.report_id = r.id
          AND v.vote = 'confirm'
          AND v.device_id IS DISTINCT FROM r.created_by
          AND ${preuveVecueSql(sql.raw('v.parcourus_m'))})
    + (SELECT count(DISTINCT r2.created_by)::int
         FROM reports r2
        WHERE r2.id <> r.id
          AND r2.kind = 'block'
          AND r2.status = 'active'
          AND (r2.expires_at IS NULL OR r2.expires_at > now())
          AND ST_DWithin(r2.geom, r.geom, ${RAYON_TEMOIN_M})
          AND r2.created_by IS DISTINCT FROM r.created_by
          AND ${preuveVecueSql(sql.raw('r2.parcourus_m'))}
          AND NOT EXISTS (SELECT 1 FROM report_votes v2
                           WHERE v2.report_id = r.id
                             AND v2.vote = 'confirm'
                             AND v2.device_id = r2.created_by))
  ELSE 1 END
`;

/**
 * LE DELAI AVANT REOUVERTURE PROVISOIRE : sept jours pour des travaux, trente pour un chemin
 * sans issue. Les deux nombres viennent de `probation.ts`, interpoles ici : il n'y a donc PAS
 * deux verites, une en SQL et une en TypeScript, meme si la phrase est ecrite deux fois.
 */
const delaiSql = sql`
  (CASE WHEN r.kind = 'works' THEN ${JOURS_TRAVAUX} ELSE ${JOURS_SANS_ISSUE} END * interval '1 day')
`;

/** Les reponses << praticable >> recues DEPUIS la confirmation en cours (voir bloque_le). */
const ouiSql = sql`
  (SELECT count(*)::int FROM report_praticable p
    WHERE p.report_id = r.id AND p.praticable AND p.created_at > r.bloque_le)
`;
const totalSql = sql`
  (SELECT count(*)::int FROM report_praticable p
    WHERE p.report_id = r.id AND p.created_at > r.bloque_le)
`;

/**
 * CE BLOCAGE EST-IL DEFINITIVEMENT LEVE ? — point H du correctif v2, phase 2.
 *
 * Deux reponses << oui >>, ou quarante-huit heures de reouverture provisoire sans reponse. Le
 * reste de la phase 2 — bloque, probation — est decide par `phaseBlocage` en TypeScript, la ou
 * on peut l'eprouver ; ici on n'a besoin que de ce seul booleen, parce qu'un signalement leve
 * doit quitter la carte DES LA LECTURE, sans attendre qu'un conducteur passe par la.
 *
 * C'EST CE QUI REMPLACE LA TACHE PLANIFIEE du document (`scheduleUnlockCheck`). Un serveur qui
 * reveille un minuteur sept jours plus tard oublie tout ce qui s'est passe pendant un
 * redemarrage ; une date en base, relue a chaque requete, n'oublie rien.
 */
const degageSql = sql`
  (r.bloque_le IS NOT NULL
   AND (${ouiSql} >= ${OUI_POUR_DEBLOQUER}
        OR now() >= r.bloque_le + ${delaiSql} + ${PROBATION_HEURES} * interval '1 hour'))
`;

const reportColumns = sql`
  r.id,
  r.kind,
  r.permanent,
  ST_Y(r.geom::geometry) AS lat,
  ST_X(r.geom::geometry) AS lon,
  r.heading,
  r.speed_limit AS "speedLimit",
  r.created_at  AS "createdAt",
  r.expires_at  AS "expiresAt",
  (SELECT count(*)::int FROM report_votes v WHERE v.report_id = r.id AND v.vote = 'confirm') AS "confirmCount",
  /* LES VOTES << DISPARU >> NE SONT COMPTES QUE DEPUIS LE DERNIER << TOUJOURS LA >> — point J
   * du correctif v2 : << 1 vote "Toujours la" de n'importe quel utilisateur -> compteur remis a
   * zero, symbole reste. >>
   *
   * ON NE SUPPRIME PAS LES LIGNES, ON DEPLACE LE POINT DE DEPART DU COMPTE, et la nuance porte
   * tout. Effacer les votes << disparu >> remettrait bien le compteur a zero, mais rendrait
   * aussi leur droit de vote a ceux qui l'avaient deja utilise : l'index unique ne les
   * reconnaitrait plus, et deux personnes pourraient faire disparaitre un symbole a elles seules
   * en alternant les deux votes. Ici l'historique reste entier et auditable, et un appareil
   * garde un seul vote pour toujours.
   *
   * La date -infinity est le point de depart quand personne n a encore confirme : tous les
   * << disparu >> comptent alors, ce qui est le cas ordinaire. */
  (SELECT count(*)::int FROM report_votes v
    WHERE v.report_id = r.id
      AND v.vote = 'absent'
      AND v.created_at > COALESCE(
            (SELECT max(c.created_at) FROM report_votes c
              WHERE c.report_id = r.id AND c.vote = 'confirm'),
            '-infinity'::timestamptz
          )
  ) AS "absentCount",
  ${temoinsColumn} AS "temoins",
  /* LES TROIS CHAMPS DE LA PHASE 2 (point H). L'application en deduit l'etat du blocage avec
   * la fonction phaseBlocage, celle que le verificateur eprouve : le serveur rend des faits, et
   * la regle vit a un seul endroit.
   *
   * AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il est a l'interieur d'un gabarit sql, qu'un seul
   * accent grave refermerait — l'erreur qui a coute deux heures le 22 novembre. */
  r.bloque_le AS "bloqueLe",
  CASE WHEN r.bloque_le IS NULL THEN 0 ELSE ${ouiSql} END AS "praticableOui",
  CASE WHEN r.bloque_le IS NULL THEN 0 ELSE ${totalSql} END AS "praticableTotal"
`;

/**
 * NOTER L'INSTANT OU UN BLOCAGE DEVIENT CONFIRME — point H du correctif v2, phase 1 vers 2.
 *
 * Le deuxieme temoin fait sortir le segment des itineraires depuis le 28 octobre ; ce qui est
 * nouveau, c'est que cet instant est desormais ECRIT. C'est de lui que partent les sept ou
 * trente jours avant reouverture provisoire.
 *
 * `bloque_le IS NULL` dans la condition : on note la PREMIERE confirmation et jamais les
 * suivantes. Sans cela, chaque nouveau temoin repousserait le delai, et un blocage tres signale
 * — donc tres reel, mais peut-etre leve depuis — ne serait jamais reexamine.
 *
 * LA DECISION EST PRISE EN TYPESCRIPT, par `blocageConfirme`, et non dans une requete : c'est
 * la meme fonction que celle dont depend l'exclusion des itineraires cote application. Deux
 * ecritures de la meme regle finiraient par ne plus dire la meme chose.
 */
async function noterConfirmation(report: Report | null): Promise<void> {
  if (!report) return;
  if (report.kind !== 'block' && report.kind !== 'works') return;
  if (report.bloqueLe) return;
  if (!blocageConfirme(report.temoins)) return;
  await db.execute(sql`
    UPDATE reports SET bloque_le = now() WHERE id = ${report.id} AND bloque_le IS NULL
  `);
}

async function loadReport(id: string): Promise<Report | null> {
  const rows = (await db.execute(sql`
    SELECT ${reportColumns} FROM reports r WHERE r.id = ${id} LIMIT 1
  `)) as unknown as Report[];
  return rows[0] ?? null;
}

const routes: FastifyPluginAsync = async (app) => {
  /**
   * Signalements autour d'une position.
   *
   * Remplace GET /signalements/nearby, qui parcourait le fichier JSON entier.
   * Les signalements temporaires expires sont exclus a la lecture plutot que
   * supprimes par une tache de fond : rien a planifier, rien a oublier.
   */
  app.get('/reports/nearby', async (req) => {
    const { lat, lon, radius, kinds } = parse(nearbyReportsQuery, req.query);
    const point = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;

    const rows = await db.execute(sql`
      SELECT ${reportColumns},
             ST_Distance(r.geom, ${point}) AS "distanceM"
      FROM reports r
      WHERE r.status = 'active'
        AND (r.expires_at IS NULL OR r.expires_at > now())
        /* UN BLOCAGE DEFINITIVEMENT LEVE NE REVIENT PLUS — point H, phase 2. Exclu a la
         * lecture, comme les signalements temporaires expires : rien a planifier, rien a
         * oublier. La ligne reste en base, et son historique avec elle. */
        AND NOT ${degageSql}
        AND (${
          // Meme correction que dans places.ts : un tableau interpole est etale en
          // parametres separes, donc le transtypage `::text[]` echouait. Le defaut etait
          // encore invisible ici — l'application ne filtre jamais par type pour l'instant —
          // mais il aurait fait tomber la route au premier ecran qui s'en serait servi.
          kinds?.length
            ? sql`r.kind IN (${sql.join(
                kinds.map((kind) => sql`${kind}`),
                sql`, `,
              )})`
            : sql`true`
        })
        AND ST_DWithin(r.geom, ${point}, ${radius})
      ORDER BY "distanceM" ASC
      LIMIT 500
    `);

    return { items: rows };
  });

  /** Depot d'un signalement. */
  app.post('/reports', { preHandler: [app.requireDevice] }, async (req, reply) => {
    const input = parse(createReportInput, req.body);
    const deviceId = req.deviceId!;
    const permanent = PERMANENT_KINDS.includes(input.kind);
    const ttl = TEMPORARY_TTL_MINUTES[input.kind as ReportKind];

    // Un signalement identique a moins de 40 metres est traite comme une
    // confirmation du signalement existant plutot que comme un doublon.
    const existing = (await db.execute(sql`
      SELECT id FROM reports
      WHERE status = 'active'
        AND kind = ${input.kind}
        AND (expires_at IS NULL OR expires_at > now())
        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography, 40)
      LIMIT 1
    `)) as unknown as { id: string }[];

    if (existing.length > 0) {
      const id = existing[0]!.id;
      /* LA PREUVE DE PASSAGE SUIT LE VOTE, et non seulement le signalement : un deuxieme
       * conducteur qui appuie sur << route bloquee >> au meme endroit est enregistre comme une
       * confirmation (fusion a moins de 40 m), et c'est pourtant LUI le deuxieme temoin du
       * point H. Sans cette colonne, sa preuve serait jetee a l'instant ou elle compte. */
      await db.execute(sql`
        INSERT INTO report_votes (report_id, device_id, vote, parcourus_m)
        VALUES (${id}, ${deviceId}, 'confirm', ${input.parcourusM ?? null})
        ON CONFLICT DO NOTHING
      `);
      await noterConfirmation(await loadReport(id));
      const updated = await loadReport(id);
      if (updated) app.broadcastAround(updated.lat, updated.lon, { type: 'report:updated', report: updated });
      return reply.code(200).send({ id, merged: true });
    }

    const rows = (await db.execute(sql`
      INSERT INTO reports (kind, permanent, geom, heading, speed_limit, created_by, parcourus_m, expires_at)
      VALUES (${input.kind}, ${permanent},
              ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
              ${input.heading ?? null}, ${input.speedLimit ?? null}, ${deviceId},
              ${input.parcourusM ?? null},
              ${
                permanent || ttl === 0
                  ? sql`NULL::timestamptz`
                  : sql`now() + ${`${ttl} minutes`}::interval`
              })
      RETURNING id
    `)) as unknown as { id: string }[];

    /* UN SIGNALEMENT PEUT NAITRE DEJA CONFIRME : les temoins comptent aussi les blocages
     * voisins a moins de cent cinquante metres. Le deuxieme conducteur arrete derriere la
     * barriere, mais trop loin pour la fusion, confirme donc des son depot. */
    await noterConfirmation(await loadReport(rows[0]!.id));
    const created = await loadReport(rows[0]!.id);

    await db.execute(sql`
      INSERT INTO contributors (device_id, reports_count, score)
      VALUES (${deviceId}, 1, 5)
      ON CONFLICT (device_id) DO UPDATE
        SET reports_count = contributors.reports_count + 1,
            score         = contributors.score + 5,
            updated_at    = now()
    `);

    if (created) app.broadcastAround(created.lat, created.lon, { type: 'report:new', report: created });
    return reply.code(201).send(created);
  });

  /**
   * Vote sur un signalement : « toujours la » ou « n'existe plus ».
   *
   * En v82 le seuil de suppression reposait sur un compteur. Ici, chaque vote
   * est une ligne rattachee a un appareil, donc un meme telephone ne peut plus
   * faire disparaitre un radar a lui seul, et l'historique reste auditable.
   */
  app.post<{ Params: { id: string } }>(
    '/reports/:id/vote',
    { preHandler: [app.requireDevice] },
    async (req) => {
      const { vote } = parse(voteReportInput, req.body);
      const deviceId = req.deviceId!;
      const report = await loadReport(req.params.id);
      if (!report) throw notFound("Ce signalement n'existe plus.");

      const inserted = (await db.execute(sql`
        INSERT INTO report_votes (report_id, device_id, vote)
        VALUES (${report.id}, ${deviceId}, ${vote})
        ON CONFLICT DO NOTHING
        RETURNING id
      `)) as unknown as { id: string }[];

      if (inserted.length === 0) {
        throw conflict('deja_vote', 'Vous avez deja vote pour ce signalement.');
      }

      /* « Toujours la » PROLONGE un signalement temporaire.
       *
       * Le cahier des charges du client distingue deux familles : les permanents (dos d'ane,
       * radar, trou), qui n'expirent jamais et ne disparaissent que sur trois votes « plus la »,
       * et les ephemeres (bouchon, accident, police...), qui expirent seuls mais sont
       * prolongeables par les confirmations. Sans cette prolongation, un bouchon confirme par
       * cinq conducteurs disparaissait quand meme a l'heure dite.
       *
       * La prolongation est bornee : une heure de plus que la duree de vie initiale du type,
       * jamais davantage. Un signalement ne peut donc pas devenir eternel a force de votes —
       * c'est ce qui distingue un ephemere d'un permanent.
       */
      if (vote === 'confirm' && !report.permanent) {
        await db.execute(sql`
          UPDATE reports
          SET expires_at = LEAST(
                created_at + ${`${(TEMPORARY_TTL_MINUTES[report.kind as ReportKind] ?? 60) + 60} minutes`}::interval,
                GREATEST(expires_at, now() + interval '30 minutes')
              )
          WHERE id = ${report.id} AND expires_at IS NOT NULL
        `);
      }

      if (vote === 'confirm') {
        await db.execute(sql`
          INSERT INTO contributors (device_id, confirms_count, score)
          VALUES (${deviceId}, 1, 2)
          ON CONFLICT (device_id) DO UPDATE
            SET confirms_count = contributors.confirms_count + 1,
                score          = contributors.score + 2,
                updated_at     = now()
        `);
      }

      /* LE VOTE << TOUJOURS LA >> PEUT ETRE LE DEUXIEME TEMOIN : c'est meme le chemin le plus
       * courant, puisque la carte << Toujours la ? >> s'ouvre d'elle-meme quand on approche
       * d'un signalement. On note donc la confirmation ici aussi. */
      await noterConfirmation(await loadReport(report.id));
      const after = await loadReport(report.id);
      if (!after) throw notFound();

      /* DEUX VOTES, POUR TOUS LES TYPES — point J du correctif v2.
       *
       * Le seuil dependait du type : deux pour une route bloquee, trois pour les autres
       * permanents. Le client demande deux partout (<< Cette correction s'applique a TOUS les
       * symboles et signalisations de la carte >>), et la raison qui valait pour la route barree
       * vaut en fait pour tous : un symbole qui n'est plus la et qui reste affiche fait douter
       * de tous les autres. `seuilDegagement` est conserve — il nomme l'intention, et il
       * suffirait d'un chiffre a changer si un type devait un jour redevenir different. */
      const seuil = seuilDegagement(report.kind as ReportKind);

      if (after.absentCount >= seuil) {
        await db.execute(sql`
          UPDATE reports SET status = 'removed', removed_at = now() WHERE id = ${report.id}
        `);
        app.broadcastAround(after.lat, after.lon, {
          type: 'report:removed',
          reportId: after.id,
        });
        return { removed: true, threshold: seuil, report: after };
      }

      app.broadcastAround(after.lat, after.lon, { type: 'report:updated', report: after });
      return { removed: false, threshold: seuil, report: after };
    },
  );

  /**
   * << CETTE ROUTE EST-ELLE PRATICABLE ? >> OUI / NON — point H du correctif v2, phase 2.
   *
   * La question n'est posee qu'aux deux premiers conducteurs qui empruntent le segment pendant
   * sa reouverture provisoire. Cette route enregistre leur reponse et en tire les consequences
   * immediates du document :
   *
   *   2 x Oui  -> segment definitivement debloque, le signalement quitte la carte pour tous.
   *   1 x Non  -> re-bloque, et le delai REPART : `bloque_le` revient a maintenant. Les
   *               reponses deja recues appartiennent alors au cycle precedent et ne comptent
   *               plus (la requete ne retient que celles posterieures a cette date).
   *
   * UNE ROUTE A PART, ET NON UN TROISIEME VOTE : voir `praticableInput`. << NE PAS MODIFIER le
   * systeme de signalement existant — AJOUTER. >>
   *
   * TROIS REFUS, ET CHACUN FERME UNE PORTE QUE L'INTERFACE NE PEUT PAS GARDER SEULE. Un
   * telephone peut appeler cette route directement : hors reouverture provisoire, apres les
   * deux reponses prevues, ou une seconde fois. L'index unique est le dernier mot, mais un
   * message clair vaut mieux qu'une violation de contrainte.
   */
  app.post<{ Params: { id: string } }>(
    '/reports/:id/praticable',
    { preHandler: [app.requireDevice] },
    async (req) => {
      const { praticable } = parse(praticableInput, req.body);
      const deviceId = req.deviceId!;
      const report = await loadReport(req.params.id);
      if (!report) throw notFound("Ce signalement n'existe plus.");

      const phase = phaseBlocage({
        kind: report.kind as ReportKind,
        bloqueLe: report.bloqueLe,
        oui: report.praticableOui ?? 0,
        maintenant: new Date(),
      });
      if (phase !== 'probation') {
        throw conflict('hors_probation', "Ce segment n'est pas en reouverture provisoire.");
      }
      if ((report.praticableTotal ?? 0) >= QUESTIONS_PAR_EVENEMENT) {
        throw conflict('deja_repondu', 'Deux conducteurs ont deja repondu.');
      }

      const inserted = (await db.execute(sql`
        INSERT INTO report_praticable (report_id, device_id, praticable)
        VALUES (${report.id}, ${deviceId}, ${praticable})
        ON CONFLICT DO NOTHING
        RETURNING id
      `)) as unknown as { id: string }[];
      if (inserted.length === 0) {
        throw conflict('deja_repondu', 'Vous avez deja repondu pour ce signalement.');
      }

      if (!praticable) {
        /* << 1 x Non -> re-bloque, delai repart. >> Une seule ecriture exprime les deux : le
         * segment est de nouveau exclu des itineraires parce que la phase redevient << bloque >>,
         * et le compte des << oui >> repart de zero parce qu'il ne retient que les reponses
         * posterieures a cette date. */
        await db.execute(sql`UPDATE reports SET bloque_le = now() WHERE id = ${report.id}`);
        const rebloque = await loadReport(report.id);
        if (rebloque) {
          app.broadcastAround(rebloque.lat, rebloque.lon, {
            type: 'report:updated',
            report: rebloque,
          });
        }
        return { bloque: true, degage: false, report: rebloque };
      }

      const after = await loadReport(report.id);
      if (!after) throw notFound();
      const degage = (after.praticableOui ?? 0) >= OUI_POUR_DEBLOQUER;
      if (degage) {
        /* LE SIGNALEMENT QUITTE LA CARTE POUR TOUT LE MONDE. On marque la ligne comme retiree,
         * exactement comme le fait le deuxieme vote << plus la >> : le chemin de sortie d'un
         * signalement reste unique, quel que soit ce qui l'a declenche. */
        await db.execute(sql`
          UPDATE reports SET status = 'removed', removed_at = now() WHERE id = ${report.id}
        `);
        app.broadcastAround(after.lat, after.lon, { type: 'report:removed', reportId: after.id });
      } else {
        app.broadcastAround(after.lat, after.lon, { type: 'report:updated', report: after });
      }
      return { bloque: false, degage, report: after };
    },
  );
};

export default routes;
