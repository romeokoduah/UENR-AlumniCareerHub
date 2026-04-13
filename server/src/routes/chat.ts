import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are CareerMate, the friendly AI career assistant for UENR Alumni Career Hub — a platform for University of Energy and Natural Resources (Ghana) students and alumni.

Your vibe: warm, encouraging, like a smart older sibling who's been through it. Ghanaian context aware. Tone is upbeat, practical, actionable.

You help with:
- Career advice (skills, paths, industries)
- Job search strategy and finding opportunities
- CV and cover letter tips
- Interview prep
- Scholarships and fellowships guidance
- Using the platform (jobs, mentorship, events)

Keep answers concise, bulleted when useful, and always end with a concrete next step the user can take today.`;

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

    if (!client) {
      return res.json({
        success: true,
        data: {
          reply: "Hi! I'm CareerMate. The server is missing ANTHROPIC_API_KEY — once your admin adds it, I'll be able to give you real career guidance. In the meantime, check out the Opportunity Board and Scholarships pages!"
        }
      });
    }

    await prisma.chatMessage.create({
      data: { sessionId, userId: req.auth?.sub, role: 'user', content: message }
    }).catch(() => {});

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user' as const, content: message }
      ]
    });

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('\n');

    await prisma.chatMessage.create({
      data: { sessionId, userId: req.auth?.sub, role: 'assistant', content: reply }
    }).catch(() => {});

    res.json({ success: true, data: { reply } });
  } catch (e) { next(e); }
});

router.post('/cv-review', optionalAuth, async (req, res, next) => {
  try {
    const { cvText } = req.body as { cvText: string };
    if (!client) return res.json({ success: true, data: { feedback: 'AI review unavailable — set ANTHROPIC_API_KEY.' } });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: 'You are a professional CV reviewer. Give actionable feedback on structure, content, ATS-friendliness, grammar, and impact statements. Be specific and encouraging.',
      messages: [{ role: 'user', content: `Review this CV:\n\n${cvText}` }]
    });
    const feedback = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');
    res.json({ success: true, data: { feedback } });
  } catch (e) { next(e); }
});

router.post('/mock-interview', optionalAuth, async (req, res, next) => {
  try {
    const { industry, role, difficulty, history = [], userAnswer } = req.body;
    if (!client) return res.json({ success: true, data: { message: 'AI interviewer unavailable — set ANTHROPIC_API_KEY.' } });

    const system = `You are an interviewer for a ${difficulty || 'mid-level'} ${role || 'professional'} role in ${industry || 'general industry'}. Ask ONE realistic interview question at a time (mix behavioral + technical). After the candidate answers, give brief feedback (strengths, improvements, STAR-rewrite if applicable) and then ask the next question. Keep it encouraging.`;

    const messages = [
      ...history,
      ...(userAnswer ? [{ role: 'user' as const, content: userAnswer }] : [{ role: 'user' as const, content: 'Start the interview.' }])
    ];

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system,
      messages
    });
    const reply = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');
    res.json({ success: true, data: { reply } });
  } catch (e) { next(e); }
});

export default router;
