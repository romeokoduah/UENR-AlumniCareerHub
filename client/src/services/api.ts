import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

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
