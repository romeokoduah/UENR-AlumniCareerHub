// Hand-written cover-letter templates. Each template is a deterministic
// function that takes the structured form data and returns the letter body
// as a single string with paragraphs separated by blank lines.
//
// No AI/LLM calls. Empty inputs are gracefully replaced with neutral
// placeholders so the preview is always coherent even with partial data.

export type CoverLetterFormData = {
  // Sender
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  senderLocation: string;
  // Recipient
  recipientName: string;
  companyName: string;
  companyCity: string;
  // Letter context
  targetRole: string;
  whyCompany: string;
  achievement: string;
  skills: string[];
  closingTone: ClosingTone;
};

export type ClosingTone = 'Confident' | 'Warm' | 'Direct' | 'Academic';

export type CoverLetterTemplate = {
  id: string;
  label: string;
  industry: string;
  tone: string;
  build: (data: CoverLetterFormData) => string;
};

// ---- helpers ---------------------------------------------------------------

const fallback = (val: string | undefined, alt: string) => {
  const v = (val ?? '').trim();
  return v.length ? v : alt;
};

const skillsClause = (skills: string[], joiner = ', ', tail = ' and ') => {
  const cleaned = skills.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return 'a strong, well-rounded skill set';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]}${tail}${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(joiner)}${tail}${cleaned[cleaned.length - 1]}`;
};

const greeting = (name: string) => {
  const n = name.trim();
  return n ? `Dear ${n},` : 'Dear Hiring Manager,';
};

const closingLine = (tone: ClosingTone): string => {
  switch (tone) {
    case 'Warm':
      return 'Thank you so much for your time and for considering my application — I would be delighted to talk further.';
    case 'Direct':
      return 'I am ready to start adding value from day one. I welcome the chance to discuss how my background fits the role.';
    case 'Academic':
      return 'I would welcome the opportunity to elaborate on my work and to learn more about the research priorities driving this position.';
    case 'Confident':
    default:
      return 'I am confident I can make a meaningful contribution and would welcome the chance to discuss the role in more detail.';
  }
};

const signOff = (tone: ClosingTone): string => {
  switch (tone) {
    case 'Warm':
      return 'Warm regards,';
    case 'Direct':
      return 'Best,';
    case 'Academic':
      return 'Yours sincerely,';
    case 'Confident':
    default:
      return 'Sincerely,';
  }
};

// Joins paragraphs into a single string separated by blank lines. The
// preview renderer splits on \n\n to render paragraph blocks.
const compose = (...parts: string[]) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');

// ---- templates -------------------------------------------------------------

const classicFormal: CoverLetterTemplate = {
  id: 'classic-formal',
  label: 'Classic Formal',
  industry: 'Banking, Law, Public Sector',
  tone: 'Polished',
  build: (d) => {
    const role = fallback(d.targetRole, 'the open position');
    const company = fallback(d.companyName, 'your organisation');
    return compose(
      greeting(d.recipientName),
      `I am writing to formally express my interest in the ${role} role at ${company}. With a background in ${skillsClause(d.skills)}, I believe I am well placed to contribute to your continued success.`,
      fallback(
        d.whyCompany,
        `${company}'s reputation for excellence and the impact of your work in the sector make this a compelling opportunity for the next stage of my career.`
      ),
      fallback(
        d.achievement,
        'In recent roles I have consistently delivered measurable results — taking ownership of priorities, working closely with stakeholders, and improving outcomes that matter to the business.'
      ),
      `${closingLine(d.closingTone)} Please find my CV enclosed for your review.`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

