import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';

export default function ProfilePage() {
  const { user, refreshMe } = useAuthStore();
  const [form, setForm] = useState({
    firstName: '', lastName: '', bio: '', programme: '', graduationYear: '',
    linkedinUrl: '', phone: '', location: '', currentRole: '', currentCompany: '',
    skillsInput: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        bio: user.bio || '',
        programme: user.programme || '',
        graduationYear: user.graduationYear?.toString() || '',
        linkedinUrl: user.linkedinUrl || '',
        phone: user.phone || '',
        location: user.location || '',
        currentRole: user.currentRole || '',
        currentCompany: user.currentCompany || '',
        skillsInput: (user.skills || []).join(', ')
      });
    }
  }, [user]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch('/users/me', {
        firstName: form.firstName,
        lastName: form.lastName,
        bio: form.bio,
        programme: form.programme,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
        linkedinUrl: form.linkedinUrl || undefined,
        phone: form.phone || undefined,
        location: form.location || undefined,
        currentRole: form.currentRole || undefined,
        currentCompany: form.currentCompany || undefined,
        skills: form.skillsInput.split(',').map((s) => s.trim()).filter(Boolean)
      });
      await refreshMe();
      toast.success('Profile saved! 🎉');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Save failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold mb-6">Your profile</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold">First name</label><input className="input mt-1" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
          <div><label className="text-xs font-semibold">Last name</label><input className="input mt-1" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
        </div>
        <div>
          <label className="text-xs font-semibold">Bio</label>
          <textarea className="input mt-1 min-h-[100px]" value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="Tell the network about yourself..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold">Programme</label><input className="input mt-1" value={form.programme} onChange={(e) => set('programme', e.target.value)} /></div>
          <div><label className="text-xs font-semibold">Graduation year</label><input type="number" className="input mt-1" value={form.graduationYear} onChange={(e) => set('graduationYear', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold">Current role</label><input className="input mt-1" value={form.currentRole} onChange={(e) => set('currentRole', e.target.value)} /></div>
          <div><label className="text-xs font-semibold">Company</label><input className="input mt-1" value={form.currentCompany} onChange={(e) => set('currentCompany', e.target.value)} /></div>
        </div>
        <div>
          <label className="text-xs font-semibold">Skills (comma-separated)</label>
          <input className="input mt-1" value={form.skillsInput} onChange={(e) => set('skillsInput', e.target.value)} placeholder="React, Python, Solar PV..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold">LinkedIn URL</label><input className="input mt-1" value={form.linkedinUrl} onChange={(e) => set('linkedinUrl', e.target.value)} /></div>
          <div><label className="text-xs font-semibold">Phone</label><input className="input mt-1" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        </div>
        <div><label className="text-xs font-semibold">Location</label><input className="input mt-1" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Accra, Ghana" /></div>
        <button disabled={loading} className="btn-primary w-full">{loading ? 'Saving...' : 'Save profile'}</button>
      </form>
    </div>
  );
}
