import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import { api } from '../services/api';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function InterviewPrepPage() {
  const [started, setStarted] = useState(false);
  const [industry, setIndustry] = useState('Technology');
  const [role, setRole] = useState('Software Engineer');
  const [difficulty, setDifficulty] = useState('mid-level');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setStarted(true);
    setLoading(true);
    try {
      const { data } = await api.post('/chat/mock-interview', { industry, role, difficulty, history: [] });
      setMessages([{ role: 'assistant', content: data.data.reply }]);
    } catch { setMessages([{ role: 'assistant', content: 'AI interviewer unavailable right now.' }]); }
    finally { setLoading(false); }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const { data } = await api.post('/chat/mock-interview', {
        industry, role, difficulty,
        history: newMessages,
        userAnswer: userMsg.content
      });
      setMessages((m) => [...m, { role: 'assistant', content: data.data.reply }]);
    } catch { /* noop */ }
    finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">AI Mock Interviewer</h1>
      <p className="text-sm text-[var(--muted)]">Practice with a realistic interviewer and get instant feedback</p>

      {!started ? (
        <div className="card mt-6 space-y-4">
          <h2 className="font-heading font-bold">Configure your session</h2>
          <div>
            <label className="text-xs font-semibold">Industry</label>
            <input className="input mt-1" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold">Role</label>
            <input className="input mt-1" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold">Difficulty</label>
            <select className="input mt-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="entry-level">Entry level</option>
              <option value="mid-level">Mid level</option>
              <option value="senior">Senior</option>
            </select>
          </div>
          <button onClick={start} className="btn-primary w-full">
            <Sparkles size={16} /> Start mock interview
          </button>
        </div>
      ) : (
        <div className="card mt-6 flex flex-col h-[600px]">
          <div className="flex-1 space-y-3 overflow-y-auto pb-4">
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user' ? 'bg-[#065F46] text-white' : 'bg-stone-100 dark:bg-stone-800'
                }`}>{m.content}</div>
              </motion.div>
            ))}
            {loading && <div className="text-xs text-[var(--muted)]">Interviewer is typing...</div>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-[var(--border)] pt-3">
            <input className="input flex-1" placeholder="Your answer..." value={input} onChange={(e) => setInput(e.target.value)} />
            <button disabled={!input.trim() || loading} className="btn-primary"><Send size={16} /></button>
          </form>
        </div>
      )}
    </div>
  );
}
