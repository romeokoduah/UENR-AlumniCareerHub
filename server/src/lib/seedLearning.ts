// Hand-curated seed for the Learning Hub. Idempotent — every resource keys
// off URL via a deterministic cuid-style key, and every path off its slug.
//
// Spread:
//   - All 5 LearningType values (COURSE / VIDEO / BOOK / ARTICLE / PODCAST)
//   - All 3 LearningLevel values
//   - Mix of FREE / PAID / FREEMIUM
//   - Global providers (Coursera, edX, MIT OCW, Khan Academy, YouTube,
//     OpenLearn) plus regional (MEST Africa, Ashesi Exec Ed, Kumasi Hive,
//     Ghana Code Club, ALU open content, University of Ghana Learn).
//   - Skill arrays match common Phase 2 Skill names so the cross-tool
//     recommender can join cleanly.

import { prisma } from './prisma.js';
import type { LearningType, LearningLevel, LearningCost } from '@prisma/client';

type SeedResource = {
  title: string;
  provider: string;
  url: string;
  type: LearningType;
  level: LearningLevel;
  cost: LearningCost;
  language?: string;
  durationMin?: number;
  skills: string[];
  description: string;
};

const RESOURCES: SeedResource[] = [
  // ---- Coursera --------------------------------------------------------
  {
    title: 'Python for Everybody Specialization',
    provider: 'Coursera',
    url: 'https://www.coursera.org/specializations/python',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREEMIUM',
    durationMin: 1800,
    skills: ['python', 'data analysis'],
    description: 'Dr. Chuck Severance walks you from zero programming to building real data apps in Python.'
  },
  {
    title: 'Google Data Analytics Professional Certificate',
    provider: 'Coursera',
    url: 'https://www.coursera.org/professional-certificates/google-data-analytics',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'PAID',
    durationMin: 10800,
    skills: ['data analysis', 'sql', 'spreadsheets', 'r'],
    description: 'Google-built path to your first analyst role: SQL, R, Tableau, and a real capstone project.'
  },
  {
    title: 'IBM Data Science Professional Certificate',
    provider: 'Coursera',
    url: 'https://www.coursera.org/professional-certificates/ibm-data-science',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'PAID',
    durationMin: 12000,
    skills: ['python', 'data analysis', 'machine learning', 'sql'],
    description: 'Full IBM-curated stack: Python, SQL, Pandas, scikit-learn, and a portfolio capstone.'
  },
  {
    title: 'Project Management Principles and Practices',
    provider: 'Coursera',
    url: 'https://www.coursera.org/specializations/project-management',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREEMIUM',
    durationMin: 2400,
    skills: ['project management', 'stakeholder management'],
    description: 'UC Irvine specialization on initiating, planning, and closing projects with confidence.'
  },
  {
    title: 'GIS, Mapping, and Spatial Analysis Specialization',
    provider: 'Coursera',
    url: 'https://www.coursera.org/specializations/gis-mapping-spatial-analysis',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREEMIUM',
    durationMin: 3000,
    skills: ['gis', 'spatial analysis', 'cartography'],
    description: 'University of Toronto deep-dive into GIS — perfect for natural-resource and planning students.'
  },
  {
    title: 'Climate Change: The Science and Global Impact',
    provider: 'Coursera',
    url: 'https://www.coursera.org/learn/climate-change-science',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREEMIUM',
    durationMin: 720,
    skills: ['climate science', 'sustainability'],
    description: 'SDG Academy course that builds the vocabulary and evidence base for climate work.'
  },

  // ---- edX -------------------------------------------------------------
  {
    title: 'CS50: Introduction to Computer Science',
    provider: 'edX',
    url: 'https://www.edx.org/cs50',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 6000,
    skills: ['python', 'c', 'algorithms', 'web development'],
    description: 'Harvard\'s legendary CS intro — the single best on-ramp to computer science.'
  },
  {
    title: 'Solar Energy: Photovoltaic (PV) Systems',
    provider: 'edX',
    url: 'https://www.edx.org/learn/solar-energy/delft-university-of-technology-solar-energy-photovoltaic-pv-energy-conversion',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREEMIUM',
    durationMin: 1800,
    skills: ['solar pv', 'renewables', 'electrical engineering'],
    description: 'TU Delft\'s flagship PV systems course — physics, modules, and full-system design.'
  },
  {
    title: 'Sustainable Energy: Design A Renewable Future',
    provider: 'edX',
    url: 'https://www.edx.org/learn/sustainability/delft-university-of-technology-sustainable-energy-design-a-renewable-future',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREEMIUM',
    durationMin: 1800,
    skills: ['renewables', 'energy policy', 'sustainability'],
    description: 'Design a 100%-renewable energy system for a real region using TU Delft\'s framework.'
  },
  {
    title: 'Introduction to Project Management',
    provider: 'edX',
    url: 'https://www.edx.org/learn/project-management/the-university-of-adelaide-introduction-to-project-management',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREEMIUM',
    durationMin: 360,
    skills: ['project management'],
    description: 'University of Adelaide primer on PM lifecycles, scope, and risk — short and practical.'
  },

  // ---- MIT OCW ---------------------------------------------------------
  {
    title: 'Introduction to Computer Science and Programming in Python',
    provider: 'MIT OpenCourseWare',
    url: 'https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 2400,
    skills: ['python', 'algorithms'],
    description: 'MIT 6.0001 lectures, problem sets, and slides — a rigorous start in programming.'
  },
  {
    title: 'Renewable Energy: Sources & Technologies',
    provider: 'MIT OpenCourseWare',
    url: 'https://ocw.mit.edu/courses/2-65j-sustainable-energy-spring-2011/',
    type: 'COURSE',
    level: 'ADVANCED',
    cost: 'FREE',
    durationMin: 3600,
    skills: ['renewables', 'sustainability', 'energy policy'],
    description: 'Graduate-level MIT material covering wind, solar, geothermal, biomass, and policy.'
  },
  {
    title: 'Entrepreneurship 101: Who is your customer?',
    provider: 'MIT OpenCourseWare',
    url: 'https://ocw.mit.edu/courses/15-390-new-enterprises-spring-2013/',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    durationMin: 1800,
    skills: ['entrepreneurship', 'product management', 'customer discovery'],
    description: 'Bill Aulet\'s MIT 15.390 — the disciplined entrepreneurship method, free.'
  },

  // ---- Khan Academy ----------------------------------------------------
  {
    title: 'Statistics and Probability',
    provider: 'Khan Academy',
    url: 'https://www.khanacademy.org/math/statistics-probability',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 3000,
    skills: ['statistics', 'data analysis'],
    description: 'Self-paced foundation in stats — distributions, inference, regression. Free forever.'
  },
  {
    title: 'AP/College Macroeconomics',
    provider: 'Khan Academy',
    url: 'https://www.khanacademy.org/economics-finance-domain/macroeconomics',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 1800,
    skills: ['economics', 'policy analysis'],
    description: 'Full macro syllabus — perfect for ESG and policy career pivots.'
  },
  {
    title: 'Computer Programming: Intro to JS',
    provider: 'Khan Academy',
    url: 'https://www.khanacademy.org/computing/computer-programming',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 1200,
    skills: ['javascript', 'web development'],
    description: 'Beginner JS course with an in-browser editor — code as you watch.'
  },

  // ---- YouTube ---------------------------------------------------------
  {
    title: 'Linear Algebra — 3Blue1Brown Essence Series',
    provider: 'YouTube',
    url: 'https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab',
    type: 'VIDEO',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 180,
    skills: ['linear algebra', 'machine learning'],
    description: 'Grant Sanderson\'s visual masterclass on the geometry of linear algebra.'
  },
  {
    title: 'freeCodeCamp — Full SQL Course',
    provider: 'YouTube',
    url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY',
    type: 'VIDEO',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 270,
    skills: ['sql', 'data analysis'],
    description: 'Single-sitting full-length SQL bootcamp from freeCodeCamp.'
  },
  {
    title: 'GIS Crash Course — QGIS for Beginners',
    provider: 'YouTube',
    url: 'https://www.youtube.com/watch?v=OKuLPyWVcFc',
    type: 'VIDEO',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 90,
    skills: ['gis', 'qgis', 'spatial analysis'],
    description: 'QGIS from install to first map — the fastest practical intro on the web.'
  },
  {
    title: 'How to Write a Research Proposal',
    provider: 'YouTube',
    url: 'https://www.youtube.com/watch?v=oXf3kn1tQuk',
    type: 'VIDEO',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 30,
    skills: ['research methods', 'english writing'],
    description: 'Concise walkthrough of structure, scope, and language for graduate proposals.'
  },

  // ---- OpenLearn (UK Open University) ----------------------------------
  {
    title: 'Succeeding in Postgraduate Study',
    provider: 'OpenLearn',
    url: 'https://www.open.edu/openlearn/education-development/succeeding-postgraduate-study/content-section-overview',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 900,
    skills: ['research methods', 'english writing', 'critical thinking'],
    description: 'Open University bootcamp on academic writing, reading, and self-management.'
  },
  {
    title: 'Energy Resources: Solar Energy',
    provider: 'OpenLearn',
    url: 'https://www.open.edu/openlearn/nature-environment/energy-resources-solar-energy/content-section-0',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 600,
    skills: ['solar pv', 'renewables'],
    description: 'Plain-English unit on solar resources, technologies, and trade-offs.'
  },
  {
    title: 'Climate Change: Transitions to Sustainability',
    provider: 'OpenLearn',
    url: 'https://www.open.edu/openlearn/nature-environment/climate-change-transitions-sustainability/content-section-overview',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    durationMin: 720,
    skills: ['climate science', 'sustainability', 'policy analysis'],
    description: 'How societies actually transition — useful for ESG and climate-policy entrants.'
  },

  // ---- MEST Africa -----------------------------------------------------
  {
    title: 'MEST Express: Idea Validation',
    provider: 'MEST Africa',
    url: 'https://meltwater.org/mest-express/',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 240,
    skills: ['entrepreneurship', 'customer discovery', 'product management'],
    description: 'MEST\'s self-paced track on validating an idea before you write a line of code.'
  },
  {
    title: 'MEST Founder Stories',
    provider: 'MEST Africa',
    url: 'https://meltwater.org/blog/',
    type: 'ARTICLE',
    level: 'BEGINNER',
    cost: 'FREE',
    skills: ['entrepreneurship', 'storytelling'],
    description: 'Long-form interviews with West African founders MEST has incubated.'
  },

  // ---- Ashesi Executive Education --------------------------------------
  {
    title: 'Ashesi Exec Ed: Leading with Purpose',
    provider: 'Ashesi Executive Education',
    url: 'https://exec.ashesi.edu.gh/',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'PAID',
    durationMin: 2400,
    skills: ['leadership', 'strategy', 'ethics'],
    description: 'Short course aimed at early-career managers — Ashesi\'s ethics-first approach.'
  },
  {
    title: 'Ashesi Exec Ed: Negotiation Skills for Professionals',
    provider: 'Ashesi Executive Education',
    url: 'https://exec.ashesi.edu.gh/programs/',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'PAID',
    durationMin: 1200,
    skills: ['negotiation', 'communication'],
    description: 'Hands-on negotiation workshop — Ghana-context cases, role-play heavy.'
  },

  // ---- Kumasi Hive -----------------------------------------------------
  {
    title: 'Kumasi Hive: Climate Innovation Bootcamp',
    provider: 'Kumasi Hive',
    url: 'https://kumasihive.com/programs/',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    durationMin: 2400,
    skills: ['climate innovation', 'entrepreneurship', 'sustainability'],
    description: 'Northern-Ghana hub bootcamp for founders building climate-resilience ventures.'
  },
  {
    title: 'Kumasi Hive: Hardware Prototyping 101',
    provider: 'Kumasi Hive',
    url: 'https://kumasihive.com/',
    type: 'VIDEO',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 120,
    skills: ['prototyping', 'electronics', 'product design'],
    description: 'Hardware workshop intro — Arduino, sensors, enclosure basics.'
  },

  // ---- Ghana Code Club -------------------------------------------------
  {
    title: 'Ghana Code Club: Web Development for Beginners',
    provider: 'Ghana Code Club',
    url: 'https://ghanacodeclub.org/programs',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 1800,
    skills: ['html', 'css', 'javascript', 'web development'],
    description: 'Local-language friendly web dev curriculum — built for Ghanaian teens and grads.'
  },
  {
    title: 'Ghana Code Club: Intro to Python',
    provider: 'Ghana Code Club',
    url: 'https://ghanacodeclub.org/',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREE',
    durationMin: 1200,
    skills: ['python', 'algorithms'],
    description: 'Beginner Python with West-African examples — from variables to a small project.'
  },

  // ---- University of Ghana Learn ---------------------------------------
  {
    title: 'UG Learn: Academic Writing for Graduate Students',
    provider: 'University of Ghana Learn',
    url: 'https://learn.ug.edu.gh/',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    durationMin: 900,
    skills: ['english writing', 'research methods'],
    description: 'UG\'s LMS course on argumentation, citation, and academic register.'
  },
  {
    title: 'UG Learn: Research Methods in the Social Sciences',
    provider: 'University of Ghana Learn',
    url: 'https://learn.ug.edu.gh/courses',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    durationMin: 1500,
    skills: ['research methods', 'statistics', 'data analysis'],
    description: 'Mixed-methods primer — designs, sampling, basic stats, write-up.'
  },

  // ---- African Leadership University -----------------------------------
  {
    title: 'ALU: Conservation Leadership',
    provider: 'African Leadership University',
    url: 'https://www.alueducation.com/',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'PAID',
    durationMin: 3600,
    skills: ['conservation', 'leadership', 'policy analysis'],
    description: 'ALU\'s flagship undergrad track for conservation leaders across Africa.'
  },
  {
    title: 'ALU Open Resources: Mission-Driven Career Design',
    provider: 'African Leadership University',
    url: 'https://www.alueducation.com/about/our-mission/',
    type: 'ARTICLE',
    level: 'BEGINNER',
    cost: 'FREE',
    skills: ['career planning', 'leadership'],
    description: 'ALU\'s public materials on building a 7-year career narrative around a mission.'
  },

  // ---- Books -----------------------------------------------------------
  {
    title: 'Designing Your Life — Bill Burnett & Dave Evans',
    provider: 'Knopf',
    url: 'https://designingyour.life/the-book/',
    type: 'BOOK',
    level: 'BEGINNER',
    cost: 'PAID',
    skills: ['career planning', 'design thinking'],
    description: 'Stanford d.school designers apply prototyping to your career and life.'
  },
  {
    title: 'The Lean Startup — Eric Ries',
    provider: 'Crown Business',
    url: 'https://theleanstartup.com/book',
    type: 'BOOK',
    level: 'INTERMEDIATE',
    cost: 'PAID',
    skills: ['entrepreneurship', 'product management'],
    description: 'Build–measure–learn — the operating system for modern startups.'
  },
  {
    title: 'The Pragmatic Programmer — David Thomas & Andrew Hunt',
    provider: 'Addison-Wesley',
    url: 'https://pragprog.com/titles/tpp20/the-pragmatic-programmer-20th-anniversary-edition/',
    type: 'BOOK',
    level: 'INTERMEDIATE',
    cost: 'PAID',
    skills: ['software engineering', 'craftsmanship'],
    description: 'The classic on what it takes to be a craftsman developer.'
  },
  {
    title: 'Sustainable Energy — Without the Hot Air (David MacKay)',
    provider: 'UIT Cambridge',
    url: 'https://www.withouthotair.com/',
    type: 'BOOK',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    skills: ['renewables', 'energy policy', 'sustainability'],
    description: 'Free, numerate, and beautifully clear — the energy-systems book to read first.'
  },

  // ---- Articles --------------------------------------------------------
  {
    title: 'Paul Graham — How to Start a Startup',
    provider: 'paulgraham.com',
    url: 'https://www.paulgraham.com/start.html',
    type: 'ARTICLE',
    level: 'BEGINNER',
    cost: 'FREE',
    skills: ['entrepreneurship'],
    description: 'The seminal essay on what actually matters when starting a company.'
  },
  {
    title: 'Stratechery — Aggregation Theory',
    provider: 'Stratechery',
    url: 'https://stratechery.com/2015/aggregation-theory/',
    type: 'ARTICLE',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    skills: ['business strategy', 'product management'],
    description: 'Ben Thompson\'s framework that explains modern internet competition in 15 minutes.'
  },
  {
    title: 'NREL — Best Research-Cell Efficiency Chart',
    provider: 'NREL',
    url: 'https://www.nrel.gov/pv/cell-efficiency.html',
    type: 'ARTICLE',
    level: 'ADVANCED',
    cost: 'FREE',
    skills: ['solar pv', 'renewables', 'research methods'],
    description: 'The single chart every PV researcher cites — updated quarterly.'
  },
  {
    title: 'IEA — Africa Energy Outlook',
    provider: 'International Energy Agency',
    url: 'https://www.iea.org/reports/africa-energy-outlook-2022',
    type: 'ARTICLE',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    skills: ['energy policy', 'sustainability', 'africa'],
    description: 'IEA\'s definitive read on Africa\'s energy demand, supply, and transition.'
  },

  // ---- Podcasts --------------------------------------------------------
  {
    title: 'The Flip — Africa\'s startup ecosystem',
    provider: 'The Flip',
    url: 'https://theflip.africa/',
    type: 'PODCAST',
    level: 'BEGINNER',
    cost: 'FREE',
    skills: ['entrepreneurship', 'africa'],
    description: 'Interviews with founders, operators, and investors building across Africa.'
  },
  {
    title: 'Catalyst with Shayle Kann — Climate tech',
    provider: 'Latitude Media',
    url: 'https://www.latitudemedia.com/podcasts/catalyst',
    type: 'PODCAST',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    skills: ['climate science', 'renewables', 'venture capital'],
    description: 'Deep dives into the science, economics, and politics of climate tech.'
  },
  {
    title: 'Lex Fridman — AI & engineering conversations',
    provider: 'Lex Fridman Podcast',
    url: 'https://lexfridman.com/podcast/',
    type: 'PODCAST',
    level: 'INTERMEDIATE',
    cost: 'FREE',
    skills: ['machine learning', 'software engineering'],
    description: 'Long-form interviews with researchers and engineers shaping the field.'
  },
  {
    title: 'Akoma Mma — Career stories of Ghanaian women',
    provider: 'Akoma Mma',
    url: 'https://anchor.fm/akomamma',
    type: 'PODCAST',
    level: 'BEGINNER',
    cost: 'FREE',
    skills: ['career planning', 'leadership', 'storytelling'],
    description: 'Career-journey interviews focused on Ghanaian women in business and STEM.'
  },

  // ---- Final fillers to round out skills coverage ----------------------
  {
    title: 'ESG Investing: Concepts, Strategies & Examples',
    provider: 'Coursera',
    url: 'https://www.coursera.org/learn/esg-investing',
    type: 'COURSE',
    level: 'INTERMEDIATE',
    cost: 'FREEMIUM',
    durationMin: 600,
    skills: ['esg', 'finance', 'sustainability'],
    description: 'NYU course laying out the ESG framework investors and consultants now use daily.'
  },
  {
    title: 'Excel Skills for Business Specialization',
    provider: 'Coursera',
    url: 'https://www.coursera.org/specializations/excel',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREEMIUM',
    durationMin: 3600,
    skills: ['spreadsheets', 'data analysis'],
    description: 'Macquarie University\'s 4-course Excel path, from intro to advanced.'
  },
  {
    title: 'Public Speaking — University of Washington',
    provider: 'edX',
    url: 'https://www.edx.org/learn/public-speaking',
    type: 'COURSE',
    level: 'BEGINNER',
    cost: 'FREEMIUM',
    durationMin: 600,
    skills: ['communication', 'storytelling'],
    description: 'Build the core skill nobody teaches you in engineering school.'
  },
  {
    title: 'Negotiation Mastery — HBS Online',
    provider: 'HBS Online',
    url: 'https://online.hbs.edu/courses/negotiation-mastery/',
    type: 'COURSE',
    level: 'ADVANCED',
    cost: 'PAID',
    durationMin: 2400,
    skills: ['negotiation', 'communication', 'leadership'],
    description: 'HBS\'s flagship online negotiation course — case-based, instructor-led cohorts.'
  }
];

