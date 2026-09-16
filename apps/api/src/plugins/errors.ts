import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { isProduction } from '../env.js';
import { HttpError } from '../lib/http.js';

const plugin: FastifyPluginAsync = async (app) => {
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: 'route_inconnue',
      message: `Aucune route ${req.method} ${req.url}.`,
    });
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.status).send({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.code(400).send({
        error: 'donnees_invalides',
        message: 'Certains champs sont incorrects.',
        details: error.issues.map((i) => ({ champ: i.path.join('.'), probleme: i.message })),
      });
      return;
    }

    const err = error as {
      code?: string;
      statusCode?: number;
      message?: string;
      constraint_name?: string;
      constraint?: string;
    };

    // Violation de contrainte d'unicite cote Postgres.
    if (err.code === '23505') {
      reply.code(409).send({ error: 'doublon', message: 'Cet enregistrement existe deja.' });
      return;
    }

    // Cle etrangere violee. Le cas de loin le plus frequent : un jeton d'appareil encore
    // valide (il est signe pour 400 jours) dont la ligne `devices` n'existe plus — base
    // remigree, appareil purge. Tout ce qui rattache une contribution a l'appareil echoue
    // alors, et l'utilisateur n'y peut rigoureusement rien.
    //
    // On le renvoie sous le code que l'application sait DEJA traiter : elle oublie son jeton,
    // se reinscrit et rejoue la requete. Le probleme se repare tout seul, sans que personne
    // n'ait a comprendre ce qui s'est passe.
    if (err.code === '23503') {
      const constraint = err.constraint_name ?? err.constraint ?? '';
      if (/device|created_by|uploaded_by/i.test(constraint)) {
        req.log.warn({ constraint }, 'appareil inconnu en base : reinscription demandee');
        reply.code(401).send({
          error: 'device_token_requis',
          message: "Appareil non identifie.",
        });
        return;
      }
      reply.code(409).send({
        error: 'reference_invalide',
        message: `Une donnee liee n'existe pas (${constraint || 'contrainte inconnue'}).`,
      });
      return;
    }

    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err: error }, 'erreur non geree');

    // Le code d'erreur Postgres est ajoute au message MEME en production. Il ne revele rien
    // de sensible — c'est un identifiant normalise, pas un contenu — et il transforme un
    // « une erreur est survenue » indiagnosticable en quelque chose qu'une capture d'ecran
    // suffit a identifier. Sur une equipe de cette taille, c'est la difference entre une
    // soiree de fouille dans les logs et trente secondes.
    const technicalCode = err.code ? ` (code ${err.code})` : '';

    reply.code(status).send({
      error: 'erreur_serveur',
      message: isProduction
        ? `Une erreur est survenue${technicalCode}. L'equipe a ete prevenue.`
        : (err.message ?? 'Erreur inconnue.'),
      ...(err.code ? { details: { pgCode: err.code } } : {}),
    });
  });
};

export default fp(plugin, { name: 'win-errors' });
