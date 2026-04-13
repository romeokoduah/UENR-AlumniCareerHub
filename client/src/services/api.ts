import axios from 'axios';

// In dev, Vite proxies /api → localhost:4000. In prod (Vercel), set
// VITE_API_URL to your deployed backend origin, e.g.
// VITE_API_URL=https://uenr-career-hub-api.up.railway.app
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

// Public backend origin — used to resolve /uploads/... image URLs in prod.
// Falls back to same-origin for dev (Vite proxies /uploads → :4000).
export const BACKEND_ORIGIN = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '';

// Turn a backend-relative URL like "/uploads/foo.png" into an absolute URL
// when VITE_API_URL is set; leave it alone for dev/same-origin.
export const resolveAsset = (url?: string | null): string => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/') && BACKEND_ORIGIN) return BACKEND_ORIGIN + url;
  return url;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('uenr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('uenr_token');
      localStorage.removeItem('uenr_user');
    }
    return Promise.reject(error);
  }
);

export const unwrap = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);
