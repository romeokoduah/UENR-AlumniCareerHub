// Admin → Users & roles. Phase 2 (Full User Management).
//
// Preserves Phase 1's layout (search, role filter chips, summary cards,
// table) and the promote/demote action; adds a per-row kebab menu for
// password reset, impersonation, suspend/unsuspend, soft-delete,
// hard-delete, force-logout, and data export. Also adds a "Bulk import
// users" flow that POSTs a CSV to the server twice — once dry-run for
// preview, then a real import.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Crown, Search, ShieldCheck, ShieldOff, CheckCircle2, X,
  MoreVertical, KeyRound, UserCog, Ban, RotateCcw, Trash2, LogOut,
  Download, UploadCloud, Copy, AlertTriangle, Loader2
} from 'lucide-react';
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
  suspendedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

const ROLE_FILTERS: ({ key: 'all' | Role; label: string })[] = [
  { key: 'all', label: 'All' },
  { key: 'STUDENT', label: 'Students' },
  { key: 'ALUMNI', label: 'Alumni' },
  { key: 'EMPLOYER', label: 'Employers' },
  { key: 'ADMIN', label: 'Admins' }
];

// Per-row modal state — discriminated union keeps each modal's payload
// strongly typed without giant nullable bags.
type ModalState =
  | { kind: 'none' }
  | { kind: 'reset'; user: AdminUser; resetUrl?: string; loading: boolean }
  | { kind: 'impersonate'; user: AdminUser }
  | { kind: 'suspend'; user: AdminUser }
  | { kind: 'unsuspend'; user: AdminUser }
  | { kind: 'softDelete'; user: AdminUser }
  | { kind: 'hardDelete'; user: AdminUser }
  | { kind: 'forceLogout'; user: AdminUser }
  | { kind: 'import' };

