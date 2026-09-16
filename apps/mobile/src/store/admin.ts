import { create } from 'zustand';
import { ApiError, api } from '../api/client';
import { readJson, storage, StorageKeys, writeJson } from './storage';

export type AdminIdentity = { id: string; displayName: string; role: 'moderator' | 'admin' };

type AdminSession = {
  token: string | null;
  admin: AdminIdentity | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const ADMIN_IDENTITY_KEY = 'adminIdentity';

/**
 * Session administrateur, distincte de la session appareil (useSession) : un compte reel,
 * jamais le code partage/code public que la v83 utilisait. Voir apps/api/src/routes/admin.ts —
 * cote serveur, cette authentification existait deja, seul l'ecran mobile manquait.
 */
export const useAdminSession = create<AdminSession>((set) => ({
  token: storage.getString(StorageKeys.adminToken) ?? null,
  admin: readJson<AdminIdentity | null>(ADMIN_IDENTITY_KEY, null),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const result = await api<{ token: string; admin: AdminIdentity }>('/admin/login', {
        method: 'POST',
        body: { email, password },
      });
      storage.set(StorageKeys.adminToken, result.token);
      writeJson(ADMIN_IDENTITY_KEY, result.admin);
      set({ token: result.token, admin: result.admin, loading: false });
      return true;
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Connexion impossible.';
      set({ loading: false, error: message });
      return false;
    }
  },

  logout: () => {
    storage.delete(StorageKeys.adminToken);
    storage.delete(ADMIN_IDENTITY_KEY);
    set({ token: null, admin: null });
  },
}));
