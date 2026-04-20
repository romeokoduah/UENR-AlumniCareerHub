import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth';

// Sticky red bar shown to a superuser who is currently impersonating
// another user. Only renders when `user.actingAs` is present (set by the
// /admin/users/:id/impersonate endpoint and surfaced via /auth/me).
export function ImpersonationBanner() {
  const user = useAuthStore((s) => s.user);
  const endImpersonation = useAuthStore((s) => s.endImpersonation);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!user?.actingAs) return null;

  const handleEnd = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await endImpersonation();
      toast.success('Returned to your admin account');
      navigate('/admin/users');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Could not end impersonation. Please log in again.');
      navigate('/login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-rose-700 bg-rose-600 px-4 py-2 text-white shadow-lg">
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <ShieldAlert size={16} className="shrink-0" />
        <span className="truncate">
          Impersonating <span className="underline">{user.firstName} {user.lastName}</span>
          <span className="ml-2 hidden text-xs font-normal text-white/80 sm:inline">
            — every action you take will be attributed to this user.
          </span>
        </span>
      </div>
      <button
        onClick={handleEnd}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/25 disabled:opacity-60"
      >
        <LogOut size={12} />
        {busy ? 'Ending…' : 'End impersonation'}
      </button>
    </div>
  );
}
