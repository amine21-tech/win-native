import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  DZ_WILAYA_NAMES,
  IDS_EVENEMENTS,
  LANGUAGES,
  PHENOMENES,
  raisonsDeRefus,
  type Alerte,
} from '@win/shared';
import { db } from '../db/client.js';
import { badRequest, noStore, parse } from '../lib/http.js';

/**
 * ALERTES OFFICIELLES — vigilance foret, vigilance meteo, fetes et commemorations.
 *
 * QUATRE ROUTES : une publique que l'application interroge a chaque ouverture, trois reservees
 * a l'espace administrateur.
 *
 * IL N'Y A PAS DE SECOND CODE, ET C'EST UNE CORRECTION DE FOND. Le cahier des charges en
 * demande un, a quatre chiffres, avec limitation des essais et blocage de quinze minutes.
 * C'est ce qui a ete ecrit d'abord, puis retire — parce que le client a pose la bonne
 * question : il a deja un mot de passe pour entrer dans l'espace administrateur, pourquoi en
 * redemander un second une fois qu'il est dedans ?
 *
 * La reponse est que ce code n'a jamais ete concu pour notre application. Le document est
 * ecrit pour la version HTML du site, qui n'avait aucun compte : son seul moyen de proteger
 * une page etait un nombre ecrit dans le code source — d'ou les quatre chiffres, et d'ou
 * l'insistance du document a ne pas les mettre dans l'application.
 *
 * L'application native, elle, a de vrais comptes : adresse, mot de passe hache en argon2,
 * role, jeton signe, expiration. Poser un code a quatre chiffres par-dessus revient a ajouter
 * une serrure PLUS FAIBLE sur une porte deja fermee : dix mille combinaisons contre un mot de
 * passe, et un secret de plus a transmettre, a retenir et a changer.
 *
 * Les trois routes protegees utilisent donc `requireAdmin`, comme /admin/stats et toutes les
 * autres. Le panneau des alertes devient une section de l'espace administrateur existant.
 */

/**
 * Adresse de l'appareil qui publie, pour le journal des activations.
 *
 * On garde le journal meme sans code partage : plusieurs personnes peuvent avoir un compte
 * administrateur, et le jour ou une banniere apparait sans que personne ne reconnaisse
 * l'avoir allumee, c'est la seule chose qui permettra de repondre.
 */
function adresse(req: FastifyRequest): string {
  return req.ip ?? 'inconnue';
}

/* ------------------------------------------------------------------ */
/* Ce que le panneau peut envoyer                                      */
/* ------------------------------------------------------------------ */

const messageSchema = z
  .record(z.enum(LANGUAGES), z.string().max(400))
  .nullable()
  .optional();

