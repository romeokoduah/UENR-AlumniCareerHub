import { useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import { api } from '../services/api';

export default function CVBuilderPage() {
  const [cv, setCv] = useState({
    fullName: '', email: '', phone: '', location: '', summary: '',
    education: '', experience: '', skills: '', projects: ''
  });
  const [feedback, setFeedback] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setCv((f) => ({ ...f, [k]: v }));

  const plainCV = () => `${cv.fullName}\n${cv.email} · ${cv.phone} · ${cv.location}\n\nSUMMARY\n${cv.summary}\n\nEDUCATION\n${cv.education}\n\nEXPERIENCE\n${cv.experience}\n\nSKILLS\n${cv.skills}\n\nPROJECTS\n${cv.projects}`;

  const review = async () => {
    setReviewing(true);
    try {
      const { data } = await api.post('/chat/cv-review', { cvText: plainCV() });
      setFeedback(data.data.feedback);
    } catch { toast.error('Review failed'); }
    finally { setReviewing(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/cvs', { title: `${cv.fullName || 'My'} CV`, template: 'modern', data: cv });
      toast.success('CV saved!');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold mb-6">CV Builder</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="font-heading font-bold">Your details</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Full name" value={cv.fullName} onChange={(e) => set('fullName', e.target.value)} />
            <input className="input" placeholder="Email" value={cv.email} onChange={(e) => set('email', e.target.value)} />
            <input className="input" placeholder="Phone" value={cv.phone} onChange={(e) => set('phone', e.target.value)} />
            <input className="input" placeholder="Location" value={cv.location} onChange={(e) => set('location', e.target.value)} />
          </div>
          <textarea className="input min-h-[80px]" placeholder="Professional summary (2-3 sentences)" value={cv.summary} onChange={(e) => set('summary', e.target.value)} />
          <textarea className="input min-h-[80px]" placeholder="Education" value={cv.education} onChange={(e) => set('education', e.target.value)} />
          <textarea className="input min-h-[120px]" placeholder="Work experience" value={cv.experience} onChange={(e) => set('experience', e.target.value)} />
          <textarea className="input min-h-[60px]" placeholder="Skills (comma-separated)" value={cv.skills} onChange={(e) => set('skills', e.target.value)} />
          <textarea className="input min-h-[80px]" placeholder="Projects" value={cv.projects} onChange={(e) => set('projects', e.target.value)} />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save CV'}</button>
            <button onClick={review} disabled={reviewing} className="btn-accent">
              <Sparkles size={16} /> {reviewing ? 'Reviewing...' : 'AI Review'}
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="font-heading font-bold mb-3">Preview</h2>
          <div className="rounded-xl bg-white dark:bg-stone-900 p-6 border border-[var(--border)]">
            <h1 className="font-heading text-2xl font-bold">{cv.fullName || 'Your Name'}</h1>
            <p className="text-xs text-[var(--muted)]">{cv.email} · {cv.phone} · {cv.location}</p>
            {cv.summary && (<><h3 className="mt-4 font-heading font-bold text-sm uppercase tracking-wide">Summary</h3><p className="text-sm whitespace-pre-wrap">{cv.summary}</p></>)}
            {cv.education && (<><h3 className="mt-4 font-heading font-bold text-sm uppercase tracking-wide">Education</h3><p className="text-sm whitespace-pre-wrap">{cv.education}</p></>)}
            {cv.experience && (<><h3 className="mt-4 font-heading font-bold text-sm uppercase tracking-wide">Experience</h3><p className="text-sm whitespace-pre-wrap">{cv.experience}</p></>)}
            {cv.skills && (<><h3 className="mt-4 font-heading font-bold text-sm uppercase tracking-wide">Skills</h3><p className="text-sm">{cv.skills}</p></>)}
          </div>
          {feedback && (
            <div className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-200 dark:border-emerald-800">
              <h3 className="font-heading font-bold text-sm mb-2 text-[#065F46] dark:text-[#84CC16]">✨ CareerMate's feedback</h3>
              <div className="text-sm whitespace-pre-wrap">{feedback}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
