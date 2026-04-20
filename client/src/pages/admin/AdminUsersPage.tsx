import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Crown, Search, ShieldCheck, ShieldOff, CheckCircle2, X } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

type Role = 'STUDENT' | 'ALUMNI' | 'EMPLOYER' | 'ADMIN';

type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isApproved: boolean;
  isVerified: boolean;
  isSuperuser: boolean;
  programme: string | null;
  graduationYear: number | null;
  createdAt: string;
};

const ROLE_FILTERS: ({ key: 'all' | Role; label: string })[] = [
  { key: 'all', label: 'All' },
  { key: 'STUDENT', label: 'Students' },
  { key: 'ALUMNI', label: 'Alumni' },
  { key: 'EMPLOYER', label: 'Employers' },
  { key: 'ADMIN', label: 'Admins' }
];

export default function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get('/admin/users')).data.data
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        (u.programme ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const approveMut = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/admin/users/${id}/approve`)).data.data,
    onSuccess: () => { toast.success('User approved'); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); }
  });

  const superuserMut = useMutation({
    mutationFn: async (vars: { id: string; isSuperuser: boolean }) =>
      (await api.patch(`/admin/users/${vars.id}/superuser`, { isSuperuser: vars.isSuperuser })).data.data,
    onSuccess: (_d, vars) => {
      toast.success(vars.isSuperuser ? 'Promoted to superuser' : 'Demoted from superuser');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  const counts = useMemo(() => {
    const c = { total: users.length, admins: 0, employers: 0, alumni: 0, students: 0, superusers: 0, pending: 0 };
    for (const u of users) {
      if (u.role === 'ADMIN') c.admins++;
      else if (u.role === 'EMPLOYER') c.employers++;
      else if (u.role === 'ALUMNI') c.alumni++;
      else if (u.role === 'STUDENT') c.students++;
      if (u.isSuperuser) c.superusers++;
      if (!u.isApproved) c.pending++;
    }
    return c;
  }, [users]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-extrabold">Users &amp; roles</h1>
        <p className="text-sm text-[var(--muted)]">Approve registrations, change roles, promote superusers.</p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ['Total', counts.total],
          ['Admins', counts.admins],
          ['Employers', counts.employers],
          ['Alumni', counts.alumni],
          ['Students', counts.students],
          ['Superusers', counts.superusers]
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
            <div className="mt-1 font-heading text-2xl font-black">{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / email / programme…"
            className="input pl-9"
          />
        </label>
        {ROLE_FILTERS.map((r) => {
          const active = roleFilter === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setRoleFilter(r.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-[#065F46] bg-[#065F46] text-white'
                  : 'border-[var(--border)] bg-[var(--card)] hover:border-[#065F46]/50'
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Programme</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => {
              const isMe = u.id === me?.id;
              return (
                <motion.tr
                  key={u.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.01, 0.2) }}
                  className="border-b border-[var(--border)]/50 last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{u.firstName} {u.lastName}</div>
                      {u.isSuperuser && <Crown size={12} className="text-[#F59E0B]" aria-label="Superuser" />}
                      {isMe && <span className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)] border border-[var(--border)]">You</span>}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleBadge(u.role)}`}>
                      {u.role.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {u.programme ? `${u.programme}${u.graduationYear ? ` · ${u.graduationYear}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.isApproved
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"><CheckCircle2 size={10} /> approved</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"><X size={10} /> pending</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {!u.isApproved && (
                        <button
                          onClick={() => approveMut.mutate(u.id)}
                          disabled={approveMut.isPending}
                          className="btn-ghost text-xs"
                          title="Approve user"
                        >
                          Approve
                        </button>
                      )}
                      {me?.isSuperuser && u.role === 'ADMIN' && (
                        <button
                          onClick={() => {
                            const verb = u.isSuperuser ? 'demote' : 'promote';
                            if (confirm(`Type DEMOTE or PROMOTE to confirm. ${verb} ${u.firstName} ${u.lastName}?`)) {
                              superuserMut.mutate({ id: u.id, isSuperuser: !u.isSuperuser });
                            }
                          }}
                          disabled={superuserMut.isPending}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${u.isSuperuser ? 'border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30' : 'bg-[#F59E0B]/15 text-amber-700 hover:bg-[#F59E0B]/25 dark:text-[#F59E0B]'}`}
                          title={u.isSuperuser ? 'Demote from superuser' : 'Promote to superuser'}
                        >
                          {u.isSuperuser ? <><ShieldOff size={12} /> Demote</> : <><ShieldCheck size={12} /> Make superuser</>}
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-[var(--muted)]">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!me?.isSuperuser && (
        <div className="mt-4 rounded-xl border-l-4 border-l-[#F59E0B] bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
          You're an admin but not a superuser. Promote/demote actions are gated to superusers.
          The first admin to visit the admin area gets bootstrapped automatically — refresh if the
          crown icon hasn't appeared yet.
        </div>
      )}
    </div>
  );
}

function roleBadge(role: Role): string {
  switch (role) {
    case 'ADMIN': return 'bg-[#065F46] text-white';
    case 'EMPLOYER': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'ALUMNI': return 'bg-[#84CC16]/15 text-[#065F46] dark:text-[#84CC16]';
    case 'STUDENT': return 'bg-[var(--bg)] text-[var(--fg)]/70 border border-[var(--border)]';
  }
}
