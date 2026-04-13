import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';

export default function PostOpportunityPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', company: '', location: '',
    locationType: 'ONSITE', type: 'FULL_TIME',
    deadline: '', industry: '', requiredSkillsInput: '', applicationUrl: ''
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        requiredSkills: form.requiredSkillsInput.split(',').map((s) => s.trim()).filter(Boolean),
        deadline: new Date(form.deadline).toISOString()
      };
      const { data } = await api.post('/opportunities', payload);
      toast.success('Posted!');
      navigate(`/opportunities/${data.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to post');
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold mb-6">Post an opportunity</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="text-xs font-semibold">Title</label>
          <input className="input mt-1" value={form.title} onChange={(e) => set('title', e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold">Company</label>
            <input className="input mt-1" value={form.company} onChange={(e) => set('company', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">Industry</label>
            <input className="input mt-1" value={form.industry} onChange={(e) => set('industry', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold">Location</label>
            <input className="input mt-1" value={form.location} onChange={(e) => set('location', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">Mode</label>
            <select className="input mt-1" value={form.locationType} onChange={(e) => set('locationType', e.target.value)}>
              <option value="ONSITE">Onsite</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold">Type</label>
            <select className="input mt-1" value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="NATIONAL_SERVICE">National Service</option>
              <option value="VOLUNTEER">Volunteer</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">Description</label>
          <textarea className="input mt-1 min-h-[140px]" value={form.description} onChange={(e) => set('description', e.target.value)} required minLength={20} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold">Deadline</label>
            <input className="input mt-1" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">Skills (comma-separated)</label>
            <input className="input mt-1" value={form.requiredSkillsInput} onChange={(e) => set('requiredSkillsInput', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold">External application URL (optional)</label>
          <input className="input mt-1" type="url" value={form.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} />
        </div>
        <button disabled={loading} className="btn-primary w-full">{loading ? 'Posting...' : 'Post opportunity'}</button>
      </form>
    </div>
  );
}
