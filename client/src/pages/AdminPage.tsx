import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Briefcase, ArrowUpRight, Image } from 'lucide-react';
import { api } from '../services/api';

type Stats = { users: number; opportunities: number; applications: number; sessions: number; events: number };

export default function AdminPage() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data.data
  });

  const { data: users = [], refetch } = useQuery<any[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get('/admin/users')).data.data
  });

  const approve = async (id: string) => {
    try {
      await api.patch(`/admin/users/${id}/approve`);
      toast.success('User approved');
      refetch();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats && Object.entries(stats).map(([k, v]) => (
          <div key={k} className="card">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{k}</div>
            <div className="mt-2 font-heading text-3xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          to="/admin/opportunities"
          className="group card-hover flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#065F46] text-white">
              <Briefcase size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold">Opportunities editor</h3>
              <p className="text-sm text-[var(--muted)]">Edit, approve, hide, or delete every post across the board.</p>
            </div>
          </div>
          <ArrowUpRight size={18} className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--fg)]" />
        </Link>

        <Link
          to="/admin/landing"
          className="group card-hover flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#84CC16] text-[#1C1917]">
              <Image size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold">Landing page editor</h3>
              <p className="text-sm text-[var(--muted)]">Swap hero photos, alumni portraits, headlines, and the story section.</p>
            </div>
          </div>
          <ArrowUpRight size={18} className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--fg)]" />
        </Link>
      </div>

      <div className="card mt-8">
        <h2 className="font-heading text-xl font-bold mb-4">Users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--muted)]">
                <th className="pb-2">Name</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border)]/50">
                  <td className="py-2">{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td><span className="badge-emerald">{u.role}</span></td>
                  <td>{u.isApproved ? <span className="badge-lime">Approved</span> : <span className="badge-coral">Pending</span>}</td>
                  <td>{!u.isApproved && <button onClick={() => approve(u.id)} className="btn-accent text-xs py-1 px-2">Approve</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
