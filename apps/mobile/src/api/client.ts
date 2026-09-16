import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { storage } from '../store/storage';

const BASE_URL =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'http://10.0.2.2:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/* ------------------------------------------------------------------------- */
/* Identification de l'appareil                                               */
/* ------------------------------------------------------------------------- */

/** Inscription en cours, partagee : si l'ajout d'un lieu et l'envoi d'une photo demandent
 * un jeton en meme temps, ils attendent la MEME inscription au lieu d'en declencher deux —
 * ce qui creerait deux appareils pour un seul telephone. */
let registration: Promise<string | null> | null = null;

async function registerDevice(): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/devices/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        language: storage.getString('language') ?? 'fr',
      }),
    });
    if (!response.ok) return null;
    const session = (await response.json()) as { deviceId?: string; token?: string };
    if (!session.token || !session.deviceId) return null;
    storage.set('deviceId', session.deviceId);
    storage.set('deviceToken', session.token);
    return session.token;
  } catch {
    // Hors ligne : on ne retient rien, la prochaine tentative recommencera.
    return null;
  }
}

/**
 * Jeton d'appareil, en inscrivant le telephone si besoin.
 *
 * L'inscription n'avait lieu qu'une fois, au tout premier lancement, et son echec etait
 * avale en silence : un premier demarrage sans reseau — ou pendant une coupure du serveur —
 * laissait l'application SANS IDENTITE pour toujours. Tout ce qui demande un appareil
 * identifie (ajouter un lieu, envoyer une photo, signaler, voter) repondait alors
 * « Appareil non identifie », sans que rien ne retente jamais.
 *
 * Elle est desormais tentee au moment ou l'on en a besoin, et retentee tant qu'elle n'a
 * pas abouti.
 */
export async function ensureDeviceToken(): Promise<string | null> {
  const existing = storage.getString('deviceToken');
  if (existing) return existing;
  if (!registration) {
    registration = registerDevice().finally(() => {
      registration = null;
    });
  }
  return registration;
}

/** Oublie le jeton courant : appele quand le serveur le refuse, pour qu'un nouveau soit
 * demande au prochain appel plutot que de repeter un jeton mort a l'infini. */
function forgetDeviceToken(): void {
  storage.delete('deviceToken');
  storage.delete('deviceId');
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Jeton administrateur, quand la route l'exige. */
  adminToken?: string;
  signal?: AbortSignal;
};

/**
 * Appel API.
 *
 * Le jeton appareil est ajoute automatiquement : aucun ecran n'a besoin de
 * savoir qu'il existe. Les messages d'erreur du serveur sont deja rediges en
 * francais et peuvent etre affiches tels quels.
 */
export async function api<T>(path: string, options: Options = {}, retrying = false): Promise<T> {
  const url = new URL(BASE_URL.replace(/\/$/, '') + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  // Le jeton d'appareil est obtenu au besoin. Les routes publiques s'en passent tres bien,
  // mais l'obtenir ici evite d'avoir a y penser dans chaque ecran — et surtout evite qu'un
  // echec d'inscription au premier lancement rende la contribution impossible a jamais.
  const token = options.adminToken ?? (await ensureDeviceToken());
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const text = await response.text();
  // Toutes les reponses ne viennent pas de l'API : un 502 ou un 504 est produit par Nginx
  // et renvoie une page HTML. `JSON.parse` levait alors une SyntaxError brute, que les
  // ecrans — qui attendent tous une ApiError — laissaient remonter jusqu'a l'utilisateur
  // sous forme d'ecran rouge. Un corps illisible est traite comme une absence de corps.
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ApiError(response.status, 'reponse_illisible', "Le serveur a repondu quelque chose d'inattendu.");
      }
    }
  }

  if (!response.ok) {
    const error = payload as { error?: string; message?: string; details?: unknown } | null;

    // Jeton d'appareil refuse : il a expire (400 jours) ou le serveur a change de secret. On
    // l'oublie et on retente une fois avec une inscription neuve, plutot que de laisser
    // l'utilisateur devant un « Appareil non identifie » qu'aucune action de sa part ne peut
    // resoudre. La reprise est conditionnee au MOTIF renvoye par le serveur, jamais au seul
    // code 401 : un mauvais mot de passe administrateur renvoie lui aussi 401, et effacer
    // l'identite de l'appareil a cette occasion serait absurde.
    if (error?.error === 'device_token_requis' && !retrying && !options.adminToken) {
      forgetDeviceToken();
      if (await ensureDeviceToken()) return api<T>(path, options, true);
    }

    throw new ApiError(
      response.status,
      error?.error ?? 'erreur_reseau',
      error?.message ?? "Le serveur n'a pas repondu correctement.",
      error?.details,
    );
  }

  return payload as T;
}

