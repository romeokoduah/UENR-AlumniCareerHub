// Tiny React-Query backed hook for reading site feature flags.
// /api/admin/site/feature-flags is intentionally public-read so the
// hook works on first paint without auth.

import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

type FlagValue = boolean | string | number;

export function useFeatureFlag<T extends FlagValue>(key: string, fallback: T): T {
  const { data } = useQuery<Record<string, FlagValue>>({
    queryKey: ['site', 'feature-flags'],
    queryFn: async () => (await api.get('/admin/site/feature-flags')).data.data ?? {},
    staleTime: 5 * 60 * 1000
  });
  const value = data?.[key];
  if (value == null) return fallback;
  return value as T;
}
