import { speakGuidance, stopSpeaking } from '../speech/voice';
import { phraseItineraireRecalcule, phraseRouteBloquee, phraseSortieRatee } from './instructions';
import { useSpokenLanguage } from '../speech/useSpokenLanguage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localizedInstruction, lowerFirst, spokenDistance } from './instructions';
import {
  fetchRoute,
  locateOnRoute,
  traveledMeters,
  type Maneuver,
  type Route,
  type RouteLocation,
  type RouteMode,
} from './routing';
import { bearing, haversine, pointAu, type Language } from '../shared';
import { useSession } from '../store/session';

type Coords = { lat: number; lon: number };

const MANEUVER_ARRIVAL_RADIUS_M = 30;
/* Detection de la sortie d'itineraire — portage de `RoutingSession::OnLocationPositionChanged`
 * d'Organic Maps (libs/routing/routing_session.cpp, licence Apache 2.0), demande par le client.
 *
 * Leur methode ne ressemble pas a un simple seuil de distance, et c'est tout l'interet :
 *
 *   1. LA TOLERANCE SUIT LA PRECISION ANNONCEE PAR LE GPS. Ils projettent la position dans un
 *      rectangle de `max(matchingThreshold, horizontalAccuracy)` — 50 m pour une voiture. Un
 *      seuil fixe declare « sorti de l'itineraire » un conducteur parfaitement sur sa route des
 *      que le GPS annonce 80 m de precision, ce qui arrive entre deux immeubles.
 *
 *   2. ON COMPTE DES POINTS, PAS DES MESURES. Une mesure hors trace vaut DEUX points si le
 *      vehicule roule (au-dela de 3 km/h), UN seul s'il est a l'arret. Un conducteur arrete a un
 *      feu, dont le GPS derive, met donc deux fois plus longtemps a declencher un recalcul qu'un
 *      conducteur qui s'eloigne vraiment.
 *
 *   3. UNE MESURE QUI NE S'ELOIGNE PAS DAVANTAGE NE COMPTE PAS. Si la distance au trace n'a pas
 *      bouge depuis la mesure precedente, c'est du bruit et non un ecart : on ne compte rien.
 *      Sans cela, un telephone pose pres d'une route comptait indefiniment.
 *
 * Seul le total exige differe : six points au lieu de dix, soit trois mesures (environ trois
 * secondes) pour un vehicule qui roule, six pour un vehicule lent. Le client demande un recalcul
 * rapide ; Organic Maps vise plutot l'economie de batterie. Un ecart franc — plus de 120 m —
 * vaut trois points, ce qui le ramene a deux mesures.
 *
 * Le cap du vehicule est transmis avec la demande (voir loadRoute) : le nouveau trajet part dans
 * le sens ou l'on roule, au lieu de commencer par un demi-tour vers le trace abandonne.
 */
const OFF_ROUTE_CERTAIN_M = 120;
/** Au-dessus de cette vitesse, une mesure hors trace compte double (Organic Maps : 3 km/h). */
const MIN_SPEED_FOR_REBUILD_MPS = 3 / 3.6;
/** Ecart minimal, en metres, pour qu'une mesure compte comme un vrai eloignement. */
const RUNAWAY_SENSITIVITY_M = 1;
const OFF_ROUTE_SCORE_TO_RECALC = 6;
/* Six secondes, et non quatre (point 10E du client, 27 octobre : « anti-boucle »). Le client
 * veut un recalcul tres reactif ; le revers est qu'un trajet mal engage pourrait se recalculer
 * en chaine, chaque nouveau trace etant aussitot juge abandonne. Six secondes laissent au
 * conducteur le temps de s'engager vraiment sur le trajet propose avant qu'on en doute. */
const RECALC_COOLDOWN_MS = 6_000;

/**
 * Au-dela, un recalcul est ANORMALEMENT lent et on le dit (point 15.A du client).
 *
 * Trois secondes, sa valeur. Un recalcul Valhalla prend moins de deux secondes, meme sur une
 * 3G algerienne : au-dela, ce n'est presque jamais le calcul, c'est le reseau. En deca,
 * l'attente est normale et l'annoncer ferait douter sans raison.
 */
const RECALCUL_LENT_MS = 3_000;

/**
 * Types de manoeuvre Valhalla qui designent une BRETELLE ou une SORTIE.
 *
 * 17 a 21 : bretelle tout droit, a droite, a gauche, puis sortie a droite et a gauche. Ce sont
 * les seules manoeuvres qu'on peut rater sans s'ecarter franchement de la route — d'ou leur
 * traitement a part.
 */
const EST_SORTIE = new Set([17, 18, 19, 20, 21]);

/** Depassement au-dela duquel une sortie est consideree comme ratee (point 10B du client). */
const SORTIE_RATEE_M = 30;