// Idempotently upsert resources by URL. We can\'t use @unique on `url` without
// a migration, so we look it up first.
export async function seedLearningResources(): Promise<{ created: number; updated: number; total: number }> {
  let created = 0;
  let updated = 0;
  for (const r of RESOURCES) {
    const existing = await prisma.learningResource.findFirst({
      where: { url: r.url },
      select: { id: true }
    });
    if (existing) {
      await prisma.learningResource.update({
        where: { id: existing.id },
        data: {
          title: r.title,
          provider: r.provider,
          type: r.type,
          level: r.level,
          cost: r.cost,
          language: r.language ?? 'English',
          durationMin: r.durationMin ?? null,
          skills: r.skills.map((s) => s.toLowerCase()),
          description: r.description,
          isApproved: true
        }
      });
      updated += 1;
    } else {
      await prisma.learningResource.create({
        data: {
          title: r.title,
          provider: r.provider,
          url: r.url,
          type: r.type,
          level: r.level,
          cost: r.cost,
          language: r.language ?? 'English',
          durationMin: r.durationMin ?? null,
          skills: r.skills.map((s) => s.toLowerCase()),
          description: r.description,
          isApproved: true
        }
      });
      created += 1;
    }
  }
  return { created, updated, total: RESOURCES.length };
}

