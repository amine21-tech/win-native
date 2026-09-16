import { useEffect, useState } from 'react';

/** Horloge stricte sur 24h (00:00-23:59) — demande client explicite (chantier #22), independante
 * du format 12h/24h par defaut de la locale du telephone. */
export function formatClock24(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Heure courante, rafraichie toutes les `intervalMs` (15s par defaut, largement assez pour un
 * affichage a la minute pres) — utilisee sur l'ecran principal ET pendant la navigation, comme
 * demande par le client (chantier #22 : "horloge visible en permanence"). */
export function useClock(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Debut et fin de la plage consideree comme nocturne, reprises telles quelles de v83
 * (index.html : `if(h>=19||h<6) applyNight(true)`). Elles collent au crepuscule algerien
 * plutot qu'a une heure ronde. */
const NIGHT_FROM_HOUR = 19;
const NIGHT_UNTIL_HOUR = 6;

export function isNightTime(at: Date = new Date()): boolean {
  const hour = at.getHours();
  return hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR;
}

/**
 * Theme deduit de l'heure, reevalue toutes les cinq minutes.
 *
 * La v83 ne faisait ce calcul qu'au chargement de la page : un trajet commence a 18 h 50
 * restait en plein blanc toute la nuit. Ici la bascule a lieu pendant le trajet, au moment
 * ou la lumiere baisse — c'est exactement la ou elle compte.
 */
export function useAutoScheme(enabled: boolean): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => (isNightTime() ? 'dark' : 'light'));

  useEffect(() => {
    if (!enabled) return;
    const check = () => setScheme(isNightTime() ? 'dark' : 'light');
    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, [enabled]);

  return scheme;
}
