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
import { env } from '../env.js';
import { badRequest, HttpError, noStore, parse } from '../lib/http.js';

/**
 * ALERTES OFFICIELLES — vigilance foret, vigilance meteo, fetes et commemorations.
 *
 * QUATRE ROUTES : une publique que l'application interroge a chaque ouverture, trois protegees
 * par le code a quatre chiffres que seul le panneau administrateur appelle.
 *
 * LE CODE N'EST PAS DANS L'APPLICATION, et ce n'est pas une precaution de principe : le site
 * portait le sien en clair dans son index.html, donc lisible par quiconque affichait le code
 * source de la page. Il a ete retire pour cette raison. Le mettre dans l'application Android
 * reviendrait au meme — un .apk se decompresse en une commande.
 *
 * Il vit donc dans ADMIN_CODE, sur le serveur, et le fondateur le change sans republier
 * l'application. Le depot GitHub est PUBLIC : ce fichier ne doit jamais contenir le code, ni
 * un commentaire qui le donne en exemple.
 *
 * QUATRE CHIFFRES, C'EST DIX MILLE COMBINAISONS. Un programme les essaie toutes en quelques
 * minutes sur une route sans limite. La limitation d'essais n'est donc pas un confort, c'est
 * la seule chose qui tient ce code debout — le cahier des charges le dit lui-meme.
 */

/* ------------------------------------------------------------------ */
/* Le code administrateur                                              */
/* ------------------------------------------------------------------ */

/**
 * Comparaison a duree constante.
 *
 * POURQUOI PAS UN SIMPLE `===`. L'egalite de chaines s'arrete au premier caractere different :
 * un code commencant par le bon chiffre met tres legerement plus longtemps a etre refuse qu'un
 * autre. Sur dix mille essais, cet ecart se mesure, et il permet de trouver le code chiffre par
 * chiffre — quarante essais au lieu de dix mille.
 *
 * L'attaque est theorique a travers un reseau, ou la variation du reseau couvre largement la
 * microseconde en question. Elle coute ici trois lignes, et on ne veut pas avoir a juger
 * ensuite si le reseau etait assez bruyant.
 */
function codeIdentique(fourni: string, attendu: string): boolean {
  if (fourni.length !== attendu.length) return false;
  let ecart = 0;
  for (let i = 0; i < fourni.length; i++) {
    ecart |= fourni.charCodeAt(i) ^ attendu.charCodeAt(i);
  }
  return ecart === 0;
}

/**
 * Blocage apres cinq essais rates en une minute, pendant quinze minutes.
 *
 * Valeurs du cahier des charges. Le compte est tenu PAR ADRESSE et en memoire : un redemarrage
 * de l'API le remet a zero, ce qui est acceptable — l'API ne redemarre pas toutes les minutes,
 * et celui qui essaie dix mille codes n'a aucun moyen de la faire redemarrer.
 *
 * LES ESSAIS REUSSIS NE COMPTENT PAS, et le compteur est remis a zero par une reussite. Le
 * fondateur qui se trompe deux fois puis entre le bon code ne doit pas rester a deux essais du
 * blocage pour le reste de l'heure.
 */
const ESSAIS_MAX = 5;
const FENETRE_MS = 60_000;
const BLOCAGE_MS = 15 * 60_000;

type Compteur = { essais: number[]; bloqueJusqua: number };
const compteurs = new Map<string, Compteur>();

function adresse(req: FastifyRequest): string {
  return req.ip ?? 'inconnue';
}

/** Purge les adresses dont plus rien n'est vivant : sans cela, la table grandit sans fin. */
function nettoyer(maintenant: number) {
  for (const [cle, c] of compteurs) {
    const vivant =
      c.bloqueJusqua > maintenant || c.essais.some((t) => maintenant - t < FENETRE_MS);
    if (!vivant) compteurs.delete(cle);
  }
}

function verifierCode(req: FastifyRequest): void {
  const maintenant = Date.now();
  if (compteurs.size > 500) nettoyer(maintenant);

  const cle = adresse(req);
  const c = compteurs.get(cle) ?? { essais: [], bloqueJusqua: 0 };

  if (c.bloqueJusqua > maintenant) {
    const minutes = Math.ceil((c.bloqueJusqua - maintenant) / 60_000);
    throw new HttpError(429, 'trop_d_essais', `Trop d'essais. Reessayez dans ${minutes} min.`);
  }

  const fourni = String(req.headers['x-admin-code'] ?? '');
  if (codeIdentique(fourni, env.ADMIN_CODE)) {
    compteurs.delete(cle);
    return;
  }

  c.essais = c.essais.filter((t) => maintenant - t < FENETRE_MS);
  c.essais.push(maintenant);
  if (c.essais.length >= ESSAIS_MAX) {
    c.bloqueJusqua = maintenant + BLOCAGE_MS;
    c.essais = [];
  }
  compteurs.set(cle, c);

  /* LE MESSAGE NE DIT PAS COMBIEN D'ESSAIS RESTENT. Il dirait a celui qui cherche le code
   * exactement quand s'arreter pour ne pas se faire bloquer. */
  throw new HttpError(401, 'code_incorrect', 'Code incorrect.');
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
   * C'est aussi la route qui VALIDE LE CODE : le panneau l'appelle en premier, et un 401 lui
   * fait afficher << Code incorrect. >> sans rien ouvrir. Il n'y a donc pas de route de
   * connexion separee — elle ne ferait que renvoyer la meme reponse deux fois.
   */
  app.get('/admin/alertes', async (req, reply) => {
    verifierCode(req);
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
  app.put('/admin/alertes/:type', async (req, reply) => {
    verifierCode(req);
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
  app.put('/admin/alertes/event/:id', async (req, reply) => {
    verifierCode(req);
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
