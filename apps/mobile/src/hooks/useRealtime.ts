import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Report } from '../shared';
import { BASE_URL } from '../api/client';

type Handlers = {
  onNew?: (report: Report) => void;
  onUpdated?: (report: Report) => void;
  onRemoved?: (reportId: string) => void;
};

/**
 * Connexion temps reel aux signalements.
 *
 * L'application n'ecoute que les cellules autour d'elle : a chaque deplacement
 * notable, elle renvoie sa position et le serveur ajuste l'abonnement. Sans
 * cela, un utilisateur d'Oran recevrait chaque dos d'ane signale a Annaba.
 */
export function useRealtime(
  position: { lat: number; lon: number } | null,
  handlers: Handlers,
): void {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  /** Derniere position connue, relue lors d'une reconnexion (voir l'ecouteur `connect`). */
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    // L'API peut etre servie sous un prefixe (`https://serveur/v2`), le temps
    // que l'ancien backend cohabite avec le nouveau. Socket.io a besoin de
    // l'origine d'un cote et du chemin complet de l'autre : si on lui passe le
    // prefixe dans l'URL, il le prend pour un espace de noms et frappe la
    // mauvaise adresse.
    const base = new URL(BASE_URL);
    const socket = io(base.origin, {
      path: `${base.pathname.replace(/\/$/, '')}/socket.io/`,
      transports: ['websocket'],
      reconnectionDelay: 1500,
      reconnectionDelayMax: 15_000,
    });
    socketRef.current = socket;

    // Le serveur perd l'abonnement a chaque coupure : sans ce reabonnement, l'utilisateur
    // cessait de recevoir les signalements apres un simple passage de tunnel, et ne les
    // retrouvait qu'apres avoir parcouru le kilometre qui declenche l'effet ci-dessous.
    socket.on('connect', () => {
      const here = positionRef.current;
      if (here) socket.emit('subscribe', { lat: here.lat, lon: here.lon });
    });

    socket.on('report:new', (e: { report: Report }) => handlersRef.current.onNew?.(e.report));
    socket.on('report:updated', (e: { report: Report }) =>
      handlersRef.current.onUpdated?.(e.report),
    );
    socket.on('report:removed', (e: { reportId: string }) =>
      handlersRef.current.onRemoved?.(e.reportId),
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Reabonnement seulement quand on a franchi environ un kilometre, pour ne
  // pas envoyer un message a chaque rafraichissement GPS.
  const lastSent = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    if (!position || !socketRef.current) return;
    const previous = lastSent.current;
    const moved =
      !previous ||
      Math.abs(previous.lat - position.lat) > 0.01 ||
      Math.abs(previous.lon - position.lon) > 0.01;
    if (!moved) return;

    lastSent.current = position;
    socketRef.current.emit('subscribe', { lat: position.lat, lon: position.lon });
  }, [position]);
}
