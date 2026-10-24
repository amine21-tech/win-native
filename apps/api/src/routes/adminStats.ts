import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';

/**
 * CHIFFRES DE L'ESPACE ADMINISTRATEUR.
 *
 * L'espace admin ne montrait que des listes a traiter — remarques, photos signalees, codes,
 * deblocages. Rien ne disait combien de lieux existent, combien de personnes contribuent, ni
 * si cela progresse. On pilotait l'application sans un chiffre.
 *
 * CE QUI EST COMPTE, ET POURQUOI CES CHIFFRES-LA. Chacun repond a une question qu'on se pose
 * vraiment devant cet ecran :
 *   - la carte grandit-elle, et a quelle vitesse ?      (lieux, et ceux des 30 derniers jours)
 *   - combien de gens l'alimentent ?                    (contributeurs, appareils actifs)
 *   - la route est-elle couverte en ce moment ?         (signalements actifs)
 *   - ai-je du travail en attente ?                     (remarques et photos a traiter)
 *   - ou l'application s'implante-t-elle ?              (les wilayas les mieux pourvues)
 *
 * UNE SEULE REQUETE PLUTOT QUE SEPT. Les sous-requetes sont independantes et tiennent dans un
 * aller-retour ; sept appels depuis un telephone en 3G algerienne feraient attendre pour
 * afficher des nombres.
 */
const routes: FastifyPluginAsync = async (app) => {
  app.get('/admin/stats', { preHandler: [app.requireAdmin] }, async () => {
    const rows = (await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM places WHERE deleted_at IS NULL)                    AS "lieux",
        (SELECT count(*)::int FROM places
          WHERE deleted_at IS NULL AND created_at > now() - interval '30 days')        AS "lieux30j",
        (SELECT count(*)::int FROM places
          WHERE deleted_at IS NULL AND is_partner)                                     AS "partenaires",
        (SELECT count(*)::int FROM devices WHERE is_contributor)                       AS "contributeurs",
        -- Un appareil « actif » s'est manifeste dans le mois. C'est la mesure la plus honnete
        -- d'une audience : le nombre total d'appareils enregistres ne fait que croitre et ne
        -- dit rien de qui se sert encore de l'application.
        (SELECT count(*)::int FROM devices
          WHERE last_seen_at > now() - interval '30 days')                             AS "appareilsActifs",
        (SELECT count(*)::int FROM reports WHERE status = 'active')                    AS "signalementsActifs",
        (SELECT count(*)::int FROM corrections WHERE status = 'pending')               AS "remarquesEnAttente",
        (SELECT count(*)::int FROM photo_reports WHERE status = 'pending')             AS "photosEnAttente"
    `)) as unknown as Record<string, number>[];

    /* Les wilayas les mieux pourvues. `wilaya` est saisie a la main et reste souvent vide :
     * on ecarte donc les lignes sans valeur plutot que de faire apparaitre une rubrique
     * << (vide) >> en tete du classement, ou elle ne voudrait rien dire. */
    const wilayas = (await db.execute(sql`
      SELECT wilaya AS "nom", count(*)::int AS "lieux"
      FROM places
      WHERE deleted_at IS NULL AND wilaya IS NOT NULL AND btrim(wilaya) <> ''
      GROUP BY wilaya
      ORDER BY count(*) DESC
      LIMIT 8
    `)) as unknown as { nom: string; lieux: number }[];

    return { ...(rows[0] ?? {}), wilayas };
  });
};

export default routes;
