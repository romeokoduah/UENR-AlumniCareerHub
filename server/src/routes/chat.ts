// Chat-style AI endpoints — backs CareerMate (the floating chatbot),
// the legacy CV reviewer, and the legacy mock interviewer. All three
// run through lib/aiProvider which tries Groq first (free 14,400/day,
// fast, OpenAI-compatible) and falls back to Gemini if Groq is
// unavailable.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiChat, isAnyProviderEnabled, getLastAiError } from '../lib/aiProvider.js';

const router = Router();

const CAREERMATE_SYSTEM = `You are CareerMate, the friendly AI career assistant for UENR Alumni Career Hub — a platform for University of Energy and Natural Resources (Ghana) students and alumni.

Your vibe: warm, encouraging, like a smart older sibling who's been through it. Ghanaian context aware. Tone is upbeat, practical, actionable.

You help with:
- Career advice (skills, paths, industries)
- Job search strategy and finding opportunities
- CV and cover letter tips
- Interview prep
- Scholarships and fellowships guidance
- Using the platform (jobs, mentorship, events)

Keep answers concise, bulleted when useful, and always end with a concrete next step the user can take today.`;

const KEY_MISSING_REPLY =
  "Hi! I'm CareerMate. The site has no AI provider configured yet — once your admin sets GROQ_API_KEY (or GOOGLE_GEMINI_API_KEY), I'll be able to give you real career guidance. In the meantime, try the Career Tools hub for CV building, mentorship, and the job board.";

const CV_REVIEW_SYSTEM =
  'You are a professional CV reviewer. Give actionable feedback on structure, content, ATS-friendliness, grammar, and impact statements. Be specific and encouraging. Use bulleted lists when listing issues.';

// --- /careermate ---------------------------------------------------------

const messageSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).default([])
});

router.post('/careermate', optionalAuth, validate(messageSchema), async (req, res, next) => {
  try {
    const { sessionId, message, history } = req.body as z.infer<typeof messageSchema>;

    if (!(await isAnyProviderEnabled())) {
      return res.json({ success: true, data: { reply: KEY_MISSING_REPLY } });
    }

    await prisma.chatMessage.create({
      data: { sessionId, userId: req.auth?.sub ?? null, role: 'user', content: message }
    }).catch(() => { /* best-effort */ });

    // Sanitise history: providers reject conversations starting with an
    // assistant turn and choke on empty content. Drop any leading
    // assistant turns and any empty messages before sending.
    let cleanHistory = history.filter((h) => h.content && h.content.trim().length > 0);
    while (cleanHistory.length > 0 && cleanHistory[0].role === 'assistant') {
      cleanHistory.shift();
    }
    if (cleanHistory.length > 10) {
      cleanHistory = cleanHistory.slice(-10);
    }

    const result = await aiChat(CAREERMATE_SYSTEM, cleanHistory, message, {
      maxTokens: 1024,
      temperature: 0.7
    });

    let reply: string;
    if (result?.text) {
      reply = result.text;
    } else {
      const err = getLastAiError() ?? '';
      if (/429/.test(err) || /quota/i.test(err)) {
        reply = "Both my AI providers hit their rate limits at the same time. Try again in a minute — usually clears quickly. The Career Tools hub still works normally.";
      } else if (/blocked/i.test(err)) {
        reply = "I couldn't answer that one — the model's safety filter blocked the response. Try rephrasing the question?";
      } else if (/timeout/i.test(err)) {
        reply = "The AI took too long to answer that one. Try again in a moment, or rephrase shorter and more specific.";
      } else {
        reply = "I couldn't reach the AI just now. Try again in a moment, or browse the Career Tools hub while we look at this.";
      }
    }

    await prisma.chatMessage.create({
      data: { sessionId, userId: req.auth?.sub ?? null, role: 'assistant', content: reply }
    }).catch(() => { /* best-effort */ });

    res.json({ success: true, data: { reply } });
  } catch (e) { next(e); }
});

// --- /cv-review ----------------------------------------------------------

router.post('/cv-review', optionalAuth, async (req, res, next) => {
  try {
    const { cvText } = req.body as { cvText?: string };
    if (!cvText) {
      return res.status(400).json({ success: false, error: { code: 'NO_CV', message: 'cvText is required' } });
    }
    if (!(await isAnyProviderEnabled())) {
      return res.json({ success: true, data: { feedback: 'AI review unavailable — set GROQ_API_KEY or GOOGLE_GEMINI_API_KEY.' } });
    }
    const result = await aiChat(
      CV_REVIEW_SYSTEM,
      [],
      `Review this CV:\n\n${cvText.slice(0, 12_000)}`,
      { maxTokens: 1500, temperature: 0.5 }
    );
    const feedback = result?.text ?? "Couldn't reach the AI for review. Try again shortly.";
    res.json({ success: true, data: { feedback } });
  } catch (e) { next(e); }
});

// --- /mock-interview -----------------------------------------------------

router.post('/mock-interview', optionalAuth, async (req, res, next) => {
  try {
    const { industry, role, difficulty, history = [], userAnswer } = req.body as {
      industry?: string;
      role?: string;
      difficulty?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      userAnswer?: string;
    };

    if (!(await isAnyProviderEnabled())) {
      return res.json({ success: true, data: { reply: 'AI interviewer unavailable — set GROQ_API_KEY or GOOGLE_GEMINI_API_KEY.' } });
    }

    const system = `You are an interviewer for a ${difficulty || 'mid-level'} ${role || 'professional'} role in ${industry || 'general industry'}. Ask ONE realistic interview question at a time (mix behavioral + technical). After the candidate answers, give brief feedback (strengths, improvements, STAR-rewrite if applicable) and then ask the next question. Keep it encouraging.`;

    const userMessage = userAnswer ?? 'Start the interview.';

    const result = await aiChat(system, history, userMessage, {
      maxTokens: 800,
      temperature: 0.6
    });

    const reply = result?.text ?? "I couldn't reach the AI right now — give it another moment.";
    res.json({ success: true, data: { reply } });
  } catch (e) { next(e); }
});

export default router;
