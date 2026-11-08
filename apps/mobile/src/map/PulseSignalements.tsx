import { Layer } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { OR_MARQUEUR } from './signalisation';

/**
 * L'ANNEAU QUI PULSE AUTOUR D'UN SIGNALEMENT RECENT — correctif du 8 novembre, point 6.
 *
 * << Pulsation animee si signalement recent >>, et le document donne le seuil dans son code de
 * reference : `pulse=(report.age < 10min)`.
 *
 * POURQUOI UN COMPOSANT A LUI SEUL, et c'est tout l'interet de ce fichier. MapLibre ne sait pas
 * animer une couche : il n'y a pas d'equivalent de l'`AlphaAnimation` d'Android dans un style de
 * carte. Il faut donc renvoyer un rayon et une opacite differents a chaque image — c'est-a-dire
 * declencher un rendu React plusieurs fois par seconde.
 *
 * Fait depuis l'ecran de carte, cela re-rendrait les trois mille lignes de app/index.tsx dix
 * fois par seconde, pendant toute la navigation. C'est exactement la cause des saccades que le
 * client signalait au point 10 d'octobre. Ici, l'etat qui change vit dans CE composant : React
 * ne re-rend que lui, et lui ne contient qu'une couche de cercles.
 *
 * DIX IMAGES PAR SECONDE, ET NON SOIXANTE. Un anneau qui respire n'a pas besoin d'etre fluide
 * comme un deplacement : a dix images par seconde la pulsation se lit parfaitement, et on
 * economise cinquante rendus. La carte, elle, continue de tourner a sa propre cadence — cette
 * couche n'est qu'une de ses couches.
 */

/** Duree d'un cycle complet, en millisecondes : il grandit et s'efface, puis repart. */
const CYCLE_MS = 1_400;
/** Cadence de rafraichissement : dix images par seconde. */
const PAS_MS = 100;

/** Age au-dela duquel un signalement ne pulse plus. Valeur du document : dix minutes. */
export const RECENT_MS = 10 * 60 * 1000;

/** Rayons extremes de l'anneau, en points. Il part du bord du marqueur (14) et s'en ecarte. */
const RAYON_MIN = 15;
const RAYON_MAX = 30;

export function PulseSignalements({
  source,
  actif,
}: {
  source: string;
  /**
   * Y a-t-il quelque chose a animer ?
   *
   * LE MINUTEUR NE TOURNE PAS POUR RIEN. Dix rendus par seconde pendant des heures de
   * navigation, alors qu'aucun signalement des environs n'a moins de dix minutes, c'est de la
   * batterie depensee a animer un anneau que personne ne voit. L'ecran de carte sait, lui, si
   * la liste contient un signalement recent.
   */
  actif: boolean;
}) {
  /* La phase du cycle, de 0 a 1. */
  const [phase, setPhase] = useState(0);
  /* L'INSTANT, RELU A CHAQUE PAS. C'est lui qui fait qu'un signalement CESSE de pulser au bout
   * de dix minutes sans qu'on ait besoin de reconstruire les donnees de la couche : le filtre
   * compare la date de creation portee par chaque point a cet instant-ci. */
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    if (!actif) return;
    const debut = Date.now();
    const minuteur = setInterval(() => {
      const t = Date.now();
      setPhase(((t - debut) % CYCLE_MS) / CYCLE_MS);
      setMaintenant(t);
    }, PAS_MS);
    return () => clearInterval(minuteur);
  }, [actif]);

  const rayon = RAYON_MIN + (RAYON_MAX - RAYON_MIN) * phase;
  /* L'anneau s'efface en grandissant : c'est ce qui le fait lire comme une onde qui part du
   * marqueur, et non comme un cercle qui clignote. */
  const opacite = 0.55 * (1 - phase);

  return (
    <Layer
      id="reports-pulse"
      type="circle"
      source={source}
      /* SEULS LES RECENTS PULSENT. `creeA` est la date de creation en millisecondes, posee sur
       * chaque point par l'ecran de carte. Un signalement vieux de onze minutes sort du filtre
       * tout seul, a la seconde pres, sans que rien ne soit recalcule. */
      filter={['>', ['get', 'creeA'], maintenant - RECENT_MS]}
      paint={{
        'circle-radius': rayon,
        'circle-color': 'transparent',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': OR_MARQUEUR,
        'circle-stroke-opacity': opacite,
      }}
    />
  );
}
