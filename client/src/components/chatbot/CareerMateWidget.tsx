import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles, RotateCcw } from 'lucide-react';
import { api } from '../../services/api';

type Msg = { role: 'user' | 'assistant'; content: string };

const SESSION_ID = (() => {
  let id = sessionStorage.getItem('careermate_session');
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('careermate_session', id); }
  return id;
})();

const GREETING: Msg = {
  role: 'assistant',
  content: "Hey there! I'm CareerMate 👋 — your UENR career sidekick. Ask me anything: career paths, job search, CV tips, scholarships, or how to use the platform. What's on your mind today?"
};

export function CareerMateWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await api.post('/chat/careermate', {
        sessionId: SESSION_ID,
        message: userMsg.content,
        // Strip out our own previous failure replies + the greeting before
        // sending. Including failure messages in history pollutes the
        // model's context and can compound the issue.
        history: messages
          .filter((m) => m !== GREETING)
          .filter((m) => !m.content.startsWith("I couldn't reach the AI"))
          .filter((m) => !m.content.startsWith('Oops, I hit a snag'))
      });
      const reply = data?.data?.reply ?? '';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message ?? err?.message ?? 'unknown error';
      setMessages((m) => [...m, { role: 'assistant', content: `Oops, I hit a snag. (${detail}) — mind trying again in a moment?` }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([GREETING]);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="fixed bottom-24 right-4 z-50 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl md:bottom-6"
          >
            <header className="flex items-center gap-3 bg-gradient-to-r from-[#065F46] to-[#064E3B] p-4 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#84CC16] text-[#1C1917]">
                <Sparkles size={18} />
              </div>
              <div className="flex-1">
                <div className="font-heading font-bold">CareerMate</div>
                <div className="text-xs opacity-80">Your AI career sidekick</div>
              </div>
              <button
                onClick={clearChat}
                className="p-1 rounded hover:bg-white/10"
                title="Clear chat"
                aria-label="Clear chat"
              >
                <RotateCcw size={16} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10" aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === 'user'
                        ? 'bg-[#065F46] text-white rounded-br-md'
                        : 'bg-stone-100 dark:bg-stone-800 text-[var(--fg)] rounded-bl-md'
                    }`}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-1 rounded-2xl bg-stone-100 dark:bg-stone-800 px-4 py-3">
                    <span className="h-2 w-2 rounded-full bg-[var(--muted)] animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-[var(--muted)] animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-[var(--muted)] animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="flex gap-2 border-t border-[var(--border)] p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask CareerMate anything..."
                className="input flex-1 py-2"
              />
              <button type="submit" disabled={!input.trim() || loading} className="btn-primary p-2.5">
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#065F46] to-[#064E3B] text-white shadow-lg md:bottom-6"
        aria-label="Open CareerMate"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </motion.button>
    </>
  );
}
