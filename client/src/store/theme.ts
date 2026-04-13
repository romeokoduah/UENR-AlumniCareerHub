import { create } from 'zustand';

type ThemeState = { dark: boolean; toggle: () => void; init: () => void };

export const useThemeStore = create<ThemeState>((set, get) => ({
  dark: false,
  init: () => {
    const stored = localStorage.getItem('uenr_theme');
    const dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    set({ dark });
  },
  toggle: () => {
    const dark = !get().dark;
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('uenr_theme', dark ? 'dark' : 'light');
    set({ dark });
  }
}));
