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
}));
