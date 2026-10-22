import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bearing as geoBearing, countryFromCoords, formatDistance, formatDuration, haversine, NEARBY_RADIUS_M, type Language, type Place, type Report, type ReportKind } from '../src/shared';
import { api, ApiError } from '../src/api/client';
import { AddPlaceSheet } from '../src/components/AddPlaceSheet';
import { AssistantPanel } from '../src/components/AssistantPanel';
import { CategoryChips } from '../src/components/CategoryChips';
import { ConsentGate } from '../src/components/ConsentGate';
import { Header } from '../src/components/Header';
import { NavigationOverlay } from '../src/components/NavigationOverlay';
import { useLocalSearchParams } from 'expo-router';
import { PlaceSheet, type SelectedPlace } from '../src/components/PlaceSheet';
import { ProfilePanel } from '../src/components/ProfilePanel';
import { QiblaPanel } from '../src/components/QiblaPanel';
import { QuranMiniBar } from '../src/components/QuranMiniBar';
import { useQuranPlayer } from '../src/quran/player';
import { ReportMenu } from '../src/components/ReportMenu';
import { ReportVoteCard } from '../src/components/ReportVoteCard';
import { SearchBar } from '../src/components/SearchBar';
import { SearchResults } from '../src/components/SearchResults';
import { SeasonalBanner } from '../src/components/SeasonalBanner';
import { SosPanel } from '../src/components/SosPanel';
import { StepsSheet } from '../src/components/StepsSheet';
import { Toast } from '../src/components/Toast';
import { VoicePanel } from '../src/components/VoicePanel';
import { TripSummary, type Trip } from '../src/components/TripSummary';
import { useRealtime } from '../src/hooks/useRealtime';
import { NavArrow } from '../src/components/NavArrow';
import { TunisiaUnlockSheet } from '../src/components/TunisiaUnlockSheet';
import { useTunisiaUnlock } from '../src/unlock/useTunisiaUnlock';
import { LocateIcon } from '../src/components/LocateIcon';
import { NavDestinationPicker } from '../src/components/NavDestinationPicker';
import { DetourSheet } from '../src/components/DetourSheet';
import { NavSearchMenu } from '../src/components/NavSearchMenu';
import { MeMarker } from '../src/map/MeMarker';
import { NavMarker } from '../src/map/NavMarker';
import { COUNTRY_VIEWS, INITIAL_VIEW_STATE, MAP_STYLES, REPORT_COLORS, type CountryView } from '../src/map/style';
import { useMapStyle } from '../src/map/useMapStyle';
import { usePoiLayer } from '../src/map/usePoiLayer';
import { REPORT_EMOJI } from '../src/reports/kinds';
import { emojiForPlace } from '../src/map/placeIcons';
import { useAssistant } from '../src/assistant/useAssistant';
import { durationInWords } from '../src/assistant/commands';
import { formatClock24, useAutoScheme } from '../src/utils/clock';
import { useApproachAlerts } from '../src/navigation/useApproachAlerts';
import { useLiveLocation } from '../src/navigation/useLiveLocation';
import { hasVoiceFor } from '../src/speech/voice';
import { useNavigationSession } from '../src/navigation/useNavigationSession';
import { useSmoothCamera, type SnappedPoint } from '../src/navigation/useSmoothCamera';
import { useSpeedLimit } from '../src/navigation/useSpeedLimit';
import { useRoutePreview } from '../src/navigation/useRoutePreview';
import {
  locateOnRoute,
  pointOnRoute,
  traveledMeters,
  type Route,
  type RouteMode,
} from '../src/navigation/routing';
import type { LiveFix } from '../src/navigation/useLiveLocation';
import type { GeocodedResult } from '../src/search/geocode';
import { usePlaceSearch } from '../src/search/usePlaceSearch';
import { useVoiceSearch } from '../src/search/useVoiceSearch';
import { usePlaces, type Bookmark } from '../src/store/places';
import { useSession } from '../src/store/session';
import { HIT_SIZE, palette, radius, spacing, typography } from '../src/theme';

type Position = { lat: number; lon: number };

/** Hauteur visuelle du bandeau de marque (Header), sous l'encoche/la barre de statut.
 *
 * 92 depuis que les langues occupent leur propre ligne (cinq au lieu de quatre). La colonne de
 * boutons se recalcule a partir de cette valeur : sur un grand telephone elle avait de la marge
 * et les boutons gardent leur taille pleine ; sur un ecran court ils etaient deja a leur
 * plancher de 38 points, que ces 28 points de plus ne franchissent pas. */
const HEADER_HEIGHT = 92;

/* Couleurs du trace, reprises de `routeColors()` en v83.
 *
 * Le vert WIN ne convient QUE de jour. La nuit, le site bascule sur un turquoise lumineux :
 * sur le fond sombre, un vert fonce disparait purement et simplement — c'est ce que le client
 * decrit en disant qu'il ne voit pas le trace vert pendant un trajet. La palette de
 * l'application, elle, garde le meme accent jour et nuit (c'est le choix de la v83 pour les
 * boutons), d'ou l'oubli : le trace ne suit pas cette regle, il a la sienne.
 *
 * Le liseré suit le meme sort : blanc de jour, vert tres sombre la nuit.
 */
/* `casing` est la BORDURE demandee par le client (point 2) : un liseré plus sombre que le
 * trace, pose dessous et plus large de quelques points. C'est ce qui donne au trace son relief
 * et l'empeche de se confondre avec une route du fond de meme teinte. Le liseré clair (`halo`)
 * reste en-dessous des deux : lui seul detache l'itineraire des nationales algeriennes, peintes
 * en orange et en beige dans ce style. */
const ROUTE_COLORS = {
  day: { main: '#0D6E4F', casing: '#063B2A', halo: '#FFFFFF', alt: '#9AA89F' },
  night: { main: '#2EE6A6', casing: '#0B6B4E', halo: '#06251C', alt: '#5B6B63' },
} as const;

/* Epaisseur des traces, selon le zoom.
 *
 * Une largeur fixe ne peut pas convenir aux deux usages : 13 points conviennent en navigation,
 * au zoom 17, mais donnent un gros boudin illisible quand on prend du recul pour comparer les
 * itineraires — c'est ce que le client a releve, capture de Waze a l'appui. Les cartes de
 * navigation courantes font donc varier l'epaisseur avec le zoom ; ces quatre paliers
 * reproduisent leur progression.
 *
 * Les cinq paliers sont ceux du client, mesures sur son telephone apres trois essais :
 * 1,5 au zoom 7 (pays entier), 2,5 au zoom 10 (itineraire complet), 6 au zoom 13 (approche
 * d'une ville), 9 au zoom 15 (navigation courante) et 13 au zoom 18 (rue).
 *
 * Ces valeurs ont baisse deux fois. La premiere demande disait « trace trop fin » et visait la
 * navigation ; la deuxieme « trop epais en zoom arriere » et visait la vue d'ensemble ; la
 * troisieme a reduit encore la navigation elle-meme, de 18 a 13 — soit deux millimetres de
 * moins sur l'ecran. Rien ne remplace l'oeil de quelqu'un qui conduit avec, et c'est pour cela
 * que ces nombres viennent de lui et non d'une regle.
 *
 * Les autres couches en derivent : la bordure sombre et le lisere clair encadrent le trace sans
 * le noyer, l'alternative reste plus fine que lui, et la portion deja parcourue a exactement sa
 * largeur — sinon le changement de couleur se verrait comme un ressaut.
 */
type LineWidth = NonNullable<React.ComponentProps<typeof Layer>['paint']> extends infer P
  ? P extends { 'line-width'?: infer W }
    ? W
    : never
  : never;

function ROUTE_WIDTH(widths: [number, number, number, number, number]): LineWidth {
  return ['interpolate', ['linear'], ['zoom'], 7, widths[0], 10, widths[1], 13, widths[2], 15, widths[3], 18, widths[4]];
}

/* ------------------------------------------------------------------------- */
/* La traine de comete                                                        */
/* ------------------------------------------------------------------------- */

/**
 * LONGUEUR DE LA TRAINE, EN METRES.
 *
 * Le client demande deux choses a la fois, en citant deux applications : Google Maps, ou la
 * part parcourue reste << gris marque, tres lisible >>, et Waze, qui << efface progressivement >>.
 * Quatre cents metres concilient les deux, et ce n'est pas un compromis mou : au zoom de
 * conduite on voit environ deux cents metres derriere soi, donc toute la portion visible est
 * encore franchement grise, avec un affaiblissement qui donne le sens de la marche ; des qu'on
 * prend du recul pour embrasser le trajet, ces quatre cents metres ne pesent plus rien et tout
 * le parcours accompli se lit d'un trait gris continu.
 */
const TRAINE_M = 400;

/** Largeur, en fraction du trajet, du passage du gris au vert. Juste assez pour que la coupure
 * ne soit pas un escalier de pixels, jamais assez pour qu'on voie un degrade a cet endroit. */
const COUPURE = 0.0008;

type LineGradient = NonNullable<React.ComponentProps<typeof Layer>['paint']> extends infer P
  ? P extends { 'line-gradient'?: infer G }
    ? G
    : never
  : never;

/** Couleur hexadecimale rendue transparente. MapLibre n'accepte pas de teinter une couleur
 * dans une expression : il faut donc lui donner la couleur deja diluee. */
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * LE TRACE NE SE COUPE PLUS EN DEUX : IL SE TEINTE.
 *
 * Jusqu'ici, la portion parcourue et la portion restante etaient deux lignes distinctes,
 * recoupees a chaque point GPS. Cela marchait, mais cela voulait dire reconstruire et renvoyer
 * a la carte TOUTE la geometrie du trajet une fois par seconde — plusieurs milliers de points
 * sur un Alger-Oran. C'est precisement le genre de travail qui produit les saccades que le
 * client releve au point 10.
 *
 * `line-gradient` fait la meme chose sans toucher a la geometrie : on envoie le trace UNE fois,
 * et chaque seconde on ne met a jour qu'une poignee de nombres disant ou en est le vehicule le
 * long de la ligne. La carte, elle, n'a plus rien a recharger.
 *
 * Les trois couches de l'itineraire — le lisere clair, la bordure sombre et le trace lui-meme —
 * recoivent le MEME degrade. Sans cela, la traine s'effacerait en laissant derriere elle un
 * lisere blanc intact, c'est-a-dire le fantome du chemin parcouru.
 */
function degradeDeProgression(
  arriereLoin: string,
  arriereProche: string,
  avant: string,
  fait: number,
  traine: number,
): LineGradient {
  const paliers: (number | string)[] = [];
  let dernier = -1;
  const poser = (position: number, couleur: string) => {
    const x = Math.min(1, Math.max(0, position));
    // Les paliers d'une interpolation doivent croitre STRICTEMENT : aux deux extremites du
    // trajet, plusieurs d'entre eux retombent sur la meme valeur et il faut les ecarter.
    if (x <= dernier) return;
    dernier = x;
    paliers.push(x, couleur);
  };

  poser(0, fait <= 0 ? avant : arriereLoin);
  if (fait > 0) {
    poser(fait - traine, arriereLoin);
    poser(fait, arriereProche);
    poser(fait + COUPURE, avant);
  }
  poser(1, avant);

  return ['interpolate', ['linear'], ['line-progress'], ...paliers] as LineGradient;
}

/** Point du trace situe a `metres` du depart, mesure LE LONG de la route et non a vol
 * d'oiseau. Sert a poser l'etiquette au milieu de ce qui reste a parcourir. */
function pointAtDistance(route: Route, metres: number): [number, number] | null {
  const { cumulativeM, geometry } = route;
  if (geometry.length < 2) return null;
  const total = cumulativeM[cumulativeM.length - 1] ?? 0;
  const cible = Math.max(0, Math.min(metres, total));
  let i = 1;
  while (i < cumulativeM.length - 1 && cumulativeM[i]! < cible) i += 1;
  const avant = cumulativeM[i - 1]!;
  const apres = cumulativeM[i]!;
  const t = apres === avant ? 0 : (cible - avant) / (apres - avant);
  const a = geometry[i - 1]!;
  const b = geometry[i]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Gris de la portion parcourue — le `#b9c4bf` de v83. */
const GRIS_PARCOURU = '#B9C4BF';

/* L'epingle de destination, dessinee par le moteur de la carte.
 *
 * Elle etait jusqu'ici un emoji pose dans un `text-field`. Or le serveur de tuiles ne sert que
 * Noto Sans, qui ne contient aucun emoji : le pictogramme n'etait donc JAMAIS dessine, et il ne
 * restait qu'une pastille verte. Le client demande « une epingle, comme Google Maps / Waze » :
 * une image de style ne depend d'aucune police et s'affiche a coup sur.
 * Voir scripts/make-destination-pin.py. */
const MAP_IMAGES = { 'destination-pin': require('../assets/map/destination-pin.png') };

/**
 * Point situe a mi-chemin d'une polyligne, mesure en distance reelle et non en nombre de
 * points : les geometries de Valhalla sont bien plus denses dans les virages, si bien que le
 * point « du milieu du tableau » tombe systematiquement du cote le plus sinueux du trajet.
 */
function midpointOf(geometry: [number, number][]): [number, number] | null {
  if (geometry.length < 2) return null;
  const steps: number[] = [];
  let total = 0;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const a = geometry[i]!;
    const b = geometry[i + 1]!;
    const d = haversine(a[1], a[0], b[1], b[0]);
    steps.push(d);
    total += d;
  }
  let walked = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const d = steps[i]!;
    if (walked + d >= total / 2) {
      const t = d === 0 ? 0 : (total / 2 - walked) / d;
      const a = geometry[i]!;
      const b = geometry[i + 1]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += d;
  }
  return geometry[geometry.length - 1] ?? null;
}