const warmNarrative: CoverLetterTemplate = {
  id: 'warm-narrative',
  label: 'Warm Narrative',
  industry: 'Education, Healthcare, NGOs',
  tone: 'Personal',
  build: (d) => {
    const role = fallback(d.targetRole, 'this role');
    const company = fallback(d.companyName, 'your team');
    return compose(
      greeting(d.recipientName),
      `When I came across the ${role} opening at ${company}, it felt like the kind of opportunity I have been quietly preparing for. I would love to tell you a little about why.`,
      fallback(
        d.whyCompany,
        `What draws me to ${company} is the way you put people at the centre of the work — that kind of mission is exactly what I want to be part of.`
      ),
      fallback(
        d.achievement,
        'In my most recent role I had the privilege of helping a small team build something we genuinely cared about, and the experience taught me how much careful, human-centred work can change.'
      ),
      `Alongside that experience I bring ${skillsClause(d.skills)} — practical strengths I would bring with me on day one. ${closingLine(d.closingTone)}`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

const directImpact: CoverLetterTemplate = {
  id: 'direct-impact',
  label: 'Direct Impact',
  industry: 'Sales, Operations, Startups',
  tone: 'Punchy',
  build: (d) => {
    const role = fallback(d.targetRole, 'the role');
    const company = fallback(d.companyName, 'your company');
    return compose(
      greeting(d.recipientName),
      `I want the ${role} role at ${company}. Here is why I am the right person for it.`,
      fallback(
        d.achievement,
        'Most recently I drove measurable results — owning targets end-to-end, shipping fast, and turning ambiguity into outcomes leadership could rely on.'
      ),
      `I bring direct strength in ${skillsClause(d.skills)} — the same toolkit your team needs to keep momentum.`,
      fallback(
        d.whyCompany,
        `${company} is moving in a direction I want to help accelerate, and I am ready to plug in immediately.`
      ),
      `${closingLine(d.closingTone)}`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

const academicResearch: CoverLetterTemplate = {
  id: 'academic-research',
  label: 'Academic Research',
  industry: 'Universities, Research Institutes',
  tone: 'Scholarly',
  build: (d) => {
    const role = fallback(d.targetRole, 'the advertised position');
    const company = fallback(d.companyName, 'your institution');
    return compose(
      greeting(d.recipientName),
      `I am writing to apply for the ${role} at ${company}. My academic and professional background, with a focus on ${skillsClause(d.skills)}, aligns closely with the priorities outlined in your call.`,
      fallback(
        d.whyCompany,
        `${company} has built a reputation for rigorous, impactful scholarship, and the opportunity to contribute to that body of work would be a meaningful continuation of my own research trajectory.`
      ),
      fallback(
        d.achievement,
        'My recent work has produced concrete, peer-reviewed outputs — designing studies, leading analysis, and translating findings into recommendations that informed practice beyond the academy.'
      ),
      `I would be glad to share further detail on my research agenda and how it complements your group's ongoing priorities. ${closingLine(d.closingTone)}`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

const engineeringTechnical: CoverLetterTemplate = {
  id: 'engineering-technical',
  label: 'Engineering / Technical',
  industry: 'Software, Energy, Manufacturing',
  tone: 'Pragmatic',
  build: (d) => {
    const role = fallback(d.targetRole, 'the open engineering role');
    const company = fallback(d.companyName, 'your team');
    return compose(
      greeting(d.recipientName),
      `I am applying for the ${role} at ${company}. I work across ${skillsClause(d.skills)} and have a strong record of shipping production-grade systems that scale.`,
      fallback(
        d.achievement,
        'In my last role I led design and delivery of a critical system — owning architecture decisions, writing the core components, and reducing operational issues through clean instrumentation and test coverage.'
      ),
      fallback(
        d.whyCompany,
        `${company}'s technical direction is exactly the kind of work I want to spend my time on — real engineering problems with measurable impact.`
      ),
      `I am comfortable owning problems end-to-end, working closely with non-engineering stakeholders, and writing code that is easy for the next person to maintain. ${closingLine(d.closingTone)}`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

const consultingStructured: CoverLetterTemplate = {
  id: 'consulting-structured',
  label: 'Consulting Structured',
  industry: 'Consulting, Strategy, Finance',
  tone: 'Analytical',
  build: (d) => {
    const role = fallback(d.targetRole, 'the role');
    const company = fallback(d.companyName, 'your firm');
    return compose(
      greeting(d.recipientName),
      `I am applying for the ${role} at ${company}. Three things make me a strong fit: a record of measurable impact, a sharp analytical toolkit, and a working style aligned to your culture.`,
      `First, impact. ${fallback(
        d.achievement,
        'In my most recent engagement I helped a client move from ambiguous goals to a tested plan, with clear KPIs and stakeholder buy-in across the leadership team.'
      )}`,
      `Second, capability. I bring depth in ${skillsClause(d.skills)} — the analytical and communication strengths consulting work runs on.`,
      `Third, fit. ${fallback(
        d.whyCompany,
        `${company} is the firm I want to build the next chapter of my career with — the work, the calibre of the team, and the kind of clients you serve.`
      )}`,
      `${closingLine(d.closingTone)}`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

const nonprofitMission: CoverLetterTemplate = {
  id: 'nonprofit-mission',
  label: 'Nonprofit / Mission',
  industry: 'NGOs, Development, Social Impact',
  tone: 'Mission-led',
  build: (d) => {
    const role = fallback(d.targetRole, 'the role');
    const company = fallback(d.companyName, 'your organisation');
    return compose(
      greeting(d.recipientName),
      `I am applying for the ${role} at ${company} because the mission resonates with the work I want to dedicate my career to.`,
      fallback(
        d.whyCompany,
        `${company} is doing the kind of work that creates real, durable change for the communities you serve, and I would be proud to contribute to that mission.`
      ),
      fallback(
        d.achievement,
        'In a recent project I helped translate a community-led idea into a funded, measurable programme — coordinating stakeholders, managing the budget, and reporting transparently against agreed indicators.'
      ),
      `I bring practical strength in ${skillsClause(d.skills)}, alongside the patience and humility that mission-driven work demands. ${closingLine(d.closingTone)}`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

const creativeBold: CoverLetterTemplate = {
  id: 'creative-bold',
  label: 'Creative Bold',
  industry: 'Design, Marketing, Media',
  tone: 'Distinctive',
  build: (d) => {
    const role = fallback(d.targetRole, 'this role');
    const company = fallback(d.companyName, 'your studio');
    return compose(
      greeting(d.recipientName),
      `Most cover letters open the same way. I would rather skip that and tell you why I want to work on ${role} at ${company} — and what I would bring with me.`,
      fallback(
        d.whyCompany,
        `${company} is doing the kind of work that makes the rest of the industry look slightly bland. I would love to be part of the team building it.`
      ),
      fallback(
        d.achievement,
        'My most recent project was a concept I owned end-to-end — from the first scrappy sketch to a launched piece of work that picked up real traction with the audience it was made for.'
      ),
      `On the craft side, I bring ${skillsClause(d.skills)} — the toolkit I would use to ship work I am proud to put my name to. ${closingLine(d.closingTone)}`,
      `${signOff(d.closingTone)}\n${fallback(d.senderName, 'Your Name')}`
    );
  }
};

export const COVER_LETTER_TEMPLATES: CoverLetterTemplate[] = [
  classicFormal,
  warmNarrative,
  directImpact,
  academicResearch,
  engineeringTechnical,
  consultingStructured,
  nonprofitMission,
  creativeBold
];

export function findTemplate(id: string): CoverLetterTemplate {
  return COVER_LETTER_TEMPLATES.find((t) => t.id === id) ?? COVER_LETTER_TEMPLATES[0];
}

export function emptyFormData(): CoverLetterFormData {
  return {
    senderName: '',
    senderEmail: '',
    senderPhone: '',
    senderLocation: '',
    recipientName: '',
    companyName: '',
    companyCity: '',
    targetRole: '',
    whyCompany: '',
    achievement: '',
    skills: [],
    closingTone: 'Confident'
  };
}

// Build the rendered letter from data + template id. Pure function so it
// can be reused by the print page without React state.
export function renderLetter(data: CoverLetterFormData, templateId: string): string {
  return findTemplate(templateId).build(data);
}
