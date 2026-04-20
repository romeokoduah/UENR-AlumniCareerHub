// Seed Skill + RoleProfile rows for the Skills Assessment tool.
//
// Two responsibilities:
//   1. seedSkills() upserts ~80 hand-curated skills covering the full spread
//      of UENR programmes (environmental engineering, renewable energy,
//      natural resources, mining, forestry, petroleum, computer science,
//      agriculture, economics, data science). Each skill carries a category
//      and (where useful) a list of synonyms so future ATS / fuzzy match
//      logic has somewhere to look.
//   2. seedRoles() upserts ~25 RoleProfiles relevant to UENR alumni career
//      paths. Each role lists 6-12 required + 4-6 preferred skill names
//      that match the Skill seed exactly so the assessment UI doesn't need
//      to reconcile them.
//
// Both functions are idempotent (Prisma upsert by unique key) so they can
// be re-run in production via `POST /api/skills/seed` after schema changes
// without duplicating rows.
//
// Can also be run standalone:  `bun run server/src/lib/seedSkillsRoles.ts`

import { pathToFileURL } from 'url';
import { prisma } from './prisma.js';

// ===== Skill catalogue ====================================================

type SeedSkill = { name: string; category: string; synonyms?: string[] };

const SKILLS: SeedSkill[] = [
  // ---- Engineering (general) ---------------------------------------------
  { name: 'AutoCAD', category: 'engineering', synonyms: ['CAD'] },
  { name: 'SolidWorks', category: 'engineering' },
  { name: 'MATLAB', category: 'engineering' },
  { name: 'Project Management', category: 'engineering', synonyms: ['PM', 'PMP'] },
  { name: 'Technical Drawing', category: 'engineering', synonyms: ['Drafting'] },
  { name: 'Site Supervision', category: 'engineering' },
  { name: 'Quality Control', category: 'engineering', synonyms: ['QA/QC', 'QC'] },
  { name: 'Health and Safety', category: 'engineering', synonyms: ['HSE', 'EHS'] },

  // ---- Environmental / Sustainability ------------------------------------
  { name: 'Environmental Impact Assessment', category: 'engineering', synonyms: ['EIA'] },
  { name: 'Environmental Auditing', category: 'engineering' },
  { name: 'Waste Management', category: 'engineering' },
  { name: 'Water Quality Analysis', category: 'engineering' },
  { name: 'Air Quality Monitoring', category: 'engineering' },
  { name: 'Climate Change Mitigation', category: 'engineering', synonyms: ['Carbon Mitigation'] },
  { name: 'GIS', category: 'engineering', synonyms: ['Geographic Information Systems', 'ArcGIS', 'QGIS'] },
  { name: 'Remote Sensing', category: 'engineering' },
  { name: 'Sustainability Reporting', category: 'business', synonyms: ['GRI', 'ESG Reporting'] },
  { name: 'ESG Analysis', category: 'business', synonyms: ['ESG'] },

  // ---- Energy ------------------------------------------------------------
  { name: 'Solar PV Design', category: 'energy', synonyms: ['Solar Design', 'PV Design'] },
  { name: 'PV Installation', category: 'energy', synonyms: ['Solar Installation'] },
  { name: 'PVsyst', category: 'energy' },
  { name: 'Wind Energy', category: 'energy' },
  { name: 'Energy Auditing', category: 'energy' },
  { name: 'Energy Modeling', category: 'energy', synonyms: ['HOMER', 'RETScreen'] },
  { name: 'Power Systems', category: 'energy' },
  { name: 'Grid Integration', category: 'energy' },
  { name: 'Battery Storage', category: 'energy', synonyms: ['BESS'] },
  { name: 'Mini-Grid Design', category: 'energy', synonyms: ['Microgrid'] },
  { name: 'Renewable Energy Policy', category: 'energy' },

  // ---- Natural resources / Mining / Forestry / Petroleum -----------------
  { name: 'Mineral Exploration', category: 'engineering' },
  { name: 'Mine Surveying', category: 'engineering' },
  { name: 'Drill and Blast', category: 'engineering' },
  { name: 'Rock Mechanics', category: 'engineering' },
  { name: 'Mineral Processing', category: 'engineering' },
  { name: 'Forest Inventory', category: 'engineering' },
  { name: 'Silviculture', category: 'engineering' },
  { name: 'Wildlife Conservation', category: 'engineering' },
  { name: 'Reservoir Engineering', category: 'engineering' },
  { name: 'Drilling Engineering', category: 'engineering' },
  { name: 'Petroleum Geology', category: 'engineering' },
  { name: 'Well Logging', category: 'engineering' },

  // ---- Agriculture -------------------------------------------------------
  { name: 'Agronomy', category: 'engineering' },
  { name: 'Soil Science', category: 'engineering' },
  { name: 'Crop Management', category: 'engineering' },
  { name: 'Irrigation Design', category: 'engineering' },
  { name: 'Farm Management', category: 'business' },
  { name: 'Agricultural Extension', category: 'business' },

  // ---- Computer Science / Data -------------------------------------------
  { name: 'JavaScript', category: 'data', synonyms: ['JS', 'ECMAScript'] },
  { name: 'TypeScript', category: 'data', synonyms: ['TS'] },
  { name: 'Python', category: 'data' },
  { name: 'React', category: 'data', synonyms: ['React.js'] },
  { name: 'Node.js', category: 'data', synonyms: ['Node'] },
  { name: 'SQL', category: 'data' },
  { name: 'PostgreSQL', category: 'data', synonyms: ['Postgres'] },
  { name: 'Git', category: 'tools', synonyms: ['GitHub', 'GitLab'] },
  { name: 'REST APIs', category: 'data', synonyms: ['REST', 'HTTP APIs'] },
  { name: 'Linux', category: 'tools' },
  { name: 'Docker', category: 'tools' },
  { name: 'Cloud Computing', category: 'tools', synonyms: ['AWS', 'Azure', 'GCP'] },
  { name: 'Data Analysis', category: 'data' },
  { name: 'Excel', category: 'tools', synonyms: ['Microsoft Excel', 'Spreadsheets'] },
  { name: 'Power BI', category: 'data' },
  { name: 'Tableau', category: 'data' },
  { name: 'Machine Learning', category: 'data', synonyms: ['ML'] },
  { name: 'Statistics', category: 'data' },
  { name: 'R Programming', category: 'data', synonyms: ['R'] },
  { name: 'Data Visualization', category: 'data', synonyms: ['Dataviz'] },
  { name: 'SPSS', category: 'data' },

  // ---- Business / Economics ----------------------------------------------
  { name: 'Financial Modeling', category: 'business' },
  { name: 'Budgeting', category: 'business' },
  { name: 'Cost Analysis', category: 'business' },
  { name: 'Procurement', category: 'business' },
  { name: 'Supply Chain Management', category: 'business', synonyms: ['SCM', 'Logistics'] },
  { name: 'Stakeholder Engagement', category: 'business' },
  { name: 'Public Policy Analysis', category: 'business', synonyms: ['Policy Analysis'] },
  { name: 'Grant Writing', category: 'business' },
  { name: 'Market Research', category: 'business' },
  { name: 'Product Strategy', category: 'business' },
  { name: 'Agile / Scrum', category: 'business', synonyms: ['Scrum', 'Agile'] },

  // ---- Health / Public Health --------------------------------------------
  { name: 'Epidemiology', category: 'data' },
  { name: 'Public Health Research', category: 'data' },
  { name: 'Health Promotion', category: 'business' },

  // ---- Soft skills -------------------------------------------------------
  { name: 'Communication', category: 'soft' },
  { name: 'Technical Writing', category: 'soft' },
  { name: 'Report Writing', category: 'soft' },
  { name: 'Presentation Skills', category: 'soft' },
  { name: 'Teamwork', category: 'soft' },
  { name: 'Leadership', category: 'soft' },
  { name: 'Problem Solving', category: 'soft' },
  { name: 'Critical Thinking', category: 'soft' },
  { name: 'Time Management', category: 'soft' },
  { name: 'Negotiation', category: 'soft' },

  // ---- Tools / Languages -------------------------------------------------
  { name: 'Microsoft Office', category: 'tools', synonyms: ['MS Office'] },
  { name: 'Google Workspace', category: 'tools', synonyms: ['G Suite'] },
  { name: 'English Language', category: 'soft' },
  { name: 'Twi / Akan', category: 'soft', synonyms: ['Akan'] }
];

