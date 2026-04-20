import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users as UsersIcon, ShieldAlert, Database,
  HeartHandshake, BriefcaseBusiness, SlidersHorizontal, BarChart3,
  Activity, Briefcase, Image as ImageIcon, BookOpen, Trophy,
  Crown
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

type BootstrapResponse = { promoted: boolean; isSuperuser: boolean; existingCount?: number };

const SECTIONS: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  status?: 'beta' | 'soon';
  end?: boolean;
}[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users & roles', icon: UsersIcon },
  { to: '/admin/opportunities', label: 'Opportunities', icon: Briefcase },
  { to: '/admin/landing', label: 'Landing page', icon: ImageIcon },
  { to: '/admin/learning', label: 'Learning queue', icon: BookOpen },
  { to: '/admin/achievements', label: 'Achievements queue', icon: Trophy },
  { to: '/admin/moderation', label: 'Universal moderation', icon: ShieldAlert, status: 'soon' },
  { to: '/admin/data', label: 'Tool data', icon: Database, status: 'soon' },
  { to: '/admin/services', label: 'Career Services', icon: HeartHandshake, status: 'soon' },
  { to: '/admin/ats', label: 'ATS oversight', icon: BriefcaseBusiness, status: 'soon' },
  { to: '/admin/site', label: 'Site config', icon: SlidersHorizontal, status: 'soon' },
  { to: '/admin/insights', label: 'Insights & audit', icon: BarChart3, status: 'soon' },
  { to: '/admin/system', label: 'System health', icon: Activity, status: 'soon' }
];

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  // One-shot bootstrap: if no superuser exists yet, promote the first
  // ADMIN that visits the admin area. Idempotent on the server side.
  useQuery<BootstrapResponse>({
    queryKey: ['admin', 'bootstrap-superuser'],
    queryFn: async () => {
      const { data } = await api.post('/admin/bootstrap-superuser');
      return data.data as BootstrapResponse;
    },
    staleTime: Infinity,
    retry: false
  });

  // After bootstrap might have flipped isSuperuser server-side, refresh the
  // local auth store so the crown badge appears without needing a re-login.
  useEffect(() => {
    if (user && !user.isSuperuser) {
      refreshMe().catch(() => { /* ignore */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-20 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="mb-3 flex items-center gap-2 px-2 pt-1">
            <Crown size={16} className="text-[#F59E0B]" />
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              {user?.isSuperuser ? 'Superuser' : 'Admin'}
            </div>
          </div>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map(({ to, label, icon: Icon, status, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `group flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[#065F46] text-white'
                      : 'text-[var(--fg)]/80 hover:bg-black/5 dark:hover:bg-white/5'
                  }`
                }
              >
                <span className="inline-flex items-center gap-2">
                  <Icon size={15} /> {label}
                </span>
                {status === 'soon' && (
                  <span className="rounded-full bg-[var(--bg)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">
                    Soon
                  </span>
                )}
                {status === 'beta' && (
                  <span className="rounded-full bg-[#F59E0B]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-[#F59E0B]">
                    Beta
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile: scrollable section pill row */}
        <div
          className="mb-4 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {SECTIONS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'border-[#065F46] bg-[#065F46] text-white'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)]/75 hover:border-[#065F46]/50'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        <Outlet />
      </div>
    </div>
  );
}
