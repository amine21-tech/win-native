import type { FastifyReply } from 'fastify';
import { ZodError, type ZodTypeAny, type z } from 'zod';

/** Erreur metier, transformee en reponse HTTP propre par le gestionnaire global. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const notFound = (message = 'Ressource introuvable.') =>
  new HttpError(404, 'introuvable', message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);
export const forbidden = (message = 'Action non autorisee.') =>
  new HttpError(403, 'interdit', message);

/**
 * Valide une entree avec zod et leve une erreur 400 lisible en cas d'echec.
 * Les messages sont renvoyes tels quels a l'application, qui les affiche.
 */
export function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw badRequest(
        'donnees_invalides',
        'Certains champs sont incorrects.',
        error.issues.map((i) => ({ champ: i.path.join('.'), probleme: i.message })),
      );
    }
    throw error;
  }
}

/** Reponse paginee homogene pour toutes les listes. */
export function page<T>(items: T[], total: number, limit: number, offset: number) {
  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

export function noStore(reply: FastifyReply): FastifyReply {
  return reply.header('Cache-Control', 'no-store');
}
