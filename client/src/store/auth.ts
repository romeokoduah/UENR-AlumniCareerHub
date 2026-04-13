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
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  hydrate: () => {
    const token = localStorage.getItem('uenr_token');
    const user = localStorage.getItem('uenr_user');
    if (token && user) set({ token, user: JSON.parse(user) });
  },
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
  }
}));
