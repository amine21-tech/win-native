import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, uploadPhoto, uploadVideo } from '../api/client';
import { clearSearchCache } from '../search/usePlaceSearch';
import * as Location from 'expo-location';
import { countryFromCoords, formatDistance, haversine, PLACE_CATEGORIES, type PlaceCategory } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

type Coords = { lat: number; lon: number };

type Props = {
  coords: Coords | null;
  onClose: () => void;
  onSaved: () => void;
  colors: Palette;
  /** Position de l'utilisateur et precision annoncee par le GPS, pour l'avertissement
   * ci-dessous. Absente tant qu'aucune mesure n'est arrivee. */
  userFix?: { lat: number; lon: number; accuracyM: number } | null;
};

/* Au-dela de cette precision annoncee, un releve « ici » n'a plus de sens.
 *
 * Le client a enregistre un bureau de poste qui s'est retrouve a 1 364 km : la position
 * capturee venait du reseau mobile, pas du satellite. Un recepteur qui s'avoue a plus de cent
 * metres pres peut se tromper de quartier — et, quand il retombe sur une antenne, de wilaya. */
const GPS_UNSTABLE_ACCURACY_M = 100;

/** En deca de cette distance, on considere que l'utilisateur enregistre SA position, et c'est
 * la seule situation ou la precision du GPS entre en jeu : viser volontairement un point a
 * l'autre bout de la carte reste libre. */
const REGISTERING_HERE_M = 150;

/**
 * Au-dela de cette distance, l'enregistrement est signale comme douteux.
 *
 * C'est la « double verification » demandee par le client, et elle vient d'un cas reel : un
 * contributeur a enregistre la poste de Boulay en se tenant juste devant, et la fiche s'est
 * retrouvee a DIX KILOMETRES — le telephone avait pris une position du reseau mobile, pas du
 * satellite. Personne ne s'en est apercu avant que la recherche ne renvoie l'adresse a l'autre
 * bout de la commune.
 *
 * Le client a eu la bonne idee : rechercher la fiche juste apres l'avoir creee et regarder la
 * distance annoncee. Mais une verification qui repose sur la memoire de l'utilisateur n'est
 * jamais faite — la preuve. L'application la fait donc elle-meme, tout de suite, avec une
 * mesure GPS FRAICHE : elle connait les coordonnees enregistrees et sait ou se trouve le
 * telephone. Trois cents metres laissent passer un releve fait depuis le trottoir d'en face
 * sans laisser passer une erreur de quartier.
 */
const VERIFY_SUSPICIOUS_M = 300;

/**
 * ON N'ENREGISTRE PAS UN LIEU OU L'ON N'EST PAS — point 3 du 24 novembre.
 *
 *   << Un lieu ne peut etre enregistre qu'a <= 15 m de la position GPS reelle. Pas possible en
 *   cliquant sur un point de la carte a distance. Le bouton "Garder tel quel" est SUPPRIME
 *   pour tout utilisateur normal. >>
 *
 * LA CAPTURE QUI L'A DECLENCHE montre << le lieu enregistre se trouve a 33 km de votre position
 * actuelle >> — et, juste en dessous, un bouton vert << Garder tel quel >>. L'application
 * voyait l'erreur, la nommait au metre pres, et proposait quand meme de la garder. Une fiche
 * fausse entrait sur la carte en un appui, et personne ne s'en apercevait plus ensuite.
 *
 * LA VERIFICATION PASSE DONC AVANT L'ENREGISTREMENT, et plus apres. Elle redemande une mesure
 * GPS FRAICHE en haute precision, comme la double verification : reutiliser le releve qui a
 * servi a remplir les coordonnees reviendrait a comparer une erreur avec elle-meme.
 *
 * CE QUI N'EST PAS CASSE. Un GPS muet ne bloque personne : sans mesure, on enregistre comme
 * avant — on ne reproche pas a un contributeur un recepteur qui ne repond pas. Et le refus
 * n'est jamais un cul-de-sac : il porte le bouton qui replace la fiche sur la position reelle,
 * donc un appui suffit pour continuer.
 *
 * LE CODE WIN RESTE AU-DESSUS DE LA REGLE. Une fiche partenaire se saisit au bureau, a partir
 * de coordonnees communiquees par le commercant — c'est pour cela que les deux champs de
 * latitude et longitude existent. Le document le dit lui-meme : << pour tout utilisateur
 * NORMAL >>.
 */
const MAX_DISTANCE_M = 15;

/**
 * TROIS PHOTOS PRISES SUR PLACE, DEUX CHOISIES DANS LE TELEPHONE — document du 24 novembre.
 *
 *   « 3 PHOTOS CAMERA DIRECTE — prises depuis l'appareil photo du telephone, sur place, au
 *   moment de la creation. »  « 2 PHOTOS GALERIE / FICHIER. »
 *
 * DEUX COMPTEURS ET NON UN SEUL DE CINQ, parce que la distinction est tout l'interet de la
 * demande. Une photo prise sur place prouve que le contributeur y etait ; une photo tiree de
 * la galerie peut venir de n'importe ou — c'est pratique pour un logo ou une devanture
 * envoyee par le commercant, et c'est precisement pourquoi elle ne doit pas pouvoir occuper
 * les cinq emplacements. Un seul compteur de cinq autoriserait une fiche entierement
 * illustree d'images trouvees ailleurs.
 *
 * ON PASSE DE TROIS A CINQ : c'est un AJOUT. Les fiches a trois photos restent valables, le
 * serveur en acceptait deja six (`photoIds.max(6)`), et rien de ce qui existe ne retrecit.
 */
const MAX_PHOTOS_CAMERA = 3;
const MAX_PHOTOS_GALERIE = 2;
const MAX_PHOTOS = MAX_PHOTOS_CAMERA + MAX_PHOTOS_GALERIE;