// ---- Paths ---------------------------------------------------------------

type SeedPath = {
  slug: string;
  name: string;
  description: string;
  // Each step references a seeded resource by its URL (stable across reseeds)
  // plus an optional note. We resolve URL -> id at seed time.
  steps: { url: string; note?: string }[];
};

const PATHS: SeedPath[] = [
  {
    slug: 'from-environmental-engineer-to-climate-policy-analyst',
    name: 'Environmental Engineer to Climate Policy Analyst',
    description: 'Pivot from on-the-ground environmental engineering into climate policy and advocacy work.',
    steps: [
      { url: 'https://www.coursera.org/learn/climate-change-science', note: 'Build the climate-science vocabulary policy work assumes.' },
      { url: 'https://www.open.edu/openlearn/nature-environment/climate-change-transitions-sustainability/content-section-overview', note: 'How societies actually transition — case studies you\'ll cite forever.' },
      { url: 'https://www.iea.org/reports/africa-energy-outlook-2022', note: 'Anchor your African analysis to the IEA\'s data.' },
      { url: 'https://www.khanacademy.org/economics-finance-domain/macroeconomics', note: 'Economics is the second language of policy work.' },
      { url: 'https://www.coursera.org/learn/esg-investing', note: 'Get fluent in ESG — half of climate policy is investor-facing.' },
      { url: 'https://learn.ug.edu.gh/', note: 'Sharpen academic writing for white papers and briefs.' }
    ]
  },
  {
    slug: 'natural-resources-to-esg-consulting',
    name: 'Natural Resources to ESG Consulting',
    description: 'Translate field experience in natural-resource management into a consulting role.',
    steps: [
      { url: 'https://www.coursera.org/learn/esg-investing', note: 'Frameworks every ESG consultant uses on day one.' },
      { url: 'https://www.coursera.org/specializations/excel', note: 'Excel modelling fluency is non-negotiable.' },
      { url: 'https://www.coursera.org/professional-certificates/google-data-analytics', note: 'Add a real data-analysis cert to your CV.' },
      { url: 'https://www.coursera.org/specializations/gis-mapping-spatial-analysis', note: 'GIS skills set you apart on land-use projects.' },
      { url: 'https://online.hbs.edu/courses/negotiation-mastery/', note: 'Consultants negotiate scope, price, and conclusions.' },
      { url: 'https://exec.ashesi.edu.gh/', note: 'Build a leadership signal local clients trust.' }
    ]
  },
  {
    slug: 'graduate-to-research-assistant',
    name: 'New Graduate to Research Assistant',
    description: 'A focused on-ramp for fresh graduates aiming at university or NGO research roles.',
    steps: [
      { url: 'https://www.open.edu/openlearn/education-development/succeeding-postgraduate-study/content-section-overview', note: 'Study habits and writing register — start here.' },
      { url: 'https://learn.ug.edu.gh/courses', note: 'Mixed-methods primer with Ghanaian examples.' },
      { url: 'https://learn.ug.edu.gh/', note: 'Dial in your academic writing voice.' },
      { url: 'https://www.khanacademy.org/math/statistics-probability', note: 'Stats fluency carries you through any RA brief.' },
      { url: 'https://www.youtube.com/watch?v=oXf3kn1tQuk', note: 'Practical tour of a real research proposal.' }
    ]
  },
  {
    slug: 'from-cs-grad-to-data-analyst',
    name: 'CS Graduate to Data Analyst',
    description: 'Convert CS coursework into a hireable data-analyst skill stack.',
    steps: [
      { url: 'https://www.coursera.org/specializations/python', note: 'Solidify Python fundamentals and Pandas.' },
      { url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY', note: 'Single-sitting SQL bootcamp — make queries muscle memory.' },
      { url: 'https://www.coursera.org/professional-certificates/google-data-analytics', note: 'Capstone gives you a portfolio-ready project.' },
      { url: 'https://www.khanacademy.org/math/statistics-probability', note: 'Don\'t skip the stats foundation.' },
      { url: 'https://www.coursera.org/specializations/excel', note: 'Excel still wins for stakeholder-facing analysis.' },
      { url: 'https://www.coursera.org/professional-certificates/ibm-data-science', note: 'Stretch goal: layer on ML for senior-analyst roles.' }
    ]
  },
  {
    slug: 'from-energy-engineer-to-renewables-pm',
    name: 'Energy Engineer to Renewables Project Manager',
    description: 'Move from individual-contributor engineering into PM ownership of renewables projects.',
    steps: [
      { url: 'https://www.edx.org/learn/sustainability/delft-university-of-technology-sustainable-energy-design-a-renewable-future', note: 'TU Delft\'s system-level renewables design course.' },
      { url: 'https://www.edx.org/learn/solar-energy/delft-university-of-technology-solar-energy-photovoltaic-pv-energy-conversion', note: 'PV depth — you\'ll need it for solar-heavy portfolios.' },
      { url: 'https://www.coursera.org/specializations/project-management', note: 'PM frameworks, plain and structured.' },
      { url: 'https://www.edx.org/learn/project-management/the-university-of-adelaide-introduction-to-project-management', note: 'Quick PM primer if you want a concise refresh.' },
      { url: 'https://www.withouthotair.com/', note: 'Free, numerate book that sharpens your judgment.' },
      { url: 'https://online.hbs.edu/courses/negotiation-mastery/', note: 'PM is 50% negotiation — invest here.' }
    ]
  },
  {
    slug: 'petroleum-to-renewables-pivot',
    name: 'Petroleum to Renewables Pivot',
    description: 'Translate petroleum-engineering muscle memory into a credible renewables career story.',
    steps: [
      { url: 'https://www.withouthotair.com/', note: 'Re-baseline your intuitions about energy at scale.' },
      { url: 'https://www.iea.org/reports/africa-energy-outlook-2022', note: 'Know the African transition story cold.' },
      { url: 'https://www.edx.org/learn/sustainability/delft-university-of-technology-sustainable-energy-design-a-renewable-future', note: 'System-level renewables design.' },
      { url: 'https://www.edx.org/learn/solar-energy/delft-university-of-technology-solar-energy-photovoltaic-pv-energy-conversion', note: 'Build credible solar PV depth.' },
      { url: 'https://ocw.mit.edu/courses/2-65j-sustainable-energy-spring-2011/', note: 'MIT graduate-level survey — heavy but worth it.' },
      { url: 'https://www.latitudemedia.com/podcasts/catalyst', note: 'Stay current on the climate-tech market each week.' }
    ]
  }
];

export async function seedLearningPaths(): Promise<{ upserted: number; total: number }> {
  let upserted = 0;
  for (const p of PATHS) {
    // Resolve each step\'s URL to a resource id. Unknown URLs (e.g. if a
    // resource was renamed) are skipped silently so the seed never crashes.
    const resolvedSteps: { resourceId: string; note?: string }[] = [];
    for (const s of p.steps) {
      const r = await prisma.learningResource.findFirst({
        where: { url: s.url },
        select: { id: true }
      });
      if (r) resolvedSteps.push({ resourceId: r.id, note: s.note });
    }

    await prisma.learningPath.upsert({
      where: { slug: p.slug },
      update: { name: p.name, description: p.description, steps: resolvedSteps },
      create: { slug: p.slug, name: p.name, description: p.description, steps: resolvedSteps }
    });
    upserted += 1;
  }
  return { upserted, total: PATHS.length };
}
