import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, Moon, Sun, LogOut, User as UserIcon, Search } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';

const navLinks = [
  { to: '/opportunities', label: 'Jobs' },
  { to: '/scholarships', label: 'Scholarships' },
  { to: '/mentors', label: 'Mentors' },
  { to: '/career-tools', label: 'Career Tools' },
  { to: '/events', label: 'Events' },
  { to: '/directory', label: 'Alumni' }
];

export function Navbar() {
  const { user, logout } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#065F46] text-white font-bold">U</div>
          <span className="font-heading text-lg font-bold hidden sm:inline">UENR Career Hub</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-[#065F46] text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={toggle} className="btn-ghost p-2" aria-label="Toggle theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <>
              <button className="btn-ghost p-2 relative" aria-label="Notifications">
                <Bell size={18} />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#FB7185] animate-pulse" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#84CC16] text-[#1C1917] font-bold"
                >
                  {user.firstName[0]}{user.lastName[0]}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg">
                    <div className="px-3 py-2 text-sm">
                      <div className="font-semibold">{user.firstName} {user.lastName}</div>
                      <div className="text-xs text-[var(--muted)]">{user.role}</div>
                    </div>
                    <hr className="border-[var(--border)] my-1" />
                    <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">Dashboard</Link>
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                      <span className="inline-flex items-center gap-2"><UserIcon size={14} /> Profile</span>
                    </Link>
                    {user.role === 'ADMIN' && (
                      <Link to="/admin" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">Admin</Link>
                    )}
                    <button onClick={() => { logout(); setMenuOpen(false); navigate('/'); }} className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                      <span className="inline-flex items-center gap-2"><LogOut size={14} /> Log out</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-sm hidden sm:inline-flex">Log in</Link>
              <Link to="/register" className="btn-primary text-sm">Join free</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