/**
 * TRENTE SECONDES, ET C'EST LE TELEPHONE QUI LES FAIT RESPECTER — document du 24 novembre.
 *
 *   « 1 VIDEO 30 SECONDES MAX — enregistree en direct OU importee depuis la galerie, duree
 *   maximum STRICTE : 30 secondes. »
 *
 * `videoMaxDuration` arrete l'enregistrement tout seul : la camera se coupe a trente secondes,
 * il n'y a rien a refuser ensuite. Mais il ne s'applique qu'a la PRISE DE VUE — une video
 * IMPORTEE depuis la galerie peut durer dix minutes, et le document autorise explicitement
 * l'import. Celle-la est donc mesuree a l'arrivee et refusee si elle depasse, avec sa duree
 * affichee : un refus qui ne dit pas de combien on depasse ne sert a rien.
 *
 * LA DEMI-SECONDE DE TOLERANCE n'est pas de la complaisance. Un encodeur ferme son fichier sur
 * la derniere image complete : trente secondes filmees donnent regulierement 30,04 s de
 * conteneur. Refuser cela ferait echouer une video que la camera de l'application vient
 * elle-meme de produire.
 */
const VIDEO_MAX_S = 30;
const VIDEO_TOLERANCE_S = 0.5;

type PhotoChoisie = { uri: string; source: 'camera' | 'galerie' };

/**
 * Ajoute une photo SANS faire deborder sa propre colonne, et sans toucher a l'autre.
 *
 * Hors du composant parce qu'elle ne depend que de ses arguments : elle se lit seule, et le
 * verificateur peut la rejouer sans monter un ecran React. Le `slice` d'origine, lui, etait
 * ecrit deux fois dans `addPhoto` — une par branche — et les deux copies auraient fini par
 * differer le jour ou l'une des deux aurait ete corrigee.
 *
 * La photo EN TROP est la plus ANCIENNE de sa colonne, pas la nouvelle : quelqu'un qui prend
 * une quatrieme photo veut manifestement celle-la. Rendre la main sans rien changer donnerait
 * un bouton qui ne repond pas.
 */
function garderSousQuota(actuelles: PhotoChoisie[], ajoutee: PhotoChoisie): PhotoChoisie[] {
  const max = ajoutee.source === 'camera' ? MAX_PHOTOS_CAMERA : MAX_PHOTOS_GALERIE;
  const memeSource = [...actuelles.filter((ph) => ph.source === ajoutee.source), ajoutee].slice(-max);
  // L'ordre d'ajout est conserve pour l'autre colonne : seule celle qui deborde est recomposee.
  const gardees = new Set(memeSource.map((ph) => ph.uri));
  return [...actuelles.filter((ph) => ph.source !== ajoutee.source || gardees.has(ph.uri)), ajoutee].filter(
    (ph, i, tous) => tous.findIndex((a) => a.uri === ph.uri) === i,
  );
}

/** Largeur d'envoi. Le serveur re-limite a 1600 px de toute facon (routes/photos.ts) : au-dela,
 * on ne transporterait que des octets inutiles sur une connexion mobile algerienne. */
const UPLOAD_WIDTH = 1280;

const emptyForm = {
  name: '',
  category: 'autre' as PlaceCategory,
  street: '',
  houseNumber: '',
  city: '',
  postalCode: '',
  wilaya: '',
  phoneMobile: '',
  whatsapp: '',
  viber: '',
  email: '',
  promo: '',
};

