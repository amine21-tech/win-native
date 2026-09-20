import {
  Camera,
  GeoJSONSource,
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
import { bearing as geoBearing, countryFromCoords, haversine, NEARBY_RADIUS_M, type Language, type Place, type Report, type ReportKind } from '../src/shared';
import { api, ApiError } from '../src/api/client';
import { AddPlaceSheet } from '../src/components/AddPlaceSheet';
import { AssistantPanel } from '../src/components/AssistantPanel';
import { CategoryChips } from '../src/components/CategoryChips';
import { ConsentGate } from '../src/components/ConsentGate';
import { Header } from '../src/components/Header';
import { NavigationOverlay } from '../src/components/NavigationOverlay';
import { PlaceSheet, type SelectedPlace } from '../src/components/PlaceSheet';
import { ProfilePanel } from '../src/components/ProfilePanel';
import { QiblaPanel } from '../src/components/QiblaPanel';
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
import { NavDestinationPicker } from '../src/components/NavDestinationPicker';
import { MeMarker } from '../src/map/MeMarker';
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
import { locateOnRoute, pointOnRoute, type Route, type RouteMode } from '../src/navigation/routing';
import type { LiveFix } from '../src/navigation/useLiveLocation';
import type { GeocodedResult } from '../src/search/geocode';
import { usePlaceSearch } from '../src/search/usePlaceSearch';
import { useVoiceSearch } from '../src/search/useVoiceSearch';
import { usePlaces, type Bookmark } from '../src/store/places';
import { useSession } from '../src/store/session';
import { HIT_SIZE, palette, radius, spacing, typography } from '../src/theme';

type Position = { lat: number; lon: number };

/** Hauteur visuelle du bandeau de marque (Header), sous l'encoche/la barre de statut. */
const HEADER_HEIGHT = 64;

/** Distance restante en dessous de laquelle on considere le trajet termine. */
const ARRIVAL_RADIUS_M = 50;

/** Ecart au trace sous lequel le vehicule est dessine SUR la route. 25 m absorbent la derive
 * ordinaire d'un GPS de telephone en ville, sans masquer une vraie sortie de route. */
const SNAP_RADIUS_M = 25;
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
    return Math.max(38, Math.min(HIT_SIZE, Math.floor(raw)));
  }, [windowHeight, insets.top, insets.bottom]);

  const [liveReports, setLiveReports] = useState<Report[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  /** Fiche du lieu rouverte pendant le guidage, via « Retour » du cadre du bas. */
  const [destSheetOpen, setDestSheetOpen] = useState(false);
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
  const { position, permissionDenied, subscribe: subscribeFix, getFix } = useLiveLocation(navigating);

  /** Cap au sol : utile pour un radar/barrage (sens de circulation), pas critique — on ne
   * bloque jamais l'envoi d'un signalement en son absence (GPS interieur, telephone pose). */
  const currentHeading = useCallback(() => getFix()?.heading ?? undefined, [getFix]);
  const currentSpeedMps = useCallback(() => getFix()?.speedMps ?? 0, [getFix]);

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
  const [navInitialRoute, setNavInitialRoute] = useState<Route | null>(null);
  // Vue d'ensemble / recentrer (v83: overviewBtn + navRecenterBtn) : vraie tant que la camera
  // suit la position et le cap du conducteur ; fausse des que la vue d'ensemble est ouverte, le
  // temps que "Recentrer" reprenne la main.
  const [followMode, setFollowMode] = useState(true);
  /** Bilan affiche a l'arrivee. */
  const [tripSummary, setTripSummary] = useState<Trip | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  /** Champ de recherche ouvert PENDANT le guidage (bouton loupe de la colonne). */
  const [navSearchOpen, setNavSearchOpen] = useState(false);
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

  const nav = useNavigationSession({
    active: navigating,
    position,
    destination: navDestination,
    mode: routeMode,
    lang,
    initialRoute: navInitialRoute,
    getSpeedMps: currentSpeedMps,
    getHeading: currentHeading,
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
    if (located.distanceM > SNAP_RADIUS_M) return null;
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
      const geometry = nav.route.geometry;

      // Le trace est coupe en deux au point ou l'on se trouve : la portion deja parcourue
      // passe en gris, celle qui reste garde la couleur vive. C'est le repere le plus
      // immediat qu'offre une carte de navigation — on voit d'un coup d'oeil quelle part du
      // trajet est derriere soi, sans lire un chiffre.
      if (nav.progress) {
        const snap = pointOnRoute(nav.route, nav.progress);
        const cut = Math.min(Math.max(nav.progress.segmentIndex, 0), geometry.length - 2);
        const traveled = [...geometry.slice(0, cut + 1), snap];
        const ahead = [snap, ...geometry.slice(cut + 1)];
        const features: GeoJSON.Feature[] = [];
        // La portion parcourue se termine sur le point PROJETE, jamais sur la position GPS
        // brute : sinon une branche part du trace vers le vehicule (v83, updateTraveledPath).
        if (traveled.length >= 2) {
          features.push({
            type: 'Feature',
            properties: { kind: 'traveled' },
            geometry: { type: 'LineString', coordinates: traveled },
          });
        }
        if (ahead.length >= 2) {
          features.push({
            type: 'Feature',
            properties: { kind: 'primary' },
            geometry: { type: 'LineString', coordinates: ahead },
          });
        }
        return { type: 'FeatureCollection', features };
      }

      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'primary' },
            geometry: { type: 'LineString', coordinates: geometry },
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
        const durationLabel = isPrimary
          ? ''
          : deltaMin === 0
            ? t('trip.sameDuration')
            : `${deltaMin > 0 ? '+' : ''}${deltaMin} min`;
        return {
          type: 'Feature',
          properties: { kind: isPrimary ? 'primary' : 'alt', durationLabel },
          geometry: { type: 'LineString', coordinates: r.geometry },
        };
      }),
    };
  }, [navigating, nav.route, nav.progress, previewRoutes, selectedRouteIndex, t]);

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

  useApproachAlerts({
    active: navigating,
    position,
    reports: liveReports,
    lang,
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

  /** Appui long sur la carte : ouvre le formulaire d'ajout de lieu a cet endroit (openAddPoint en v83). */
  const onMapLongPress = useCallback((event: { nativeEvent: { lngLat: [number, number] } }) => {
    const [lon, lat] = event.nativeEvent.lngLat;
    setAddPlaceCoords({ lat, lon });
  }, []);

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
    setNavigating(false);
    setNavDestination(null);
    setNavInitialRoute(null);
    // Fin de trajet : la carte revient a plat, nord en haut. Sans cela elle reste inclinee et
    // tournee dans la derniere direction suivie, ce qui n'a plus aucun sens une fois arrete.
    cameraRef.current?.setStop({ bearing: 0, pitch: 0, duration: 400 });
    setMapBearing(0);
  }, []);

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
    onPartial: (text) => search.setQuery(text),
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

  const mapStyle = useMapStyle(scheme === 'dark' ? MAP_STYLES.night : MAP_STYLES.day);

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
            : { bottom: insets.bottom + spacing.xl },
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
          <Text style={[styles.fabGlyph, { color: colors.accent }]}>◎</Text>
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

        <GeoJSONSource id="route" data={routeLinesGeoJson}>
          {/* Alternative(s) estompee(s) sous le trace choisi — memes codes que l'apercu Google Maps.
              Traits epaissis (doc 110 #2) : trop fins auparavant, surtout dezoome sur un long trajet. */}
          <Layer
            id="route-alt"
            type="line"
            source="route"
            filter={['==', ['get', 'kind'], 'alt']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colors.textMuted, 'line-width': 8, 'line-opacity': 0.55 }}
          />
          {/* Liseré clair sous TOUT l'itineraire (parcouru comme restant). Sans lui, le trace
              vert se confond avec les routes du fond des qu'elles sont orange ou beiges — ce
              qui est le cas de toutes les nationales algeriennes dans ce style. C'est la
              technique cartographique habituelle, et la raison pour laquelle un itineraire
              reste lisible sur n'importe quel fond. */}
          <Layer
            id="route-casing"
            type="line"
            source="route"
            filter={['!=', ['get', 'kind'], 'alt']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colors.surface, 'line-width': 19, 'line-opacity': 0.95 }}
          />
          {/* Portion deja parcourue, en gris — meme teinte que le `#b9c4bf` de v83. Bout coupe
              net (`line-cap: butt`) et non arrondi : arrondi, elle depasserait du point de
              coupure et laisserait un bourrelet gris devant le vehicule. */}
          <Layer
            id="route-traveled"
            type="line"
            source="route"
            filter={['==', ['get', 'kind'], 'traveled']}
            layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
            paint={{ 'line-color': '#B9C4BF', 'line-width': 10, 'line-opacity': 0.9 }}
          />
          <Layer
            id="route-primary"
            type="line"
            source="route"
            filter={['==', ['get', 'kind'], 'primary']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            // Epaisseur relevee de 9 a 13 points : le client trouvait le trace trop fin par
            // rapport a la version web, ou il domine nettement les rues du fond.
            paint={{ 'line-color': colors.accent, 'line-width': 13 }}
          />
          {/* Ecart de duree affiche sur chaque alternatif ("+8 min" / "Meme duree"), pour rester
              identifiable une fois les traces epaissis et rapproches (doc 110 #2). */}
          <Layer
            id="route-alt-label"
            type="symbol"
            source="route"
            filter={['==', ['get', 'kind'], 'alt']}
            layout={{
              'symbol-placement': 'line-center',
              'text-field': ['get', 'durationLabel'],
              'text-size': 12.5,
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': colors.text,
              'text-halo-color': colors.surface,
              'text-halo-width': 2,
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
          <Layer
            id="destination-badge"
            type="circle"
            source="destination"
            paint={{
              'circle-radius': 15,
              'circle-color': colors.accent,
              'circle-stroke-width': 3,
              'circle-stroke-color': colors.surface,
            }}
          />
          <Layer
            id="destination-icon"
            type="symbol"
            source="destination"
            layout={{
              'text-field': ['get', 'emoji'],
              'text-size': 16,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
          />
        </GeoJSONSource>
        {/* Le point « Vous etes ici » — celui du site, dessine par la carte elle-meme (voir
            MeMarker). Place EN DERNIER : les calques s'empilent dans l'ordre, et le point doit
            passer au-dessus du trace, des lieux et des signalements.
            En navigation suivie il cede la place au marqueur fixe dessine hors carte, au point
            focal de la camera : sinon on aurait deux marqueurs, dont un decale de la route.
            L'etiquette disparait des le demarrage du guidage, comme en v83. */}
        {position && !(navigating && followMode) ? (
          <MeMarker lat={position.lat} lon={position.lon} labelLang={navigating ? null : lang} />
        ) : null}
      </Map>

      {/* Sous la barre de recherche (HIT_SIZE de haut), jamais par-dessus — elle la cachait
          entierement auparavant, meme hauteur de depart que les deux. */}
      <SeasonalBanner
        top={insets.top + HEADER_HEIGHT + (topBlockH || HIT_SIZE) + spacing.lg}
        // Degage la colonne de boutons : sa marge droite + son bouton le plus large + un ecart.
        right={spacing.lg + fabPrimarySize + spacing.md}
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
          <NavArrow size={NAV_PUCK_SIZE} />
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
          onBack={() => setDestSheetOpen(true)}
          onLayoutBounds={onNavLayoutBounds}
          limitKmh={speedLimit}
          onSearch={() => {
            search.setQuery('');
            setResultsOpen(true);
            setNavSearchOpen(true);
          }}
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
      <ProfilePanel visible={profileOpen} onClose={() => setProfileOpen(false)} colors={colors} />
      <QiblaPanel visible={qiblaOpen} onClose={() => setQiblaOpen(false)} position={position} colors={colors} />
      <AddPlaceSheet coords={addPlaceCoords} onClose={() => setAddPlaceCoords(null)} onSaved={onPlaceSaved} colors={colors} />
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

      {!navigating || destSheetOpen ? (
        <PlaceSheet
          place={selectedPlace}
          isFavorite={selectedPlace ? places.isFavorite(toBookmark(selectedPlace)) : false}
          onToggleFavorite={() => selectedPlace && places.toggleFavorite(toBookmark(selectedPlace))}
          onClose={() => {
            setDestSheetOpen(false);
            if (!navigating) closeSheet();
          }}
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
