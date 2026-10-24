import { create } from 'zustand';
import { readJson, StorageKeys, writeJson } from './storage';

/**
 * Un favori ou une entree d'historique n'est pas force lie a un lieu WIN : en
 * v83 (getFavs/getHist), on peut enregistrer n'importe quel resultat de
 * recherche (ville OpenStreetMap, adresse Photon...), donc l'identite est le
 * couple nom + coordonnees, pas un identifiant serveur.
 */
export type Bookmark = {
  name: string;
  addr: string;
  lat: number;
  lon: number;
};

const HISTORY_MAX = 15;
const FAVORITES_MAX = 50;

const sameBookmark = (a: Bookmark, b: Bookmark) =>
  a.name === b.name && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;

type PlacesState = {
  favorites: Bookmark[];
  history: Bookmark[];

  isFavorite: (b: Bookmark) => boolean;
  toggleFavorite: (b: Bookmark) => void;
  addToHistory: (b: Bookmark) => void;
  removeFromHistory: (b: Bookmark) => void;
  clearHistory: () => void;
  /** Oublie un lieu supprime : il quitte l'historique ET les favoris. Voir l'implementation. */
  oublierLieu: (lat: number, lon: number) => void;
};

export const usePlaces = create<PlacesState>((set, get) => ({
  favorites: readJson<Bookmark[]>(StorageKeys.favorites, []),
  history: readJson<Bookmark[]>(StorageKeys.history, []),

  isFavorite: (b) => get().favorites.some((f) => sameBookmark(f, b)),

  toggleFavorite: (b) => {
    const current = get().favorites;
    const next = get().isFavorite(b)
      ? current.filter((f) => !sameBookmark(f, b))
      : [b, ...current].slice(0, FAVORITES_MAX);
    writeJson(StorageKeys.favorites, next);
    set({ favorites: next });
  },

  addToHistory: (b) => {
    const next = [b, ...get().history.filter((h) => !sameBookmark(h, b))].slice(0, HISTORY_MAX);
    writeJson(StorageKeys.history, next);
    set({ history: next });
  },

  removeFromHistory: (b) => {
    const next = get().history.filter((h) => !sameBookmark(h, b));
    writeJson(StorageKeys.history, next);
    set({ history: next });
  },

  clearHistory: () => {
    writeJson(StorageKeys.history, []);
    set({ history: [] });
  },

  /**
   * Oublie un lieu supprime : il quitte l'historique ET les favoris.
   *
   * POURQUOI C'EST NECESSAIRE. La barre de recherche n'affiche pas que les reponses du
   * serveur : elle montre aussi ce que le telephone garde en local, l'historique et les
   * favoris. Retirer une fiche du serveur ne vidait donc rien de tout cela, et le lieu
   * supprime reparaissait des qu'on retapait son nom. Le client en a conclu — a juste titre
   * vu de l'ecran — que la suppression n'avait pas pris.
   *
   * L'IDENTITE RETENUE ICI EST LA POSITION SEULE, et non le couple nom + position qui sert
   * partout ailleurs. Une fiche a pu etre renommee entre le moment ou elle est entree dans
   * l'historique et celui ou on la supprime : on veut l'oublier quel que soit le nom sous
   * lequel elle avait ete rangee.
   */
  oublierLieu: (lat, lon) => {
    const memeEndroit = (b: Bookmark) =>
      Math.abs(b.lat - lat) < 1e-6 && Math.abs(b.lon - lon) < 1e-6;

    const history = get().history.filter((h) => !memeEndroit(h));
    const favorites = get().favorites.filter((f) => !memeEndroit(f));
    writeJson(StorageKeys.history, history);
    writeJson(StorageKeys.favorites, favorites);
    set({ history, favorites });
  },
}));
