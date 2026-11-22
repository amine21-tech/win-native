import { useEffect, useRef, useState } from 'react';
import type { MapRef } from '@maplibre/maplibre-react-native';
import { api } from '../api/client';
import { haversine } from '../shared';
import { estEnAgglomeration, type TraitDeCarte } from './agglomeration';

/**
 * Limite de vitesse reglementaire du troncon en cours (v79 #7 du site).
 *
 * D'ou vient le chiffre, dans cet ordre :
 *   1. la limite REELLE des panneaux, quand OpenStreetMap la connait : le serveur la lit dans
 *      les tuiles Valhalla (GET /routing/speed-limit). Interrogee au plus une fois toutes les
 *      vingt secondes, et seulement apres 250 m parcourus — sans ces deux garde-fous, ce serait
 *      une requete par releve GPS ;
 *   2. a defaut, le TYPE de route lu dans les tuiles vectorielles deja affichees a l'ecran.
 *      Aucune requete, aucune batterie consommee, et c'est ce que font les cartes courantes sur
 *      les troncons non renseignes.
 *
 * Ce que l'on NE fait pas : deviner. Si le type de route n'est pas reconnu, la pastille reste
 * masquee. Une limite fausse est pire que pas de limite du tout — le conducteur s'y fierait.
 *
 * Les valeurs sont celles du code de la route algerien, reprises telles quelles de la version
 * web (LIMITES_DZ). Les limites « chaussee humide » (40 / 80 / 100) y figurent mais ne sont pas
 * appliquees : l'application n'a aucune source meteo, et supposer la pluie afficherait une
 * limite erronee la plupart du temps.
 */
const LIMITS: Record<string, number> = {
  motorway: 120,
  trunk: 100,
  primary: 100,
  secondary: 100,
  tertiary: 80,
  unclassified: 80,
  residential: 50,
  // « minor » : nom des tuiles OpenMapTiles (celles d'OpenFreeMap) pour les rues de quartier et
  // les voies non classees. C'est la classe la plus frequente en ville — sans elle, la pastille
  // restait vide presque partout.
  minor: 50,
  living_street: 20,
  service: 30,
};

/** Du plus rapide au plus lent. Sur un echangeur, plusieurs routes se superposent a l'ecran :
 * en voiture, on est presque toujours sur la plus importante. */
const BY_IMPORTANCE = Object.keys(LIMITS);


/** Fenetre de lecture autour du vehicule, en points d'ecran. */
const PROBE_RADIUS = 22;
/**
 * FENETRE DU BATI, bien plus large que celle de la route — correctif Fleches, bug 1.
 *
 * Vingt-deux points suffisent a trouver la route : on roule dessus. Les maisons, elles, sont
 * de l'autre cote du trottoir. A 17,5 de zoom, un point d'ecran vaut environ soixante-dix
 * centimetres : quatre-vingt-dix points font donc une soixantaine de metres de part et
 * d'autre du vehicule. Assez pour voir la rue ; trop peu pour apercevoir le village suivant.
 */
const PROBE_AGGLO = 90;
/** Cadence de lecture. Plus court n'apporterait rien : le type de route change rarement. */
const INTERVAL_MS = 3000;
/** Garde-fous de l'interrogation du serveur, repris de la version web. */
const SERVER_MIN_INTERVAL_MS = 20_000;
const SERVER_MIN_MOVE_M = 250;

type Props = {
  active: boolean;
  mapRef: React.RefObject<MapRef | null>;
  /** Position du vehicule a l'ecran, en points : [x, y]. */
  vehiclePoint: () => [number, number];
  /** Position geographique courante, pour interroger le serveur. */
  here: { lat: number; lon: number } | null;
};

/**
 * CE QUE LA CARTE DIT DU TRONCON SOUS LE VEHICULE.
 *
 * Le hook rendait un nombre — la limite — parce que c'est tout ce que la pastille rouge
 * demandait. Le correctif Fleches a besoin de deux choses de plus, et elles sortent de la MEME
 * lecture : la classe de la route (une sortie d'autoroute sans `maxspeed` reste une autoroute)
 * et la presence de bati (une nationale taguee 100 km/h au milieu des maisons reste une
 * ville). Les calculer ailleurs aurait voulu dire interroger la carte une seconde fois.
 */
export type EtatTroncon = {
  /** Limite reglementaire en km/h, ou `null` si ni les panneaux ni la carte ne la donnent. */
  limiteKmh: number | null;
  /** Classe de route d'OpenMapTiles : `motorway`, `trunk`, `primary`, `minor`... */
  classeRoute: string | null;
  /** Du bati autour du vehicule ? Voir agglomeration.ts. */
  agglomeration: boolean;
};

const RIEN: EtatTroncon = { limiteKmh: null, classeRoute: null, agglomeration: false };