type RawResponse = { status: number; body: string };

/**
 * Voie 1 : multipart compose cote NATIF, a partir du chemin du fichier.
 *
 * C'est la voie preferee — le fichier ne transite jamais par la memoire JavaScript, ce qui
 * compte pour une photo sur un telephone d'entree de gamme. Elle repose en revanche sur une
 * fonction depreciee d'expo-file-system, qui leve `UnavailabilityError` si le module natif
 * ne l'expose pas. D'ou la voie 2.
 */
async function postPhotoNative(uri: string, token: string): Promise<RawResponse> {
  const result = await uploadAsync(`${BASE_URL.replace(/\/$/, '')}/photos`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    // Le serveur lit la premiere partie fichier de la requete (`req.file()`, voir
    // apps/api/src/routes/photos.ts) ; le nom du champ reste `file` pour rester explicite.
    fieldName: 'file',
    mimeType: 'image/jpeg',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  return { status: result.status, body: result.body };
}

/**
 * Voie 2 : `FormData` avec un objet `File` d'expo-file-system.
 *
 * Le `fetch` d'Expo n'accepte que trois formes de piece jointe — une chaine, un `Blob`, ou un
 * objet exposant `bytes()` (voir expo/src/winter/fetch/convertFormData.ts). L'objet
 * `{ uri, name, type }` employe partout dans l'ecosysteme React Native n'en est aucune, d'ou
 * l'erreur « Unsupported FormDataPart implementation ». `File` en est une : il implemente
 * `Blob` et porte un `name`, donc le nom de fichier arrive bien au serveur — sans quoi la
 * partie serait recue comme un simple champ de texte et `req.file()` ne trouverait rien.
 */
async function postPhotoFetch(uri: string, token: string): Promise<RawResponse> {
  const form = new FormData();
  form.append('file', new File(uri) as unknown as Blob, 'photo.jpg');

  const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/photos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: response.status, body: await response.text() };
}

/**
 * Envoi d'une photo, avec repli.
 *
 * Deux voies independantes, parce qu'aucune ne peut etre verifiee ailleurs que sur un
 * telephone : si la premiere n'est pas disponible sur cet appareil ou ce SDK, la seconde
 * prend le relais. Une erreur RENVOYEE PAR LE SERVEUR (photo trop lourde, jeton refuse) ne
 * declenche pas le repli — la seconde voie echouerait de la meme facon, et reessayer ne
 * ferait que doubler l'attente.
 */
export async function uploadPhoto(uri: string, retrying = false): Promise<{ id: string; url: string }> {
  // Cette route exige un appareil identifie : sans jeton, elle repond 401 et la photo est
  // perdue apres que l'utilisateur a rempli tout le formulaire.
  const token = await ensureDeviceToken();
  if (!token) {
    throw new ApiError(401, 'appareil_non_identifie', "L'appareil n'a pas pu s'identifier. Verifiez la connexion.");
  }

  let result: RawResponse;
  try {
    result = await postPhotoNative(uri, token);
  } catch (nativeError) {
    try {
      result = await postPhotoFetch(uri, token);
    } catch (fetchError) {
      // Les deux voies ont echoue avant meme d'atteindre le serveur : on remonte les DEUX
      // raisons. Diagnostiquer a distance avec un seul des deux messages est impossible.
      const first = nativeError instanceof Error ? nativeError.message : String(nativeError);
      const second = fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new ApiError(0, 'photo_envoi_impossible', `envoi impossible (natif: ${first} | fetch: ${second})`);
    }
  }

  // Seule `requireDevice` protege cette route : un 401 y signifie toujours que le jeton
  // d'appareil est refuse.
  if (result.status === 401 && !retrying) {
    forgetDeviceToken();
    if (await ensureDeviceToken()) return uploadPhoto(uri, true);
  }

  if (result.status < 200 || result.status >= 300) {
    // Le corps d'erreur de l'API porte deja un message en francais ; on le prefere au notre
    // quand il est lisible.
    let message = `La photo n'a pas pu etre envoyee (${result.status}).`;
    try {
      const body = JSON.parse(result.body) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* corps illisible : on garde le message generique */
    }
    throw new ApiError(result.status, 'photo_refusee', message);
  }

  return JSON.parse(result.body) as { id: string; url: string };
}

export { BASE_URL };
