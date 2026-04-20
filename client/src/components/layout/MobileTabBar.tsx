import { NavLink } from 'react-router-dom';
import {
  Home, Briefcase, GraduationCap, Users, Wrench, CalendarDays, Network, User
} from 'lucide-react';

const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/opportunities', label: 'Jobs', icon: Briefcase },
  { to: '/scholarships', label: 'Scholar', icon: GraduationCap },
  { to: '/career-tools', label: 'Tools', icon: Wrench },
  { to: '/mentors', label: 'Mentors', icon: Users },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/directory', label: 'Alumni', icon: Network },
  { to: '/profile', label: 'Me', icon: User }
];

export function MobileTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur md:hidden">
      <div
        className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-w-[72px] shrink-0 flex-col items-center gap-1 py-2.5 px-3 text-xs font-semibold ${
                isActive ? 'text-[#065F46] dark:text-[#84CC16]' : 'text-[var(--muted)]'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