/**
 * PRE-CALCUL ANTICIPATIF (point 10C du client, 27 octobre).
 *
 * A un kilometre d'une sortie, on calcule DEJA l'itineraire qu'il faudrait si on la ratait, et
 * on le garde de cote. Si elle est effectivement ratee, on l'affiche sans aucun appel reseau —
 * c'est ce qui fait passer le recalcul de deux ou trois secondes a l'affichage immediat que le
 * client demande.
 *
 * D'OU PART CET ITINERAIRE, PUISQUE LE CONDUCTEUR N'A PAS ENCORE RATE SA SORTIE ? D'un point
 * DEVINE : celui de la sortie, prolonge de trois cents metres dans le sens de la voie rapide.
 * C'est exactement la ou l'on se trouve quand on vient de passer devant sans la prendre, et
 * Valhalla raccrochera ce point a la route reelle.
 *
 * La devinette n'est pas un pari : l'itineraire du cache est affiche TOUT DE SUITE, puis un
 * calcul exact depuis la position reelle part en arriere-plan et le remplace des qu'il arrive.
 * Le conducteur voit une reponse immediate, et elle se corrige d'elle-meme en une seconde.
 */
const PRECALCUL_DISTANCE_M = 1_000;
/** Longueur dont on prolonge la voie rapide au-dela de la sortie, pour deviner le point de repli. */
const PRECALCUL_DEPASSEMENT_M = 300;

/**
 * SEUIL D'ECART ET TEMPS DE CONFIRMATION, SELON LA VITESSE (point 5A du client).
 *
 * Un seuil unique ne peut pas convenir aux deux bouts de l'echelle, et c'est exactement le
 * reproche que le client fait a Waze :
 *
 *   - Sur autoroute, a 120 km/h, une sortie ratee se paie en kilometres. Il faut s'en rendre
 *     compte en une seconde, et vingt metres d'ecart y sont deja sans ambiguite : les voies
 *     sont larges, bien cartographiees, et rien ne passe a vingt metres d'une autoroute sauf la
 *     bretelle que l'on vient justement de prendre par erreur.
 *
 *   - En ville, les memes vingt metres ne veulent rien dire. Entre deux immeubles, le GPS saute
 *     d'un trottoir a l'autre, et la rue parallele est a quinze metres. Declencher la un
 *     recalcul, c'est recalculer en boucle un trajet parfaitement suivi.
 *
 * D'ou trois regimes. Le temps de confirmation s'AJOUTE au comptage de points herite d'Organic
 * Maps : il faut desormais que l'ecart dure, et pas seulement qu'il se repete. Les deux
 * ensemble sont ce qui permet de descendre a vingt metres sans recalculer a tort.
 */
const DEVIATION_BANDS = [
  { minSpeedMps: 70 / 3.6, thresholdM: 20, confirmMs: 1_000 },
  { minSpeedMps: 30 / 3.6, thresholdM: 25, confirmMs: 2_000 },
  { minSpeedMps: 0, thresholdM: 30, confirmMs: 2_000 },
] as const;

function deviationBand(speedMps: number): (typeof DEVIATION_BANDS)[number] {
  return DEVIATION_BANDS.find((band) => speedMps >= band.minSpeedMps) ?? DEVIATION_BANDS[2];
}

/**
 * DEMI-TOUR (point 5E du client).
 *
 * Un conducteur qui fait demi-tour reste, lui, parfaitement SUR le trace : son ecart au trace
 * est nul, et la detection de sortie d'itineraire ne se declenchera donc jamais. Il roulerait
 * ainsi vers son point de depart pendant que l'application continue de lui annoncer des
 * virages qu'il a deja passes.
 *
 * On surveille donc le SENS : des que le vehicule recule de plus de vingt metres le long de
 * l'itineraire, ce qui reste du trajet n'est plus le bon et il faut le reprendre d'ou l'on est.
 * La reference ne retient que le point le plus avance atteint — elle suit le conducteur tant
 * qu'il avance, et reste en place des qu'il revient en arriere.
 */
const U_TURN_BACKWARD_M = 20;

/** Apres un demi-tour, on laisse le nouveau trajet s'installer avant d'en redetecter un. */
const U_TURN_COOLDOWN_MS = 8_000;

/** Distances d'annonce, exprimees en SECONDES de trajet puis bornees : a 120 km/h une
 * consigne donnee a 200 m arrive trop tard pour changer de file, et en ville la meme
 * consigne a 800 m ferait tourner au mauvais carrefour. Ce sont les deux temps de v83
 * (« dans 400 metres, tournez a droite », puis « tournez a droite »). */
const PRE_ANNOUNCE_S = 18;
const PRE_ANNOUNCE_MIN_M = 200;
const PRE_ANNOUNCE_MAX_M = 800;
const FINAL_ANNOUNCE_S = 4;
const FINAL_ANNOUNCE_MIN_M = 60;
const FINAL_ANNOUNCE_MAX_M = 180;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Etat vivant d'une navigation guidee : calcule l'itineraire au demarrage, avance de
 * manoeuvre en manoeuvre au fil de la position GPS, annonce vocalement chaque manoeuvre
 * a venir — une premiere fois a distance, une seconde au moment d'agir — et recalcule
 * automatiquement des qu'un ecart soutenu au trace est detecte.
 *
 * La progression est suivie EN CONTINU le long du trace, pas de manoeuvre en manoeuvre :
 * la distance restante et l'heure d'arrivee descendent seconde apres seconde, au lieu de
 * rester figees puis de sauter d'un coup au passage d'un carrefour.
 */
