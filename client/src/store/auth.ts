import { create } from 'zustand';
import { api } from '../services/api';
import type { User } from '../types';

type AuthState = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: any) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
  refreshMe: () => Promise<void>;
  // Phase 2: superuser impersonation. `impersonate` swaps the current
  // session for the impersonated user (token + user). The user object
  // carries an `actingAs` flag so we can render the sticky red banner.
  impersonate: (token: string, user: User) => void;
  endImpersonation: () => Promise<void>;
};

// Read persisted auth synchronously so it's in the initial state on the very
// first render. Without this, RequireAuth sees user=null on mount and redirects
// to /login before the hydrate useEffect has a chance to run.
function readPersisted(): { user: User | null; token: string | null } {
  if (typeof localStorage === 'undefined') return { user: null, token: null };
  try {
    const token = localStorage.getItem('uenr_token');
    const raw = localStorage.getItem('uenr_user');
    return { token, user: raw ? JSON.parse(raw) : null };
  } catch {
    return { user: null, token: null };
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...readPersisted(),
  hydrate: () => set(readPersisted()),
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('uenr_token', data.data.token);
    localStorage.setItem('uenr_user', JSON.stringify(data.data.user));
    set({ token: data.data.token, user: data.data.user });
  },
  register: async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('uenr_token', data.data.token);
    localStorage.setItem('uenr_user', JSON.stringify(data.data.user));
    set({ token: data.data.token, user: data.data.user });
  },
  logout: () => {
    localStorage.removeItem('uenr_token');
    localStorage.removeItem('uenr_user');
    set({ user: null, token: null });
  },
  refreshMe: async () => {
    const { data } = await api.get('/auth/me');
    localStorage.setItem('uenr_user', JSON.stringify(data.data));
    set({ user: data.data });
  },
  impersonate: (token, user) => {
    localStorage.setItem('uenr_token', token);
    localStorage.setItem('uenr_user', JSON.stringify(user));
    set({ token, user });
  },
  endImpersonation: async () => {
    // Server checks the current JWT for `actingAs` and mints a fresh
    // token for the originating admin. If the call fails (e.g. 15-min
    // window expired), fall through to a hard logout so the user isn't
    // left in a broken state.
    try {
      const { data } = await api.post('/auth/end-impersonation');
      localStorage.setItem('uenr_token', data.data.token);
      localStorage.setItem('uenr_user', JSON.stringify(data.data.user));
      set({ token: data.data.token, user: data.data.user });
    } catch (e) {
      localStorage.removeItem('uenr_token');
      localStorage.removeItem('uenr_user');
      set({ user: null, token: null });
      throw e;
    }
  }
}));
