import { randomInt } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { HttpError, parse } from '../lib/http.js';

/**
 * CODES DE CONTRIBUTEUR — un par personne, crees depuis l'espace admin.
 *
 * CE QU'ILS DONNENT : le titre, et rien d'autre. Le badge << contributeur >>, le nom au
 * classement, le compteur de lieux. Le client a ouvert la correction et la suppression a tout
 * le monde le 19 octobre, puis a confirme le 22 que le code ne devait plus etre qu'une
 * reconnaissance. Personne n'est donc bloque faute de code, et en revoquer un ne retire aucune
 * capacite — seulement la distinction.
 *
 * POURQUOI UNE TABLE PLUTOT QU'UNE VARIABLE DE CONFIGURATION. Il n'existait qu'un seul code,
 * ecrit dans le fichier du serveur : tout le monde partageait le meme, on ne savait pas qui
 * s'en etait servi, et le changer le retirait a tous d'un coup. Un code par personne regle les
 * trois.
 *
 * CHAQUE CODE NE SERT QU'UNE FOIS : il se lie au premier appareil qui le presente. C'est la
 * difference entre donner un titre a quelqu'un et publier un mot de passe.
 */

/**
 * Alphabet du code : chiffres et majuscules, MOINS ce qui se confond a l'oral et a l'oeil.
 *
 * Ces codes se dictent au telephone et se recopient a la main. O/0, I/1/L et S/5 produisent
 * exactement les erreurs de saisie qu'on passerait ensuite a diagnostiquer. Les retirer coute
 * quelques combinaisons sur un espace qui en compte des milliards.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';
const LONGUEUR = 8;

function tirerCode(): string {
  let code = '';
  // `randomInt` et non `Math.random` : un code devinable n'est pas un code.
  for (let i = 0; i < LONGUEUR; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

const creationInput = z.object({
  /** Pour qui ce code est destine. C'est la raison d'etre de la table. */
  label: z.string().trim().min(2).max(120),
});

const routes: FastifyPluginAsync = async (app) => {
  /** Liste des codes, du plus recent au plus ancien, avec leur etat. */
  app.get('/admin/contributor-codes', { preHandler: [app.requireAdmin] }, async () => {
    const rows = await db.execute(sql`
      SELECT c.id, c.code, c.label,
             c.created_at AS "createdAt",
             c.used_at    AS "usedAt",
             c.revoked_at AS "revokedAt",
             a.display_name AS "createdByName"
      FROM contributor_codes c
      LEFT JOIN admins a ON a.id = c.created_by
      ORDER BY c.created_at DESC
      LIMIT 200
    `);
    return { items: rows };
  });

  /** Cree un code pour une personne. Le code est tire ici, jamais choisi par l'appelant. */
  app.post('/admin/contributor-codes', { preHandler: [app.requireAdmin] }, async (req) => {
    const { label } = parse(creationInput, req.body);

    /* Le tirage peut, tres rarement, tomber sur un code deja pris. La contrainte d'unicite en
     * base est ce qui le garantit vraiment ; cette boucle ne fait que reessayer proprement au
     * lieu de rendre une erreur a l'administrateur. */
    for (let essai = 0; essai < 5; essai += 1) {
      const code = tirerCode();
      try {
        const rows = await db.execute(sql`
          INSERT INTO contributor_codes (code, label, created_by)
          VALUES (${code}, ${label}, ${req.admin!.id})
          RETURNING id, code, label, created_at AS "createdAt"
        `);
        return (rows as unknown as unknown[])[0];
      } catch (error) {
        // 23505 = violation d'unicite. Toute autre erreur doit remonter telle quelle.
        if ((error as { code?: string }).code !== '23505') throw error;
      }
    }
    throw new HttpError(500, 'code_non_genere', "Le code n'a pas pu etre genere, reessayez.");
  });

  /**
   * Retire un code.
   *
   * Deux effets, et le second compte autant que le premier : le code ne pourra plus etre
   * presente, ET l'appareil qui s'en etait servi perd le titre. Revoquer sans retirer le badge
   * ne voudrait rien dire.
   *
   * La ligne n'est pas supprimee mais datee : savoir qui a ete promu, par qui et jusqu'a quand
   * est precisement ce qu'on voudra relire le jour ou une question se posera.
   */
  app.delete<{ Params: { id: string } }>(
    '/admin/contributor-codes/:id',
    { preHandler: [app.requireAdmin] },
    async (req) => {
      const rows = (await db.execute(sql`
        UPDATE contributor_codes
        SET revoked_at = now()
        WHERE id = ${req.params.id} AND revoked_at IS NULL
        RETURNING used_by AS "usedBy"
      `)) as unknown as { usedBy: string | null }[];

      if (rows.length === 0) {
        throw new HttpError(404, 'code_introuvable', 'Ce code est introuvable ou deja retire.');
      }

      const appareil = rows[0]!.usedBy;
      if (appareil) {
        await db.execute(sql`
          UPDATE devices
          SET is_contributor = false, contributor_granted_at = NULL
          WHERE id = ${appareil}
        `);
      }

      return { ok: true, titreRetire: appareil !== null };
    },
  );
};

export default routes;

/**
 * Un appareil presente un code : s'il est valable, il le consomme et rend vrai.
 *
 * Expose ici plutot que dans la route des lieux pour que la table reste la propriete d'un
 * seul fichier. Rend faux sans rien modifier quand le code est inconnu, deja servi ou retire —
 * l'appelant decide du message.
 */
export async function consommerCode(code: string, deviceId: string): Promise<boolean> {
  /* Une seule requete, et c'est volontaire : entre un SELECT et un UPDATE separes, deux
   * telephones presentant le meme code au meme instant passeraient tous les deux. La clause
   * `used_at IS NULL` dans le UPDATE fait que le second ne trouve plus rien a mettre a jour. */
  const rows = (await db.execute(sql`
    UPDATE contributor_codes
    SET used_by = ${deviceId}, used_at = now()
    WHERE upper(code) = upper(${code})
      AND used_at IS NULL
      AND revoked_at IS NULL
    RETURNING id
  `)) as unknown as unknown[];

  return rows.length > 0;
}
