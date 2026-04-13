import { NavLink } from 'react-router-dom';
import { Home, Briefcase, GraduationCap, Users, User } from 'lucide-react';

const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/opportunities', label: 'Jobs', icon: Briefcase },
  { to: '/scholarships', label: 'Scholar', icon: GraduationCap },
  { to: '/mentors', label: 'Mentors', icon: Users },
  { to: '/profile', label: 'Me', icon: User }
];

export function MobileTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur md:hidden">
      <div className="flex justify-around">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-semibold ${
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