export async function seedSkills(): Promise<number> {
  let count = 0;
  for (const s of SKILLS) {
    await prisma.skill.upsert({
      where: { name: s.name },
      create: { name: s.name, category: s.category, synonyms: s.synonyms ?? [] },
      update: { category: s.category, synonyms: s.synonyms ?? [] }
    });
    count++;
  }
  return count;
}

// ===== Role catalogue =====================================================

type SeedRole = {
  slug: string;
  name: string;
  category: string;
  description?: string;
  required: string[];
  preferred: string[];
};

const ROLES: SeedRole[] = [
  // ---- Environmental engineering -----------------------------------------
  {
    slug: 'environmental-engineer',
    name: 'Environmental Engineer',
    category: 'engineering',
    description: 'Design + monitor environmental control systems and assess project impact.',
    required: [
      'Environmental Impact Assessment', 'Water Quality Analysis', 'Air Quality Monitoring',
      'Waste Management', 'GIS', 'Technical Drawing', 'Report Writing', 'Communication'
    ],
    preferred: ['Sustainability Reporting', 'AutoCAD', 'Project Management', 'Environmental Auditing']
  },
  {
    slug: 'climate-policy-analyst',
    name: 'Climate Policy Analyst',
    category: 'business',
    description: 'Translate climate science into actionable policy and corporate strategy.',
    required: [
      'Public Policy Analysis', 'Climate Change Mitigation', 'Stakeholder Engagement',
      'Report Writing', 'Communication', 'Critical Thinking', 'Data Analysis'
    ],
    preferred: ['ESG Analysis', 'Sustainability Reporting', 'Grant Writing', 'Presentation Skills']
  },
  {
    slug: 'esg-consultant',
    name: 'ESG Consultant',
    category: 'business',
    description: 'Advise organisations on environmental, social, and governance disclosure.',
    required: [
      'ESG Analysis', 'Sustainability Reporting', 'Stakeholder Engagement',
      'Report Writing', 'Communication', 'Critical Thinking', 'Data Analysis', 'Excel'
    ],
    preferred: ['Environmental Auditing', 'Project Management', 'Presentation Skills', 'Grant Writing']
  },

  // ---- Renewable energy --------------------------------------------------
  {
    slug: 'renewable-energy-engineer',
    name: 'Renewable Energy Engineer',
    category: 'energy',
    description: 'Design and commission solar, wind, and hybrid renewable systems.',
    required: [
      'Solar PV Design', 'Energy Modeling', 'Power Systems', 'AutoCAD',
      'PVsyst', 'Technical Drawing', 'Site Supervision', 'Communication'
    ],
    preferred: ['Wind Energy', 'Battery Storage', 'Grid Integration', 'Project Management', 'MATLAB']
  },
  {
    slug: 'solar-pv-installer',
    name: 'Solar PV Installer',
    category: 'energy',
    description: 'Install and commission rooftop and ground-mount PV systems.',
    required: [
      'PV Installation', 'Solar PV Design', 'Health and Safety', 'Technical Drawing',
      'Site Supervision', 'Quality Control', 'Communication'
    ],
    preferred: ['Battery Storage', 'PVsyst', 'Mini-Grid Design', 'Energy Auditing']
  },
  {
    slug: 'energy-auditor',
    name: 'Energy Auditor',
    category: 'energy',
    description: 'Audit buildings and industrial processes for energy efficiency wins.',
    required: [
      'Energy Auditing', 'Power Systems', 'Excel', 'Report Writing',
      'Data Analysis', 'Technical Writing', 'Communication'
    ],
    preferred: ['Energy Modeling', 'Renewable Energy Policy', 'Project Management', 'Solar PV Design']
  },
  {
    slug: 'mini-grid-engineer',
    name: 'Mini-Grid Engineer',
    category: 'energy',
    description: 'Design off-grid and rural electrification systems for last-mile communities.',
    required: [
      'Mini-Grid Design', 'Solar PV Design', 'Battery Storage', 'Power Systems',
      'Energy Modeling', 'AutoCAD', 'Site Supervision', 'Communication'
    ],
    preferred: ['Grid Integration', 'Stakeholder Engagement', 'Project Management', 'PVsyst']
  },

  // ---- Mining ------------------------------------------------------------
  {
    slug: 'mining-engineer',
    name: 'Mining Engineer',
    category: 'engineering',
    description: 'Plan and supervise extraction operations safely and efficiently.',
    required: [
      'Mineral Exploration', 'Mine Surveying', 'Drill and Blast', 'Rock Mechanics',
      'Health and Safety', 'AutoCAD', 'Technical Drawing', 'Site Supervision'
    ],
    preferred: ['Mineral Processing', 'Project Management', 'GIS', 'Environmental Impact Assessment']
  },
  {
    slug: 'mineral-processing-engineer',
    name: 'Mineral Processing Engineer',
    category: 'engineering',
    description: 'Design and run plants that crush, separate, and refine ores.',
    required: [
      'Mineral Processing', 'Quality Control', 'Health and Safety', 'Technical Drawing',
      'Report Writing', 'Communication', 'Site Supervision'
    ],
    preferred: ['Project Management', 'AutoCAD', 'MATLAB', 'Cost Analysis']
  },

  // ---- Forestry / Natural resources --------------------------------------
  {
    slug: 'forestry-officer',
    name: 'Forestry Officer',
    category: 'engineering',
    description: 'Steward forest reserves, run inventories, and enforce regulations.',
    required: [
      'Forest Inventory', 'Silviculture', 'GIS', 'Wildlife Conservation',
      'Report Writing', 'Communication', 'Stakeholder Engagement'
    ],
    preferred: ['Remote Sensing', 'Environmental Impact Assessment', 'Project Management', 'Public Policy Analysis']
  },
  {
    slug: 'wildlife-conservation-officer',
    name: 'Wildlife Conservation Officer',
    category: 'engineering',
    description: 'Protect and monitor wildlife populations across protected areas.',
    required: [
      'Wildlife Conservation', 'GIS', 'Forest Inventory', 'Report Writing',
      'Communication', 'Stakeholder Engagement', 'Critical Thinking'
    ],
    preferred: ['Remote Sensing', 'Grant Writing', 'Public Policy Analysis', 'Data Analysis']
  },

  // ---- Petroleum ---------------------------------------------------------
  {
    slug: 'petroleum-engineer',
    name: 'Petroleum Engineer',
    category: 'engineering',
    description: 'Design and operate oil & gas drilling and production systems.',
    required: [
      'Reservoir Engineering', 'Drilling Engineering', 'Petroleum Geology', 'Well Logging',
      'Health and Safety', 'Technical Drawing', 'Report Writing', 'Communication'
    ],
    preferred: ['MATLAB', 'AutoCAD', 'Project Management', 'Cost Analysis']
  },

  // ---- Software / Data ---------------------------------------------------
  {
    slug: 'software-engineer',
    name: 'Software Engineer',
    category: 'data',
    description: 'Build and maintain web or backend systems end-to-end.',
    required: [
      'JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'Git', 'REST APIs', 'Problem Solving'
    ],
    preferred: ['PostgreSQL', 'Docker', 'Cloud Computing', 'Linux', 'Agile / Scrum']
  },
  {
    slug: 'data-analyst',
    name: 'Data Analyst',
    category: 'data',
    description: 'Pull, clean, and visualise data to drive product and business decisions.',
    required: [
      'SQL', 'Excel', 'Data Analysis', 'Data Visualization', 'Statistics',
      'Communication', 'Critical Thinking', 'Report Writing'
    ],
    preferred: ['Python', 'Power BI', 'Tableau', 'R Programming', 'Presentation Skills']
  },
  {
    slug: 'data-scientist',
    name: 'Data Scientist',
    category: 'data',
    description: 'Build models that turn raw data into predictions and product features.',
    required: [
      'Python', 'Statistics', 'Machine Learning', 'SQL', 'Data Analysis',
      'Data Visualization', 'Communication', 'Problem Solving'
    ],
    preferred: ['R Programming', 'Cloud Computing', 'Git', 'Critical Thinking', 'Presentation Skills']
  },
  {
    slug: 'gis-analyst',
    name: 'GIS Analyst',
    category: 'data',
    description: 'Map and analyse spatial data for planning, environment, or logistics.',
    required: [
      'GIS', 'Remote Sensing', 'Data Analysis', 'Excel', 'Report Writing',
      'Communication', 'Critical Thinking'
    ],
    preferred: ['Python', 'SQL', 'Data Visualization', 'Project Management']
  },

  // ---- Research / Field --------------------------------------------------
  {
    slug: 'field-research-assistant',
    name: 'Field Research Assistant',
    category: 'data',
    description: 'Collect and clean primary field data for academic or NGO studies.',
    required: [
      'Data Analysis', 'Excel', 'Report Writing', 'Communication',
      'Teamwork', 'Time Management', 'Critical Thinking'
    ],
    preferred: ['SPSS', 'GIS', 'Statistics', 'Technical Writing']
  },
  {
    slug: 'public-health-analyst',
    name: 'Public Health Analyst',
    category: 'data',
    description: 'Analyse health data to inform interventions and policy.',
    required: [
      'Public Health Research', 'Epidemiology', 'Statistics', 'Excel',
      'Data Analysis', 'Report Writing', 'Communication'
    ],
    preferred: ['R Programming', 'SPSS', 'Health Promotion', 'Public Policy Analysis']
  },

  // ---- Agriculture / Agribusiness ----------------------------------------
  {
    slug: 'agribusiness-analyst',
    name: 'Agribusiness Analyst',
    category: 'business',
    description: 'Run financial and market analysis across the agricultural value chain.',
    required: [
      'Financial Modeling', 'Market Research', 'Excel', 'Data Analysis',
      'Report Writing', 'Communication', 'Critical Thinking'
    ],
    preferred: ['Farm Management', 'Agronomy', 'Supply Chain Management', 'Presentation Skills']
  },
  {
    slug: 'agricultural-extension-officer',
    name: 'Agricultural Extension Officer',
    category: 'business',
    description: 'Bring research-backed practices to smallholder farmers in the field.',
    required: [
      'Agricultural Extension', 'Agronomy', 'Crop Management', 'Communication',
      'Stakeholder Engagement', 'Report Writing', 'Teamwork'
    ],
    preferred: ['Soil Science', 'Irrigation Design', 'Farm Management', 'Presentation Skills']
  },

  // ---- Business / Ops ----------------------------------------------------
  {
    slug: 'product-manager',
    name: 'Product Manager',
    category: 'business',
    description: 'Decide what to build, why, and when — and ship it with the team.',
    required: [
      'Product Strategy', 'Stakeholder Engagement', 'Communication', 'Critical Thinking',
      'Data Analysis', 'Presentation Skills', 'Problem Solving', 'Agile / Scrum'
    ],
    preferred: ['SQL', 'Market Research', 'Leadership', 'Negotiation']
  },
  {
    slug: 'procurement-officer',
    name: 'Procurement Officer',
    category: 'business',
    description: 'Source goods + services efficiently and compliantly.',
    required: [
      'Procurement', 'Supply Chain Management', 'Negotiation', 'Cost Analysis',
      'Excel', 'Communication', 'Report Writing'
    ],
    preferred: ['Microsoft Office', 'Stakeholder Engagement', 'Project Management', 'Critical Thinking']
  },
  {
    slug: 'project-coordinator',
    name: 'Project Coordinator',
    category: 'business',
    description: 'Keep multi-stakeholder projects on schedule, on budget, and on scope.',
    required: [
      'Project Management', 'Communication', 'Stakeholder Engagement', 'Time Management',
      'Report Writing', 'Excel', 'Microsoft Office'
    ],
    preferred: ['Budgeting', 'Presentation Skills', 'Leadership', 'Agile / Scrum']
  },
  {
    slug: 'sustainability-analyst',
    name: 'Sustainability Analyst',
    category: 'business',
    description: 'Measure and report on a company\'s environmental + social footprint.',
    required: [
      'Sustainability Reporting', 'ESG Analysis', 'Data Analysis', 'Excel',
      'Report Writing', 'Communication', 'Critical Thinking'
    ],
    preferred: ['Climate Change Mitigation', 'Stakeholder Engagement', 'Presentation Skills', 'Power BI']
  }
];

export async function seedRoles(): Promise<number> {
  let count = 0;
  for (const r of ROLES) {
    await prisma.roleProfile.upsert({
      where: { slug: r.slug },
      create: {
        slug: r.slug,
        name: r.name,
        description: r.description ?? null,
        category: r.category,
        requiredSkills: r.required,
        preferredSkills: r.preferred
      },
      update: {
        name: r.name,
        description: r.description ?? null,
        category: r.category,
        requiredSkills: r.required,
        preferredSkills: r.preferred
      }
    });
    count++;
  }
  return count;
}

// ===== CLI entry point ====================================================
//
// Run via `bun run server/src/lib/seedSkillsRoles.ts`. Guard ensures the
// script body only executes when this file is the program entry — importing
// it from a route handler is a no-op.

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  (async () => {
    console.log('Seeding skills…');
    const skills = await seedSkills();
    console.log(`  upserted ${skills} skills`);
    console.log('Seeding roles…');
    const roles = await seedRoles();
    console.log(`  upserted ${roles} roles`);
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
