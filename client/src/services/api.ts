import axios from 'axios';

// In dev, Vite proxies /api → localhost:4000. In prod, set VITE_API_URL
// to your deployed backend origin. Accepts either a full URL
// ("https://api.example.com") or a bare hostname ("api.onrender.com" —
// which is what Render's fromService blueprint injection produces).
const raw = (import.meta.env.VITE_API_URL || '').trim();
const normalized = raw
  ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/$/, '')
  : '';

const API_BASE = normalized ? `${normalized}/api` : '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

// Public backend origin — used to resolve /uploads/... image URLs in prod.
// Falls back to same-origin for dev (Vite proxies /uploads → :4000).
export const BACKEND_ORIGIN = normalized;

// Turn a backend-relative URL like "/uploads/foo.png" into an absolute URL
// when BACKEND_ORIGIN is set; leave it alone for dev/same-origin.
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
