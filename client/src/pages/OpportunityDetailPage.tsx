import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock, Building, ArrowLeft, Bookmark, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import type { Opportunity } from '../types';

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery<Opportunity>({
    queryKey: ['opportunity', id],
    queryFn: async () => (await api.get(`/opportunities/${id}`)).data.data
  });

  const apply = async () => {
    if (!user) return navigate('/login');
    // External listings (ingested aggregator jobs + any user-posted job that
    // points at an external ATS) don't accept in-app applications — the
    // employer collects candidates on their own site. Send the user there.
    if (data?.applicationUrl) {
      // Fire-and-forget a "clickthrough" audit so the employer's analytics
      // still see a referral, without blocking the browser tab-open.
      api.post(`/opportunities/${id}/clickthrough`, {}).catch(() => { /* best-effort */ });
      window.open(data.applicationUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // Fallback: in-app apply flow (used by alumni-posted roles without an
    // external application URL).
    try {
      await api.post(`/opportunities/${id}/apply`, {});
      toast.success('Application submitted! 🎉');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Could not apply');
    }
  };

  const bookmark = async () => {
    if (!user) return navigate('/login');
    try {
      const { data } = await api.post(`/opportunities/${id}/bookmark`);
      toast.success(data.data.bookmarked ? 'Bookmarked!' : 'Removed bookmark');
    } catch { toast.error('Failed'); }
  };

  if (isLoading || !data) return <div className="mx-auto max-w-4xl px-4 py-10"><div className="skeleton h-96" /></div>;

  const daysLeft = data.deadline
    ? Math.max(0, Math.ceil((new Date(data.deadline).getTime() - Date.now()) / 86400000))
    : null;
  const isExternal = !!data.applicationUrl;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <button onClick={() => navigate(-1)} className="btn-ghost text-sm mb-4">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-[#065F46] dark:text-[#84CC16]">{data.company}</div>
            <h1 className="mt-1 font-heading text-3xl font-bold">{data.title}</h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--muted)]">
              <span className="inline-flex items-center gap-1"><MapPin size={14} /> {data.location} · {data.locationType.toLowerCase()}</span>
              <span className="inline-flex items-center gap-1"><Building size={14} /> {data.type.replace('_', ' ').toLowerCase()}</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={14} />
                {daysLeft === null ? 'Rolling' : `${daysLeft}d left`}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={bookmark} className="btn-ghost"><Bookmark size={16} /></button>
            <button onClick={apply} className="btn-primary inline-flex items-center gap-2">
              {isExternal ? <>Apply on source site <ExternalLink size={14} /></> : 'Quick Apply'}
            </button>
          </div>
        </div>

        {(data.salaryMin || data.salaryMax) && (
          <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm font-semibold text-amber-900 dark:text-amber-200 inline-block">
            💰 {data.currency || 'GHS'} {data.salaryMin?.toLocaleString()} – {data.salaryMax?.toLocaleString()} / month
          </div>
        )}

        <div className="mt-6 prose prose-stone dark:prose-invert max-w-none">
          <h3 className="font-heading font-bold">About the role</h3>
          <p className="whitespace-pre-wrap text-[var(--fg)]">{data.description}</p>
        </div>

        {data.requiredSkills?.length > 0 && (
          <div className="mt-6">
            <h3 className="font-heading font-bold mb-2">Required skills</h3>
            <div className="flex flex-wrap gap-2">
              {data.requiredSkills.map((s) => <span key={s} className="badge-emerald">{s}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