/** Formulaire « Ajouter un lieu », declenche par un appui long sur la carte (openAddPoint en v83). */
export function AddPlaceSheet({ coords, onClose, onSaved, colors, userFix }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  /* L'ORIGINE EST GARDEE AVEC CHAQUE PHOTO, et pas seulement comptee : sans elle, retirer une
   * photo ne rendrait pas son emplacement a la bonne colonne — on effacerait une prise de vue
   * et c'est un emplacement de galerie qui se libererait. */
  const [photos, setPhotos] = useState<{ uri: string; source: 'camera' | 'galerie' }[]>([]);
  /** La video de presentation, choisie mais pas encore envoyee. Au plus une. */
  const [video, setVideo] = useState<{ uri: string; dureeS: number | null } | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Lieu enregistre, mais photo(s) non envoyee(s) : porte la raison technique. */
  const [savedWithoutPhoto, setSavedWithoutPhoto] = useState<string | null>(null);
  /** Conseil de verification affiche APRES un enregistrement reussi (demande du client). */
  const [savedOk, setSavedOk] = useState(false);
  /** Identifiant rendu par le serveur : il permet de corriger l'emplacement sans ressaisir. */
  const [savedId, setSavedId] = useState<string | null>(null);
  /** Resultat de la verification automatique : distance entre le lieu enregistre et le GPS. */
  const [verifyM, setVerifyM] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [moving, setMoving] = useState(false);
  /** Distance mesuree AVANT l'enregistrement quand elle depasse les quinze metres (point 3). */
  const [tropLoinM, setTropLoinM] = useState<number | null>(null);
  /** Service VIP : null = ferme, 'code' = saisie du code, sinon le code valide par le serveur. */
  const [vip, setVip] = useState<null | 'code' | { code: string }>(null);
  const [vipInput, setVipInput] = useState('');
  const [vipChecking, setVipChecking] = useState(false);
  const [vipError, setVipError] = useState<string | null>(null);
  /* Coordonnees saisissables, en plus de celles de l'appui long.
   *
   * Un partenaire VIP est souvent enregistre au bureau, a partir de coordonnees relevees sur
   * place ou communiquees par le commercant : il faut pouvoir les ECRIRE, pas seulement viser
   * un point sur la carte. Les deux champs partent de l'endroit touche, et le lieu est
   * enregistre a l'endroit affiche ici. */
  const [coordText, setCoordText] = useState({ lat: '', lon: '' });
  const insets = useSafeAreaInsets();

  /* TOUT REPART DE ZERO A CHAQUE OUVERTURE — y compris ce qui vient du dernier enregistrement.
   *
   * Cet effet remettait le formulaire a blanc mais oubliait les quatre etats de l'ecran de
   * VERIFICATION, celui qui s'affiche une fois le lieu enregistre. `savedOk` restait donc vrai,
   * et toute ouverture suivante montrait << Verification recommandee — vous etes a 20 m du lieu
   * enregistre >> au lieu du formulaire. Le client l'a decrit exactement : il se deplacait de
   * Tizi Ouzou a Alger et retrouvait le message du lieu precedent, sans jamais pouvoir en
   * ajouter un nouveau.
   *
   * La regle est simple et vaut pour la suite : cet effet doit remettre a zero TOUT ce que le
   * composant garde entre deux ouvertures. Un etat ajoute ici plus tard devra y figurer. */
  /** Dernieres coordonnees connues, gardees le temps que le panneau s'efface (voir plus bas). */
  const dernieresCoords = useRef<Coords | null>(coords);

  useEffect(() => {
    if (coords) {
      setForm(emptyForm);
      setPhotos([]);
      setVideo(null);
      setPreparingPhoto(false);
      setError(null);
      setSavedWithoutPhoto(null);
      setVip(null);
      setVipInput('');
      setVipError(null);
      setCoordText({ lat: coords.lat.toFixed(6), lon: coords.lon.toFixed(6) });
      // L'ecran de verification du lieu PRECEDENT : sans ces quatre lignes, il reste affiche.
      setSavedOk(false);
      setSavedId(null);
      setVerifyM(null);
      setVerifying(false);
      // Le refus de distance du lieu PRECEDENT : sans cette ligne il barre le formulaire suivant.
      setTropLoinM(null);
    }
  }, [coords]);

  /* NE JAMAIS ARRACHER DE L'ARBRE UN MODAL ENCORE AFFICHE.
   *
   * `coords` passe a null des que le formulaire se ferme — c'est ce que fait onClose chez
   * l'appelant. Avec un simple `if (!coords) return null`, le `<Modal>` disparaissait donc de
   * l'arbre SANS avoir jamais ete rendu ferme. Android, lui, avait deja ouvert sa fenetre
   * native : elle restait a l'ecran, vide, par-dessus l'application, qui se figeait puis se
   * fermait. C'est le plantage rapporte a l'enregistrement d'un lieu.
   *
   * On garde donc les dernieres coordonnees connues pour que le contenu reste dessinable
   * pendant que le panneau s'efface, et c'est `visible` qui commande la fermeture. Le null
   * n'est rendu que si le formulaire n'a jamais ete ouvert — la, il n'y a aucune fenetre a
   * refermer. */
  if (coords) dernieresCoords.current = coords;
  const posees = coords ?? dernieresCoords.current;
  if (!posees) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const removePhoto = (uri: string) => setPhotos((cur) => cur.filter((ph) => ph.uri !== uri));

  /** Combien de place reste-t-il dans l'une des deux colonnes. */
  const placeRestante = (source: 'camera' | 'galerie') =>
    (source === 'camera' ? MAX_PHOTOS_CAMERA : MAX_PHOTOS_GALERIE) -
    photos.filter((ph) => ph.source === source).length;

  /**
   * Reduit la photo AVANT de la garder, et non au moment de l'enregistrement.
   *
   * C'est la correction du plantage signale : une photo de telephone recent fait 12 megapixels,
   * soit environ 48 Mo une fois decodee en memoire. Elle etait decodee DEUX fois — une premiere
   * par la vignette affichee dans le formulaire, une seconde par le redimensionnement declenche
   * a l'appui sur « Enregistrer ». Avec trois photos, Android atteignait la limite de memoire du
   * processus et tuait l'application : elle se fermait d'un coup, sans message, exactement au
   * moment de l'enregistrement.
   *
   * En reduisant des la prise de vue, la vignette affiche un fichier deja petit et l'appui sur
   * « Enregistrer » n'a plus aucun travail d'image a faire.
   */
  const addPhoto = async (uri: string, source: 'camera' | 'galerie') => {
    setPreparingPhoto(true);
    try {
      const resized = await manipulateAsync(uri, [{ resize: { width: UPLOAD_WIDTH } }], {
        compress: 0.7,
        format: SaveFormat.JPEG,
      });
      setPhotos((cur) => garderSousQuota(cur, { uri: resized.uri, source }));
    } catch {
      // Le redimensionnement a echoue : on garde l'originale plutot que de perdre la photo.
      // Le serveur la redimensionnera de son cote (routes/photos.ts), l'envoi sera seulement
      // plus long.
      setPhotos((cur) => garderSousQuota(cur, { uri, source }));
    } finally {
      setPreparingPhoto(false);
    }
  };

  // Deux boutons directs plutot qu'un Alert.alert() natif : un dialogue systeme empile par-dessus
  // ce Modal, suivi de l'ouverture d'une autre Activity (camera), provoquait un redemarrage de
  // l'application sur certains telephones — probleme connu d'empilement de fenetres natives sur
  // Android, evite en ne passant plus par Alert.alert() ici.
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError(t('addPlace.cameraDenied'));
      return;
    }
    // `exif: false` : les donnees EXIF ne servent a rien ici et alourdissent la reponse du
    // module natif, qui les transporte en memoire.
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, exif: false });
    const picked = result.canceled ? null : result.assets?.[0]?.uri;
    if (picked) await addPhoto(picked, 'camera');
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('addPlace.galleryDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, exif: false });
    const picked = result.canceled ? null : result.assets?.[0]?.uri;
    if (picked) await addPhoto(picked, 'galerie');
  };

  /**
   * LA VIDEO DE PRESENTATION — document du 24 novembre, priorite 2.
   *
   * UN SEUL CHEMIN POUR LES DEUX CAS, parce que le document les met sur le meme rang :
   * « enregistree en direct OU importee depuis la galerie ». `enDirect` choisit la camera ou
   * le selecteur de fichiers, le reste est identique — meme borne de duree, meme refus, meme
   * message.
   *
   * `videoMaxDuration` coupe la CAMERA a trente secondes ; il ne peut rien contre un fichier
   * deja enregistre, d'ou la mesure a l'arrivee. Une video dont le telephone ne sait pas dire
   * la duree passe : on ne refuse pas sur une information manquante, et le serveur la borne
   * de toute facon au poids.
   */
  const choisirVideo = async (enDirect: boolean) => {
    const perm = enDirect
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t(enDirect ? 'addPlace.cameraDenied' : 'addPlace.galleryDenied'));
      return;
    }
    const result = enDirect
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['videos'],
          videoMaxDuration: VIDEO_MAX_S,
          quality: 0.7,
        })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset?.uri) return;

    // `duration` vient en MILLISECONDES quand le telephone la connait, et manque sinon.
    const dureeS = typeof asset.duration === 'number' && asset.duration > 0 ? asset.duration / 1000 : null;
    if (dureeS !== null && dureeS > VIDEO_MAX_S + VIDEO_TOLERANCE_S) {
      setError(t('addPlace.videoTooLong', { s: VIDEO_MAX_S, d: Math.round(dureeS) }));
      return;
    }
    setError(null);
    setVideo({ uri: asset.uri, dureeS });
  };

  /** Le code n'est jamais compare dans l'application : il est envoye au serveur, seul a le
   * connaitre. Il sera renvoye avec le lieu, et reverifie a l'enregistrement. */
  const checkVip = async () => {
    const code = vipInput.trim();
    if (!code) return;
    setVipChecking(true);
    setVipError(null);
    try {
      await api<{ ok: boolean }>('/places/vip-check', { method: 'POST', body: { code } });
      setVip({ code });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setVipError(t('addPlace.vipWrongCode'));
      else if (e instanceof ApiError && e.status === 429) setVipError(t('addPlace.vipTooMany'));
      else setVipError(t('errors.network'));
    } finally {
      setVipChecking(false);
    }
  };

  const vipCode = vip && typeof vip === 'object' ? vip.code : null;

  /** Coordonnees retenues : celles saisies si elles sont valides, sinon celles de l'appui long.
   * Une latitude hors [-90, 90] ou une longitude hors [-180, 180] est refusee a l'enregistrement
   * plutot que d'aller poser un lieu a l'autre bout du monde. */
  const typedLat = Number(coordText.lat.replace(',', '.'));
  const typedLon = Number(coordText.lon.replace(',', '.'));
  const coordsValid =
    Number.isFinite(typedLat) && Number.isFinite(typedLon) &&
    Math.abs(typedLat) <= 90 && Math.abs(typedLon) <= 180;
  const saveLat = coordsValid ? typedLat : posees.lat;
  const saveLon = coordsValid ? typedLon : posees.lon;

  /* L'utilisateur enregistre-t-il SA position, ou vise-t-il un point ailleurs sur la carte ?
   * La precision du GPS ne concerne que le premier cas. */
  const registeringHere =
    !!userFix && haversine(userFix.lat, userFix.lon, saveLat, saveLon) < REGISTERING_HERE_M;
  const gpsUnstable = registeringHere && userFix!.accuracyM > GPS_UNSTABLE_ACCURACY_M;

  /**
   * Double verification de l'emplacement, juste apres l'enregistrement.
   *
   * On redemande une mesure GPS FRAICHE, en haute precision, plutot que de reutiliser celle
   * qui a servi a l'enregistrement : si cette derniere venait du reseau mobile, la reprendre
   * reviendrait a comparer une erreur avec elle-meme. C'est exactement ce qui est arrive a la
   * poste de Boulay.
   *
   * Un echec reste silencieux : on ne reproche pas a l'utilisateur un GPS qui ne repond pas,
   * et sa fiche est enregistree de toute facon.
   */
  const verifyLocation = async (lat: number, lon: number) => {
    setVerifying(true);
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setVerifyM(haversine(fix.coords.latitude, fix.coords.longitude, lat, lon));
    } catch {
      setVerifyM(null);
    } finally {
      setVerifying(false);
    }
  };

  /** « Replacer sur ma position » : un appui corrige la fiche, sans rien ressaisir. */
  const moveToMe = async () => {
    if (!savedId) return;
    setMoving(true);
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      await api(`/places/${savedId}/mine`, {
        method: 'PATCH',
        body: { lat: fix.coords.latitude, lon: fix.coords.longitude },
      });
      clearSearchCache();
      setVerifyM(0);
    } catch {
      setError(t('addPlace.error'));
    } finally {
      setMoving(false);
    }
  };

  /**
   * << Replacer sur ma position >> AVANT l'enregistrement — la sortie du refus de distance.
   *
   * Le meme geste que `moveToMe`, mais sur un lieu qui n'existe pas encore : il n'y a donc rien
   * a corriger en base, seulement les deux champs de coordonnees a reecrire. Le refus s'efface
   * avec eux, et l'appui suivant sur << Enregistrer >> passe.
   */
  const placerSurMaPosition = async () => {
    setMoving(true);
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setCoordText({
        lat: fix.coords.latitude.toFixed(6),
        lon: fix.coords.longitude.toFixed(6),
      });
      setTropLoinM(null);
      setError(null);
    } catch {
      setError(t('addPlace.gpsUnstable'));
    } finally {
      setMoving(false);
    }
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError(t('addPlace.nameRequired'));
      return;
    }
    // Mieux vaut faire patienter quelques secondes qu'enregistrer un lieu a plusieurs
    // centaines de metres — ou plusieurs centaines de kilometres — de l'endroit reel.
    if (gpsUnstable) {
      setError(t('addPlace.gpsUnstable'));
      return;
    }
    if (!coordsValid) {
      setError(t('addPlace.coordsInvalid'));
      return;
    }
    setError(null);
    setSubmitting(true);
    /* LES QUINZE METRES, MESURES MAINTENANT — point 3 du 24 novembre, voir MAX_DISTANCE_M.
     *
     * Dans le `try` du submit et non avant lui : `setSubmitting(true)` est deja passe, et un
     * retour anticipe doit rendre le bouton. C'est le `finally` du bas qui s'en charge pour
     * toutes les sorties a la fois — une seule ligne a ne pas oublier au lieu de quatre. */
    try {
      if (!vipCode) {
        let ici: { lat: number; lon: number } | null = null;
        try {
          const fix = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
          });
          ici = { lat: fix.coords.latitude, lon: fix.coords.longitude };
        } catch {
          // GPS muet : on n'invente pas une distance, et on n'empeche pas d'enregistrer.
          ici = null;
        }
        if (ici) {
          const ecart = haversine(ici.lat, ici.lon, saveLat, saveLon);
          if (ecart > MAX_DISTANCE_M) {
            setTropLoinM(ecart);
            return;
          }
        }
      }
      setTropLoinM(null);
      /**
       * Les photos sont envoyees AVANT le lieu, mais leur echec ne l'empeche plus.
       *
       * Auparavant, une photo qui ne partait pas faisait echouer tout l'enregistrement : le
       * contributeur avait rempli nom, adresse, wilaya, telephone — et repartait sans rien.
       * C'est la mauvaise priorite. Le lieu est ce qui a de la valeur pour la carte ; la photo
       * l'illustre. On enregistre donc ce qui peut l'etre, et on dit clairement ce qui a
       * manque, plutot que de tout perdre pour une image.
       */
      const photoIds: string[] = [];
      let photoProblem: string | null = null;
      if (photos.length > 0) {
        for (const { uri } of photos) {
          try {
            // Sequentiel plutot que Promise.all — trois envois simultanes sur une connexion
            // mobile algerienne se genent plus qu'ils ne s'aident.
            const uploaded = await uploadPhoto(uri);
            photoIds.push(uploaded.id);
          } catch (e) {
            photoProblem = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
          }
        }
      }

      /* LA VIDEO PART APRES LES PHOTOS, ET SON ECHEC NE FAIT PAS PLUS PERDRE LE LIEU.
       *
       * Meme raisonnement qu'au-dessus, en plus vrai encore : une video pese vingt fois une
       * photo, c'est donc l'envoi qui a le plus de chances de tomber sur une connexion
       * algerienne — et ce serait le plus absurde des echecs, puisque le lieu lui-meme tient
       * en deux cents octets. Elle se rattache plus tard depuis la fiche. */
      let videoId: string | undefined;
      if (video) {
        try {
          const envoyee = await uploadVideo(video.uri, video.dureeS ?? undefined);
          videoId = envoyee.id;
        } catch (e) {
          photoProblem = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
        }
      }

      const cree = await api<{ id: string }>('/places', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          category: form.category,
          lat: saveLat,
          lon: saveLon,
          country: countryFromCoords(saveLat, saveLon) ?? 'DZ',
          street: form.street.trim() || undefined,
          houseNumber: form.houseNumber.trim() || undefined,
          city: form.city.trim() || undefined,
          postalCode: form.postalCode.trim() || undefined,
          wilaya: form.wilaya.trim() || undefined,
          phoneMobile: form.phoneMobile.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          viber: form.viber.trim() || undefined,
          email: form.email.trim() || undefined,
          photoIds: photoIds.length > 0 ? photoIds : undefined,
          videoId,
          promo: vipCode ? form.promo.trim() || undefined : undefined,
          vipCode: vipCode ?? undefined,
        },
      });

      clearSearchCache();
      setSavedId(cree.id);
      // La verification part tout de suite, en arriere-plan : le temps que l'utilisateur lise
      // l'ecran de confirmation, la reponse est la.
      void verifyLocation(saveLat, saveLon);
      if (photoProblem) {
        // Le lieu est en base : on ne referme pas le formulaire sur un simple message d'erreur,
        // on dit ce qui s'est passe pour que le contributeur sache qu'il peut revenir ajouter
        // la photo plus tard depuis la fiche.
        setSavedWithoutPhoto(photoProblem);
        return;
      }
      setSavedOk(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setVip('code');
        setVipError(t('addPlace.vipWrongCode'));
      } else if (e instanceof ApiError && e.status === 409) {
        setError(t('addPlace.duplicate'));
      } else {
        const detail = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
        setError(`${t('addPlace.error')} — ${detail}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={Boolean(coords)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* `maxHeight` laisse une bande libre en haut, et la marge basse suit la barre de
            navigation du telephone : le bouton « Enregistrer » touchait le bord inferieur de
            l'ecran, sans aucune respiration. */}
        <View style={[styles.box, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.head}>
            <Text style={[typography.heading, { color: colors.text }]}>
              {vipCode ? `⭐ ${t('addPlace.vipTitle')}` : t('addPlace.title')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {savedOk ? (
            /* Conseil de verification, demande par le client : un enregistrement peut avoir
               l'air reussi et pointer a dix kilometres. Une verification immediate coute
               quelques secondes et evite une fiche fausse qui restera des mois sur la carte. */
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[typography.heading, { color: colors.accentDark, marginBottom: spacing.sm }]}>
                ✅ {t('addPlace.savedCheckTitle')}
              </Text>

              {/* La verification parle d'elle-meme : trois cas, trois tons. */}
              {verifying ? (
                <View style={styles.verifyRow}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={[typography.body, { color: colors.textMuted }]}>{t('addPlace.verifying')}</Text>
                </View>
              ) : verifyM === null ? (
                // GPS muet : on retombe sur le conseil manuel, qui reste valable.
                <Text style={[typography.body, { color: colors.text }]}>{t('addPlace.savedCheck')}</Text>
              ) : verifyM <= VERIFY_SUSPICIOUS_M ? (
                <Text style={[typography.body, { color: colors.accentDark }]}>
                  ✅ {t('addPlace.verifyOk', { d: formatDistance(verifyM) })}
                </Text>
              ) : (
                <View style={[styles.verifyWarn, { borderColor: colors.danger, backgroundColor: colors.danger + '12' }]}>
                  <Text style={[typography.body, { color: colors.danger, fontWeight: '700' }]}>
                    ⚠️ {t('addPlace.verifyFar', { d: formatDistance(verifyM) })}
                  </Text>
                  <Text style={[typography.caption, { color: colors.text, marginTop: 6 }]}>
                    {t('addPlace.verifyFarWhy')}
                  </Text>
                  <Pressable
                    disabled={moving}
                    onPress={() => void moveToMe()}
                    style={[styles.save, { backgroundColor: colors.accent, marginTop: spacing.md }]}
                  >
                    <Text style={styles.saveText}>{moving ? '…' : t('addPlace.moveHere')}</Text>
                  </Pressable>
                </View>
              )}

              {/* << GARDER TEL QUEL >> A DISPARU POUR UN UTILISATEUR ORDINAIRE — point 3 du
                  24 novembre, capture d'ecran a l'appui : il s'affichait sous << le lieu
                  enregistre se trouve a 33 km de votre position actuelle >>.
                  Il ne reste que pour une saisie par code WIN, ou les coordonnees sont
                  communiquees par le commercant et ou l'ecart est donc normal. Quand la
                  distance est bonne — ou que le GPS n'a rien pu dire —, ce bouton n'a jamais
                  ete << garder tel quel >> : c'est le bouton qui ferme, et il reste.
                  Dans tous les cas, la croix du haut referme la feuille : personne n'est
                  enferme dans cet ecran. */}
              {vipCode || verifyM === null || verifyM <= VERIFY_SUSPICIOUS_M ? (
                <Pressable onPress={onSaved} style={[styles.save, { backgroundColor: colors.accent }]}>
                  <Text style={styles.saveText}>
                    {verifyM !== null && verifyM > VERIFY_SUSPICIOUS_M ? t('addPlace.keepAnyway') : t('search.confirm')}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : savedWithoutPhoto ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[typography.body, { color: colors.text, marginBottom: spacing.sm }]}>
                {t('addPlace.savedWithoutPhoto')}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{savedWithoutPhoto}</Text>
              <Pressable onPress={onSaved} style={[styles.save, { backgroundColor: colors.accent }]}>
                <Text style={styles.saveText}>{t('search.confirm')}</Text>
              </Pressable>
            </ScrollView>
          ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[typography.caption, styles.coords, { color: colors.accent, backgroundColor: colors.surfaceAlt }]}>
              📍 {saveLat.toFixed(5)}, {saveLon.toFixed(5)}
            </Text>

            {/* Avertissement GPS. Il s'affiche toujours — la mise en garde vaut meme avec un bon
                signal — et passe en rouge quand la precision annoncee rend le releve douteux,
                auquel cas l'enregistrement est refuse tant qu'elle ne s'ameliore pas. */}
            <View
              style={[
                styles.gpsNotice,
                {
                  backgroundColor: gpsUnstable ? colors.danger + '1a' : colors.surfaceAlt,
                  borderColor: gpsUnstable ? colors.danger : colors.border,
                },
              ]}
            >
              <Text style={[typography.caption, { color: gpsUnstable ? colors.danger : colors.textMuted }]}>
                {gpsUnstable ? `⛔ ${t('addPlace.gpsUnstable')}` : `⚠️ ${t('addPlace.gpsCheck')}`}
              </Text>
              {userFix ? (
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 3 }]}>
                  {t('addPlace.gpsAccuracy', { m: Math.round(userFix.accuracyM) })}
                </Text>
              ) : null}
            </View>

            {/* Coordonnees modifiables : indispensables pour enregistrer un partenaire VIP dont
                on a releve la position ailleurs, sans avoir a viser le point sur la carte. */}
            <View style={styles.row2}>
              <Field label={t('addPlace.latitude')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={coordText.lat}
                  onChangeText={(v) => setCoordText((c) => ({ ...c, lat: v }))}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { color: colors.text, borderColor: coordsValid ? colors.border : colors.danger }]}
                />
              </Field>
              <Field label={t('addPlace.longitude')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={coordText.lon}
                  onChangeText={(v) => setCoordText((c) => ({ ...c, lon: v }))}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { color: colors.text, borderColor: coordsValid ? colors.border : colors.danger }]}
                />
              </Field>
            </View>

            <Field label={t('addPlace.name')} colors={colors}>
              <TextInput
                value={form.name}
                onChangeText={(v) => set('name', v)}
                placeholder={t('addPlace.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>

            <Text style={[styles.label, { color: colors.textMuted }]}>{t('addPlace.category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {PLACE_CATEGORIES.map((cat) => {
                const on = cat === form.category;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => set('category', cat)}
                    style={[
                      styles.catChip,
                      { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface },
                    ]}
                  >
                    <Text style={{ color: on ? colors.accentText : colors.text, fontSize: 12.5, fontWeight: '700' }}>
                      {t(`placeCategories.${cat}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.row2}>
              <Field label={t('addPlace.houseNumber')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={form.houseNumber}
                  onChangeText={(v) => set('houseNumber', v)}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
              <Field label={t('addPlace.street')} colors={colors} style={{ flex: 2 }}>
                <TextInput
                  value={form.street}
                  onChangeText={(v) => set('street', v)}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
            </View>

            <View style={styles.row2}>
              <Field label={t('addPlace.postalCode')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={form.postalCode}
                  onChangeText={(v) => set('postalCode', v)}
                  keyboardType="number-pad"
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
              <Field label={t('addPlace.city')} colors={colors} style={{ flex: 2 }}>
                <TextInput
                  value={form.city}
                  onChangeText={(v) => set('city', v)}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
            </View>

            <Field label={t('addPlace.wilaya')} colors={colors}>
              <TextInput
                value={form.wilaya}
                onChangeText={(v) => set('wilaya', v)}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>

            <Field label={t('addPlace.phoneMobile')} colors={colors}>
              <TextInput
                value={form.phoneMobile}
                onChangeText={(v) => set('phoneMobile', v)}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>
            <Field label={t('addPlace.whatsapp')} colors={colors}>
              <TextInput
                value={form.whatsapp}
                onChangeText={(v) => set('whatsapp', v)}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>
            {/* VIBER, a cote de WhatsApp (demande du 2 novembre). Les deux et non l'un ou
                l'autre : en Algerie, Viber reste tres utilise pour les appels vers l'etranger,
                la ou WhatsApp domine les echanges du quotidien. Un commercant qui donne les
                deux numeros ne vise pas la meme clientele avec chacun.

                Le champ est propose a TOUTE fiche, pas seulement aux VIP : ce sont les fiches
                VIP qui le remplissent, mais une fiche ordinaire qui porte un numero Viber ne
                gene personne, et une fiche declassee n'aurait aucune raison de le perdre. */}
            <Field label={t('addPlace.viber')} colors={colors}>
              <TextInput
                value={form.viber}
                onChangeText={(v) => set('viber', v)}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>
            <Field label={t('addPlace.email')} colors={colors}>
              <TextInput
                value={form.email}
                onChangeText={(v) => set('email', v)}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('addPlace.photo')} {photos.length > 0 ? `(${photos.length}/${MAX_PHOTOS})` : ''}
              {preparingPhoto ? ` — ${t('addPlace.preparingPhoto')}` : ''}
            </Text>
            {/* LE DETAIL DES DEUX COLONNES — document du 24 novembre : trois prises sur place,
                deux tirees du telephone. Sans cette ligne, un bouton qui cesse de repondre a la
                quatrieme photo n'aurait aucune explication a l'ecran : l'utilisateur verrait
                « 3/5 » et un appareil photo qui ne fait plus rien. */}
            <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.xs }]}>
              📷 {photos.filter((ph) => ph.source === 'camera').length}/{MAX_PHOTOS_CAMERA}
              {'   '}🖼️ {photos.filter((ph) => ph.source === 'galerie').length}/{MAX_PHOTOS_GALERIE}
            </Text>
            {photos.length > 0 ? (
              <View style={styles.photoRow}>
                {photos.map(({ uri }) => (
                  <Pressable key={uri} onPress={() => removePhoto(uri)} style={styles.photoThumbWrap}>
                    {/* `resizeMethod="resize"` : Android decode l'image DEJA reduite a la
                        taille d'affichage, au lieu de charger le bitmap entier en memoire
                        pour le reduire ensuite. Sur une vignette de 88 points, la difference
                        se compte en dizaines de megaoctets par photo. */}
                    <Image source={{ uri }} style={styles.photoThumb} resizeMethod="resize" />
                    <View style={[styles.removePhotoBadge, { backgroundColor: colors.danger }]}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✕</Text>
                    </View>
                  </Pressable>
                ))}
                {/* CHAQUE MOITIE DE LA TUILE S'EFFACE SEPAREMENT, quand SA colonne est pleine :
                    trois photos prises sur place ne doivent pas faire disparaitre l'acces a la
                    galerie, ni l'inverse. La tuile entiere ne part que lorsque les deux le
                    sont. */}
                {placeRestante('camera') > 0 || placeRestante('galerie') > 0 ? (
                  <View style={[styles.photoAddTile, { borderColor: colors.border }]}>
                    {placeRestante('camera') > 0 ? (
                      <Pressable onPress={() => void takePhoto()} style={styles.photoAddHalf}>
                        <Text style={{ fontSize: 18 }}>📷</Text>
                      </Pressable>
                    ) : null}
                    {placeRestante('camera') > 0 && placeRestante('galerie') > 0 ? (
                      <View style={[styles.photoAddDivider, { backgroundColor: colors.border }]} />
                    ) : null}
                    {placeRestante('galerie') > 0 ? (
                      <Pressable onPress={() => void pickFromGallery()} style={styles.photoAddHalf}>
                        <Text style={{ fontSize: 18 }}>🖼️</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.photoRow}>
                <Pressable onPress={() => void takePhoto()} style={[styles.photoBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted }}>📷 {t('addPlace.camera')}</Text>
                </Pressable>
                <Pressable onPress={() => void pickFromGallery()} style={[styles.photoBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted }}>🖼️ {t('addPlace.gallery')}</Text>
                </Pressable>
              </View>
            )}

            {/* LA VIDEO DE PRESENTATION — document du 24 novembre, priorite 2.
                Posee sous les photos et au-dessus du bloc VIP : c'est un media de plus, pas un
                service de plus. Elle est FACULTATIVE pour tout le monde — une fiche ordinaire
                qui en porte une l'affichera le jour ou elle deviendra partenaire, au lieu de
                repartir de rien, exactement comme les avis depuis le 19 novembre. */}
            <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>
              🎬 {t('addPlace.video')} — {t('addPlace.videoMax', { s: VIDEO_MAX_S })}
            </Text>
            {video ? (
              <Pressable
                onPress={() => setVideo(null)}
                style={[styles.photoBtn, { borderColor: colors.goldDeep, flexDirection: 'row', gap: spacing.sm }]}
              >
                <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                  ▶ {video.dureeS !== null ? `${Math.round(video.dureeS)} s` : t('addPlace.video')}
                </Text>
                <Text style={{ color: colors.danger, fontWeight: '700' }}>✕</Text>
              </Pressable>
            ) : (
              <View style={styles.photoRow}>
                <Pressable
                  onPress={() => void choisirVideo(true)}
                  style={[styles.photoBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textMuted }}>🎥 {t('addPlace.videoRecord')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void choisirVideo(false)}
                  style={[styles.photoBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textMuted }}>📁 {t('addPlace.videoImport')}</Text>
                </Pressable>
              </View>
            )}

            {/* Service VIP — bouton dore, puis code, comme « Ajouter un partenaire VIP » en v83. */}
            {vipCode ? (
              <>
                <View style={[styles.vipBanner, { borderColor: colors.goldDeep, backgroundColor: colors.gold + '22' }]}>
                  <Text style={[styles.vipBannerText, { color: colors.alert }]}>⭐ {t('addPlace.vipActive')}</Text>
                </View>
                <Field label={t('addPlace.promo')} colors={colors}>
                  <TextInput
                    value={form.promo}
                    onChangeText={(v) => set('promo', v)}
                    placeholder={t('addPlace.promoPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    maxLength={280}
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  />
                </Field>
              </>
            ) : vip === 'code' ? (
              <View style={styles.vipCodeZone}>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t('addPlace.vipCode')}</Text>
                <View style={styles.row2}>
                  <TextInput
                    value={vipInput}
                    onChangeText={setVipInput}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={32}
                    placeholder="••••"
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={() => void checkVip()}
                    style={[styles.input, styles.vipInput, { color: colors.text, borderColor: colors.goldDeep }]}
                  />
                  <Pressable
                    onPress={() => void checkVip()}
                    disabled={vipChecking}
                    style={[styles.vipOk, { backgroundColor: colors.goldDeep, opacity: vipChecking ? 0.7 : 1 }]}
                  >
                    {vipChecking ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>OK</Text>}
                  </Pressable>
                </View>
                {vipError ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{vipError}</Text> : null}
              </View>
            ) : (
              <Pressable
                onPress={() => setVip('code')}
                style={[styles.vipBtn, { borderColor: colors.goldDeep, backgroundColor: colors.surface }]}
              >
                <Text style={[styles.vipBtnText, { color: colors.goldDeep }]}>⭐ {t('addPlace.vipButton')}</Text>
              </Pressable>
            )}

            {/* LE REFUS DE DISTANCE — point 3 du 24 novembre, voir MAX_DISTANCE_M.
                Il remplace l'ancien enchainement << on enregistre, puis on previent, puis on
                propose de garder >> : ici rien n'est encore entre sur la carte, et le seul
                bouton offert est celui qui corrige. */}
            {tropLoinM !== null ? (
              <View style={[styles.verifyWarn, { borderColor: colors.danger, backgroundColor: colors.danger + '12' }]}>
                <Text style={[typography.body, { color: colors.danger, fontWeight: '700' }]}>
                  ⚠️ {t('addPlace.tooFar', { d: formatDistance(tropLoinM) })}
                </Text>
                <Text style={[typography.caption, { color: colors.text, marginTop: 6 }]}>
                  {t('addPlace.tooFarWhy', { m: MAX_DISTANCE_M })}
                </Text>
                <Pressable
                  disabled={moving}
                  onPress={() => void placerSurMaPosition()}
                  style={[styles.save, { backgroundColor: colors.accent, marginTop: spacing.md }]}
                >
                  <Text style={styles.saveText}>{moving ? '…' : t('addPlace.moveHere')}</Text>
                </Pressable>
              </View>
            ) : null}

            {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text> : null}

            <Pressable
              /* `void submit()` et non `submit` : une fonction asynchrone passee directement
                 rend une promesse que Pressable ignore. Si elle etait rejetee — ce que son
                 try/catch interdit aujourd'hui, mais qu'une modification future pourrait
                 reintroduire — le rejet partirait sans gestionnaire. On ferme la porte. */
              onPress={() => void submit()}
              disabled={submitting || preparingPhoto}
              style={[
                styles.save,
                { backgroundColor: vipCode ? colors.goldDeep : colors.accent, opacity: submitting || preparingPhoto ? 0.7 : 1 },
              ]}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{vipCode ? t('addPlace.vipSave') : t('addPlace.save')}</Text>}
            </Pressable>
          </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  colors,
  children,
  style,
}: {
  label: string;
  colors: Palette;
  children: ReactNode;
  style?: object;
}) {
  return (
    <View style={style}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  box: {
    /* 78 % et non 90 % (point 5 du client, 23 octobre : « le reduire pour qu'il ne prenne pas
     * tout l'ecran »). A 90 %, le cadre d'enregistrement recouvrait la carte presque entiere et
     * l'on perdait de vue l'endroit que l'on etait en train d'enregistrer — or c'est
     * precisement ce qu'on veut verifier du coin de l'oeil en remplissant le formulaire.
     *
     * Le contenu defile deja : reduire la hauteur ne cache rien, cela rend simplement la carte
     * visible derriere. */
    maxHeight: '78%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    /* Bordure fine verte, teinte donnee par le client. Elle ferme le cadre : sans elle, le
     * panneau blanc se fondait dans la carte claire et l'on ne voyait plus ou il commencait. */
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    padding: spacing.lg,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  gpsNotice: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  verifyWarn: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md },
  coords: {
    alignSelf: 'flex-start',
    fontWeight: '700' as const,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  label: { fontSize: 12.5, fontWeight: '700' as const, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14 },
  row2: { flexDirection: 'row', gap: spacing.sm },
  catRow: { flexGrow: 0 },
  catChip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm },
  photoBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  photoRow: { flexDirection: 'row', gap: spacing.sm },
  photoThumbWrap: { position: 'relative', width: 88, height: 88 },
  photoThumb: { width: '100%', height: '100%', borderRadius: radius.md },
  removePhotoBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddTile: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  photoAddHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoAddDivider: { width: 1.5 },
  save: { marginTop: spacing.lg, marginBottom: spacing.md, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' as const, fontSize: 15 },
  vipBtn: { marginTop: spacing.lg, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  vipBtnText: { fontWeight: '800' as const, fontSize: 14.5 },
  vipCodeZone: { marginTop: spacing.md },
  vipInput: { flex: 1, textAlign: 'center', letterSpacing: 6, fontWeight: '800' as const },
  vipOk: { borderRadius: radius.sm, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  vipBanner: { marginTop: spacing.lg, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md },
  vipBannerText: { fontWeight: '800' as const, fontSize: 13.5, textAlign: 'center' },
});
