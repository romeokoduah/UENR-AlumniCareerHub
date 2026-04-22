import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';

export default function PostScholarshipPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    provider: '',
    description: '',
    eligibility: '',
    deadline: '',
    awardAmount: '',
    applicationUrl: '',
    level: 'UNDERGRAD',
    fieldOfStudy: '',
    location: '',
    tagsInput: ''
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { tagsInput, ...rest } = form;
      const payload = {
        ...rest,
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
        deadline: new Date(form.deadline).toISOString()
      };
      const { data } = await api.post('/scholarships', payload);
      toast.success('Scholarship posted!');
      navigate(`/scholarships`);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to post');
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold mb-6">Post a scholarship</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="text-xs font-semibold">Title</label>
          <input className="input mt-1" value={form.title} onChange={(e) => set('title', e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold">Provider / Organization</label>
            <input className="input mt-1" value={form.provider} onChange={(e) => set('provider', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">Level</label>
            <select className="input mt-1" value={form.level} onChange={(e) => set('level', e.target.value)}>
              <option value="UNDERGRAD">Undergrad</option>
              <option value="MASTERS">Masters</option>
              <option value="PHD">PhD</option>
              <option value="POSTDOC">Postdoc</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold">Deadline</label>
            <input type="date" className="input mt-1" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">Award Amount (optional)</label>
            <input className="input mt-1" value={form.awardAmount} onChange={(e) => set('awardAmount', e.target.value)} placeholder="e.g. GHS 5,000/year" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">Application URL</label>
          <input type="url" className="input mt-1" value={form.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold">Field of Study (optional)</label>
            <input className="input mt-1" value={form.fieldOfStudy} onChange={(e) => set('fieldOfStudy', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold">Location (optional)</label>
            <input className="input mt-1" value={form.location} onChange={(e) => set('location', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">Tags (comma-separated)</label>
          <input className="input mt-1" value={form.tagsInput} onChange={(e) => set('tagsInput', e.target.value)} placeholder="STEM, international, Ghana…" />
        </div>
        <div>
          <label className="text-xs font-semibold">Eligibility</label>
          <textarea className="input mt-1 min-h-[80px]" value={form.eligibility} onChange={(e) => set('eligibility', e.target.value)} required />
        </div>
        <div>
          <label className="text-xs font-semibold">Description</label>
          <textarea className="input mt-1 min-h-[120px]" value={form.description} onChange={(e) => set('description', e.target.value)} required minLength={20} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Posting…' : 'Post scholarship'}
        </button>
      </form>
    </div>
  );
}
