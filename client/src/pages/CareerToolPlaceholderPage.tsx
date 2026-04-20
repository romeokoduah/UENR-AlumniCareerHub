import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { findCareerTool } from '../content/careerTools';

export default function CareerToolPlaceholderPage() {
  const params = useParams();
  const slug = params['*'] ?? '';
  const tool = findCareerTool(slug);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!tool) return;
    if (tool.employerOnly && user?.role !== 'EMPLOYER' && user?.role !== 'ADMIN') return;
    api.post('/career-tools/activity', { tool: tool.slug, action: 'open' }).catch(() => {});
  }, [tool, user?.role]);

  if (!tool) {
    return <Navigate to="/career-tools" replace />;
  }

  if (tool.employerOnly && user?.role !== 'EMPLOYER' && user?.role !== 'ADMIN') {
    return <Navigate to="/career-tools" replace />;
  }

  const Icon = tool.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/career-tools" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        <ArrowLeft size={14} /> Career Tools
      </Link>

      <div className="mt-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          <Icon size={28} />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-extrabold leading-tight">{tool.name}</h1>
          <p className="text-sm text-[var(--muted)]">{tool.description}</p>
        </div>
      </div>

      <div className="mt-10 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
        <Construction size={32} className="mx-auto text-[#F59E0B]" />
        <h2 className="mt-4 font-heading text-xl font-bold">Shipping in Phase {tool.phase}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
          The hub is live now so you can see what's coming. This tool is being built in
          the next round of work — check back shortly.
        </p>
        <Link to="/career-tools" className="btn-primary mt-6 inline-flex">Back to all tools</Link>
      </div>
    </div>
  );
}
