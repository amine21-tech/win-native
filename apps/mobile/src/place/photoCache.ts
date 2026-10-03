import {
  cacheDirectory,
  downloadAsync,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';
import { WIKI_HEADERS } from './placePhoto';

/**
 * Telechargement des photos Wikimedia, et conservation sur le telephone.
 *
 * Pourquoi ne pas se contenter de donner l'adresse a `<Image>` : Wikimedia refuse les requetes
 * sans agent declare (403), et l'agent ne peut etre transmis que par les en-tetes de la source
 * de l'image. Or ces en-tetes dependent du composant natif qui charge l'image, et rien ne
 * garantit qu'il les transmette — le cadre restait vide sans qu'aucune erreur ne remonte, et
 * c'est ce que le client photographie depuis plusieurs versions.
 *
 * En telechargeant nous-memes, nous maitrisons la requete de bout en bout : l'agent part a coup
 * sur, un echec est une VRAIE erreur que l'on peut traiter, et `<Image>` ne recoit plus qu'un
 * fichier local, qu'il sait afficher sans rien demander au reseau.
 *
 * Le fichier est garde dans le dossier de cache de l'application : une ville deja consultee
 * s'affiche instantanement, meme sans reseau, et Android peut recuperer la place s'il en
 * manque — c'est ce que ce dossier signifie.
 */

const DIR = cacheDirectory ? `${cacheDirectory}win-photos/` : null;

/** Un nom de fichier stable et sans surprise, derive de l'adresse. */
function fileNameFor(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) hash = ((hash * 33) ^ url.charCodeAt(i)) >>> 0;
  const ext = /\.(jpe?g|png|webp|gif)(\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
  return `${hash.toString(36)}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

let dirReady = false;

async function ensureDir(): Promise<boolean> {
  if (!DIR) return false;
  if (dirReady) return true;
  try {
    const info = await getInfoAsync(DIR);
    if (!info.exists) await makeDirectoryAsync(DIR, { intermediates: true });
    dirReady = true;
    return true;
  } catch {
    return false;
  }
}

/* Telechargements en cours, pour qu'une meme photo demandee deux fois de suite — une fiche
 * rouverte avant la fin du premier telechargement — ne parte pas deux fois sur le reseau. */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Adresse LOCALE de la photo, telechargee au besoin. `null` si le telechargement echoue : a
 * l'appelant d'afficher la fiche sans image plutot qu'un cadre vide.
 */
export async function localPhotoUri(url: string): Promise<string | null> {
  if (!(await ensureDir()) || !DIR) return null;

  const target = DIR + fileNameFor(url);
  try {
    const info = await getInfoAsync(target);
    if (info.exists && info.size > 0) return target;
  } catch {
    /* dossier vide au premier lancement : on telecharge */
  }

  const pending = inFlight.get(url);
  if (pending) return pending;

  const task = (async () => {
    try {
      // Deux essais : une coupure de reseau passagere ne doit pas priver la fiche de sa photo
      // jusqu'a la prochaine ouverture. Un refus du serveur, lui, se repetera a l'identique —
      // d'ou un seul nouvel essai, et non une insistance inutile.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await downloadAsync(url, target, { headers: WIKI_HEADERS });
          // Un 403 ou un 404 produit tout de meme un fichier, qui contient la page d'erreur :
          // sans ce controle, on afficherait du texte en guise de photo.
          if (res.status >= 200 && res.status < 300) return res.uri;
        } catch {
          /* on retente une fois */
        }
      }
      return null;
    } finally {
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, task);
  return task;
}
