import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, GraduationCap, Users, FileText, MessageSquare, Calendar } from 'lucide-react';
import { useAuthStore } from '../store/auth';

const actions = [
  { to: '/opportunities', icon: Briefcase, title: 'Browse jobs', desc: 'Find your next role' },
  { to: '/scholarships', icon: GraduationCap, title: 'Scholarships', desc: 'Funding opportunities' },
  { to: '/mentors', icon: Users, title: 'Find a mentor', desc: 'Get guidance from alumni' },
  { to: '/cv-builder', icon: FileText, title: 'Build your CV', desc: 'With AI review' },
  { to: '/interview-prep', icon: MessageSquare, title: 'Mock interviews', desc: 'Practice with AI' },
  { to: '/events', icon: Calendar, title: 'Upcoming events', desc: 'Workshops & panels' }
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)!;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-3xl font-bold">Hey {user.firstName} 👋</h1>
        <p className="text-[var(--muted)]">Let's make today count. Here's what you can do.</p>
      </motion.div>

      {!user.profileComplete && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card mt-6 border-l-4 border-l-[#F59E0B] bg-amber-50 dark:bg-amber-900/20"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-heading font-bold">Complete your profile</h3>
              <p className="text-sm text-[var(--muted)]">A complete profile gets 3x more mentor matches and personalized job alerts.</p>
            </div>
            <Link to="/profile" className="btn-primary shrink-0">Finish now</Link>
          </div>
        </motion.div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {actions.map(({ to, icon: Icon, title, desc }, i) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link to={to} className="card-hover block">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#065F46] text-white">
                <Icon size={18} />
              </div>
              <h3 className="mt-3 font-heading text-lg font-bold">{title}</h3>
              <p className="text-sm text-[var(--muted)]">{desc}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