export function useNavigationSession(params: {
  active: boolean;
  position: Coords | null;
  destination: Coords | null;
  mode: RouteMode;
  lang: Language;
  /** Itineraire deja calcule (apercu choisi dans la fiche du lieu) : evite un
   * appel reseau redondant pile au moment ou l'utilisateur demarre. */
  initialRoute?: Route | null;
  /** Acces a la vitesse instantanee, en m/s, sans passer par un rendu React : elle sert
   * a decider QUAND annoncer une manoeuvre. Voir useLiveLocation. */
  getSpeedMps?: () => number;
  /** Cap au sol courant, en degres, ou `undefined` a l'arret. Transmis au moteur d'itineraire
   * lors d'un recalcul pour qu'il reparte dans le sens de la marche. */
  getHeading?: () => number | undefined;
  /** Precision annoncee par le GPS, en metres. Elle ouvre la tolerance de suivi : voir
   * DEVIATION_BANDS. Sans elle, on retombe sur le seuil lie a la vitesse. */
  getAccuracyM?: () => number;
  /**
   * Barrages et routes coupees signales par les utilisateurs, a contourner au recalcul
   * (point 5F du client). Lu par une fonction et non par une propriete : la liste change a
   * chaque signalement recu en temps reel, et le guidage ne doit pas repartir de zero pour
   * autant.
   */
  getAvoidPoints?: () => {
    points: { lat: number; lon: number }[];
    /** Au moins un de ces points est une route bloquee CONFIRMEE (point 12 du client). */
    blocage: boolean;
  };
}) {
  const {
    active,
    position,
    destination,
    mode,
    lang,
    initialRoute,
    getSpeedMps,
    getHeading,
    getAccuracyM,
    getAvoidPoints,
  } = params;
  const [route, setRoute] = useState<Route | null>(null);
  const [maneuverIndex, setManeuverIndex] = useState(0);
  const [traveledM, setTraveledM] = useState(0);
  /** Projection de la position sur le trace. Publiee parce que la carte en a besoin pour
   * couper l'itineraire en deux : la part deja parcourue et celle qui reste. */
  const [progress, setProgress] = useState<RouteLocation | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  /**
   * Le recalcul dure-t-il ANORMALEMENT longtemps ? (point 15.A du client : trois secondes.)
   *
   * Separe de `recalculating` parce qu'il ne dit pas la meme chose. Le premier dit << je
   * travaille >>, ce qui rassure ; celui-ci dit << ca ne devrait pas prendre si longtemps >>,
   * ce qui informe. Les confondre obligerait a choisir entre inquieter tout de suite et ne
   * jamais rien dire.
   *
   * Trois secondes, valeur du client : en deca, l'attente est normale et l'annoncer ferait
   * douter sans raison. Au-dela, c'est presque toujours le reseau — un recalcul Valhalla prend
   * moins de deux secondes, meme sur une 3G algerienne.
   */
  const [recalculLent, setRecalculLent] = useState(false);
  const [error, setError] = useState(false);

  const routeRef = useRef<Route | null>(null);
  const maneuverIndexRef = useRef(0);
  /** Index du segment ou l'on se trouvait a la mesure precedente : point de depart de la
   * recherche suivante (voir locateOnRoute). */
  const segmentHintRef = useRef<number | undefined>(undefined);
  const offRouteScoreRef = useRef(0);
  /** Distance au trace lors de la derniere mesure comptee, pour ne pas compter du bruit. */
  const offRouteDistanceRef = useRef(0);
  const lastRecalcAtRef = useRef(0);
  /** Heure de la premiere mesure hors trace de la serie en cours — voir DEVIATION_BANDS. */
  const offRouteSinceRef = useRef(0);
  /** Point le plus avance atteint sur le trace, pour reperer une marche arriere. */
  const farthestTraveledRef = useRef(0);
  const lastUTurnAtRef = useRef(0);
  /* Sortie deja signalee comme ratee, reperee par son index sur le trace : sans cette memoire,
   * chaque mesure GPS suivante redeclencherait l'annonce et le recalcul tant qu'on s'eloigne. */
  const sortieRateeRef = useRef<number | null>(null);
  /* L'annonce de sortie ratee est prononcee depuis le suivi, qui tourne hors du rendu React.
   * Elle a donc besoin de la langue parlee et du reglage de voix par REFERENCE : les lire
   * directement figerait les valeurs du premier rendu pour toute la navigation. */
  const direSortieRateeRef = useRef<() => void>(() => {});

  /**
   * Itineraire de repli prepare a l'avance, et la sortie pour laquelle il l'a ete.
   *
   * `pour` est l'index de forme de la manoeuvre visee : il identifie la sortie sans ambiguite
   * et permet de jeter le cache des qu'on en vise une autre. `enCours` empeche de relancer le
   * meme calcul a chaque mesure GPS pendant tout le kilometre d'approche.
   */
  const repliRef = useRef<{ pour: number | null; route: Route | null; enCours: boolean }>({
    pour: null,
    route: null,
    enCours: false,
  });
  /* Le suivi tourne hors du rendu React : il appelle le pre-calcul par reference, sinon il
   * figerait la version construite au premier rendu, avec sa destination d'alors. */
  const preparerRepliRef = useRef<(depart: Coords, pour: number) => Promise<void>>(async () => {});
  const initialRouteRef = useRef<Route | null>(null);
  const getSpeedRef = useRef(getSpeedMps);
  const getHeadingRef = useRef(getHeading);
  getHeadingRef.current = getHeading;
  /* Preferences du conducteur, lues par une reference : `loadRoute` ne doit pas etre
   * recree — donc le guidage relance — parce qu'une case a ete cochee. */
  const prefsRef = useRef(useSession.getState().routePrefs);
  prefsRef.current = useSession((s) => s.routePrefs);
  const getAvoidRef = useRef(getAvoidPoints);
  getAvoidRef.current = getAvoidPoints;
  /* Vitesse et precision sont lues par reference DANS l'effet de suivi. C'est volontaire : cet
   * effet ne doit se declencher qu'a l'arrivee d'une position, jamais a un simple rendu. S'il
   * figurait dans ses dependances, un rendu de plus — un changement de theme, une pastille qui
   * se met a jour — compterait un second point d'ecart pour la MEME mesure GPS, et le recalcul
   * partirait deux fois plus vite que prevu. */
  const getAccuracyRef = useRef(getAccuracyM);
  getAccuracyRef.current = getAccuracyM;
  getSpeedRef.current = getSpeedMps;
  useEffect(() => {
    initialRouteRef.current = initialRoute ?? null;
  }, [initialRoute]);

  /** Etape d'annonce deja franchie pour la manoeuvre a venir : 0 = rien dit,
   * 1 = annonce a distance, 2 = annonce finale. Remis a zero a chaque manoeuvre. */
  const announcedForRef = useRef({ index: -1, stage: 0 });
  /** La consigne de depart n'a ete donnee qu'une fois pour cet itineraire. */
  const departureSaidRef = useRef(false);

  const applyRoute = useCallback((next: Route | null) => {
    setRoute(next);
    setManeuverIndex(0);
    setTraveledM(0);
    setProgress(null);
    segmentHintRef.current = undefined;
    offRouteScoreRef.current = 0;
    offRouteDistanceRef.current = 0;
    offRouteSinceRef.current = 0;
    farthestTraveledRef.current = 0;
    /* Le nouveau trace a ses propres index : garder celui d'une sortie ratee sur l'ANCIEN
     * pourrait, par coincidence, bloquer la detection d'une sortie du nouveau. */
    sortieRateeRef.current = null;
    announcedForRef.current = { index: -1, stage: 0 };
    departureSaidRef.current = false;
  }, []);

  /** `premier` : le calcul de depart. Les recalculs en roulant, eux, sont presses — voir
   * l'option `quick`, qui raccourcit l'attente et reessaie une fois. */
  const loadRoute = useCallback(
    async (from: Coords, premier = false) => {
      if (!destination) return;
      const evitement = getAvoidRef.current?.() ?? { points: [], blocage: false };
      setRecalculating(true);
      setRecalculLent(false);
      /* Le minuteur arme l'avertissement, il n'interrompt RIEN. Couper le calcul a trois
       * secondes ferait echouer un recalcul qui allait aboutir a la quatrieme — et le
       * conducteur, lui, roule toujours. On previent, on n'abandonne pas. */
      const lenteur = setTimeout(() => setRecalculLent(true), RECALCUL_LENT_MS);
      try {
        const { primary } = await fetchRoute({
          from,
          to: destination,
          mode,
          narrationLanguage: lang === 'en' ? 'en-US' : 'fr-FR',
          alternates: 0,
          // Le cap n'est transmis qu'en mouvement : a l'arret, le GPS en renvoie un aleatoire,
          // et contraindre le depart dans une direction inventee donnerait un trajet absurde.
          heading: getHeadingRef.current?.() ?? undefined,
          // Un recalcul en route doit respecter les memes preferences que le trajet d'origine,
          // sinon un detour ramenerait le conducteur sur une piste qu'il a demande d'eviter.
          prefs: prefsRef.current,
          quick: !premier,
          // Contourner ce que les utilisateurs ont signale comme coupe. Sans cela, le recalcul
          // declenche par un barrage renvoie droit sur ce meme barrage.
          avoid: evitement.points,
          /* Un contournement de route bloquee n'est pas un recalcul ordinaire : il exige la
           * nationale et refuse les pistes (point 12 du client, 28 octobre). */
          blocage: evitement.blocage,
        });
        setError(false);
        applyRoute(primary);
        /* CONFIRMATION VOCALE D'UN RECALCUL REUSSI (point 15.A). Jamais au premier calcul : la
         * consigne de conduite suit immediatement et dit deja que le guidage a pris. Apres un
         * recalcul, en revanche, rien ne parlait — le conducteur voyait le trace changer sans
         * savoir si le calcul avait abouti. */
        if (!premier && voiceRef.current) {
          speakGuidance(phraseItineraireRecalcule(spokenLangRef.current), spokenLangRef.current);
        }
      } catch {
        setError(true);
      } finally {
        clearTimeout(lenteur);
        setRecalculLent(false);
        setRecalculating(false);
      }
    },
    [destination, mode, lang, applyRoute],
  );

  /**
   * Prepare l'itineraire de repli d'une sortie, en silence (point 10C du client).
   *
   * Rien n'est affiche, aucun indicateur de recalcul ne s'allume : le conducteur ne doit pas
   * voir l'application douter d'une sortie qu'il n'a pas encore ratee. Un echec est ignore —
   * si le repli n'est pas pret au moment du besoin, on retombe simplement sur le recalcul
   * ordinaire, qui fonctionnait deja.
   */
  const preparerRepli = useCallback(
    async (depart: Coords, pour: number) => {
      if (!destination) return;
      const evitement = getAvoidRef.current?.() ?? { points: [], blocage: false };
      repliRef.current = { pour, route: null, enCours: true };
      try {
        const { primary } = await fetchRoute({
          from: depart,
          to: destination,
          mode,
          narrationLanguage: lang === 'en' ? 'en-US' : 'fr-FR',
          alternates: 0,
          prefs: prefsRef.current,
          quick: true,
          avoid: evitement.points,
          blocage: evitement.blocage,
        });
        // La sortie visee a pu changer pendant l'appel : on ne garde le resultat que s'il
        // concerne toujours celle qu'on surveille.
        if (repliRef.current.pour === pour) repliRef.current = { pour, route: primary, enCours: false };
      } catch {
        repliRef.current = { pour, route: null, enCours: false };
      }
    },
    [destination, mode, lang],
  );
  preparerRepliRef.current = preparerRepli;

  // Changement de langue PENDANT le trajet : les consignes basculent tout de suite grace aux
  // phrases locales (localizedInstruction), puis l'itineraire est recalcule depuis la position
  // actuelle pour retrouver le texte detaille de Valhalla dans la nouvelle langue. Rien a faire
  // en arabe : Valhalla ne le redige pas, les phrases sont toujours construites localement.
  /** Langue des annonces vocales : celle de l'application, ou le francais si le telephone n'a
   * pas la voix correspondante. Le TEXTE affiche, lui, reste toujours dans la langue choisie. */
  const spokenLang = useSpokenLanguage(lang);

  /* Refs plutot que dependances : `loadRoute` est memorisee, et la recreer a chaque bascule du
   * guidage vocal relancerait les effets qui en dependent — en pleine navigation. */
  const spokenLangRef = useRef(spokenLang);
  spokenLangRef.current = spokenLang;
  /* Le reglage de voix est lu plus bas dans ce fichier : la ref est declaree ici, remplie
   * la-bas, et lue plus tard encore — au retour d'un appel reseau, donc apres le rendu. */
  const voiceRef = useRef(false);

  const narrationLang = lang === 'en' ? 'en' : 'fr';
  const previousNarrationRef = useRef(narrationLang);
  useEffect(() => {
    if (previousNarrationRef.current === narrationLang) return;
    previousNarrationRef.current = narrationLang;
    if (active && position && destination && lang !== 'ar' && lang !== 'dz') void loadRoute(position);
    // `position` volontairement hors dependances : seule la langue declenche ce recalcul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationLang]);

  // Demarrage / arret de la session, et RE-demarrage si la destination change en cours de route
  // (ex. l'utilisateur cherche une autre categorie via l'assistant vocal pendant la navigation
  // et choisit un nouveau lieu) — cle sur les coordonnees plutot que sur `active` seul, sinon un
  // changement de destination alors qu'on navigue deja (active reste `true`) ne se voyait jamais.
  // Volontairement PAS sur `position` : un seul calcul par destination, pas a chaque frappe GPS.
  useEffect(() => {
    if (active && position && destination) {
      if (initialRouteRef.current) {
        setError(false);
        applyRoute(initialRouteRef.current);
        initialRouteRef.current = null;
      } else {
        void loadRoute(position, true);
      }
    }
    if (!active) {
      applyRoute(null);
      stopSpeaking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, destination?.lat, destination?.lon]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    maneuverIndexRef.current = maneuverIndex;
  }, [maneuverIndex]);

  // Avancement de manoeuvre, progression continue et detection de deviation, a chaque
  // nouvelle position GPS.
  useEffect(() => {
    if (!active || !position) return;
    const currentRoute = routeRef.current;
    if (!currentRoute) return;
    const here: [number, number] = [position.lon, position.lat];

    const located = locateOnRoute(here, currentRoute.geometry, segmentHintRef.current);
    segmentHintRef.current = located.segmentIndex;
    const traveled = traveledMeters(currentRoute, located);
    setTraveledM(traveled);
    setProgress(located);

    // Une manoeuvre est franchie soit par proximite a son point exact, soit des que la
    // position la plus proche sur le trace a depasse son index de depart — necessaire dans
    // un virage serre, ou le GPS peut ne jamais repasser a moins de 30 m du point de
    // manoeuvre tout en ayant clairement pris le virage. La boucle gere aussi le cas, rare,
    // ou une mise a jour GPS saute plusieurs manoeuvres tres rapprochees d'un coup.
    let idx = maneuverIndexRef.current;
    while (true) {
      const next = currentRoute.maneuvers[idx + 1];
      if (!next) break;
      const closeToPoint =
        haversine(position.lat, position.lon, next.point[1], next.point[0]) <
        MANEUVER_ARRIVAL_RADIUS_M;
      const passedByProgress = located.segmentIndex >= next.shapeIndex;
      if (!closeToPoint && !passedByProgress) break;
      idx += 1;
    }
    if (idx !== maneuverIndexRef.current) setManeuverIndex(idx);

    const speedMps = getSpeedRef.current?.() ?? 0;
    const band = deviationBand(speedMps);
    // La tolerance s'ouvre avec la precision annoncee : un GPS qui s'avoue a 80 m pres ne
    // permet pas d'affirmer qu'un vehicule a quitte sa route. C'est elle qui rend les seuils
    // serres ci-dessus utilisables : ils ne mordent que lorsque le signal est bon.
    const tolerance = Math.max(band.thresholdM, getAccuracyRef.current?.() ?? 0);

    const now = Date.now();
    const cooledDown = now - lastRecalcAtRef.current > RECALC_COOLDOWN_MS;

    /* Demi-tour : teste AVANT la tolerance, puisqu'un demi-tour se fait sur le trace et ne
     * creuse aucun ecart. */
    if (traveled > farthestTraveledRef.current) farthestTraveledRef.current = traveled;
    if (
      farthestTraveledRef.current - traveled > U_TURN_BACKWARD_M &&
      speedMps >= MIN_SPEED_FOR_REBUILD_MPS &&
      now - lastUTurnAtRef.current > U_TURN_COOLDOWN_MS &&
      cooledDown
    ) {
      lastUTurnAtRef.current = now;
      lastRecalcAtRef.current = now;
      farthestTraveledRef.current = traveled;
      offRouteScoreRef.current = 0;
      offRouteDistanceRef.current = 0;
      offRouteSinceRef.current = 0;
      void loadRoute(position);
      return;
    }

    /* SORTIE D'AUTOROUTE MANQUEE — recalcul SANS delai de confirmation (point 10B, 27 octobre).
     *
     * Pourquoi un cas a part. Rater une sortie ne creuse presque pas d'ecart : la bretelle
     * s'ecarte de la voie rapide par un angle tres ouvert, et il faut parfois deux cents metres
     * avant que les vingt metres du seuil soient atteints. Pendant ce temps, a 110 km/h, on
     * s'eloigne de six secondes par seconde — et le recalcul n'arrive qu'apres le delai de
     * confirmation, soit trop tard pour la sortie suivante.
     *
     * La regle du client contourne la mesure d'ecart : si la manoeuvre qu'on vient de depasser
     * etait une sortie ou une bretelle, et qu'on l'a depassee de plus de trente metres sans
     * l'avoir prise, c'est rate. On recalcule tout de suite, sans attendre, et on le DIT —
     * parce qu'un conducteur qui vient de rater sa sortie cherche deja ce qu'il doit faire. */
    /* A UN KILOMETRE D'UNE SORTIE, on prepare deja l'itineraire du cas ou elle serait ratee
     * (point 10C). Le point de depart devine est celui de la sortie prolonge de trois cents
     * metres dans le sens de la voie rapide — la ou l'on se trouve quand on vient de passer
     * devant sans la prendre. */
    const manoeuvreSuivante = currentRoute.maneuvers[idx + 1];
    if (manoeuvreSuivante && EST_SORTIE.has(manoeuvreSuivante.type)) {
      const marque = manoeuvreSuivante.shapeIndex;
      const restantJusquA = (currentRoute.cumulativeM[marque] ?? 0) - traveled;
      const dejaPret = repliRef.current.pour === marque;
      if (restantJusquA > 0 && restantJusquA <= PRECALCUL_DISTANCE_M && !dejaPret) {
        const forme = currentRoute.geometry;
        const avant = forme[Math.max(0, marque - 2)];
        const sortie = forme[marque];
        if (avant && sortie) {
          // Le cap de la VOIE RAPIDE, pris juste avant la sortie : c'est la direction qu'on
          // garde si on ne la prend pas.
          const cap = bearing(avant[1], avant[0], sortie[1], sortie[0]);
          const repli = pointAu(sortie[1], sortie[0], cap, PRECALCUL_DEPASSEMENT_M);
          void preparerRepliRef.current(repli, marque);
        }
      }
    } else if (repliRef.current.pour !== null && !repliRef.current.enCours) {
      // Plus aucune sortie en vue : le repli prepare n'a plus d'objet.
      repliRef.current = { pour: null, route: null, enCours: false };
    }

    const manoeuvreDepassee = currentRoute.maneuvers[idx];
    if (
      manoeuvreDepassee &&
      EST_SORTIE.has(manoeuvreDepassee.type) &&
      traveled - (currentRoute.cumulativeM[manoeuvreDepassee.shapeIndex] ?? 0) > SORTIE_RATEE_M &&
      located.distanceM > tolerance &&
      sortieRateeRef.current !== manoeuvreDepassee.shapeIndex &&
      cooledDown
    ) {
      sortieRateeRef.current = manoeuvreDepassee.shapeIndex;
      lastRecalcAtRef.current = now;
      offRouteScoreRef.current = 0;
      offRouteDistanceRef.current = 0;
      offRouteSinceRef.current = 0;
      direSortieRateeRef.current();

      /* LE REPLI PREPARE S'AFFICHE TOUT DE SUITE, sans appel reseau — c'est tout l'objet du
       * pre-calcul. Il part d'un point DEVINE, a quelques dizaines de metres pres : on lance
       * donc aussitot le calcul exact depuis la position reelle, qui le remplacera en une
       * seconde. Le conducteur voit une reponse immediate, et elle se corrige d'elle-meme. */
      const repli = repliRef.current;
      if (repli.pour === manoeuvreDepassee.shapeIndex && repli.route) {
        applyRoute(repli.route);
        repliRef.current = { pour: null, route: null, enCours: false };
      }
      void loadRoute(position);
      return;
    }

    if (located.distanceM <= tolerance) {
      offRouteScoreRef.current = 0;
      offRouteDistanceRef.current = 0;
      offRouteSinceRef.current = 0;
      return;
    }

    // Premiere mesure hors trace de la serie : on retient l'heure, c'est elle qui ouvre le
    // temps de confirmation. Un ecart isole ne declenche donc jamais rien a lui seul.
    if (offRouteSinceRef.current === 0) offRouteSinceRef.current = now;

    // Toujours a la meme distance du trace qu'a la mesure precedente : c'est du bruit.
    if (Math.abs(located.distanceM - offRouteDistanceRef.current) < RUNAWAY_SENSITIVITY_M) return;
    offRouteDistanceRef.current = located.distanceM;

    /* UN ECART FRANC NE SE COMPTE PLUS, IL SE CONSTATE.
     *
     * Le comptage par points sert a ne pas recalculer pour du bruit GPS. Mais au-dela de cent
     * vingt metres du trace il n'y a plus de doute a lever : aucune derive de signal ne fait
     * cela, et le conducteur a bel et bien pris une autre route. Attendre une deuxieme mesure
     * pour en etre sur lui coutait une seconde de plus a un moment ou chaque seconde compte —
     * c'est exactement ce que le client demande de supprimer.
     *
     * Le temps de confirmation, lui, reste : il est d'une seconde a vitesse d'autoroute, et
     * c'est le delai minimal pour que deux mesures successives disent la meme chose. En
     * dessous de ce seuil, rien ne change — c'est la que le bruit se produit. */
    offRouteScoreRef.current +=
      located.distanceM > OFF_ROUTE_CERTAIN_M
        ? OFF_ROUTE_SCORE_TO_RECALC
        : speedMps >= MIN_SPEED_FOR_REBUILD_MPS
          ? 2
          : 1;

    const confirmed = now - offRouteSinceRef.current >= band.confirmMs;
    if (offRouteScoreRef.current >= OFF_ROUTE_SCORE_TO_RECALC && confirmed && cooledDown) {
      lastRecalcAtRef.current = now;
      offRouteScoreRef.current = 0;
      offRouteDistanceRef.current = 0;
      offRouteSinceRef.current = 0;
      void loadRoute(position);
    }
  }, [position, active, loadRoute]);

  const currentManeuver: Maneuver | null = route?.maneuvers[maneuverIndex] ?? null;
  const nextManeuver: Maneuver | null = route?.maneuvers[maneuverIndex + 1] ?? null;
  /** Manoeuvre d'APRES la prochaine : « puis a droite ». Annoncee sur les cartes de
   * navigation courantes parce que deux virages rapproches se preparent ensemble — savoir
   * qu'on tourne encore juste apres change la file qu'on choisit. */
  const followingManeuver: Maneuver | null = route?.maneuvers[maneuverIndex + 2] ?? null;

  /** Distance qui reste a parcourir, sur la route, jusqu'a la prochaine manoeuvre. C'est
   * elle qu'affiche le bandeau (« dans 250 m ») : la distance a vol d'oiseau utilisee
   * auparavant annoncait un virage trop tot des que la route faisait un coude. */
  const distanceToNextManeuverM = useMemo(() => {
    if (!nextManeuver) return null;
    return Math.max(0, nextManeuver.startM - traveledM);
  }, [nextManeuver, traveledM]);

  const voiceGuidanceEnabled = useSession((s) => s.voiceGuidanceEnabled);
  voiceRef.current = voiceGuidanceEnabled;

  // Annonce vocale de la manoeuvre A VENIR, en deux temps : une premiere fois assez tot
  // pour se rabattre, une seconde au moment d'agir. Chaque etape ne parle qu'une fois —
  // et elle est marquee comme dite meme quand le son est coupe, pour que reactiver le son
  // en cours de trajet ne declenche pas une rafale de consignes deja passees.
  /* La phrase de sortie ratee, tenue a jour pour le suivi (point 10B). Couper la voix de
   * guidage la coupe aussi : c'est un choix explicite du conducteur, et une sortie manquee ne
   * justifie pas de passer outre — l'ecran, lui, affiche deja le recalcul. */
  direSortieRateeRef.current = () => {
    if (voiceGuidanceEnabled) speakGuidance(phraseSortieRatee(spokenLang), spokenLang);
  };

  useEffect(() => {
    if (!active || !route) return;

    // Consigne de depart, donnee une seule fois des que l'itineraire est pret. Sans elle,
    // un trajet qui commence par dix kilometres de ligne droite demarre dans le silence :
    // le conducteur n'a aucune confirmation que le guidage a bien pris.
    if (!departureSaidRef.current) {
      departureSaidRef.current = true;
      const first = route.maneuvers[0];
      if (first && voiceGuidanceEnabled) {
        speakGuidance(localizedInstruction(first, spokenLang), spokenLang);
        return;
      }
    }

    if (!nextManeuver || distanceToNextManeuverM == null) return;

    const speedMps = getSpeedRef.current?.() ?? 0;
    const preM = clamp(speedMps * PRE_ANNOUNCE_S, PRE_ANNOUNCE_MIN_M, PRE_ANNOUNCE_MAX_M);
    const finalM = clamp(speedMps * FINAL_ANNOUNCE_S, FINAL_ANNOUNCE_MIN_M, FINAL_ANNOUNCE_MAX_M);

    const target = maneuverIndex + 1;
    const state = announcedForRef.current;
    if (state.index !== target) announcedForRef.current = { index: target, stage: 0 };
    const stage = announcedForRef.current.stage;

    const instruction = localizedInstruction(nextManeuver, spokenLang);
    let phrase: string | null = null;
    if (distanceToNextManeuverM <= finalM && stage < 2) {
      announcedForRef.current = { index: target, stage: 2 };
      phrase = instruction;
    } else if (distanceToNextManeuverM <= preM && stage < 1) {
      announcedForRef.current = { index: target, stage: 1 };
      // « Dans 300 metres, tournez a droite » — arrondi parle, comme en v83.
      phrase = `${spokenDistance(distanceToNextManeuverM, spokenLang)}, ${lowerFirst(instruction)}`;
    }

    if (!phrase || !voiceGuidanceEnabled) return;
    speakGuidance(phrase, spokenLang);
  }, [active, route, nextManeuver, distanceToNextManeuverM, maneuverIndex, spokenLang, voiceGuidanceEnabled]);

  /**
   * Distance et duree restantes, calculees a partir de la progression reelle sur le trace.
   * La duree combine le temps restant sur la manoeuvre en cours (au prorata de ce qui en
   * reste) et le temps de toutes les suivantes : l'heure d'arrivee descend donc en continu.
   */
  const remaining = useMemo(() => {
    if (!route) return null;
    // Longueur mesuree sur le trace, et non le total renvoye par Valhalla : `traveledM` et
    // `startM` sont calcules sur cette meme geometrie, et melanger les deux sources ferait
    // terminer le decompte a quelques dizaines de metres de zero.
    const total = route.cumulativeM[route.cumulativeM.length - 1] ?? route.distanceM;
    const distanceM = Math.max(0, total - traveledM);

    const current = route.maneuvers[maneuverIndex];
    let durationS = 0;
    for (let i = maneuverIndex + 1; i < route.maneuvers.length; i++) {
      durationS += route.maneuvers[i]!.durationS;
    }
    if (current) {
      const start = current.startM;
      const end = route.maneuvers[maneuverIndex + 1]?.startM ?? total;
      const span = end - start;
      const done = span > 0 ? clamp((traveledM - start) / span, 0, 1) : 1;
      durationS += current.durationS * (1 - done);
    }
    return { distanceM, durationS };
  }, [route, maneuverIndex, traveledM]);

  /**
   * ROUTE BLOQUEE CONFIRMEE DEVANT NOUS : on le dit, et on recalcule (point 12 du client).
   *
   * POURQUOI UNE ENTREE SEPAREE PLUTOT QUE LE RECALCUL ORDINAIRE. Les autres recalculs partent
   * d'un constat sur le vehicule : il s'est ecarte du trace, il a rate une sortie. Celui-ci
   * part d'une information venue des AUTRES, alors que le conducteur suit parfaitement son
   * itineraire. Rien dans sa conduite ne le declenche, donc aucune des surveillances
   * existantes ne peut le voir.
   *
   * ET SURTOUT, IL SE DIT A VOIX HAUTE. Un recalcul silencieux qui rallonge le trajet de vingt
   * kilometres est incomprehensible : le conducteur voit l'heure d'arrivee sauter sans savoir
   * pourquoi, et il soupconne l'application de s'etre trompee. << Route bloquee. Recalcul en
   * cours. >> est exactement ce qu'il faut entendre, et c'est la phrase que demande le client.
   *
   * L'annonce passe AVANT l'appel reseau, pas apres : elle doit sortir pendant que le calcul
   * tourne, sinon elle arrive deux secondes plus tard, une fois le nouveau trajet affiche.
   */
  const recalculerPourBlocage = useCallback(
    (from: Coords) => {
      if (voiceGuidanceEnabled) speakGuidance(phraseRouteBloquee(spokenLang), spokenLang);
      void loadRoute(from);
    },
    [loadRoute, spokenLang, voiceGuidanceEnabled],
  );

  return {
    route,
    maneuverIndex,
    currentManeuver,
    nextManeuver,
    followingManeuver,
    distanceToNextManeuverM,
    remaining,
    progress,
    recalculating,
    recalculLent,
    recalculerPourBlocage,
    error,
  };
}
