import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card w-full"
      >
        <h1 className="font-heading text-2xl font-bold">Welcome back 👋</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Log in to continue your career journey</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold">Email</label>
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold">Password</label>
            <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button disabled={loading} className="btn-primary w-full">
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          New here? <Link to="/register" className="font-semibold text-[#065F46] dark:text-[#84CC16]">Create an account</Link>
        </p>
        <div className="mt-4 rounded-lg bg-stone-100 dark:bg-stone-800 p-3 text-xs">
          <div className="font-semibold mb-1">Demo accounts:</div>
          <div>student@uenr.edu.gh / password123</div>
          <div>admin@uenr.edu.gh / admin12345</div>
        </div>
      </motion.div>
    </div>
  );
}