export default function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const impersonate = useAuthStore((s) => s.impersonate);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });

  const approveMut = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/admin/users/${id}/approve`)).data.data,
    onSuccess: () => { toast.success('User approved'); invalidate(); }
  });

  const superuserMut = useMutation({
    mutationFn: async (vars: { id: string; isSuperuser: boolean }) =>
      (await api.patch(`/admin/users/${vars.id}/superuser`, { isSuperuser: vars.isSuperuser })).data.data,
    onSuccess: (_d, vars) => {
      toast.success(vars.isSuperuser ? 'Promoted to superuser' : 'Demoted from superuser');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  const counts = useMemo(() => {
    const c = { total: users.length, admins: 0, employers: 0, alumni: 0, students: 0, superusers: 0, pending: 0, suspended: 0 };
    for (const u of users) {
      if (u.role === 'ADMIN') c.admins++;
      else if (u.role === 'EMPLOYER') c.employers++;
      else if (u.role === 'ALUMNI') c.alumni++;
      else if (u.role === 'STUDENT') c.students++;
      if (u.isSuperuser) c.superusers++;
      if (!u.isApproved) c.pending++;
      if (u.suspendedAt) c.suspended++;
    }
    return c;
  }, [users]);

  // Click-outside handler so the kebab menu closes when the user clicks
  // the table or page background. We lift it above the row to avoid
  // wiring it on every cell.
  useEffect(() => {
    if (!openMenuId) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-row-menu]')) setOpenMenuId(null);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [openMenuId]);

  // Mutations for each row action. Errors are surfaced via toast; the
  // active modal stays open so the operator can read the message and
  // either retry or cancel.
  const resetPasswordMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/users/${id}/reset-password`)).data.data as { token: string; resetUrl: string },
    onSuccess: (data, _id) => {
      setModal((m) => (m.kind === 'reset' ? { ...m, resetUrl: data.resetUrl, loading: false } : m));
      toast.success('Reset link generated — copy + send to user');
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to generate reset link');
      setModal((m) => (m.kind === 'reset' ? { ...m, loading: false } : m));
    }
  });

  const impersonateMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/users/${id}/impersonate`)).data.data as { token: string; user: any },
    onSuccess: (data) => {
      impersonate(data.token, data.user);
      toast.success(`Impersonating ${data.user.firstName} ${data.user.lastName}`);
      // Reload the dashboard fresh so all React Query caches reset.
      navigate('/dashboard');
      window.location.reload();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Impersonation failed')
  });

  const suspendMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/users/${id}/suspend`)).data.data,
    onSuccess: () => { toast.success('User suspended'); invalidate(); setModal({ kind: 'none' }); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  const unsuspendMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/users/${id}/unsuspend`)).data.data,
    onSuccess: () => { toast.success('User reinstated'); invalidate(); setModal({ kind: 'none' }); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  const softDeleteMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/users/${id}/soft-delete`)).data.data,
    onSuccess: () => { toast.success('User soft-deleted (PII anonymised)'); invalidate(); setModal({ kind: 'none' }); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  const hardDeleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/users/${id}`)).data.data,
    onSuccess: () => { toast.success('User permanently deleted'); invalidate(); setModal({ kind: 'none' }); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  const forceLogoutMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/users/${id}/force-logout`)).data.data,
    onSuccess: () => { toast.success('All sessions revoked'); invalidate(); setModal({ kind: 'none' }); },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed')
  });

  // Browser-side blob download — fetches the JSON export with the
  // current Authorization header (axios) and converts the response to a
  // download trigger.
  const handleExport = async (u: AdminUser) => {
    try {
      const resp = await api.get(`/admin/users/${u.id}/export`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-${u.id}-export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Export failed');
    }
  };

  const openMenuFor = (id: string) => {
    setOpenMenuId((cur) => (cur === id ? null : id));
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold">Users &amp; roles</h1>
          <p className="text-sm text-[var(--muted)]">Approve registrations, change roles, suspend, impersonate, export.</p>
        </div>
        {me?.isSuperuser && (
          <button
            onClick={() => setModal({ kind: 'import' })}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold hover:border-[#065F46]"
          >
            <UploadCloud size={15} /> Bulk import users
          </button>
        )}
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-7">
        {[
          ['Total', counts.total],
          ['Admins', counts.admins],
          ['Employers', counts.employers],
          ['Alumni', counts.alumni],
          ['Students', counts.students],
          ['Superusers', counts.superusers],
          ['Suspended', counts.suspended]
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
              const isSuspended = !!u.suspendedAt;
              const isDeleted = !!u.deletedAt;
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
                      {isDeleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                          <Trash2 size={10} /> deleted
                        </span>
                      )}
                      {isSuspended && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          <Ban size={10} /> suspended
                        </span>
                      )}
                      {!isDeleted && !isSuspended && (u.isApproved
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]"><CheckCircle2 size={10} /> approved</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"><X size={10} /> pending</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {!u.isApproved && !isDeleted && (
                        <button
                          onClick={() => approveMut.mutate(u.id)}
                          disabled={approveMut.isPending}
                          className="btn-ghost text-xs"
                          title="Approve user"
                        >
                          Approve
                        </button>
                      )}
                      {me?.isSuperuser && u.role === 'ADMIN' && !isDeleted && (
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
                      {me?.isSuperuser && (
                        <RowMenu
                          user={u}
                          isMe={isMe}
                          isOpen={openMenuId === u.id}
                          onToggle={() => openMenuFor(u.id)}
                          onAction={(action) => {
                            setOpenMenuId(null);
                            if (action === 'reset') setModal({ kind: 'reset', user: u, loading: false });
                            else if (action === 'impersonate') setModal({ kind: 'impersonate', user: u });
                            else if (action === 'suspend') setModal({ kind: 'suspend', user: u });
                            else if (action === 'unsuspend') setModal({ kind: 'unsuspend', user: u });
                            else if (action === 'softDelete') setModal({ kind: 'softDelete', user: u });
                            else if (action === 'hardDelete') setModal({ kind: 'hardDelete', user: u });
                            else if (action === 'forceLogout') setModal({ kind: 'forceLogout', user: u });
                            else if (action === 'export') handleExport(u);
                          }}
                        />
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
          You're an admin but not a superuser. Promote/demote and destructive actions are gated to superusers.
          The first admin to visit the admin area gets bootstrapped automatically — refresh if the
          crown icon hasn't appeared yet.
        </div>
      )}

      <AnimatePresence>
        {modal.kind === 'reset' && (
          <ResetPasswordModal
            user={modal.user}
            resetUrl={modal.resetUrl}
            loading={modal.loading}
            onGenerate={() => {
              setModal({ ...modal, loading: true });
              resetPasswordMut.mutate(modal.user.id);
            }}
            onClose={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'impersonate' && (
          <TypedConfirmModal
            title={`Impersonate ${modal.user.firstName} ${modal.user.lastName}?`}
            description="Type IMPERSONATE to confirm. You will be signed in as this user for 15 minutes. A red banner will appear at the top of the page until you end the session."
            confirmWord="IMPERSONATE"
            confirmLabel="Impersonate"
            confirmVariant="primary"
            busy={impersonateMut.isPending}
            onConfirm={() => impersonateMut.mutate(modal.user.id)}
            onCancel={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'suspend' && (
          <TypedConfirmModal
            title={`Suspend ${modal.user.firstName} ${modal.user.lastName}?`}
            description="Type SUSPEND to confirm. The user will be unable to sign in or use the platform until you reinstate them."
            confirmWord="SUSPEND"
            confirmLabel="Suspend"
            confirmVariant="warn"
            busy={suspendMut.isPending}
            onConfirm={() => suspendMut.mutate(modal.user.id)}
            onCancel={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'unsuspend' && (
          <TypedConfirmModal
            title={`Reinstate ${modal.user.firstName} ${modal.user.lastName}?`}
            description="Type UNSUSPEND to confirm. The user will regain access immediately."
            confirmWord="UNSUSPEND"
            confirmLabel="Unsuspend"
            confirmVariant="primary"
            busy={unsuspendMut.isPending}
            onConfirm={() => unsuspendMut.mutate(modal.user.id)}
            onCancel={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'softDelete' && (
          <TypedConfirmModal
            title={`Soft-delete ${modal.user.firstName} ${modal.user.lastName}?`}
            description="Type DELETE to confirm. PII (email, name, phone, bio, LinkedIn, student ID, avatar) will be anonymised and the user will be unable to sign in. Their content rows will remain owned by an anonymous shell record."
            confirmWord="DELETE"
            confirmLabel="Soft-delete"
            confirmVariant="warn"
            busy={softDeleteMut.isPending}
            onConfirm={() => softDeleteMut.mutate(modal.user.id)}
            onCancel={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'hardDelete' && (
          <TypedConfirmModal
            title={`Permanently delete ${modal.user.firstName} ${modal.user.lastName}?`}
            description="Type PERMANENTLY DELETE to confirm. This wipes the user row AND every related record (applications, CVs, posts, achievements, freelance bids, vault docs, etc.). Cannot be undone."
            confirmWord="PERMANENTLY DELETE"
            confirmLabel="Permanently delete"
            confirmVariant="danger"
            busy={hardDeleteMut.isPending}
            onConfirm={() => hardDeleteMut.mutate(modal.user.id)}
            onCancel={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'forceLogout' && (
          <TypedConfirmModal
            title={`Force-logout ${modal.user.firstName} ${modal.user.lastName} everywhere?`}
            description="Type LOGOUT to confirm. Every active JWT for this user (browsers, mobile, API clients) will be invalidated on its next request."
            confirmWord="LOGOUT"
            confirmLabel="Force logout"
            confirmVariant="warn"
            busy={forceLogoutMut.isPending}
            onConfirm={() => forceLogoutMut.mutate(modal.user.id)}
            onCancel={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'import' && (
          <BulkImportModal onClose={() => { setModal({ kind: 'none' }); invalidate(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============ Row kebab menu ============

type RowMenuAction = 'reset' | 'impersonate' | 'suspend' | 'unsuspend' | 'softDelete' | 'hardDelete' | 'forceLogout' | 'export';

function RowMenu({
  user, isMe, isOpen, onToggle, onAction
}: {
  user: AdminUser;
  isMe: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onAction: (action: RowMenuAction) => void;
}) {
  const isSuspended = !!user.suspendedAt;
  const isDeleted = !!user.deletedAt;

  return (
    <div className="relative" data-row-menu>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 hover:bg-black/5 dark:hover:bg-white/5"
        title="More actions"
      >
        <MoreVertical size={14} />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
          <MenuItem icon={<KeyRound size={13} />} disabled={isDeleted} onClick={() => onAction('reset')}>
            Force password reset
          </MenuItem>
          <MenuItem icon={<UserCog size={13} />} disabled={isDeleted || isMe || isSuspended} onClick={() => onAction('impersonate')}>
            Impersonate
          </MenuItem>
          {isSuspended ? (
            <MenuItem icon={<RotateCcw size={13} />} disabled={isDeleted} onClick={() => onAction('unsuspend')}>
              Unsuspend
            </MenuItem>
          ) : (
            <MenuItem icon={<Ban size={13} />} disabled={isDeleted || isMe} onClick={() => onAction('suspend')}>
              Suspend
            </MenuItem>
          )}
          <MenuItem icon={<LogOut size={13} />} disabled={isDeleted} onClick={() => onAction('forceLogout')}>
            Force logout everywhere
          </MenuItem>
          <MenuItem icon={<Download size={13} />} onClick={() => onAction('export')}>
            Download data export
          </MenuItem>
          <div className="border-t border-[var(--border)]" />
          <MenuItem icon={<Trash2 size={13} />} danger disabled={isMe || isDeleted} onClick={() => onAction('softDelete')}>
            Soft-delete (anonymise)
          </MenuItem>
          <MenuItem icon={<Trash2 size={13} />} danger disabled={isMe} onClick={() => onAction('hardDelete')}>
            Hard-delete (permanent)
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon, children, onClick, danger, disabled
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition ${
        disabled
          ? 'cursor-not-allowed text-[var(--muted)]'
          : danger
            ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
            : 'text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/5'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </button>
  );
}

// ============ Modals ============

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function TypedConfirmModal({
  title, description, confirmWord, confirmLabel, confirmVariant = 'primary',
  busy, onConfirm, onCancel
}: {
  title: string;
  description: string;
  confirmWord: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'warn' | 'danger';
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const matches = text.trim() === confirmWord;
  const buttonClass = confirmVariant === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : confirmVariant === 'warn'
      ? 'bg-orange-600 hover:bg-orange-700 text-white'
      : 'bg-[#065F46] hover:bg-[#054b38] text-white';

  return (
    <ModalShell onClose={onCancel}>
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20} />
          <h3 className="font-heading text-lg font-extrabold leading-tight">{title}</h3>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-sm text-[var(--fg)]/80">{description}</p>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            Type <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--fg)]">{confirmWord}</code> to confirm
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input w-full"
            autoFocus
            placeholder={confirmWord}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button onClick={onCancel} className="btn-ghost text-sm" disabled={busy}>Cancel</button>
        <button
          onClick={onConfirm}
          disabled={!matches || busy}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${buttonClass}`}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function ResetPasswordModal({
  user, resetUrl, loading, onGenerate, onClose
}: {
  user: AdminUser;
  resetUrl?: string;
  loading: boolean;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!resetUrl) return;
    try {
      await navigator.clipboard.writeText(resetUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the text and copy manually');
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="font-heading text-lg font-extrabold">Force password reset</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          For <span className="font-semibold text-[var(--fg)]">{user.firstName} {user.lastName}</span> ({user.email})
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {!resetUrl && (
          <>
            <p className="text-sm text-[var(--fg)]/80">
              Generates a one-time link the user can use to set a new password. The link expires in 24 hours.
            </p>
            <div className="rounded-xl border-l-4 border-l-amber-500 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              SMTP isn't wired up in v1 — you'll need to copy the link below and send it to the user manually
              (email, WhatsApp, in person, etc.).
            </div>
          </>
        )}
        {resetUrl && (
          <>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Reset URL (expires in 24h)</label>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={resetUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="input flex-1 font-mono text-xs"
              />
              <button
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold uppercase tracking-wider hover:border-[#065F46]"
              >
                <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="rounded-xl border-l-4 border-l-amber-500 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              Send this to the user manually — there's no email in v1.
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button onClick={onClose} className="btn-ghost text-sm">{resetUrl ? 'Done' : 'Cancel'}</button>
        {!resetUrl && (
          <button
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-sm font-bold text-white hover:bg-[#054b38] disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Generate reset link
          </button>
        )}
      </div>
    </ModalShell>
  );
}

// ============ Bulk import modal ============

type ImportPreviewRow = {
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  programme: string | null;
  graduationYear: number | null;
};

type ImportError = { row: number; message: string };

type ImportPreviewResult = {
  dryRun: true;
  totals: { rows: number; valid: number; errors: number };
  preview: ImportPreviewRow[];
  errors: ImportError[];
};

type ImportConfirmResult = {
  dryRun: false;
  totals: { rows: number; valid: number; errors: number; created: number };
  created: { id: string; email: string; resetUrl: string }[];
  errors: ImportError[];
};

function BulkImportModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [confirmed, setConfirmed] = useState<ImportConfirmResult | null>(null);
  const [busy, setBusy] = useState(false);

  const runUpload = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dryRun', dryRun ? 'true' : 'false');
      const resp = await api.post('/admin/users/import-csv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (dryRun) setPreview(resp.data.data as ImportPreviewResult);
      else {
        setConfirmed(resp.data.data as ImportConfirmResult);
        toast.success(`Imported ${resp.data.data.totals?.created ?? 0} users`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'CSV upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setConfirmed(null);
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="font-heading text-lg font-extrabold">Bulk import users</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          CSV with header <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 text-[11px]">email,firstName,lastName,role,programme,graduationYear</code>.
          Quoted fields are not supported.
        </p>
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
        {!confirmed && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#065F46] file:px-4 file:py-2 file:font-bold file:text-white hover:file:bg-[#054b38]"
            />
            {file && (
              <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                <span>{file.name} · {(file.size / 1024).toFixed(1)} KB</span>
                {!preview && (
                  <button
                    onClick={() => runUpload(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#054b38] disabled:opacity-50"
                  >
                    {busy && <Loader2 size={12} className="animate-spin" />}
                    Validate (dry run)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {preview && !confirmed && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Rows" value={preview.totals.rows} />
              <Stat label="Valid" value={preview.totals.valid} tone="ok" />
              <Stat label="Errors" value={preview.totals.errors} tone={preview.totals.errors ? 'warn' : 'neutral'} />
            </div>

            {preview.preview.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Preview (first {preview.preview.length})
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--bg)] text-left text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      <tr>
                        <th className="px-2 py-1.5">#</th>
                        <th className="px-2 py-1.5">Email</th>
                        <th className="px-2 py-1.5">Name</th>
                        <th className="px-2 py-1.5">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map((r) => (
                        <tr key={r.rowNumber} className="border-t border-[var(--border)]/50">
                          <td className="px-2 py-1 text-[var(--muted)]">{r.rowNumber}</td>
                          <td className="px-2 py-1">{r.email}</td>
                          <td className="px-2 py-1">{r.firstName} {r.lastName}</td>
                          <td className="px-2 py-1">{r.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {preview.errors.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-rose-600">
                  Errors ({preview.errors.length})
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-rose-200 dark:border-rose-900">
                  <table className="w-full text-xs">
                    <tbody>
                      {preview.errors.map((e, i) => (
                        <tr key={i} className="border-t border-rose-200/50 dark:border-rose-900/50">
                          <td className="px-2 py-1 text-[var(--muted)]">Row {e.row}</td>
                          <td className="px-2 py-1 text-rose-700 dark:text-rose-300">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {confirmed && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Created" value={confirmed.totals.created} tone="ok" />
              <Stat label="Skipped" value={confirmed.totals.errors} tone={confirmed.totals.errors ? 'warn' : 'neutral'} />
              <Stat label="Total rows" value={confirmed.totals.rows} />
            </div>
            {confirmed.created.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Reset links (share with each user manually)
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full text-xs">
                    <tbody>
                      {confirmed.created.map((c) => (
                        <tr key={c.id} className="border-t border-[var(--border)]/50">
                          <td className="px-2 py-1 font-semibold">{c.email}</td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => { navigator.clipboard.writeText(c.resetUrl).then(() => toast.success('Copied')); }}
                              className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold hover:border-[#065F46]"
                            >
                              <Copy size={10} /> Copy reset link
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button onClick={onClose} className="btn-ghost text-sm">{confirmed ? 'Done' : 'Cancel'}</button>
        {preview && !confirmed && preview.totals.valid > 0 && (
          <button
            onClick={() => runUpload(false)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#065F46] px-4 py-2 text-sm font-bold text-white hover:bg-[#054b38] disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Confirm import ({preview.totals.valid} {preview.totals.valid === 1 ? 'user' : 'users'})
          </button>
        )}
      </div>
    </ModalShell>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'ok' | 'warn' }) {
  const cls =
    tone === 'ok' ? 'text-[#065F46] dark:text-[#84CC16]' :
    tone === 'warn' ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--fg)]';
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className={`font-heading text-xl font-black ${cls}`}>{value}</div>
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