/** Distance restante en dessous de laquelle on considere le trajet termine. */
const ARRIVAL_RADIUS_M = 50;

/* Calage du vehicule sur la route.
 *
 * Le seuil etait fixe a 25 m. Or un recepteur de telephone annonce lui-meme sa marge d'erreur,
 * et elle depasse souvent 30 m en ville, entre les immeubles, ou dans les premieres secondes
 * apres le depart. Au-dela de 25 m, le point cessait donc d'etre plaque sur la route et
 * affichait la mesure brute : le conducteur se voyait a cote de la voie qu'il suivait.
 *
 * Le seuil suit desormais la PRECISION ANNONCEE : tant que l'ecart au trace reste dans la marge
 * d'erreur du recepteur, rien ne prouve qu'on a quitte la route — la route est meme l'hypothese
 * la plus probable.
 *
 * Les deux bornes viennent d'Organic Maps : `Route::MoveIterator` projette la position dans un
 * rectangle de `max(matchingThreshold, horizontalAccuracy)`, ou le seuil vaut 50 m pour une
 * voiture (routing_settings.cpp). Notre plancher passe donc de 30 a 50 m — c'est la valeur que
 * six millions d'utilisateurs eprouvent chaque jour. Le plafond de 120 m, lui, nous est propre :
 * Organic Maps n'en a pas, mais sans lui une mesure annoncee a 300 m pres collerait le vehicule
 * sur une route qu'il n'emprunte peut-etre pas. */
const SNAP_RADIUS_MIN_M = 50;
const SNAP_RADIUS_MAX_M = 120;
/** Diametre du marqueur de navigation, en points. */
const NAV_PUCK_SIZE = 46;

/** Colonne de boutons : nombre de boutons, et place occupee en haut par le bandeau de marque,
 * la barre de recherche et la rangee de categories. Sert a calculer une taille de bouton qui
 * tient TOUJOURS dans la hauteur restante — sans ce calcul, la colonne debordait et les
 * derniers boutons (profil, Qibla) sortaient de l'ecran sur les telephones courts. */
const FAB_COUNT = 10;
/** Le bouton de signalement est plus gros que les autres (styles.fabPrimary). */
const FAB_PRIMARY_RATIO = 64 / HIT_SIZE;
const FAB_TOP_RESERVE = HIT_SIZE + 56;

function toBookmark(place: SelectedPlace): Bookmark {
  return { name: place.name, addr: place.displayName, lat: place.lat, lon: place.lon };
}

