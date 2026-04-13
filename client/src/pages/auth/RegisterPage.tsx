import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/auth';

export default function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'STUDENT' as 'STUDENT' | 'ALUMNI' | 'EMPLOYER',
    programme: '',
    graduationYear: ''
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({
        ...form,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined
      });
      toast.success('Welcome to UENR Career Hub! 🎉');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
        <h1 className="font-heading text-2xl font-bold">Join UENR Career Hub</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Create your account in 30 seconds</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold">First name</label>
              <input className="input mt-1" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold">Last name</label>
              <input className="input mt-1" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold">Email</label>
            <input className="input mt-1" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">Password (8+ characters)</label>
            <input className="input mt-1" type="password" minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">I am a</label>
            <select className="input mt-1" value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="STUDENT">Current UENR student</option>
              <option value="ALUMNI">UENR alumni</option>
              <option value="EMPLOYER">Employer / recruiter</option>
            </select>
          </div>
          {form.role !== 'EMPLOYER' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold">Programme</label>
                <input className="input mt-1" value={form.programme} onChange={(e) => set('programme', e.target.value)} placeholder="e.g., Computer Science" />
              </div>
              <div>
                <label className="text-xs font-semibold">{form.role === 'ALUMNI' ? 'Graduation year' : 'Entry year'}</label>
                <input className="input mt-1" type="number" value={form.graduationYear} onChange={(e) => set('graduationYear', e.target.value)} />
              </div>
            </div>
          )}
          <button disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          Already have an account? <Link to="/login" className="font-semibold text-[#065F46] dark:text-[#84CC16]">Log in</Link>
        </p>
      </motion.div>
    </div>
  );
}