const vigilanceInput = z.object({
  active: z.boolean(),
  wilayas: z.array(z.enum(DZ_WILAYA_NAMES as unknown as [string, ...string[]])).max(58).optional(),
  phenomena: z.array(z.enum(PHENOMENES)).optional(),
  message: messageSchema,
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const evenementInput = z.object({
  active: z.boolean(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  message: messageSchema,
});

/**
 * Un tableau de texte passe en PARAMETRES, jamais recopie dans la requete.
 *
 * POURQUOI UNE FONCTION POUR TROIS LIGNES. Drizzle etale un tableau interpole en parametres
 * separes : `${wilayas}` ne donne pas un tableau PostgreSQL mais une suite de valeurs, et le
 * transtypage `::text[]` echoue. La tentation est alors de fabriquer `ARRAY['Alger','Oran']`
 * a la main avec les apostrophes doublees — cela marche, et c'est la porte d'entree qu'on
 * finit par oublier d'avoir laissee ouverte.
 *
 * Les noms de wilaya sont certes deja valides contre DZ_WILAYA_NAMES, donc rien d'injectable
 * ne devrait arriver jusqu'ici. Mais faire reposer la securite d'une requete sur une
 * validation ecrite ailleurs, c'est accepter qu'un jour quelqu'un assouplisse la validation
 * sans savoir ce qu'elle protegeait. Le meme probleme a deja ete rencontre dans reports.ts et
 * places.ts : on reprend leur solution.
 */
function tableauTexte(valeurs: readonly string[]) {
  if (valeurs.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(valeurs.map((v) => sql`${v}`), sql`, `)}]::text[]`;
}

type LigneBase = {
  type: 'fire' | 'weather' | 'event';
  id: string;
  active: boolean;
  phenomena: string[];
  wilayas: string[];
  message: Record<string, string> | null;
  until: string | null;
};

/**
 * Mise en forme d'une ligne de base vers ce que l'application attend.
 *
 * `until` arrive de PostgreSQL comme une date, que le pilote rend en chaine complete. On la
 * coupe a dix caracteres : l'application compare des AAAA-MM-JJ, et une heure de plus la
 * ferait echouer silencieusement sur le fuseau.
 */
function versAlerte(l: LigneBase): Alerte {
  const a: Alerte = { type: l.type, active: l.active };
  if (l.type === 'event') a.id = l.id;
  if (l.type === 'weather') a.phenomena = l.phenomena as Alerte['phenomena'];
  if (l.type !== 'event') a.wilayas = l.wilayas;
  if (l.message) a.message = l.message as Alerte['message'];
  a.until = l.until ? String(l.until).slice(0, 10) : null;
  return a;
}

const routes: FastifyPluginAsync = async (app) => {
  /**
   * LA SEULE ROUTE PUBLIQUE. L'application l'appelle a chaque ouverture.
   *
   * ELLE NE REND QUE LES ACTIVES, ET LES NON EXPIREES. Le filtrage se fait ici parce que
   * c'est le moins de donnees a transmettre, mais l'application refiltre de son cote : entre
   * les deux il y a son cache hors ligne de vingt-quatre heures, et une alerte valable a la
   * derniere connexion peut avoir expire depuis.
   *
   * `noStore` est indispensable : le cahier des charges ecrit << pas de cache >>. Une alerte
   * desactivee doit disparaitre chez tout le monde, et un intermediaire qui garde la reponse
   * dix minutes la ferait survivre a son extinction.
   */
  app.get('/alertes-officielles', async (_req, reply) => {
    noStore(reply);
    const rows = (await db.execute(sql`
      SELECT type, id, active, phenomena, wilayas, message, until
      FROM alertes_officielles
      WHERE active AND (until IS NULL OR until >= current_date)
      ORDER BY CASE type WHEN 'fire' THEN 0 WHEN 'weather' THEN 1 ELSE 2 END, id
    `)) as unknown as LigneBase[];
    return { alertes: rows.map(versAlerte) };
  });

  /**
   * Le panneau administrateur : les deux vigilances et les douze fetes, actives ou non.
   *
   * ACTIVES OU NON, et c'est tout l'interet : le panneau doit montrer les douze fetes
   * ETEINTES pour qu'on puisse en allumer une. La route publique, elle, ne rend que les
   * actives — personne d'autre n'a besoin de savoir ce qui existe.
   */
  app.get('/admin/alertes', { preHandler: [app.requireAdmin] }, async (_req, reply) => {
    noStore(reply);
    const rows = (await db.execute(sql`
      SELECT type, id, active, phenomena, wilayas, message, until, updated_at AS "updatedAt"
      FROM alertes_officielles
      ORDER BY CASE type WHEN 'fire' THEN 0 WHEN 'weather' THEN 1 ELSE 2 END, id
    `)) as unknown as (LigneBase & { updatedAt: string })[];
    return {
      alertes: rows.map((l) => ({ ...versAlerte(l), updatedAt: l.updatedAt })),
    };
  });

  /** Publier une vigilance : `:type` vaut `fire` ou `weather`. */
  app.put('/admin/alertes/:type', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    noStore(reply);

    const { type } = req.params as { type: string };
    if (type !== 'fire' && type !== 'weather') {
      throw badRequest('type_inconnu', 'Seules les vigilances fire et weather existent.');
    }

    const corps = parse(vigilanceInput, req.body);
    const wilayas = corps.wilayas ?? [];
    const phenomena = type === 'weather' ? (corps.phenomena ?? []) : [];

    /* LA MEME VALIDATION QUE LE PANNEAU, REFAITE ICI. Le panneau grise son bouton tant qu'il
     * manque un phenomene ; cette route ne peut pas en dependre — rien n'empeche d'appeler
     * l'API directement, et une vigilance meteo publiee sans phenomene afficherait une
     * banniere bleue sans message chez tous les utilisateurs du pays. */
    const raisons = raisonsDeRefus({
      type,
      active: corps.active,
      phenomena: phenomena as Alerte['phenomena'],
      wilayas,
      until: corps.until ?? null,
    });
    if (raisons.length > 0) {
      throw badRequest('alerte_invalide', `Publication refusee : ${raisons.join(', ')}.`, raisons);
    }

    await db.execute(sql`
      UPDATE alertes_officielles
      SET active = ${corps.active},
          wilayas = ${tableauTexte(wilayas)},
          phenomena = ${tableauTexte(phenomena)},
          message = ${corps.message ? JSON.stringify(corps.message) : null}::jsonb,
          until = ${corps.until ?? null}::date,
          updated_at = now(),
          updated_by = ${adresse(req)}
      WHERE type = ${type} AND id = ''
    `);

    await db.execute(sql`
      INSERT INTO alertes_journal (type, alerte_id, active, wilayas, phenomena, ip)
      VALUES (${type}, '', ${corps.active},
        ${tableauTexte(wilayas)},
        ${tableauTexte(phenomena)},
        ${adresse(req)})
    `);

    return { ok: true, type, active: corps.active, wilayas, phenomena };
  });

  /** Allumer ou eteindre une fete du catalogue. */
  app.put('/admin/alertes/event/:id', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    noStore(reply);

    const { id } = req.params as { id: string };
    if (!IDS_EVENEMENTS.includes(id)) {
      throw badRequest('evenement_inconnu', `La fete « ${id} » n'existe pas au catalogue.`);
    }

    const corps = parse(evenementInput, req.body);

    /* UNE FETE N'A PAS DE WILAYAS : elle s'affiche a tous. Le cahier des charges l'ecrit, et
     * c'est logique — on ne souhaite pas un bon 1er novembre a une moitie du pays. */
    await db.execute(sql`
      UPDATE alertes_officielles
      SET active = ${corps.active},
          until = ${corps.until ?? null}::date,
          message = ${corps.message ? JSON.stringify(corps.message) : null}::jsonb,
          updated_at = now(),
          updated_by = ${adresse(req)}
      WHERE type = 'event' AND id = ${id}
    `);

    await db.execute(sql`
      INSERT INTO alertes_journal (type, alerte_id, active, ip)
      VALUES ('event', ${id}, ${corps.active}, ${adresse(req)})
    `);

    return { ok: true, id, active: corps.active, until: corps.until ?? null };
  });
};

export default routes;