export function useSpeedLimit({ active, mapRef, vehiclePoint, here }: Props): EtatTroncon {
  const [etat, setEtat] = useState<EtatTroncon>(RIEN);
  const pointRef = useRef(vehiclePoint);
  pointRef.current = vehiclePoint;
  const hereRef = useRef(here);
  hereRef.current = here;
  /** Derniere limite obtenue du serveur, et conditions de la prochaine demande. */
  const posted = useRef<{ at: number; lat: number; lon: number } | null>(null);
  const fromServer = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setEtat(RIEN);
      fromServer.current = null;
      posted.current = null;
      return;
    }
    let cancelled = false;

    /** Limite reelle, demandee au serveur avec parcimonie. */
    const askServer = async () => {
      const position = hereRef.current;
      if (!position) return;
      const last = posted.current;
      const now = Date.now();
      if (
        last &&
        (now - last.at < SERVER_MIN_INTERVAL_MS ||
          haversine(last.lat, last.lon, position.lat, position.lon) < SERVER_MIN_MOVE_M)
      ) {
        return;
      }
      posted.current = { at: now, lat: position.lat, lon: position.lon };
      try {
        const { limitKmh } = await api<{ limitKmh: number | null }>('/routing/speed-limit', {
          query: { lat: position.lat, lon: position.lon },
        });
        if (!cancelled) fromServer.current = limitKmh;
      } catch {
        // Reseau absent : on garde la deduction par type de route.
      }
    };

    const read = async () => {
      void askServer();
      try {
        const [x, y] = pointRef.current();
        const box: [[number, number], [number, number]] = [
          [x - PROBE_RADIUS, y - PROBE_RADIUS],
          [x + PROBE_RADIUS, y + PROBE_RADIUS],
        ];
        const features = await mapRef.current?.queryRenderedFeatures(box);
        if (cancelled) return;

        let best: string | null = null;
        let bestRank = Number.MAX_SAFE_INTEGER;
        for (const feature of features ?? []) {
          const properties = (feature.properties ?? {}) as Record<string, unknown>;
          // On reconnait une route a sa GEOMETRIE, pas au nom de sa couche : la carte Android ne
          // renvoie pas ce nom (`sourceLayer` absent), et le filtre qui s'y fiait ecartait donc
          // TOUTES les routes — la pastille ne s'affichait jamais, alors que le site affichait
          // « 30 » au meme endroit. Une ligne suffit a exclure les zones (« residential » est
          // aussi une classe d'occupation du sol, mais un polygone).
          const type = feature.geometry?.type;
          if (type !== 'LineString' && type !== 'MultiLineString') continue;
          // Les tuiles nomment les bretelles « motorway_link », « primary_link »… : meme limite
          // que la route qu'elles rejoignent.
          const cls = String(properties['class'] ?? properties['highway'] ?? properties['subclass'] ?? '')
            .toLowerCase()
            .replace(/_link$/, '');
          const rank = BY_IMPORTANCE.indexOf(cls);
          if (rank >= 0 && rank < bestRank) {
            bestRank = rank;
            best = cls;
          }
        }
        /* LE BATI AUTOUR, dans une fenetre plus large — correctif Fleches, bug 1. Une seconde
         * interrogation de la carte, et non un elargissement de la premiere : chercher la
         * route dans une fenetre de quatre-vingt-dix points ramasserait l'autoroute qui passe
         * a cote quand on roule sur la contre-allee. */
        const autour = await mapRef.current?.queryRenderedFeatures([
          [x - PROBE_AGGLO, y - PROBE_AGGLO],
          [x + PROBE_AGGLO, y + PROBE_AGGLO],
        ]);
        if (cancelled) return;
        const traits: TraitDeCarte[] = (autour ?? []).map((feature) => ({
          polygone:
            feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon',
          proprietes: (feature.properties ?? {}) as Record<string, unknown>,
        }));

        // La valeur des panneaux prime toujours sur la deduction.
        const limiteKmh = fromServer.current ?? (best ? (LIMITS[best] ?? null) : null);
        const agglomeration = estEnAgglomeration(traits);
        /* ON NE REND UN NOUVEL OBJET QUE SI QUELQUE CHOSE A CHANGE. Sans cette comparaison,
         * l'ecran de navigation entier se redessinerait toutes les trois secondes, pour
         * annoncer trois valeurs identiques. React s'en chargeait tout seul tant que ce hook
         * rendait un nombre ; un objet est toujours une reference neuve. */
        setEtat((prev) =>
          prev.limiteKmh === limiteKmh &&
          prev.classeRoute === best &&
          prev.agglomeration === agglomeration
            ? prev
            : { limiteKmh, classeRoute: best, agglomeration });
      } catch {
        // Carte pas encore prete, ou lecture impossible : on garde la valeur precedente plutot
        // que de faire clignoter la pastille.
      }
    };

    void read();
    const timer = setInterval(() => void read(), INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, mapRef]);

  return etat;
}