export default function MapScreen() {
  // L'ecran ne doit jamais s'eteindre pendant l'usage de la carte/navigation —
  // demande client repetee (chantier #13), jamais portee depuis le web ou le
  // Wake Lock du navigateur ne couvrait que l'onglet, pas l'app installee.
  useKeepAwake();

  const { t, i18n } = useTranslation();
  const themeOverride = useSession((s) => s.themeOverride);
  const toggleNightMode = useSession((s) => s.toggleNightMode);
  const voiceGuidanceEnabled = useSession((s) => s.voiceGuidanceEnabled);
  const toggleVoiceGuidance = useSession((s) => s.toggleVoiceGuidance);
  const autoScheme = useAutoScheme(themeOverride === 'auto');
  const scheme = themeOverride === 'auto' ? autoScheme : themeOverride;
  const colors = palette[scheme === 'dark' ? 'dark' : 'light'];
  const routeColors = ROUTE_COLORS[scheme === 'dark' ? 'night' : 'day'];
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  /** Taille REELLE de la zone de carte, mesuree a l'affichage. La marge de la camera et la
   * position du marqueur de navigation en derivent toutes les deux : calculees depuis la
   * meme mesure, elles coincident par construction. Partir de `useWindowDimensions` aurait
   * suffi a les decaler de quelques points sur les telephones ou la carte passe sous la
   * barre de navigation d'Android — soit exactement un vehicule dessine a cote de la route. */
  const mapRef = useRef<MapRef | null>(null);
  const [mapSize, setMapSize] = useState<{ w: number; h: number } | null>(null);
  /* Hauteur reelle du bloc du haut (barre de recherche + puces de categories, et la liste de
   * resultats quand elle est ouverte). Le bandeau saisonnier se posait jusqu'ici a une hauteur
   * CALCULEE — barre + marge — qui ne tenait pas compte des puces : il chevauchait la barre de
   * recherche, alors que sur le site il respire nettement en dessous. On mesure donc plutot que
   * de supposer : la mesure suit toutes les langues et toutes les tailles de police. */
  const [topBlockH, setTopBlockH] = useState(0);
  const mapW = mapSize?.w ?? windowWidth;
  const mapH = mapSize?.h ?? windowHeight;
  /** Paysage : seulement possible pendant la navigation (voir le verrou d'orientation). */
  const landscape = mapW > mapH;
  /** Largeur de la colonne de consignes en paysage. 40 % de l'ecran, plafonnee : au-dela, la
   * carte n'aurait plus assez de place a droite pour montrer la route devant soi. */
  const navCardWidth = landscape ? Math.min(380, Math.round(mapW * 0.4)) : 0;
  const cameraRef = useRef<CameraRef>(null);

  // Taille des boutons de la colonne, calculee a partir de la hauteur reellement disponible
  // plutot que figee : sur un ecran court, ils retrecissent (jamais sous 38 pt, la limite de
  // confort tactile) au lieu de deborder hors de l'ecran.
  const baseFabSize = useMemo(() => {
    const available =
      windowHeight - (insets.top + HEADER_HEIGHT + FAB_TOP_RESERVE) - (insets.bottom + spacing.xl);
    const gaps = (FAB_COUNT - 1) * spacing.md;
    const raw = (available - gaps) / (FAB_COUNT - 1 + FAB_PRIMARY_RATIO);
    /* Plancher a 32 points, et non 38 : c'est ce qui manquait pour que la colonne TIENNE.
     *
     * Mesure sur les tailles d'ecran reelles, avec dix boutons : sur un telephone de 667
     * points de haut, la colonne depassait son budget de 93 points ; sur un 640, de 120. Le
     * premier bouton — le micro de l'assistant — remontait donc dans la rangee des rubriques,
     * exactement comme le client l'a vu. Ce n'etait pas un defaut d'affichage mais un calcul
     * qui ne pouvait pas aboutir : le plancher de 38 interdisait la seule issue.
     *
     * A 32, les memes ecrans tiennent avec trois points de marge. Et rien ne change sur un
     * telephone courant : des qu'il y a la place, la taille remonte d'elle-meme jusqu'aux 52
     * points de confort — mesure a 49 sur un Galaxy ordinaire, 52 sur un grand. Le compromis
     * ne coute donc rien a ceux qui n'en ont pas besoin. */
    return Math.max(32, Math.min(HIT_SIZE, Math.floor(raw)));
  }, [windowHeight, insets.top, insets.bottom]);

  /**
   * ECART ENTRE LES BOUTONS, CALCULE — ET NON FIXE A DOUZE POINTS.
   *
   * La colonne est ancree en bas et grandit vers le HAUT. Les boutons, eux, ne descendent
   * jamais sous un plancher de confort tactile (38 points) : des que l'ecran est court, la
   * colonne depasse donc le budget de hauteur qu'on lui avait calcule et son premier bouton —
   * le micro de l'assistant — monte dans la rangee des rubriques. C'est le defaut que le
   * client a releve, et ce n'est pas un hasard d'affichage : c'etait arithmetique.
   *
   * On resserre donc l'ECART avant de toucher a la taille des boutons. Douze points entre dix
   * boutons font cent-huit points de hauteur ; les ramener a quatre en rend soixante-douze,
   * soit bien plus que ce qui manquait. Et un ecart plus serre se remarque infiniment moins
   * qu'un bouton qui chevauche autre chose.
   */
  const baseFabGap = useMemo(() => {
    const available =
      windowHeight - (insets.top + HEADER_HEIGHT + FAB_TOP_RESERVE) - (insets.bottom + spacing.xl);
    const hauteurBoutons = baseFabSize * (FAB_COUNT - 1 + FAB_PRIMARY_RATIO);
    const reste = available - hauteurBoutons;
    return Math.max(4, Math.min(spacing.md, Math.floor(reste / (FAB_COUNT - 1))));
  }, [windowHeight, insets.top, insets.bottom, baseFabSize]);

  const [liveReports, setLiveReports] = useState<Report[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  /** Fiche du lieu rouverte pendant le guidage, via « Retour » du cadre du bas. */
  /* Acces a la Tunisie : 200 DA, acces a vie, debloque par appareil apres verification du
   * paiement par un administrateur (voir apps/api/src/routes/unlocks.ts). */
  const tunisia = useTunisiaUnlock();
  const [tnSheetOpen, setTnSheetOpen] = useState(false);
  /** Le panneau de paiement a deja ete presente pendant ce tour du drapeau. */
  const tnPromptedRef = useRef(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [votingReport, setVotingReport] = useState<Report | null>(null);
  const [voteMessage, setVoteMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [qiblaOpen, setQiblaOpen] = useState(false);
  /* Arret de la recitation, pilote depuis l'exterieur du panneau : le lecteur ne depend plus
   * d'aucun ecran (voir src/quran/player.ts). */
  const arreterCoran = useQuranPlayer((s) => s.arreter);
  const [addPlaceCoords, setAddPlaceCoords] = useState<Position | null>(null);
  // Declare avant tout le reste : la cadence du GPS en depend (1 Hz en navigation contre
  // une mesure toutes les 3 s au repos), donc la source de position aussi.
  const [navigating, setNavigating] = useState(false);

  /* Pendant le guidage, la colonne tient ENTRE le bas du bandeau de consigne et le haut du
   * cadre du bas, dont les hauteurs reelles sont remontees par NavigationOverlay. Elle etait
   * calee sur le bas de l'ecran : le dernier bouton (Qibla) recouvrait « Fin » (point 20 du
   * client). Les boutons retrecissent juste ce qu'il faut pour tenir, jamais sous 28 points,
   * et l'ecart entre eux passe a 8 points — comme ajusterColonneFab sur le site. */
  const [navBounds, setNavBounds] = useState({ bannerBottom: 0, bottomBarHeight: 0 });
  const onNavLayoutBounds = useCallback((b: { bannerBottom: number; bottomBarHeight: number }) => {
    setNavBounds((prev) =>
      prev.bannerBottom === b.bannerBottom && prev.bottomBarHeight === b.bottomBarHeight ? prev : b,
    );
  }, []);
  // Cadre ferme : le bouton qui le rouvre occupe le coin bas droit (36 points de haut, a 12 du
  // bord). La colonne remonte donc au-dessus de lui, sinon son dernier bouton le recouvrait.
  const navColumnBottom =
    navBounds.bottomBarHeight > 0
      ? navBounds.bottomBarHeight + spacing.md
      : insets.bottom + spacing.md + 36 + spacing.md;
  const navFabGap = spacing.sm;
  const navAvailable = mapH - (navBounds.bannerBottom + spacing.md) - navColumnBottom;
  const navFabSize = Math.max(
    28,
    Math.min(
      Math.round(baseFabSize * 0.78),
      Math.floor((navAvailable - (FAB_COUNT - 1) * navFabGap) / (FAB_COUNT - 1 + FAB_PRIMARY_RATIO)),
    ),
  );
  const fabSize = navigating ? navFabSize : baseFabSize;
  const fabPrimarySize = Math.round(fabSize * FAB_PRIMARY_RATIO);

  /**
   * Orientation : portrait partout, SAUF pendant la navigation.
   *
   * Sur un support de voiture, le telephone est souvent pose en paysage. L'ecran de
   * navigation sait s'y adapter ; l'ecran d'accueil, avec sa colonne de dix boutons, non —
   * elle demande environ 490 points de haut, un ecran en paysage en offre autour de 400.
   * `DEFAULT` suit le reglage « rotation automatique » du telephone : s'il est desactive,
   * l'ecran reste comme il est, ce qui est le comportement attendu.
   */
  useEffect(() => {
    const lock = navigating
      ? ScreenOrientation.OrientationLock.DEFAULT
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    ScreenOrientation.lockAsync(lock).catch(() => {
      /* orientation non pilotable sur cet appareil : on garde celle du systeme */
    });
  }, [navigating]);

  /* ------------------------------------------------------------------ */
  /* Position                                                            */
  /* ------------------------------------------------------------------ */

  // `position` est cadence a 1 Hz en navigation : il alimente les traitements (manoeuvres,
  // requetes, alertes de proximite). Le mouvement fluide de la carte, lui, passe par
  // `subscribe`, qui ne provoque aucun rendu. Voir useLiveLocation.
  /* Textes de la notification permanente affichee pendant le guidage. Android l'impose pour
   * continuer a fournir des positions ecran eteint : elle sert aussi de raccourci de retour.
   * Memorises, sinon leur identite changerait a chaque rendu et relancerait le service. */
  const serviceLabels = useMemo(
    () => ({ title: t('nav.serviceTitle'), body: t('nav.serviceBody') }),
    [t],
  );
  const { position, permissionDenied, subscribe: subscribeFix, getFix } = useLiveLocation(
    navigating,
    serviceLabels,
  );

  /** Cap au sol : utile pour un radar/barrage (sens de circulation), pas critique — on ne
   * bloque jamais l'envoi d'un signalement en son absence (GPS interieur, telephone pose). */
  const currentHeading = useCallback(() => getFix()?.heading ?? undefined, [getFix]);
  const currentSpeedMps = useCallback(() => getFix()?.speedMps ?? 0, [getFix]);
  /** Precision annoncee par le GPS : elle ouvre la tolerance de suivi d'itineraire. */
  const currentAccuracyM = useCallback(() => getFix()?.accuracyM ?? 0, [getFix]);

  const lang = (i18n.language as Language) ?? 'fr';
  const places = usePlaces();
  const search = usePlaceSearch(position, lang);

  /** Lieux WIN affiches en fond de carte, sans avoir a chercher (loadPOIs en v83). Ils
   * disparaissent pendant la navigation : au volant, la carte doit montrer la route, pas la
   * liste des commerces du quartier. */
  const poiGeoJson = usePoiLayer(position, !navigating);

  /* ------------------------------------------------------------------ */
  /* Itineraire : apercu dans la fiche du lieu, puis navigation guidee    */
  /* ------------------------------------------------------------------ */

  const [routeMode, setRouteMode] = useState<RouteMode>('auto');
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [navDestination, setNavDestination] = useState<(Position & { emoji: string }) | null>(null);
  /** Point vise par un appui long PENDANT le guidage, en attente de confirmation. */
  const [detourPoint, setDetourPoint] = useState<Position | null>(null);
  /* L'enregistrement de lieux est reserve aux contributeurs : pour les autres, l'appui long
   * hors navigation ne fait rien, et rien a l'ecran ne laisse deviner qu'il existe. */
  /* Destination d'origine, mise de cote le temps d'un detour.
   *
   * Sans elle, se derouter vers une station-service ferait perdre le trajet : il faudrait
   * rechercher sa destination finale et tout relancer. Elle est conservee jusqu'a ce que
   * l'utilisateur reprenne sa route ou arrete le guidage. */
  const [originalDestination, setOriginalDestination] = useState<(Position & { emoji: string }) | null>(null);
  const [navInitialRoute, setNavInitialRoute] = useState<Route | null>(null);
  // Vue d'ensemble / recentrer (v83: overviewBtn + navRecenterBtn) : vraie tant que la camera
  // suit la position et le cap du conducteur ; fausse des que la vue d'ensemble est ouverte, le
  // temps que "Recentrer" reprenne la main.
  const [followMode, setFollowMode] = useState(true);
  /* Cap du vehicule, lu au moment du rendu plutot que conserve dans un etat : le flux de
   * positions tourne a soixante images par seconde et en faire un etat declencherait autant de
   * rendus de tout l'ecran. Ce rendu-ci, lui, a deja lieu a chaque point GPS — `position` en est
   * un etat — et la fleche de deviation n'a pas besoin d'etre plus rapide que cela. */
  const capVehicule = getFix()?.heading ?? null;
  /** Bilan affiche a l'arrivee. */
  const [tripSummary, setTripSummary] = useState<Trip | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  /** Champ de recherche ouvert PENDANT le guidage (bouton loupe de la colonne). */
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  // Le petit menu « Nouvel itineraire / Continuer » que la loupe ouvre d'abord.
  const [navSearchMenuOpen, setNavSearchMenuOpen] = useState(false);
  /** Heure de depart et duree annoncee, retenues pour ce bilan. Une reference plutot qu'un
   * etat : ces valeurs ne changent rien a l'affichage tant que le trajet dure. */
  const tripStartRef = useRef<{ at: number; estimateS: number; distanceM: number } | null>(null);

  useEffect(() => setSelectedRouteIndex(0), [selectedPlace, routeMode]);
  useEffect(() => {
    if (navigating) setFollowMode(true);
  }, [navigating]);

  const previewDestination = !navigating && selectedPlace ? { lat: selectedPlace.lat, lon: selectedPlace.lon } : null;
  const preview = useRoutePreview(position, previewDestination, routeMode, lang);
  const previewRoutes = useMemo(
    () => (preview.data ? [preview.data.primary, ...preview.data.alternates] : []),
    [preview.data],
  );

  /**
   * Routes coupees a contourner lors d'un recalcul (point 5F du client).
   *
   * Seuls les barrages et les routes inondees sont transmis : ce sont les deux signalements qui
   * EMPECHENT reellement de passer. Un bouchon, lui, se traverse — l'eviter enverrait le
   * conducteur faire vingt kilometres pour economiser cinq minutes.
   *
   * Lu au moment du recalcul plutot que surveille en continu : un signalement qui arrive
   * pendant le trajet ne doit pas, a lui seul, relancer le calcul de tout l'itineraire.
   */
  const liveReportsRef = useRef(liveReports);
  liveReportsRef.current = liveReports;
  const avoidPoints = useCallback(
    () =>
      liveReportsRef.current
        .filter((r) => r.kind === 'block' || r.kind === 'flood')
        .slice(0, 20)
        .map((r) => ({ lat: r.lat, lon: r.lon })),
    [],
  );

  const nav = useNavigationSession({
    active: navigating,
    position,
    destination: navDestination,
    mode: routeMode,
    lang,
    initialRoute: navInitialRoute,
    getSpeedMps: currentSpeedMps,
    getHeading: currentHeading,
    getAccuracyM: currentAccuracyM,
    getAvoidPoints: avoidPoints,
  });

  /* ------------------------------------------------------------------ */
  /* Camera de conduite                                                  */
  /* ------------------------------------------------------------------ */

  /** Marge haute qui place le vehicule dans le bas de l'ecran : on voit la route devant
   * soi, pas derriere. Elle tient compte du bandeau d'instruction, qui occupe le haut. */
  /** Marges de la camera en navigation. Portrait : le vehicule dans le bas de l'ecran.
   * Paysage : a droite de la colonne de consignes, un peu sous le milieu. */
  const navPadding = useMemo(
    () =>
      landscape
        ? { top: Math.round(mapH * 0.22), left: navCardWidth + insets.left + spacing.sm * 2 }
        : { top: Math.round(mapH * 0.32) + insets.top, left: 0 },
    [landscape, mapH, navCardWidth, insets.top, insets.left],
  );

  /**
   * Calage de la camera sur l'itineraire (voir useSmoothCamera). Tant que la position est a
   * moins de SNAP_RADIUS_M du trace, la camera vise le point de la route le plus proche :
   * le marqueur fixe au centre est donc pose sur la ligne. Au-dela, c'est un vrai ecart —
   * sortie manquee, parking — et on montre la position telle qu'elle est.
   */
  const navRouteRef = useRef<Route | null>(null);
  navRouteRef.current = nav.route;
  const snapHintRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    snapHintRef.current = undefined;
  }, [nav.route]);

  const snapToRoute = useCallback((fix: LiveFix): SnappedPoint | null => {
    const route = navRouteRef.current;
    if (!route || route.geometry.length < 2) return null;
    const located = locateOnRoute([fix.lon, fix.lat], route.geometry, snapHintRef.current);
    snapHintRef.current = located.segmentIndex;
    const tolerance = Math.min(SNAP_RADIUS_MAX_M, Math.max(SNAP_RADIUS_MIN_M, fix.accuracyM));
    if (located.distanceM > tolerance) return null;
    const [lon, lat] = pointOnRoute(route, located);
    const i = Math.min(located.segmentIndex, route.geometry.length - 2);
    const a = route.geometry[i]!;
    const b = route.geometry[i + 1]!;
    return { lat, lon, bearing: geoBearing(a[1], a[0], b[1], b[0]) };
  }, []);

  useSmoothCamera({
    cameraRef,
    subscribe: subscribeFix,
    active: navigating && followMode,
    zoom: 17.5,
    pitch: 55,
    padding: navPadding,
    snap: snapToRoute,
  });

  /* ------------------------------------------------------------------ */
  /* Signalements : chargement initial puis mises a jour temps reel      */
  /* ------------------------------------------------------------------ */

  const { data, isLoading } = useQuery({
    // La cle est arrondie a deux decimales, soit environ un kilometre :
    // sans cela, chaque rafraichissement GPS relancerait une requete.
    queryKey: ['reports', position?.lat.toFixed(2), position?.lon.toFixed(2)],
    enabled: position !== null,
    queryFn: () =>
      api<{ items: Report[] }>('/reports/nearby', {
        query: { lat: position!.lat, lon: position!.lon, radius: NEARBY_RADIUS_M },
      }),
  });

  useEffect(() => {
    if (data?.items) setLiveReports(data.items);
  }, [data]);

  useRealtime(position, {
    // Sans filtre, un signalement deja charge (le sien, ou recu apres une reconnexion) apparaissait
    // deux fois : deux points superposes et deux alertes vocales.
    onNew: (report) => setLiveReports((current) => [report, ...current.filter((r) => r.id !== report.id)]),
    onUpdated: (report) =>
      setLiveReports((current) => current.map((r) => (r.id === report.id ? report : r))),
    onRemoved: (reportId) => setLiveReports((current) => current.filter((r) => r.id !== reportId)),
  });

  /** Les signalements passent a la carte sous forme de GeoJSON. */
  const reportsGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: liveReports.map((report) => ({
        type: 'Feature',
        id: report.id,
        properties: {
          id: report.id,
          kind: report.kind,
          color: REPORT_COLORS[report.kind] ?? '#D64545',
          emoji: REPORT_EMOJI[report.kind] ?? '⚠️',
        },
        geometry: { type: 'Point', coordinates: [report.lon, report.lat] },
      })),
    }),
    [liveReports],
  );

  /** Marqueur de destination : celle choisie dans la fiche du lieu, ou celle en cours
   * de navigation (la fiche est fermee des le depart, le pin doit rester affiche).
   * Porte un pictogramme de categorie plutot qu'un simple point (chantier navigation). */
  const destinationGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (navigating) {
      if (!navDestination) return { type: 'FeatureCollection', features: [] };
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { emoji: navDestination.emoji },
            geometry: { type: 'Point', coordinates: [navDestination.lon, navDestination.lat] },
          },
        ],
      };
    }
    if (!selectedPlace) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { emoji: emojiForPlace(selectedPlace) },
          geometry: { type: 'Point', coordinates: [selectedPlace.lon, selectedPlace.lat] },
        },
      ],
    };
  }, [navigating, navDestination, selectedPlace]);

  /** Trace(s) affiches sur la carte : itineraire(s) d'apercu avant depart, puis
   * uniquement l'itineraire suivi une fois la navigation demarree. */
  const routeLinesGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    if (navigating) {
      if (!nav.route) return { type: 'FeatureCollection', features: [] };
      /* LE TRACE ENTIER, POSE UNE FOIS POUR TOUT LE TRAJET.
       *
       * Il etait jusqu'ici recoupe en deux a chaque point GPS — le parcouru d'un cote, le
       * restant de l'autre — ce qui obligeait a renvoyer toute la geometrie a la carte une
       * fois par seconde. La distinction entre les deux se fait desormais par la couleur,
       * calculee le long de la ligne (voir degradeDeProgression). Cette liste-ci ne change
       * donc plus qu'au changement d'itineraire, c'est-a-dire presque jamais. */
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'primary' },
            geometry: { type: 'LineString', coordinates: nav.route.geometry },
          },
        ],
      };
    }
    if (!previewRoutes.length) return { type: 'FeatureCollection', features: [] };
    const primaryDurationS = previewRoutes[selectedRouteIndex]?.durationS ?? 0;
    return {
      type: 'FeatureCollection',
      features: previewRoutes.map((r, i) => {
        const isPrimary = i === selectedRouteIndex;
        // Sur un alternatif, l'ecart de duree avec le trace choisi plutot que sa duree brute :
        // "+8 min" se lit d'un coup d'oeil, la meme information que "Meme duree" demandee par
        // le client quand l'ecart est nul (doc 110 #2).
        const deltaMin = Math.round((r.durationS - primaryDurationS) / 60);
        // Le trace CHOISI porte sa duree (« 5 h 40 »), les bis portent la leur suivie de
        // l'ecart (« 5 h 48 · +8 min ») : c'est la lecture de Google Maps et de Waze, et le
        // client la demande sur chaque trace. Le principal n'affichait rien du tout.
        // Duree ET distance sur chaque trace, choisi comme alternatif : ce sont les deux
        // chiffres qui font choisir un itineraire plutot qu'un autre, et le client les veut
        // lisibles sans ouvrir la fiche. L'ecart de duree reste en queue d'etiquette sur les
        // bis (« +8 min », « Meme duree »), comme le fait Waze.
        const own = `${formatDuration(r.durationS)} · ${formatDistance(r.distanceM)}`;
        const durationLabel = isPrimary
          ? own
          : deltaMin === 0
            ? `${own} · ${t('trip.sameDuration')}`
            : `${own} · ${deltaMin > 0 ? '+' : ''}${deltaMin} min`;
        return {
          type: 'Feature',
          properties: { kind: isPrimary ? 'primary' : 'alt', durationLabel },
          geometry: { type: 'LineString', coordinates: r.geometry },
        };
      }),
    };
  }, [navigating, nav.route, previewRoutes, selectedRouteIndex, t]);

  /**
   * Part du trajet deja parcourue, de 0 a 1 — la seule chose qui bouge pendant le guidage.
   *
   * C'est elle qui place la limite entre le gris et le vert sur le trace, et elle ne coute
   * qu'une division : la distance parcourue le long de la route est deja calculee par la
   * session de navigation, la longueur totale est le dernier element du tableau de distances
   * cumulees, prepare une seule fois a la reception de l'itineraire.
   */
  const avanceFraction = useMemo(() => {
    if (!navigating || !nav.route || !nav.progress) return 0;
    const cumul = nav.route.cumulativeM;
    const total = cumul[cumul.length - 1] ?? 0;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, traveledMeters(nav.route, nav.progress) / total));
  }, [navigating, nav.route, nav.progress]);

  /** Longueur de la traine, ramenee a une fraction du trajet : quatre cents metres ne
   * representent pas la meme chose sur cinq kilometres et sur quatre cents. */
  const traineFraction = useMemo(() => {
    const cumul = nav.route?.cumulativeM;
    const total = cumul?.[cumul.length - 1] ?? 0;
    return total > 0 ? Math.min(1, TRAINE_M / total) : 1;
  }, [nav.route]);

  /**
   * Pastilles de duree, posees a mi-parcours de chaque trace.
   *
   * Elles etaient jusqu'ici ecrites LE LONG de la ligne (`symbol-placement: line-center`) :
   * le texte epousait la courbe de la route, se retrouvait a l'envers dans un lacet et
   * illisible des que le trace tournait — c'est ce que le client a releve. Une source de
   * POINTS distincte permet un texte toujours horizontal, comme la pastille « 12 min » de
   * Google Maps, sans rien changer au calcul des libelles eux-memes.
   */
  const routeLabelsGeoJson = useMemo<GeoJSON.FeatureCollection>(() => {
    /* EN GUIDAGE, L'ETIQUETTE SE POSE AU MILIEU DE CE QUI RESTE.
     *
     * Le client dezoome en cours de route pour embrasser le trajet entier, et le trace ne
     * disait alors plus rien : il fallait revenir au cadre du bas pour savoir ou l'on en
     * etait. L'etiquette reprend les deux valeurs qui comptent a cet instant — le temps et la
     * distance qui RESTENT, jamais ceux du depart — et suit la progression.
     *
     * Elle se calculait autrefois a partir du trace deja recoupe ; celui-ci ne l'etant plus,
     * on cherche directement le point situe a mi-chemin de ce qui reste. C'est le meme endroit,
     * pour une fraction du travail. */
    if (navigating) {
      const route = nav.route;
      if (!route || !nav.remaining) return { type: 'FeatureCollection', features: [] };
      const cumul = route.cumulativeM;
      const total = cumul[cumul.length - 1] ?? 0;
      const faite = nav.progress ? traveledMeters(route, nav.progress) : 0;
      const at = pointAtDistance(route, (faite + total) / 2);
      if (!at) return { type: 'FeatureCollection', features: [] };
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              label: `${formatDuration(nav.remaining.durationS)} · ${formatDistance(nav.remaining.distanceM)}`,
            },
            geometry: { type: 'Point', coordinates: at },
          },
        ],
      };
    }

    const features: GeoJSON.Feature[] = [];
    for (const f of routeLinesGeoJson.features) {
      const label = (f.properties as { durationLabel?: string } | null)?.durationLabel;
      if (!label || f.geometry.type !== 'LineString') continue;
      const at = midpointOf(f.geometry.coordinates as [number, number][]);
      if (!at) continue;
      features.push({ type: 'Feature', properties: { label }, geometry: { type: 'Point', coordinates: at } });
    }
    return { type: 'FeatureCollection', features };
  }, [navigating, nav.route, nav.progress, nav.remaining, routeLinesGeoJson]);

  /**
   * « Ma position ».
   *
   * Le bouton ne faisait RIEN quand la position n'etait pas encore connue — pas de
   * mouvement, pas de message, rien. Or c'est precisement le moment ou on appuie dessus :
   * au demarrage, en interieur, apres un tunnel. L'utilisateur en conclut, a juste titre,
   * que le bouton est casse.
   *
   * Trois cas, tous dits :
   *  - position connue : on y va ;
   *  - autorisation refusee : on l'explique, car aucune attente ne la resoudra ;
   *  - pas encore de point : on en demande un DANS L'INSTANT plutot que d'attendre la
   *    prochaine mesure du suivi continu, qui peut etre a trois secondes.
   */
  const recenter = useCallback(async () => {
    // Pendant le guidage, ce bouton est le « recentrer » de la colonne (point 6 du client) :
    // il rend la camera au suivi du vehicule. Un simple deplacement de camera, comme a
    // l'accueil, aurait ete aussitot contredit par le suivi — ou pire, l'aurait laisse coupe.
    if (navigating) {
      setFollowMode(true);
      return;
    }
    const known = getFix() ?? position;
    if (known) {
      cameraRef.current?.easeTo({ center: [known.lon, known.lat], zoom: 15, duration: 700 });
      return;
    }

    if (permissionDenied) {
      setToast(t('map.locationDenied'));
      return;
    }

    setToast(t('map.locating'));
    try {
      const one = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      cameraRef.current?.easeTo({
        center: [one.coords.longitude, one.coords.latitude],
        zoom: 15,
        duration: 700,
      });
    } catch {
      setToast(t('map.locationUnavailable'));
    }
  }, [position, getFix, permissionDenied, t, navigating]);

  /** "Vue d'ensemble" pendant la navigation : dezoome et aplatit la camera pour montrer tout le
   * trajet restant, exactement comme overviewBtn en v83. */
  const showRouteOverview = useCallback(() => {
    const geometry = nav.route?.geometry;
    if (!geometry || geometry.length < 2) return;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [lon, lat] of geometry) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    if (position) {
      west = Math.min(west, position.lon);
      east = Math.max(east, position.lon);
      south = Math.min(south, position.lat);
      north = Math.max(north, position.lat);
    }
    setFollowMode(false);
    cameraRef.current?.fitBounds([west, south, east, north], {
      // En paysage, la colonne de consignes couvre la gauche : le trajet doit tenir a droite.
      padding: landscape
        ? { top: 40, bottom: 40, left: navCardWidth + 40, right: 80 }
        : { top: 120, bottom: 160, left: 60, right: 60 },
      pitch: 0,
      duration: 600,
    });
  }, [nav.route, position, landscape, navCardWidth]);

  /** Boutons + / - de la carte, comme sur le site. Le niveau courant est demande a la carte
   * plutot que suivi dans un etat : le zoom change aussi aux pincements, et un etat local
   * finirait par mentir. */
  const zoomBy = useCallback((delta: number) => {
    void mapRef.current?.getZoom().then((zoom) => {
      cameraRef.current?.zoomTo(Math.min(20, Math.max(2, zoom + delta)), { duration: 220 });
    });
  }, []);

  const resumeFollow = useCallback(() => setFollowMode(true), []);

  /** Le conducteur (ou son passager) deplace la carte a la main pendant la navigation :
   * le suivi s'interrompt, sinon la camera, repositionnee trente fois par seconde, ramenerait
   * la vue sous le doigt et la carte serait litteralement impossible a bouger. Le bouton
   * "Recentrer" apparait alors, comme apres une vue d'ensemble. */
  const onRegionWillChange = useCallback(
    (event: { nativeEvent: { userInteraction?: boolean } }) => {
      if (navigating && event.nativeEvent.userInteraction) setFollowMode(false);
    },
    [navigating],
  );

  /* ------------------------------------------------------------------ */
  /* Signalements : creation et vote                                     */
  /* ------------------------------------------------------------------ */

  const createReport = useMutation({
    mutationFn: (kind: ReportKind) =>
      api<Report>('/reports', {
        method: 'POST',
        body: { kind, lat: position!.lat, lon: position!.lon, heading: currentHeading() },
      }),
    onSuccess: () => setToast(t('report.sent')),
    onError: () => setToast(t('errors.network')),
  });

  const voteReport = useMutation({
    mutationFn: ({ id, vote }: { id: string; vote: 'confirm' | 'absent' }) =>
      api<{ removed: boolean }>(`/reports/${id}/vote`, { method: 'POST', body: { vote } }),
    onSuccess: (result) => {
      setVoteMessage(result.removed ? t('report.removedThanks') : t('report.voteRecorded'));
      setTimeout(() => setVotingReport(null), 1800);
    },
    onError: (error) => {
      const alreadyVoted = error instanceof ApiError && error.status === 409;
      setVoteMessage(alreadyVoted ? t('report.alreadyVoted') : t('errors.network'));
      setTimeout(() => setVotingReport(null), 1800);
    },
  });

  const openReportMenu = useCallback(() => setReportMenuOpen(true), []);

  const submitReport = useCallback(
    (kind: ReportKind) => {
      setReportMenuOpen(false);
      if (!position) {
        setToast(t('map.locationDenied'));
        return;
      }
      createReport.mutate(kind);
    },
    [position, createReport, t],
  );

  const onReportsPress = useCallback(
    (event: { nativeEvent: { features?: GeoJSON.Feature[] } }) => {
      const feature = event.nativeEvent.features?.[0];
      const id = (feature?.properties as { id?: string } | undefined)?.id;
      const report = liveReports.find((r) => r.id === id);
      if (!report) return;
      setVoteMessage(null);
      setVotingReport(report);
    },
    [liveReports],
  );

  const closeVoteCard = useCallback(() => {
    setVotingReport(null);
    setVoteMessage(null);
  }, []);

  /**
   * Annonce vocale a l'approche d'un danger pendant la navigation, et ouverture de la carte
   * « Toujours la ? » (checkBumpApproach + showAlertConfirm en v83). Elle se referme seule au
   * bout de 6 s : au volant, on ne doit jamais avoir a fermer quoi que ce soit pour continuer.
   */
  const approachTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onApproachReport = useCallback((report: Report) => {
    if (approachTimerRef.current) clearTimeout(approachTimerRef.current);
    setVoteMessage(null);
    setVotingReport(report);
    approachTimerRef.current = setTimeout(() => setVotingReport(null), 6000);
  }, []);

  useEffect(() => () => {
    if (approachTimerRef.current) clearTimeout(approachTimerRef.current);
  }, []);

  /* Distance deja parcourue sur l'itineraire. Elle sert a mesurer ce qui reste jusqu'a un
   * signalement LE LONG DE LA ROUTE — la seule mesure qui corresponde a ce que la voix annonce
   * (<< dans 100 metres >> veut dire cent metres de conduite, pas a vol d'oiseau). */
  const avanceSurTraceM = useMemo(
    () => (nav.route && nav.progress ? traveledMeters(nav.route, nav.progress) : 0),
    [nav.route, nav.progress],
  );

  useApproachAlerts({
    active: navigating,
    position,
    reports: liveReports,
    lang,
    route: navigating ? nav.route : null,
    traveledM: avanceSurTraceM,
    onApproach: onApproachReport,
  });

  /** Appui sur un lieu du fond de carte : ouvre sa fiche, comme un resultat de recherche. */
  const onPoiPress = useCallback(
    (event: { nativeEvent: { features?: GeoJSON.Feature[] } }) => {
      const feature = event.nativeEvent.features?.[0];
      const props = feature?.properties as { id?: string; name?: string } | undefined;
      const geometry = feature?.geometry;
      if (!props?.id || !geometry || geometry.type !== 'Point') return;
      const [lon, lat] = geometry.coordinates as [number, number];
      setSelectedPlace({
        name: props.name ?? '',
        displayName: props.name ?? '',
        lat,
        lon,
        source: 'win',
        placeId: props.id,
        distanceM: position ? haversine(position.lat, position.lon, lat, lon) : undefined,
      });
    },
    [position],
  );

  /* Un lieu WIN ouvert depuis la carte n'arrive qu'avec son nom et sa position : c'est tout ce
   * que porte le calque. Sa fiche s'ouvrait donc SANS la photo prise lors de l'ajout, ni les
   * telephones. On charge la fiche complete, puis on la fusionne — seulement si l'utilisateur
   * regarde toujours ce lieu-la quand la reponse arrive. */
  const detailsPlaceId =
    selectedPlace?.source === 'win' && selectedPlace.placeId && selectedPlace.photos === undefined
      ? selectedPlace.placeId
      : null;
  useEffect(() => {
    if (!detailsPlaceId) return;
    let cancelled = false;
    api<Place>(`/places/${detailsPlaceId}`)
      .then((p) => {
        if (cancelled) return;
        setSelectedPlace((cur) =>
          cur && cur.placeId === detailsPlaceId
            ? {
                ...cur,
                name: p.name || cur.name,
                category: p.category,
                photoUrl: p.photos[0]?.url ?? null,
                photos: p.photos.map((ph) => ({ url: ph.url, thumbUrl: ph.thumbUrl, credit: ph.credit })),
                isPartner: p.isPartner,
                phoneFixe: p.phoneFixe,
                phoneMobile: p.phoneMobile,
                whatsapp: p.whatsapp,
                email: p.email,
                promo: p.promo,
              }
            : cur,
        );
      })
      .catch(() => {
        // Fiche partielle plutot que rien : le nom, la position et l'itineraire restent utiles.
      });
    return () => {
      cancelled = true;
    };
  }, [detailsPlaceId]);

  /**
   * Appui long sur la carte — DEUX gestes differents selon l'etat du guidage.
   *
   * Hors navigation, il ouvre le formulaire d'enregistrement d'un lieu (openAddPoint en v83).
   * Pendant le guidage, ce formulaire n'a aucun sens : on ne saisit pas un nom et une photo au
   * volant, et il masquait l'instruction en cours. Le meme geste propose alors de SE DEROUTER
   * vers le point touche — ce commerce ou cette avenue que l'on vient d'apercevoir.
   *
   * C'est la logique de `triggerAddPoint` en v83, qui teste `nav-active` sur le corps du
   * document ; ici l'etat `navigating` joue le meme role.
   */
  const onMapLongPress = useCallback(
    (event: { nativeEvent: { lngLat: [number, number] } }) => {
      const [lon, lat] = event.nativeEvent.lngLat;
      if (navigating) setDetourPoint({ lat, lon });
      /* Hors navigation, l'appui long ouvre le formulaire d'ajout POUR TOUT LE MONDE.
       *
       * Ce droit a ete ferme un temps, puis rouvert : la selection ne se fait plus a l'entree
       * mais a la curation — chacun apporte ce qu'il connait, les contributeurs corrigent et
       * retirent. Fermer l'ecriture protegeait la qualite de ce qui etait ecrit, au prix de
       * n'avoir presque rien d'ecrit. */
      else setAddPlaceCoords({ lat, lon });
    },
    [navigating],
  );

  /** Deviation confirmee : la destination change, l'ancienne est mise de cote. */
  const confirmDetour = useCallback(
    (nom: string | null) => {
      if (!detourPoint) return;
      // La destination d'origine n'est memorisee qu'au PREMIER detour : s'arreter deux fois en
      // chemin ne doit pas faire oublier ou l'on allait.
      setOriginalDestination((actuelle) => actuelle ?? navDestination);
      setNavDestination({ ...detourPoint, emoji: '📍' });
      // Pas d'itineraire pre-calcule : la session en demande un depuis l'endroit exact ou l'on
      // se trouve, comme pour un detour choisi dans la recherche.
      setNavInitialRoute(null);
      setDetourPoint(null);
      setToast(nom ? `${t('nav.detourDone')} ${nom}` : t('nav.detourDone'));
    },
    [detourPoint, navDestination, t],
  );

  /** Retour a la destination initiale, apres un detour. */
  const resumeOriginalRoute = useCallback(() => {
    if (!originalDestination) return;
    setNavDestination(originalDestination);
    setNavInitialRoute(null);
    setOriginalDestination(null);
  }, [originalDestination]);

  // Au demarrage du guidage vocal, et a chaque changement de langue : si le telephone n'a
  // aucune voix pour la langue de l'application, on le dit, avec l'endroit ou l'ajouter. Sinon
  // l'utilisateur entend la langue du telephone et croit que WIN ignore son choix.
  useEffect(() => {
    if (!navigating || !voiceGuidanceEnabled) return;
    let cancelled = false;
    void hasVoiceFor(lang).then((ok) => {
      if (!cancelled && ok === false) setToast(t('voice.fallbackFrench'));
    });
    return () => {
      cancelled = true;
    };
  }, [navigating, voiceGuidanceEnabled, lang, t]);

  const onPlaceSaved = useCallback(() => {
    setAddPlaceCoords(null);
    setToast(t('addPlace.success'));
  }, [t]);

  /* ------------------------------------------------------------------ */
  /* Recherche : selection d'un resultat, ouverture de la fiche du lieu   */
  /* ------------------------------------------------------------------ */

  const openPlace = useCallback(
    (raw: GeocodedResult) => {
      const distanceM = position ? haversine(position.lat, position.lon, raw.lat, raw.lon) : undefined;
      const place: SelectedPlace = { ...raw, distanceM };
      setSelectedPlace(place);
      setSearchFocused(false);
      setResultsOpen(false);
      search.setQuery(place.name);
      Keyboard.dismiss();
      places.addToHistory(toBookmark(place));
      cameraRef.current?.easeTo({ center: [place.lon, place.lat], zoom: 15, duration: 800 });
    },
    [position, search, places],
  );

  const openBookmark = useCallback(
    (b: Bookmark) => {
      openPlace({ name: b.name, displayName: b.addr, lat: b.lat, lon: b.lon, source: 'nominatim' });
    },
    [openPlace],
  );

  /* ------------------------------------------------------------------ */
  /* Ouverture demandee par un autre ecran (espace admin -> une remarque) */
  /* ------------------------------------------------------------------ */

  /**
   * L'espace admin renvoie ici avec le lieu vise par une remarque, pour qu'on puisse le
   * corriger sans le rechercher a la main.
   *
   * Le garde-fou n'est pas une precaution de style : les parametres de route RESTENT en place
   * apres consommation, et cet effet se declenche a chaque rendu suivant — au moindre
   * deplacement de la carte. Sans la memoire de ce qui a deja ete ouvert, la fiche se
   * reouvrirait indefiniment et la camera se recentrerait sous les doigts de l'utilisateur.
   */
  const params = useLocalSearchParams<{ lieu?: string; lat?: string; lon?: string; nom?: string }>();
  const demandeTraitee = useRef<string | null>(null);

  useEffect(() => {
    const lieu = typeof params.lieu === 'string' ? params.lieu : '';
    const lat = Number(params.lat);
    const lon = Number(params.lon);
    const signature = `${lieu}|${params.lat ?? ''}|${params.lon ?? ''}`;
    if (signature === '||' || demandeTraitee.current === signature) return;

    /* Une remarque peut porter un lieu SANS position, ou une position sans lieu. Sans l'une ni
     * l'autre il n'y a rien a montrer, et on ne touche a rien. */
    const aUnePosition = Number.isFinite(lat) && Number.isFinite(lon);
    if (!lieu && !aUnePosition) return;

    demandeTraitee.current = signature;
    const nom = typeof params.nom === 'string' && params.nom ? params.nom : t('admin.correctionNoPlace');
    openPlace({
      name: nom,
      displayName: nom,
      lat: aUnePosition ? lat : 0,
      lon: aUnePosition ? lon : 0,
      /* `source: 'win'` avec un placeId : c'est ce couple qui fait charger la fiche complete
       * et apparaitre << Gerer cette fiche >> (voir PlaceSheet, peutGerer). */
      source: lieu ? 'win' : 'nominatim',
      ...(lieu ? { placeId: lieu } : {}),
    });
  }, [params.lieu, params.lat, params.lon, params.nom, openPlace, t]);

  const closeSheet = useCallback(() => {
    setSelectedPlace(null);
    search.setQuery('');
  }, [search]);

  const startNavigation = useCallback(() => {
    if (!selectedPlace) return;
    // Guidage vers la Tunisie : reserve aux appareils qui ont debloque l'acces. Le lieu reste
    // consultable (fiche, distance, apercu) — seul le guidage est payant, comme sur le site.
    if (countryFromCoords(selectedPlace.lat, selectedPlace.lon) === 'TN' && !tunisia.unlocked) {
      setTnSheetOpen(true);
      return;
    }
    const chosen = previewRoutes[selectedRouteIndex] ?? null;
    setNavDestination({ lat: selectedPlace.lat, lon: selectedPlace.lon, emoji: emojiForPlace(selectedPlace) });
    setNavInitialRoute(chosen);
    // La duree ANNONCEE au depart est retenue ici, pas relue a l'arrivee : un recalcul en
    // cours de route la modifie, et comparer l'arrivee a une estimation revisee en chemin
    // ne mesurerait plus rien.
    tripStartRef.current = chosen
      ? { at: Date.now(), estimateS: chosen.durationS, distanceM: chosen.distanceM }
      : { at: Date.now(), estimateS: 0, distanceM: 0 };
    setTripSummary(null);
    setNavigating(true);
    closeSheet();
  }, [selectedPlace, previewRoutes, selectedRouteIndex, closeSheet, tunisia.unlocked]);

  const stopNavigation = useCallback(() => {
    setStepsOpen(false);
    setNavSearchOpen(false);
    setNavSearchMenuOpen(false);
    setDetourPoint(null);
    setOriginalDestination(null);
    setNavigating(false);
    setNavDestination(null);
    setNavInitialRoute(null);
    // Fin de trajet : la carte revient a plat, nord en haut. Sans cela elle reste inclinee et
    // tournee dans la derniere direction suivie, ce qui n'a plus aucun sens une fois arrete.
    cameraRef.current?.setStop({ bearing: 0, pitch: 0, duration: 400 });
    setMapBearing(0);
  }, []);

  /**
   * Quitter le guidage par la fleche du cadre du bas : meme effet que le bouton rouge « Fin »,
   * plus la fiche du lieu refermee et la recherche videe, pour retrouver reellement l'ecran de
   * depart et non la carte encore chargee de la derniere destination.
   */
  const exitNavigationToHome = useCallback(() => {
    stopNavigation();
    closeSheet();
  }, [stopNavigation, closeSheet]);

  /**
   * Arrivee : plus aucune manoeuvre devant, et moins de cinquante metres a parcourir. Les
   * deux conditions sont necessaires — un itineraire tres court n'a qu'une manoeuvre, et
   * conclure sur ce seul critere ferait afficher le bilan au moment du depart.
   */
  useEffect(() => {
    if (!navigating || !nav.route) return;
    if (nav.nextManeuver) return;
    const remainingM = nav.remaining?.distanceM ?? Infinity;
    if (remainingM > ARRIVAL_RADIUS_M) return;

    const start = tripStartRef.current;
    setTripSummary({
      distanceM: start?.distanceM || nav.route.distanceM,
      durationS: start ? Math.round((Date.now() - start.at) / 1000) : 0,
      estimateS: start?.estimateS ?? 0,
    });
    tripStartRef.current = null;
    stopNavigation();
  }, [navigating, nav.route, nav.nextManeuver, nav.remaining, stopNavigation]);

  // Decouple de la longueur du texte : sans ca, choisir un resultat remplit la
  // barre avec son nom (pour l'afficher), ce qui rouvrirait aussitot la liste.
  const [resultsOpen, setResultsOpen] = useState(false);
  const showBookmarks = searchFocused && search.query.trim().length < 2;
  const resultsVisible = resultsOpen && (showBookmarks || search.query.trim().length >= 2);

  /** Referme le panneau de recherche (recents, favoris ou resultats) et le clavier. La saisie,
   * elle, est conservee : toucher de nouveau la barre rouvre les memes resultats. */
  const closeSearchPanel = useCallback(() => {
    setSearchFocused(false);
    setResultsOpen(false);
    Keyboard.dismiss();
  }, []);

  // Clavier ferme (touche retour d'Android) alors que rien n'a ete tape : les recents n'ont plus
  // de raison de rester affiches, ils masquaient la carte sans que rien ne permette de les
  // fermer. Avec une vraie recherche en cours, la liste reste : l'utilisateur la parcourt.
  const queryIsEmptyRef = useRef(true);
  queryIsEmptyRef.current = search.query.trim().length < 2;
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (queryIsEmptyRef.current) {
        setSearchFocused(false);
        setResultsOpen(false);
      }
    });
    return () => sub.remove();
  }, []);

  /* ------------------------------------------------------------------ */
  /* SOS : raccourcis depanneuse/mecanicien, partage de position         */
  /* ------------------------------------------------------------------ */

  const runCategoryShortcut = useCallback(
    (dataQ: string, label: string) => {
      setSosOpen(false);
      search.searchCategory(dataQ, label);
      setSearchFocused(false);
      setResultsOpen(true);
    },
    [search],
  );

  /* ------------------------------------------------------------------ */
  /* Bascule Algerie / Tunisie (bouton drapeau, chantier #20 position 9) */
  /* ------------------------------------------------------------------ */

  const [mapCountry, setMapCountry] = useState<CountryView>('DZ');

  /* ------------------------------------------------------------------ */
  /* Boussole : remise du nord en haut                                   */
  /* ------------------------------------------------------------------ */

  /** Orientation courante de la carte, en degres. La carte se tourne a deux doigts
   * (`touchRotate`), et il n'existait aucun moyen de revenir au nord — une carte restee de
   * travers est desorientante, et l'utilisateur ne sait pas forcement ce qu'il a fait. */
  const [mapBearing, setMapBearing] = useState(0);

  const onRegionDidChange = useCallback(
    (event: { nativeEvent: { bearing?: number } }) => {
      // Pendant la navigation, la camera est posee trente fois par seconde par
      // useSmoothCamera : chacun de ces deplacements declenche cet evenement. Y repondre par
      // un changement d'etat re-rendrait tout l'ecran trente fois par seconde et annulerait
      // exactement le travail de fluidite. La boussole n'est de toute facon pas affichee alors.
      if (navigating) return;
      const bearing = event.nativeEvent.bearing ?? 0;
      // On ne re-rend que si l'orientation a REELLEMENT change : une carte immobile emet
      // encore des evenements (fin d'inertie, ajustements du moteur natif).
      setMapBearing((previous) => (Math.abs(previous - bearing) < 0.5 ? previous : bearing));
    },
    [navigating],
  );

  const resetNorth = useCallback(() => {
    cameraRef.current?.setStop({ bearing: 0, pitch: 0, duration: 350 });
    setMapBearing(0);
  }, []);

  /** Au-dela, la carte est visiblement de travers. En dessous, afficher la boussole serait
   * du bruit : une rotation d'un degre ne se voit pas. */
  const mapRotated = Math.abs(((mapBearing + 540) % 360) - 180) > 2;

  const toggleCountryView = useCallback(() => {
    // Algerie -> Tunisie -> France -> Algerie.
    let next: CountryView = mapCountry === 'DZ' ? 'TN' : mapCountry === 'TN' ? 'FR' : 'DZ';
    // Tunisie non debloquee : le premier appui presente le panneau de paiement ; le suivant
    // passe a la France. Sans cette seconde etape, un client qui ne paie pas resterait bloque
    // sur l'Algerie, sans jamais pouvoir atteindre la France.
    if (next === 'TN' && !tunisia.unlocked) {
      if (!tnPromptedRef.current) {
        tnPromptedRef.current = true;
        setTnSheetOpen(true);
        return;
      }
      next = 'FR';
    }
    if (next === 'DZ') tnPromptedRef.current = false;
    const view = COUNTRY_VIEWS[next];
    setMapCountry(next);
    // Vue d'ensemble du pays vise : la Tunisie est desormais routable au meme titre que
    // l'Algerie (graphe Valhalla reconstruit avec les deux jeux de donnees).
    cameraRef.current?.flyTo({ center: view.center, zoom: view.zoom, duration: 1200 });
  }, [mapCountry, tunisia.unlocked]);

  const sharePosition = useCallback(() => {
    setSosOpen(false);
    if (!position) {
      setToast(t('sos.positionUnavailable'));
      return;
    }
    const lat = position.lat.toFixed(5);
    const lon = position.lon.toFixed(5);
    const label = t('sos.shareTitle');
    const url = `https://win-app.dz/?lat=${lat}&lon=${lon}&nom=${encodeURIComponent(label)}`;
    void Share.share({ message: `${label} — ${t('sos.shareIntro')} ${url}`, url });
  }, [position, t]);

  /* ------------------------------------------------------------------ */
  /* Dictee vocale de la barre de recherche (micBtn en v83)              */
  /* ------------------------------------------------------------------ */

  const voice = useVoiceSearch({
    lang,
    /* LA LISTE SE CONSTRUIT PENDANT QU'ON PARLE, ELLE N'ATTEND PAS LA FIN DE LA PHRASE.
     *
     * La recherche partait deja sur chaque bout de phrase entendu — mais le panneau de
     * resultats, lui, ne s'ouvrait qu'au relachement du micro. L'utilisateur parlait donc
     * devant un ecran vide, puis attendait encore une fois sa phrase terminee, alors que la
     * reponse etait souvent deja arrivee. Il voit desormais la liste se remplir a mesure, et
     * au moment ou il relache, elle est la. C'est la latence RESSENTIE que demande le client,
     * et c'est la seule qu'il puisse constater. */
    onPartial: (text) => {
      search.setQuery(text);
      setResultsOpen(true);
    },
    onFinal: (text) => {
      search.setQuery(text);
      setSearchFocused(false);
      setResultsOpen(true);
    },
    onUnavailable: () => setToast(t('map.micUnavailable')),
  });

  /* ------------------------------------------------------------------ */
  /* Assistant vocal a commandes (assistBtn en v83)                      */
  /* ------------------------------------------------------------------ */

  /** Reponse a « combien de temps reste-t-il ? ». Elle part de `nav.remaining`, c'est-a-dire
   * de ce que le conducteur LIT deja dans le cadre du bas : jamais un second calcul, qui
   * pourrait diverger de l'affichage (meme regle qu'en v83). */
  const assistantEta = useCallback(() => {
    if (!navigating || !nav.remaining) return t('assistant.noNavigation');
    const arrival = new Date(Date.now() + nav.remaining.durationS * 1000);
    return t('assistant.etaAnswer', {
      duration: durationInWords(nav.remaining.durationS, lang),
      clock: formatClock24(arrival),
    });
  }, [navigating, nav.remaining, t, lang]);

  const assistant = useAssistant({
    lang,
    onCategory: (categoryKey, label) => {
      search.searchCategory(categoryKey, label);
      setSearchFocused(false);
      setResultsOpen(true);
    },
    onSearchText: (text) => {
      search.setQuery(text);
      setSearchFocused(false);
      setResultsOpen(true);
    },
    onStopNavigation: stopNavigation,
    onLocate: () => void recenter(),
    etaAnswer: assistantEta,
    onUnavailable: () => setToast(t('map.micUnavailable')),
  });

  /** Choix d'un resultat SANS quitter le guidage : la destination change, l'itineraire est
   * recalcule depuis la position actuelle, et le trajet reprend. C'est le detour de v83
   * (showDetourSheet) : couper la navigation pour chercher une station-service, puis tout
   * relancer a la main, etait le geste le plus penible de l'application. */
  const takeDetour = useCallback(
    (raw: GeocodedResult) => {
      setNavDestination({ lat: raw.lat, lon: raw.lon, emoji: emojiForPlace(raw) });
      // Pas d'itineraire pre-calcule : la session en demande un nouveau depuis l'endroit
      // exact ou l'on se trouve.
      setNavInitialRoute(null);
      setResultsOpen(false);
      setNavSearchOpen(false);
      search.setQuery('');
      Keyboard.dismiss();
      places.addToHistory({ name: raw.name, addr: raw.displayName, lat: raw.lat, lon: raw.lon });
    },
    [search, places],
  );

  /* ------------------------------------------------------------------ */

  /* Limite reglementaire du troncon en cours, lue sous le vehicule. En suivi, le vehicule est
   * au point focal de la camera ; carte deplacee a la main, on lit sous le centre de l'ecran. */
  const speedLimit = useSpeedLimit({
    active: navigating,
    mapRef,
    here: position,
    vehiclePoint: useCallback(
      (): [number, number] =>
        followMode
          ? [(mapW + navPadding.left) / 2, (mapH + navPadding.top) / 2]
          : [mapW / 2, mapH / 2],
      [followMode, mapW, mapH, navPadding.left, navPadding.top],
    ),
  });

  /* `routeAnchorId` : couche sous laquelle l'itineraire se glisse, pour que les panneaux et les
   * numeros de route (A1, RN5, nom de wilaya) restent lisibles PAR-DESSUS le trace — point 3 du
   * client, « critique sur autoroutes algeriennes ». Voir useMapStyle : elle est trouvee en
   * lisant le style, les deux fonds d'OpenFreeMap n'ayant pas les memes noms de couches. */
  const { mapStyle, routeAnchorId } = useMapStyle(scheme === 'dark' ? MAP_STYLES.night : MAP_STYLES.day);

  /* Colonne des dix boutons. Elle etait ecrite dans la branche « accueil » du rendu, donc
   * absente pendant le guidage — le client a constate qu'il ne restait que le bouton du son.
   * Elle est desormais rendue dans les deux etats, et elle retrecit pendant le trajet pour
   * laisser la place au bandeau de consigne et au cadre du bas (comme ajusterColonneFab en v86). */
  // Ordre EXACT donne par le client (chantier #20), repris de la colonne de v83, de haut en
  // bas : assistant vocal, SOS, partager, mode nuit, signalement, voix du guidage, ma
  // position, profil, drapeau, Qibla.
  const fabColumn = (
      <View
        style={[
          styles.column,
          navigating
            ? { bottom: navColumnBottom, gap: navFabGap }
            : { bottom: insets.bottom + spacing.xl, gap: baseFabGap },
        ]}
      >
        {isLoading ? <ActivityIndicator color={colors.accent} /> : null}

        {/* Assistant vocal : « pharmacie de garde », « combien de temps pour arriver »,
            « emmene-moi a Blida ». Distinct du micro de la barre de recherche, qui ne fait
            que dicter du texte — ici l'application comprend et agit. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.title')}
          onPress={() => void assistant.start()}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            {
              backgroundColor: assistant.listening ? colors.accent : colors.surface,
              borderColor: colors.goldDeep,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.fabGlyph, { fontSize: 20 }]}>🎙️</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sos.title')}
          onPress={() => setSosOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            { backgroundColor: colors.danger, borderColor: colors.danger, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.sosGlyph}>SOS</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.share')}
          onPress={sharePosition}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            { backgroundColor: colors.surface, borderColor: colors.goldDeep, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.fabGlyph, { color: colors.accent, fontSize: 20 }]}>🔗</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.nightMode')}
          onPress={toggleNightMode}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            { backgroundColor: colors.surface, borderColor: colors.goldDeep, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          {/* Lune sur fond clair, soleil sur fond sombre — c'est-a-dire le pictogramme de ce
              vers quoi on bascule, exactement comme `iconMoon`/`iconSun` en v83. */}
          <Text style={[styles.fabGlyph, { color: colors.accent, fontSize: 20 }]}>{/* L'icone montre le mode ACTUEL — soleil le jour, lune la nuit — et non celui vers
              lequel on bascule : l'inverse etait lu comme une erreur. */}
          {scheme === 'dark' ? '🌙' : '☀️'}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('report.add')}
          onPress={openReportMenu}
          style={({ pressed }) => [
            styles.fab,
            styles.fabPrimary,
            { width: fabPrimarySize, height: fabPrimarySize, borderRadius: fabPrimarySize / 2 },
            // Rouge, comme `#alertBtn` en v83 (background:#c8102e) : c'est le seul bouton
            // d'alerte de la colonne, il ne doit pas se confondre avec le vert de l'interface.
            { backgroundColor: colors.danger, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.fabGlyph, { color: '#fff' }]}>⚠</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.voiceGuidance')}
          accessibilityHint={t('voice.title')}
          onPress={toggleVoiceGuidance}
          onLongPress={() => setVoicePanelOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            { backgroundColor: colors.surface, borderColor: colors.goldDeep, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.fabGlyph, { color: colors.accent, fontSize: 20 }]}>{voiceGuidanceEnabled ? '🔊' : '🔇'}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.locateMe')}
          onPress={() => void recenter()}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            {
              backgroundColor: colors.surface,
              borderColor: colors.goldDeep,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <LocateIcon size={22} color={colors.accent} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.title')}
          onPress={() => setProfileOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            { backgroundColor: colors.surface, borderColor: colors.goldDeep, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.fabGlyph, { fontSize: 18 }]}>👤</Text>
        </Pressable>

        {/* Le drapeau montre le pays AFFICHE a l'ecran, comme le bouton jour/nuit montre le mode
            actuel. Il montrait le pays suivant : sur la carte de Tunisie on voyait 🇫🇷, ce qui
            se lisait comme une erreur. Un appui passe au pays suivant : Algerie -> Tunisie ->
            France -> Algerie. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mapCountry === 'DZ' ? t('map.viewTunisia') : mapCountry === 'TN' ? t('map.viewFrance') : t('map.viewAlgeria')}
          onPress={toggleCountryView}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            { backgroundColor: colors.surface, borderColor: colors.goldDeep, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.fabGlyph, { fontSize: 20 }]}>{mapCountry === 'DZ' ? '🇩🇿' : mapCountry === 'TN' ? '🇹🇳' : '🇫🇷'}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('qibla.title')}
          onPress={() => setQiblaOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { width: fabSize, height: fabSize, borderRadius: fabSize / 2 },
            { backgroundColor: colors.surface, borderColor: colors.goldDeep, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          {/* Libelle texte « Qibla », comme `.qibla-lbl` en v83 — pas d'emoji Kaaba : le site
              affiche le mot, et les deux doivent coincider. */}
          <Text style={[styles.qiblaLabel, { color: colors.accentDark }]}>Qibla</Text>
        </Pressable>
      </View>
  );


  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setMapSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      <Map
        // La reference sert a lire le type de route sous le vehicule (voir useSpeedLimit) :
        // les tuiles sont deja a l'ecran, cette lecture ne coute aucune requete reseau.
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        logo={false}
        attribution
        attributionPosition={{ bottom: 8, right: 8 }}
        touchRotate
        touchPitch
        // Toucher la carte en dehors de la recherche la referme, comme sur les cartes courantes :
        // les recents restaient sinon a l'ecran et cachaient la carte.
        onPress={closeSearchPanel}
        onLongPress={onMapLongPress}
        onRegionWillChange={onRegionWillChange}
        onRegionDidChange={onRegionDidChange}
      >
        {/* Camera VOLONTAIREMENT sans `trackUserLocation` ni propriete de suivi : en
            navigation elle est pilotee image par image par useSmoothCamera, a partir d'une
            position deja lissee et prolongee entre deux mesures GPS. Le mode natif "course"
            suivait, lui, les mesures brutes — une par seconde — d'ou une carte qui avancait
            par bonds et une rotation qui tressautait des que le cap GPS bruitait. Les deux
            ne peuvent pas coexister : l'animation native et la notre se disputeraient la
            camera a chaque image. */}
        <Camera ref={cameraRef} initialViewState={INITIAL_VIEW_STATE} />

        <Images images={MAP_IMAGES} />

        {/* La cle force un remontage quand l'ancrage change — c'est-a-dire une seule fois, au
            moment ou le style corrige arrive. Sans elle, les couches d'itineraire resteraient
            posees la ou elles ont ete creees : au-dessus des panneaux, qu'on vient justement
            de degager. */}
        {/* `lineMetrics` : la carte mesure la position de chaque pixel LE LONG de la ligne,
            ce qui est la condition pour y peindre un degrade. Il n'est demande que pendant le
            guidage — c'est un calcul de plus a l'arrivee du trace, inutile sur un apercu.
            La cle porte donc aussi ce mode : passer de l'apercu au guidage refait les couches
            proprement plutot que de changer leur nature en place. */}
        <GeoJSONSource
          key={`${routeAnchorId ?? 'dessus'}-${navigating ? 'guidage' : 'apercu'}`}
          id="route"
          data={routeLinesGeoJson}
          lineMetrics={navigating}
        >
          {/* Couleurs choisies ici une fois pour les quatre couches ci-dessous. */}
          {/* Alternative(s) estompee(s) sous le trace choisi — memes codes que l'apercu Google Maps.
              Traits epaissis (doc 110 #2) : trop fins auparavant, surtout dezoome sur un long trajet. */}
          <Layer
            id="route-alt"
            type="line"
            source="route"
            beforeId={routeAnchorId}
            filter={['==', ['get', 'kind'], 'alt']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': routeColors.alt,
              'line-width': ROUTE_WIDTH([1, 1.8, 4, 6, 8.5]),
              'line-opacity': 0.55,
            }}
          />
          {/* Liseré clair sous TOUT l'itineraire (parcouru comme restant). Sans lui, le trace
              vert se confond avec les routes du fond des qu'elles sont orange ou beiges — ce
              qui est le cas de toutes les nationales algeriennes dans ce style. C'est la
              technique cartographique habituelle, et la raison pour laquelle un itineraire
              reste lisible sur n'importe quel fond. */}
          <Layer
            id="route-halo"
            type="line"
            source="route"
            beforeId={routeAnchorId}
            filter={['!=', ['get', 'kind'], 'alt']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={
              navigating
                ? {
                    'line-gradient': degradeDeProgression(
                      rgba(routeColors.halo, 0.1),
                      rgba(routeColors.halo, 0.7),
                      rgba(routeColors.halo, 0.95),
                      avanceFraction,
                      traineFraction,
                    ),
                    'line-width': ROUTE_WIDTH([3.5, 5.5, 11, 15, 20]),
                  }
                : {
                    'line-color': routeColors.halo,
                    'line-width': ROUTE_WIDTH([3.5, 5.5, 11, 15, 20]),
                    'line-opacity': 0.95,
                  }
            }
          />
          {/* Bordure sombre demandee par le client (point 2) : quatre points de plus que le
              trace, dans une teinte plus foncee. C'est elle qui donne l'arete nette des cartes
              de navigation courantes — le trace cesse d'etre un ruban pose sur la carte pour
              devenir un objet avec un bord. */}
          <Layer
            id="route-casing"
            type="line"
            source="route"
            beforeId={routeAnchorId}
            filter={['!=', ['get', 'kind'], 'alt']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={
              navigating
                ? {
                    'line-gradient': degradeDeProgression(
                      rgba(routeColors.casing, 0.08),
                      rgba(routeColors.casing, 0.5),
                      routeColors.casing,
                      avanceFraction,
                      traineFraction,
                    ),
                    'line-width': ROUTE_WIDTH([2.5, 4, 8.5, 12, 16.5]),
                  }
                : {
                    'line-color': routeColors.casing,
                    'line-width': ROUTE_WIDTH([2.5, 4, 8.5, 12, 16.5]),
                  }
            }
          />
          {/* LA TRAINE DE COMETE (point 13 du client).
              Devant le vehicule, le vert vif de la route a parcourir ; derriere, le gris de
              v83 qui s'affaiblit puis s'efface sur quatre cents metres. Ce n'est plus une
              seconde ligne posee par-dessus mais la MEME ligne, teintee selon l'avancement :
              il n'y a donc ni raccord ni bourrelet a l'endroit du vehicule. */}
          <Layer
            id="route-primary"
            type="line"
            source="route"
            beforeId={routeAnchorId}
            filter={['==', ['get', 'kind'], 'primary']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={
              navigating
                ? {
                    'line-gradient': degradeDeProgression(
                      rgba(GRIS_PARCOURU, 0.12),
                      rgba(GRIS_PARCOURU, 0.92),
                      routeColors.main,
                      avanceFraction,
                      traineFraction,
                    ),
                    'line-width': ROUTE_WIDTH([1.5, 2.5, 6, 9, 13]),
                  }
                : { 'line-color': routeColors.main, 'line-width': ROUTE_WIDTH([1.5, 2.5, 6, 9, 13]) }
            }
          />
        </GeoJSONSource>

        {/* Duree et distance de chaque trace, en pastilles horizontales a mi-parcours.
            Deux reglages portent la lisibilite : un texte toujours droit, et un halo clair
            large qui detache les chiffres du fond de carte comme le ferait une etiquette.
            `maxzoom` les reserve a la vue d'ensemble : en navigation, au zoom 17, elles
            n'apporteraient rien et masqueraient la route — le client les demande justement
            pour le moment ou l'on prend du recul. */}
        <GeoJSONSource id="route-labels" data={routeLabelsGeoJson}>
          <Layer
            id="route-label"
            type="symbol"
            source="route-labels"
            maxzoom={14.5}
            layout={{
              'text-field': ['get', 'label'],
              // SANS CETTE LIGNE, AUCUNE ETIQUETTE N'APPARAIT. Faute de police precisee,
              // MapLibre demande « Open Sans Regular » au serveur de tuiles, qui ne la sert
              // pas (404 verifie sur tiles.openfreemap.org) : la couche entiere reste vide,
              // en silence. Le style de fond n'utilise que les trois variantes de Noto Sans.
              'text-font': ['Noto Sans Bold'],
              'text-size': 13,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
              'text-padding': 4,
            }}
            paint={{
              'text-color': colors.accentDark,
              'text-halo-color': colors.surface,
              'text-halo-width': 2.6,
              'text-halo-blur': 0.2,
            }}
          />
        </GeoJSONSource>

        {/* Fond de carte : les lieux WIN alentour. Places AVANT les signalements et la
            destination, donc dessous — un radar ou une alerte ne doit jamais passer derriere
            le pictogramme d'une boulangerie. Le nom n'apparait qu'en zoom rapproche, sinon la
            carte devient illisible. */}
        <GeoJSONSource
          id="poi"
          data={poiGeoJson}
          onPress={onPoiPress}
          hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          {/* Lieux VIP : halo dore et visibles des le zoom 11, bien avant les autres lieux —
              c'est la contrepartie du service VIP. */}
          <Layer
            id="poi-vip-halo"
            type="circle"
            source="poi"
            minzoom={11}
            filter={['==', ['get', 'partner'], true]}
            paint={{
              'circle-radius': 14,
              'circle-color': colors.gold,
              'circle-opacity': 0.35,
              'circle-stroke-width': 2,
              'circle-stroke-color': colors.goldDeep,
            }}
          />
          <Layer
            id="poi-vip-icon"
            type="symbol"
            source="poi"
            minzoom={11}
            filter={['==', ['get', 'partner'], true]}
            layout={{
              'text-field': ['get', 'emoji'],
              'text-size': 16,
              'text-allow-overlap': true,
            }}
          />
          <Layer
            id="poi-icon"
            type="symbol"
            source="poi"
            minzoom={13}
            filter={['!=', ['get', 'partner'], true]}
            layout={{
              'text-field': ['get', 'emoji'],
              'text-size': 15,
              'text-allow-overlap': false,
            }}
          />
          <Layer
            id="poi-label"
            type="symbol"
            source="poi"
            minzoom={15.5}
            layout={{
              'text-field': ['get', 'name'],
              // Meme raison que pour l'etiquette de duree : sans police declaree, le nom du
              // lieu n'est jamais dessine, la police par defaut de MapLibre etant absente du
              // serveur de tuiles.
              'text-font': ['Noto Sans Regular'],
              'text-size': 10.5,
              'text-offset': [0, 1.1],
              'text-anchor': 'top',
              'text-max-width': 8,
            }}
            paint={{
              'text-color': colors.text,
              'text-halo-color': colors.surface,
              'text-halo-width': 1.6,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource
          id="reports"
          data={reportsGeoJson}
          onPress={onReportsPress}
          hitbox={{ top: 16, right: 16, bottom: 16, left: 16 }}
        >
          {/* Halo large : visible du coin de l'oeil, sans masquer la route. */}
          <Layer
            id="reports-halo"
            type="circle"
            source="reports"
            paint={{
              'circle-radius': 16,
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.18,
            }}
          />
          <Layer
            id="reports-dot"
            type="circle"
            source="reports"
            paint={{
              'circle-radius': 7,
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 2,
              'circle-stroke-color': colors.surface,
            }}
          />
          {/* Pictogramme au-dessus du point : chaque type de signalement (radar compris) reste
              identifiable au premier coup d'oeil, pas seulement par sa couleur. */}
          <Layer
            id="reports-icon"
            type="symbol"
            source="reports"
            layout={{
              'text-field': ['get', 'emoji'],
              'text-size': 13,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
              'text-offset': [0, -1.6],
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="destination" data={destinationGeoJson}>
          <Layer
            id="destination-halo"
            type="circle"
            source="destination"
            paint={{ 'circle-radius': 18, 'circle-color': colors.accent, 'circle-opacity': 0.2 }}
          />
          {/* Badge colore : le pictogramme de categorie (voir map/placeIcons.ts) remplace le
              point plein, pour reconnaitre le type de lieu d'un coup d'oeil sur la carte. */}
          {/* L'epingle, posee par sa POINTE sur la destination (`icon-anchor: bottom`) : c'est
              le point qui compte, pas le centre du dessin. Elle remplace la pastille et son
              emoji — ce dernier n'etait jamais dessine, faute d'emoji dans la police du
              serveur de tuiles, et il ne restait qu'un rond vert sans signification. */}
          <Layer
            id="destination-pin"
            type="symbol"
            source="destination"
            layout={{
              'icon-image': 'destination-pin',
              'icon-anchor': 'bottom',
              'icon-size': 1,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        </GeoJSONSource>
        {/* Le point « Vous etes ici » — celui du site, dessine par la carte elle-meme (voir
            MeMarker). Place EN DERNIER : les calques s'empilent dans l'ordre, et le point doit
            passer au-dessus du trace, des lieux et des signalements.
            En navigation suivie il cede la place au marqueur fixe dessine hors carte, au point
            focal de la camera : sinon on aurait deux marqueurs, dont un decale de la route.
            L'etiquette disparait des le demarrage du guidage, comme en v83. */}
        {position && !navigating ? (
          <MeMarker lat={position.lat} lon={position.lon} labelLang={lang} />
        ) : null}
        {/* Guidage en cours, mais camera laissee de cote : la fleche revient sur la carte, a la
            position reelle et tournee dans le sens du deplacement. C'est le cas de la deviation,
            ou l'on deplace la carte du doigt pour designer un point — voir NavMarker. */}
        {position && navigating && !followMode ? (
          <NavMarker
            lat={position.lat}
            lon={position.lon}
            heading={capVehicule}
            night={scheme === 'dark'}
          />
        ) : null}
      </Map>

      {/* Sous la barre de recherche (HIT_SIZE de haut), jamais par-dessus — elle la cachait
          entierement auparavant, meme hauteur de depart que les deux. */}
      <SeasonalBanner
        top={insets.top + HEADER_HEIGHT + (topBlockH || HIT_SIZE) + spacing.lg}
        // Degage la colonne de boutons : sa marge droite + son bouton le plus large + un ecart.
        right={spacing.lg + fabPrimarySize + spacing.md}
        // Le bandeau ne concerne que les regions forestieres (Kabylie, Jijel, Chlef...) :
        // l'afficher a Ouargla ou a Tamanrasset apprend seulement a l'ignorer.
        position={position}
        colors={colors}
      />

      {/* Boussole : n'apparait QUE lorsque la carte est tournee, et la remet au nord. Cote
          gauche, pour ne pas s'ajouter a la colonne de droite qui est deja pleine. */}
      {!navigating && mapRotated ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.resetNorth')}
          onPress={resetNorth}
          style={({ pressed }) => [
            styles.compassBtn,
            {
              top: insets.top + HEADER_HEIGHT + HIT_SIZE + spacing.xxl * 2,
              backgroundColor: colors.surface,
              borderColor: colors.goldDeep,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {/* L'aiguille suit l'orientation de la carte, comme sur les cartes courantes :
              elle montre ou est le nord, pas une direction fixe. */}
          <Text style={[styles.compassGlyph, { transform: [{ rotate: `${-mapBearing}deg` }] }]}>🧭</Text>
        </Pressable>
      ) : null}

      {/* Cadre du bas, cote gauche : les boutons + et - de la carte, absents de la version
          Android alors que le site les affiche. Masques pendant le guidage, ou le bandeau de
          consignes et la barre du bas occupent deja l'ecran. */}
      {!navigating ? (
        <View style={[styles.zoomBox, { bottom: insets.bottom + spacing.xxl, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomIn')}
            onPress={() => zoomBy(1)}
            style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.zoomGlyph, { color: colors.text }]}>+</Text>
          </Pressable>
          <View style={[styles.zoomDivider, { backgroundColor: colors.border }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomOut')}
            onPress={() => zoomBy(-1)}
            style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.zoomGlyph, { color: colors.text }]}>−</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Marqueur du vehicule, FIXE a l'ecran : c'est la carte qui bouge dessous, et la
          camera vise le point de la route. Sa position reproduit le point focal de MapLibre
          avec une marge haute P : le centre de la zone restante, soit (hauteur + P) / 2. */}
      {navigating && followMode ? (
        <View
          pointerEvents="none"
          style={[
            styles.navPuck,
            {
              left: (mapW + navPadding.left) / 2 - NAV_PUCK_SIZE / 2,
              top: (mapH + navPadding.top) / 2 - NAV_PUCK_SIZE / 2,
            },
          ]}
        >
          {/* Meme couleur que l'itineraire : vert WIN de jour, turquoise de nuit. */}
          <NavArrow size={NAV_PUCK_SIZE} color={routeColors.main} />
        </View>
      ) : null}

      {navigating ? (
        <>
        <NavigationOverlay
          active={navigating}
          nextManeuver={nav.nextManeuver}
          followingManeuver={nav.followingManeuver}
          distanceToNextManeuverM={nav.distanceToNextManeuverM}
          subscribeFix={subscribeFix}
          remaining={nav.remaining}
          recalculating={nav.recalculating}
          lang={lang}
          onEnd={stopNavigation}
          onShowSteps={() => setStepsOpen(true)}
          onOverview={showRouteOverview}
          onRecenter={resumeFollow}
          // La fleche quitte le guidage et ramene a l'ecran de depart, comme « Fin » : elle
          // ouvrait jusqu'ici la fiche du lieu, qui est fermee pendant le guidage — donc rien
          // ne se passait a l'ecran, ce que le client a signale.
          onBack={exitNavigationToHome}
          onLayoutBounds={onNavLayoutBounds}
          limitKmh={speedLimit}
          onSearch={() => setNavSearchMenuOpen(true)}
          following={followMode}
          colors={colors}
          topInset={insets.top}
          bottomInset={insets.bottom}
          landscape={landscape}
          cardWidth={navCardWidth}
          leftInset={insets.left}
          rightInset={insets.right}
        />
        {/* Le compteur de vitesse et la limite reglementaire sont desormais dessines par
            NavigationOverlay, en haut a gauche : ils l'etaient ici ET la-bas, d'ou la pastille
            en double signalee par le client. */}

        {/* Detour : la recherche reste accessible en cours de route (via l'assistant vocal ou
            la liste ci-dessous). Choisir un resultat ne coupe pas le guidage — il change de
            destination et recalcule depuis l'endroit exact ou l'on se trouve. La liste se pose
            SOUS le bandeau d'instruction, qui ne doit jamais etre masque. */}
        {/* « Ou voulez-vous aller ? » (point 16) : grille de douze rubriques et champ de
            recherche, comme sur le site. Choisir un lieu declenche un detour sans couper le
            guidage. */}
        {/* La loupe ouvre ce menu, et non plus la recherche directement : au volant, un appui
            malheureux masquait l'instruction en cours derriere un panneau plein ecran. */}
        <DetourSheet
          visible={detourPoint !== null}
          point={detourPoint}
          lang={lang}
          onCancel={() => setDetourPoint(null)}
          onConfirm={confirmDetour}
          colors={colors}
        />

        <NavSearchMenu
          visible={navSearchMenuOpen}
          onContinue={() => setNavSearchMenuOpen(false)}
          onNewRoute={() => {
            setNavSearchMenuOpen(false);
            search.setQuery('');
            setResultsOpen(true);
            setNavSearchOpen(true);
          }}
          onResumeOriginal={
            originalDestination
              ? () => {
                  setNavSearchMenuOpen(false);
                  resumeOriginalRoute();
                }
              : undefined
          }
          colors={colors}
        />

        <NavDestinationPicker
          visible={navSearchOpen}
          onClose={() => {
            setNavSearchOpen(false);
            setResultsOpen(false);
            search.setQuery('');
            Keyboard.dismiss();
          }}
          query={search.query}
          onChangeQuery={(text) => {
            search.setQuery(text);
            setResultsOpen(true);
          }}
          onCategory={(dataQ, label) => {
            search.searchCategory(dataQ, label);
            setResultsOpen(true);
          }}
          loading={search.loading}
          partners={search.partners}
          results={search.results}
          onSelectResult={takeDetour}
          colors={colors}
        />

        {/* En ligne, sous le bandeau : seulement les resultats demandes a l'ASSISTANT VOCAL en
            cours de route. La recherche tapee passe par le panneau « Ou voulez-vous aller ? »
            ci-dessous. */}
        {!navSearchOpen && resultsVisible ? (
          <View
            style={[
              styles.navResults,
              landscape
                ? { top: insets.top + spacing.sm, left: navCardWidth + insets.left + spacing.lg, right: insets.right + 70 }
                : { top: insets.top + 150 },
            ]}
          >
            <Pressable
              onPress={() => {
                setResultsOpen(false);
                setNavSearchOpen(false);
                Keyboard.dismiss();
                search.setQuery('');
              }}
              accessibilityLabel={t('assistant.close')}
              style={[styles.navResultsClose, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12.5 }}>✕</Text>
            </Pressable>
            <SearchResults
              visible
              loading={search.loading}
              showBookmarks={false}
              partners={search.partners}
              results={search.results}
              favorites={places.favorites}
              history={places.history}
              onSelectResult={takeDetour}
              onSelectBookmark={(b) =>
                takeDetour({ name: b.name, displayName: b.addr, lat: b.lat, lon: b.lon, source: 'nominatim' })
              }
              onRemoveHistory={places.removeFromHistory}
              onClearHistory={places.clearHistory}
              colors={colors}
            />
          </View>
        ) : null}
        </>
      ) : (
        <>
      <Header colors={colors} top={insets.top} />

      {/* Barre de recherche + resultats, en haut */}
      <View
        style={[styles.top, { top: insets.top + HEADER_HEIGHT }]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setTopBlockH((prev) => (prev === h ? prev : h));
        }}
      >
        <SearchBar
          value={search.query}
          onChangeText={(text) => {
            search.setQuery(text);
            setResultsOpen(true);
          }}
          onFocus={() => {
            setSearchFocused(true);
            setResultsOpen(true);
          }}
          onClear={() => {
            search.setQuery('');
            setSearchFocused(true);
            setResultsOpen(true);
          }}
          placeholder={voice.listening ? t('map.listening') : t('map.searchPlaceholder')}
          colors={colors}
          listening={voice.listening}
          onMicPressIn={() => void voice.start()}
          onMicPressOut={voice.stop}
        />
        <SearchResults
          visible={resultsVisible}
          loading={search.loading}
          showBookmarks={showBookmarks}
          partners={search.partners}
          results={search.results}
          favorites={places.favorites}
          history={places.history}
          onSelectResult={openPlace}
          onSelectBookmark={openBookmark}
          onRemoveHistory={places.removeFromHistory}
          onClearHistory={places.clearHistory}
          colors={colors}
        />
        {!resultsVisible ? (
          <CategoryChips
            colors={colors}
            onPick={(dataQ, label) => {
              search.searchCategory(dataQ, label);
              setSearchFocused(false);
              setResultsOpen(true);
            }}
          />
        ) : null}
        {!resultsVisible && permissionDenied ? (
          <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.pillText, { color: colors.text }]}>{t('map.locationDenied')}</Text>
          </View>
        ) : !resultsVisible && liveReports.length > 0 ? (
          <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.pillText, { color: colors.text }]}>
              {t('map.reportsNearby', { count: liveReports.length })}
            </Text>
          </View>
        ) : null}
      </View>

        </>
      )}

      {/* La colonne est rendue APRES le ternaire, donc visible a l'accueil comme en trajet :
          c'est une seule vue en position absolue, pas deux. En paysage pendant le guidage,
          elle laisserait moins de place a la carte que de confort gagne — la hauteur ne
          suffit pas pour dix boutons — et le cadre du bas porte alors les commandes. */}
      {navigating && landscape ? null : fabColumn}

      {votingReport ? (
        /* En navigation, le bandeau d'instruction occupe le haut de l'ecran : la carte de vote
           se pose dessous plutot que par-dessus la consigne de conduite. */
        <View
          style={[
            styles.voteCardWrap,
            navigating && landscape
              ? { top: insets.top + spacing.sm, left: navCardWidth + insets.left + spacing.lg, right: insets.right + 70 }
              : { top: insets.top + (navigating ? 150 : spacing.xl * 2) },
          ]}
        >
          <ReportVoteCard
            report={votingReport}
            pending={voteReport.isPending}
            message={voteMessage}
            onConfirm={() => voteReport.mutate({ id: votingReport.id, vote: 'confirm' })}
            onAbsent={() => voteReport.mutate({ id: votingReport.id, vote: 'absent' })}
            onClose={closeVoteCard}
            colors={colors}
          />
        </View>
      ) : null}

      <ReportMenu visible={reportMenuOpen} onClose={() => setReportMenuOpen(false)} onPick={submitReport} colors={colors} />
      <SosPanel
        visible={sosOpen}
        onClose={() => setSosOpen(false)}
        onTowing={() => runCategoryShortcut('car repair', t('categories.items.towing'))}
        onMechanic={() => runCategoryShortcut('car repair workshop', t('categories.items.mechanic'))}
        onSharePosition={sharePosition}
        position={position}
        colors={colors}
      />
      <ProfilePanel
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        colors={colors}
        position={position}
        // Choisir un lieu dans « Mes enregistrements » ouvre sa fiche, d'ou l'on peut le
        // corriger ou le retirer — c'est le chemin que le client demandait.
        onOpenPlace={(p) =>
          // `placeId` est indispensable : c'est lui qui fait reconnaitre la fiche comme
          // etant la notre, et qui ouvre « Modifier » et « Supprimer ».
          openPlace({ name: p.name, displayName: p.name, lat: p.lat, lon: p.lon, source: 'win', placeId: p.id })
        }
      />
      {/* LA CROIX FERME, LE CHEVRON REDUIT.
          Fermer arrete la recitation : un son qui continuerait sans rien a l'ecran pour le
          commander serait impossible a couper. Reduire la laisse jouer et la confie a la barre
          ci-dessous, qui porte alors la pause et la croix. */}
      <QiblaPanel
        visible={qiblaOpen}
        onClose={() => {
          setQiblaOpen(false);
          arreterCoran();
        }}
        onReduce={() => setQiblaOpen(false)}
        position={position}
        colors={colors}
      />

      {/* La Qibla reduite. Elle ne s'affiche que si une recitation tourne ET que le panneau
          est ferme — sinon elle doublerait les commandes deja presentes dedans.
          Pendant le guidage, elle remonte au-dessus du cadre du bas, comme la colonne. */}
      {!qiblaOpen ? (
        <QuranMiniBar
          bottom={
            navigating
              ? navColumnBottom
              : insets.bottom + spacing.xl
          }
          onOuvrir={() => setQiblaOpen(true)}
        />
      ) : null}
      <AddPlaceSheet
        coords={addPlaceCoords}
        onClose={() => setAddPlaceCoords(null)}
        onSaved={onPlaceSaved}
        colors={colors}
        // La precision annoncee par le GPS sert a refuser un releve « ici » pris sur une
        // position du reseau mobile — l'origine du bureau de poste enregistre a 1 364 km.
        userFix={position ? { lat: position.lat, lon: position.lon, accuracyM: currentAccuracyM() } : null}
      />
      <AssistantPanel
        visible={assistant.open}
        listening={assistant.listening}
        status={assistant.status}
        heard={assistant.heard}
        onClose={assistant.close}
        colors={colors}
      />
      <StepsSheet
        visible={stepsOpen && navigating}
        route={nav.route}
        currentIndex={nav.maneuverIndex}
        lang={lang}
        onClose={() => setStepsOpen(false)}
        colors={colors}
      />
      <TripSummary trip={tripSummary} onClose={() => setTripSummary(null)} colors={colors} />
      <VoicePanel
        visible={voicePanelOpen}
        lang={lang}
        onClose={() => setVoicePanelOpen(false)}
        colors={colors}
      />
      <Toast message={toast} onHide={() => setToast(null)} />
      <TunisiaUnlockSheet
        visible={tnSheetOpen}
        onClose={() => setTnSheetOpen(false)}
        info={tunisia.info}
        loading={tunisia.loading}
        onRequest={tunisia.requestUnlock}
        onRefresh={() => void tunisia.refresh()}
        colors={colors}
      />

      {!navigating ? (
        <PlaceSheet
          place={selectedPlace}
          isFavorite={selectedPlace ? places.isFavorite(toBookmark(selectedPlace)) : false}
          onToggleFavorite={() => selectedPlace && places.toggleFavorite(toBookmark(selectedPlace))}
          onClose={closeSheet}
          colors={colors}
          hasUserPosition={!!position}
          routes={previewRoutes}
          routesLoading={preview.isLoading && !navigating}
          // Un trajet EN COURS ne doit jamais afficher « Itineraire indisponible » : le client
          // a vu ce bandeau apparaitre alors qu'il roulait, trace affiche et 563 km restants.
          // C'est l'apercu d'itineraire qui echouait en arriere-plan, pas le trajet.
          routesError={preview.isError && !navigating}
          routeMode={routeMode}
          onRouteModeChange={setRouteMode}
          selectedRouteIndex={selectedRouteIndex}
          onSelectRoute={setSelectedRouteIndex}
          onStartNavigation={startNavigation}
        />
      ) : null}
      <ConsentGate colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
  },
  compassBtn: {
    position: 'absolute',
    left: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  compassGlyph: { fontSize: 21, lineHeight: 25 },
  // Fleche bleue sur pastille blanche, comme sur les cartes de navigation courantes. La
  // camera tourne avec la route : la fleche pointe donc toujours vers le haut.
  // Meme forme que sur le site : deux carres blancs empiles, coins arrondis, fin lisere.
  zoomBox: {
    position: 'absolute',
    left: spacing.lg,
    width: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  zoomBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { height: 1 },
  zoomGlyph: { fontSize: 22, fontWeight: '600' as const, lineHeight: 26 },

  navPuck: {
    position: 'absolute',
    width: NAV_PUCK_SIZE,
    height: NAV_PUCK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  navResults: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
  },
  // La liste de detour se ferme a la main, contrairement aux panneaux qui se referment seuls :
  // ici l'utilisateur est peut-etre en train de comparer deux stations-service, et rien ne doit
  // la lui retirer sous les yeux.
  navResultsClose: {
    alignSelf: 'flex-end',
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  voteCardWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  pill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  pillText: { ...typography.caption, textAlign: 'center' },
  column: {
    position: 'absolute',
    right: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  // Pastilles RONDES et ombre diffuse, comme sur les cartes de navigation courantes. Le
  // filet dore de WIN est conserve mais affine (2,5 -> 1,5) : il signe encore l'application
  // sans lui donner l'air d'une rangee de cadres. Le rayon est pose en ligne, a partir de la
  // taille calculee — un rayon fixe ne resterait rond que sur un seul gabarit d'ecran.
  fab: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabPrimary: { width: 64, height: 64, borderWidth: 0 },
  fabGlyph: { fontSize: 24, lineHeight: 28 },
  sosGlyph: { fontSize: 12, lineHeight: 14, fontWeight: '800' as const, color: '#fff', letterSpacing: 0.5 },
  qiblaLabel: { fontSize: 11, lineHeight: 13, fontWeight: '800' as const, letterSpacing: 0.2 },
});
