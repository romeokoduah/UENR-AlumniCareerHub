// Seed CareerPathNode rows for the Career Path Explorer tool.
//
// Upserts ~45 nodes across 10 industries and 5 levels (Junior → Principal),
// with realistic GHS monthly salary bands grounded in 2024–2026 Ghana market
// norms. Each node points forward to typical next roles via `nextNodeSlugs`,
// modelling both vertical climbs (junior → mid → senior in the same role)
// and a few cross-industry pivots (e.g. mid environmental engineer → mid
// ESG consultant) so the graph reflects how UENR alumni actually move.
//
// `requiredSkills` are plain strings that mirror entries in the Skill seed
// (server/src/lib/seedSkillsRoles.ts) so the UI can resolve them to the
// Learning Hub later if we want — but no FK is enforced.
//
// Idempotent (Prisma upsert by unique slug). Run via:
//   POST /api/paths/seed                 (ADMIN, in production)
//   bun run server/src/lib/seedCareerPaths.ts   (locally)

import { pathToFileURL } from 'url';
import { prisma } from './prisma.js';

type SeedNode = {
  slug: string;
  role: string;
  level: 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
  industry:
    | 'renewable-energy'
    | 'environmental'
    | 'mining'
    | 'forestry'
    | 'petroleum'
    | 'software-data'
    | 'business-finance'
    | 'policy-public'
    | 'agribusiness'
    | 'consulting';
  salaryGhsMin: number;
  salaryGhsMax: number;
  yearsTypical: number;
  description: string;
  requiredSkills: string[];
  nextNodeSlugs: string[];
};

// Salary anchors (GHS / month, 2024–2026 Ghana norms):
//   Junior     3,000 – 7,000
//   Mid        7,000 – 14,000
//   Senior    14,000 – 25,000
//   Lead      25,000 – 40,000
//   Principal 40,000 – 80,000
// Petroleum + mining skew higher; policy/public + forestry skew lower;
// renewable-energy + software-data sit roughly in the middle.

const NODES: SeedNode[] = [
  // ===== Renewable Energy ================================================
  {
    slug: 'junior-solar-pv-engineer',
    role: 'Solar PV Engineer',
    level: 'junior',
    industry: 'renewable-energy',
    salaryGhsMin: 3500,
    salaryGhsMax: 6500,
    yearsTypical: 2,
    description: 'Size and lay out residential and small commercial PV systems under supervision.',
    requiredSkills: ['Solar PV Design', 'PVsyst', 'AutoCAD', 'Health and Safety'],
    nextNodeSlugs: ['mid-solar-pv-engineer', 'mid-energy-auditor']
  },
  {
    slug: 'mid-solar-pv-engineer',
    role: 'Solar PV Engineer',
    level: 'mid',
    industry: 'renewable-energy',
    salaryGhsMin: 7500,
    salaryGhsMax: 13000,
    yearsTypical: 3,
    description: 'Own commercial PV designs end-to-end — sizing, single-line diagrams, commissioning.',
    requiredSkills: ['Solar PV Design', 'PVsyst', 'Energy Modeling', 'Power Systems', 'Site Supervision'],
    nextNodeSlugs: ['senior-renewable-energy-engineer', 'mid-mini-grid-engineer']
  },
  {
    slug: 'mid-mini-grid-engineer',
    role: 'Mini-Grid Engineer',
    level: 'mid',
    industry: 'renewable-energy',
    salaryGhsMin: 8000,
    salaryGhsMax: 14000,
    yearsTypical: 3,
    description: 'Design hybrid solar+battery systems for off-grid and rural electrification.',
    requiredSkills: ['Mini-Grid Design', 'Battery Storage', 'Power Systems', 'Energy Modeling'],
    nextNodeSlugs: ['senior-renewable-energy-engineer']
  },
  {
    slug: 'senior-renewable-energy-engineer',
    role: 'Senior Renewable Energy Engineer',
    level: 'senior',
    industry: 'renewable-energy',
    salaryGhsMin: 15000,
    salaryGhsMax: 24000,
    yearsTypical: 4,
    description: 'Lead utility-scale solar and wind project design, EPC oversight, grid integration.',
    requiredSkills: ['Solar PV Design', 'Wind Energy', 'Grid Integration', 'Project Management'],
    nextNodeSlugs: ['lead-energy-project-manager']
  },
  {
    slug: 'mid-energy-auditor',
    role: 'Energy Auditor',
    level: 'mid',
    industry: 'renewable-energy',
    salaryGhsMin: 7000,
    salaryGhsMax: 12000,
    yearsTypical: 3,
    description: 'Audit buildings and industrial sites; write efficiency reports with payback maths.',
    requiredSkills: ['Energy Auditing', 'Power Systems', 'Excel', 'Report Writing'],
    nextNodeSlugs: ['senior-renewable-energy-engineer', 'mid-esg-consultant']
  },
  {
    slug: 'lead-energy-project-manager',
    role: 'Energy Project Manager',
    level: 'lead',
    industry: 'renewable-energy',
    salaryGhsMin: 26000,
    salaryGhsMax: 38000,
    yearsTypical: 4,
    description: 'Run multi-million-dollar renewable portfolios — budget, timeline, stakeholder mgmt.',
    requiredSkills: ['Project Management', 'Stakeholder Engagement', 'Cost Analysis', 'Leadership'],
    nextNodeSlugs: ['principal-energy-director']
  },
  {
    slug: 'principal-energy-director',
    role: 'Director of Energy Programs',
    level: 'principal',
    industry: 'renewable-energy',
    salaryGhsMin: 42000,
    salaryGhsMax: 70000,
    yearsTypical: 5,
    description: 'Set country-level renewable strategy across multiple portfolios and partners.',
    requiredSkills: ['Leadership', 'Renewable Energy Policy', 'Stakeholder Engagement', 'Negotiation'],
    nextNodeSlugs: []
  },

  // ===== Environmental ====================================================
  {
    slug: 'junior-environmental-engineer',
    role: 'Environmental Engineer',
    level: 'junior',
    industry: 'environmental',
    salaryGhsMin: 3500,
    salaryGhsMax: 6500,
    yearsTypical: 2,
    description: 'Support EIAs, water + air sampling, and basic remediation design.',
    requiredSkills: ['Environmental Impact Assessment', 'Water Quality Analysis', 'GIS', 'Report Writing'],
    nextNodeSlugs: ['mid-environmental-engineer', 'junior-eia-specialist']
  },
  {
    slug: 'mid-environmental-engineer',
    role: 'Environmental Engineer',
    level: 'mid',
    industry: 'environmental',
    salaryGhsMin: 8000,
    salaryGhsMax: 13500,
    yearsTypical: 3,
    description: 'Own EIA scopes, lead field campaigns, advise project teams on EPA compliance.',
    requiredSkills: ['Environmental Impact Assessment', 'Air Quality Monitoring', 'Waste Management', 'GIS'],
    nextNodeSlugs: ['senior-environmental-engineer', 'mid-esg-consultant']
  },
  {
    slug: 'senior-environmental-engineer',
    role: 'Senior Environmental Engineer',
    level: 'senior',
    industry: 'environmental',
    salaryGhsMin: 15000,
    salaryGhsMax: 23000,
    yearsTypical: 4,
    description: 'Manage EIA programmes, sign off technical reports, mentor junior engineers.',
    requiredSkills: ['Environmental Auditing', 'Project Management', 'Stakeholder Engagement', 'Report Writing'],
    nextNodeSlugs: ['lead-environmental-program-manager']
  },
  {
    slug: 'junior-eia-specialist',
    role: 'EIA Specialist',
    level: 'junior',
    industry: 'environmental',
    salaryGhsMin: 3800,
    salaryGhsMax: 6800,
    yearsTypical: 2,
    description: 'Draft EIA chapters and consult with Ghana EPA on permit applications.',
    requiredSkills: ['Environmental Impact Assessment', 'Report Writing', 'Stakeholder Engagement'],
    nextNodeSlugs: ['mid-environmental-engineer']
  },
  {
    slug: 'mid-waste-management-officer',
    role: 'Waste Management Officer',
    level: 'mid',
    industry: 'environmental',
    salaryGhsMin: 7000,
    salaryGhsMax: 12000,
    yearsTypical: 3,
    description: 'Run municipal or industrial waste programmes — collection, recycling, hazardous handling.',
    requiredSkills: ['Waste Management', 'Health and Safety', 'Project Management', 'Report Writing'],
    nextNodeSlugs: ['senior-environmental-engineer']
  },
  {
    slug: 'lead-environmental-program-manager',
    role: 'Environmental Program Manager',
    level: 'lead',
    industry: 'environmental',
    salaryGhsMin: 25000,
    salaryGhsMax: 36000,
    yearsTypical: 4,
    description: 'Lead environmental compliance and sustainability across multi-site operations.',
    requiredSkills: ['Project Management', 'Environmental Auditing', 'Leadership', 'Stakeholder Engagement'],
    nextNodeSlugs: ['principal-sustainability-director']
  },

  // ===== Mining ===========================================================
  {
    slug: 'junior-mining-engineer',
    role: 'Mining Engineer',
    level: 'junior',
    industry: 'mining',
    salaryGhsMin: 5000,
    salaryGhsMax: 8500,
    yearsTypical: 2,
    description: 'Support mine planning, drill-and-blast scheduling, and on-site safety audits.',
    requiredSkills: ['Mine Surveying', 'Drill and Blast', 'Health and Safety', 'AutoCAD'],
    nextNodeSlugs: ['mid-mining-engineer']
  },
  {
    slug: 'mid-mining-engineer',
    role: 'Mining Engineer',
    level: 'mid',
    industry: 'mining',
    salaryGhsMin: 10000,
    salaryGhsMax: 16000,
    yearsTypical: 3,
    description: 'Design pit layouts, run production targets, manage drill-and-blast contractors.',
    requiredSkills: ['Mineral Exploration', 'Mine Surveying', 'Rock Mechanics', 'Project Management'],
    nextNodeSlugs: ['senior-mining-engineer', 'mid-mineral-processing-engineer']
  },
  {
    slug: 'senior-mining-engineer',
    role: 'Senior Mining Engineer',
    level: 'senior',
    industry: 'mining',
    salaryGhsMin: 18000,
    salaryGhsMax: 28000,
    yearsTypical: 4,
    description: 'Own production for an entire pit or section; report to mine manager.',
    requiredSkills: ['Mine Surveying', 'Project Management', 'Leadership', 'Cost Analysis'],
    nextNodeSlugs: ['lead-mine-manager']
  },
  {
    slug: 'mid-mineral-processing-engineer',
    role: 'Mineral Processing Engineer',
    level: 'mid',
    industry: 'mining',
    salaryGhsMin: 9500,
    salaryGhsMax: 15500,
    yearsTypical: 3,
    description: 'Run gravity / flotation / leaching circuits; tune recovery and throughput.',
    requiredSkills: ['Mineral Processing', 'Quality Control', 'Health and Safety', 'Site Supervision'],
    nextNodeSlugs: ['senior-mining-engineer']
  },
  {
    slug: 'junior-geologist',
    role: 'Geologist',
    level: 'junior',
    industry: 'mining',
    salaryGhsMin: 4500,
    salaryGhsMax: 8000,
    yearsTypical: 2,
    description: 'Log core, map outcrops, and assist with resource estimation.',
    requiredSkills: ['Mineral Exploration', 'GIS', 'Report Writing', 'Technical Writing'],
    nextNodeSlugs: ['mid-mining-engineer']
  },
  {
    slug: 'lead-mine-manager',
    role: 'Mine Manager',
    level: 'lead',
    industry: 'mining',
    salaryGhsMin: 30000,
    salaryGhsMax: 45000,
    yearsTypical: 5,
    description: 'Run a full mine site — production, safety, community, and financial outcomes.',
    requiredSkills: ['Leadership', 'Project Management', 'Stakeholder Engagement', 'Health and Safety'],
    nextNodeSlugs: []
  },

  // ===== Forestry =========================================================
  {
    slug: 'junior-forester',
    role: 'Forester',
    level: 'junior',
    industry: 'forestry',
    salaryGhsMin: 3000,
    salaryGhsMax: 5500,
    yearsTypical: 2,
    description: 'Run forest inventories, support silviculture trials, patrol reserves.',
    requiredSkills: ['Forest Inventory', 'Silviculture', 'GIS', 'Report Writing'],
    nextNodeSlugs: ['mid-forester', 'mid-conservation-officer']
  },
  {
    slug: 'mid-forester',
    role: 'Forester',
    level: 'mid',
    industry: 'forestry',
    salaryGhsMin: 6500,
    salaryGhsMax: 11000,
    yearsTypical: 3,
    description: 'Manage a forest range; coordinate replanting, fire watch, and offtake compliance.',
    requiredSkills: ['Silviculture', 'GIS', 'Stakeholder Engagement', 'Project Management'],
    nextNodeSlugs: ['senior-forestry-officer']
  },
  {
    slug: 'mid-conservation-officer',
    role: 'Conservation Officer',
    level: 'mid',
    industry: 'forestry',
    salaryGhsMin: 6000,
    salaryGhsMax: 10500,
    yearsTypical: 3,
    description: 'Protect and monitor wildlife populations across protected areas.',
    requiredSkills: ['Wildlife Conservation', 'GIS', 'Forest Inventory', 'Report Writing'],
    nextNodeSlugs: ['senior-forestry-officer']
  },
  {
    slug: 'senior-forestry-officer',
    role: 'Senior Forestry Officer',
    level: 'senior',
    industry: 'forestry',
    salaryGhsMin: 13000,
    salaryGhsMax: 20000,
    yearsTypical: 4,
    description: 'Lead district-level forestry programmes and donor-funded projects.',
    requiredSkills: ['Project Management', 'Leadership', 'Public Policy Analysis', 'Grant Writing'],
    nextNodeSlugs: []
  },

  // ===== Petroleum ========================================================
  {
    slug: 'junior-drilling-engineer',
    role: 'Drilling Engineer',
    level: 'junior',
    industry: 'petroleum',
    salaryGhsMin: 6000,
    salaryGhsMax: 10000,
    yearsTypical: 2,
    description: 'Support drilling operations, mud programmes, and casing design under supervision.',
    requiredSkills: ['Drilling Engineering', 'Health and Safety', 'Technical Drawing', 'Report Writing'],
    nextNodeSlugs: ['mid-drilling-engineer', 'mid-production-engineer']
  },
  {
    slug: 'mid-drilling-engineer',
    role: 'Drilling Engineer',
    level: 'mid',
    industry: 'petroleum',
    salaryGhsMin: 12000,
    salaryGhsMax: 19000,
    yearsTypical: 3,
    description: 'Own well programmes from spud to TD; manage rig contractors and service vendors.',
    requiredSkills: ['Drilling Engineering', 'Well Logging', 'Project Management', 'Cost Analysis'],
    nextNodeSlugs: ['senior-petroleum-engineer']
  },
  {
    slug: 'mid-reservoir-engineer',
    role: 'Reservoir Engineer',
    level: 'mid',
    industry: 'petroleum',
    salaryGhsMin: 12000,
    salaryGhsMax: 19000,
    yearsTypical: 3,
    description: 'Build reservoir models, forecast production, plan EOR strategies.',
    requiredSkills: ['Reservoir Engineering', 'Petroleum Geology', 'MATLAB', 'Data Analysis'],
    nextNodeSlugs: ['senior-petroleum-engineer']
  },
  {
    slug: 'mid-production-engineer',
    role: 'Production Engineer',
    level: 'mid',
    industry: 'petroleum',
    salaryGhsMin: 11000,
    salaryGhsMax: 18000,
    yearsTypical: 3,
    description: 'Optimise well performance and surface facilities; troubleshoot artificial lift.',
    requiredSkills: ['Reservoir Engineering', 'Well Logging', 'Health and Safety', 'Site Supervision'],
    nextNodeSlugs: ['senior-petroleum-engineer']
  },
  {
    slug: 'senior-petroleum-engineer',
    role: 'Senior Petroleum Engineer',
    level: 'senior',
    industry: 'petroleum',
    salaryGhsMin: 22000,
    salaryGhsMax: 32000,
    yearsTypical: 4,
    description: 'Lead asset teams across drilling + reservoir + production for a producing field.',
    requiredSkills: ['Project Management', 'Leadership', 'Reservoir Engineering', 'Cost Analysis'],
    nextNodeSlugs: ['lead-petroleum-asset-manager']
  },
  {
    slug: 'lead-petroleum-asset-manager',
    role: 'Petroleum Asset Manager',
    level: 'lead',
    industry: 'petroleum',
    salaryGhsMin: 35000,
    salaryGhsMax: 50000,
    yearsTypical: 5,
    description: 'Run P&L for an offshore or onshore producing asset.',
    requiredSkills: ['Leadership', 'Financial Modeling', 'Negotiation', 'Project Management'],
    nextNodeSlugs: []
  },

  // ===== Software / Data ==================================================
  {
    slug: 'junior-software-engineer',
    role: 'Software Engineer',
    level: 'junior',
    industry: 'software-data',
    salaryGhsMin: 4000,
    salaryGhsMax: 7000,
    yearsTypical: 2,
    description: 'Ship features in a web stack with code review; learn the codebase + practices.',
    requiredSkills: ['JavaScript', 'TypeScript', 'React', 'Git', 'Problem Solving'],
    nextNodeSlugs: ['mid-software-engineer', 'mid-data-analyst']
  },
  {
    slug: 'mid-software-engineer',
    role: 'Software Engineer',
    level: 'mid',
    industry: 'software-data',
    salaryGhsMin: 8000,
    salaryGhsMax: 14000,
    yearsTypical: 3,
    description: 'Own modules, design APIs, mentor juniors; comfortable across the stack.',
    requiredSkills: ['TypeScript', 'Node.js', 'PostgreSQL', 'REST APIs', 'Git'],
    nextNodeSlugs: ['senior-software-engineer', 'mid-data-engineer']
  },
  {
    slug: 'senior-software-engineer',
    role: 'Senior Software Engineer',
    level: 'senior',
    industry: 'software-data',
    salaryGhsMin: 16000,
    salaryGhsMax: 25000,
    yearsTypical: 4,
    description: 'Lead a service or product surface; set technical direction with the team.',
    requiredSkills: ['TypeScript', 'Cloud Computing', 'Docker', 'Leadership', 'Agile / Scrum'],
    nextNodeSlugs: ['lead-engineering-manager', 'principal-staff-engineer']
  },
  {
    slug: 'mid-data-analyst',
    role: 'Data Analyst',
    level: 'mid',
    industry: 'software-data',
    salaryGhsMin: 7500,
    salaryGhsMax: 13000,
    yearsTypical: 3,
    description: 'Self-serve SQL + dashboards; partner with PMs to drive product decisions.',
    requiredSkills: ['SQL', 'Excel', 'Data Visualization', 'Statistics', 'Communication'],
    nextNodeSlugs: ['mid-data-engineer', 'mid-ml-engineer']
  },
  {
    slug: 'mid-data-engineer',
    role: 'Data Engineer',
    level: 'mid',
    industry: 'software-data',
    salaryGhsMin: 9000,
    salaryGhsMax: 15000,
    yearsTypical: 3,
    description: 'Build pipelines, warehouses, and the plumbing analysts depend on.',
    requiredSkills: ['Python', 'SQL', 'PostgreSQL', 'Cloud Computing', 'Docker'],
    nextNodeSlugs: ['senior-software-engineer']
  },
  {
    slug: 'mid-ml-engineer',
    role: 'ML Engineer',
    level: 'mid',
    industry: 'software-data',
    salaryGhsMin: 10000,
    salaryGhsMax: 17000,
    yearsTypical: 3,
    description: 'Train + ship models in production with proper evals and monitoring.',
    requiredSkills: ['Python', 'Machine Learning', 'Statistics', 'Cloud Computing'],
    nextNodeSlugs: ['senior-software-engineer']
  },
  {
    slug: 'lead-engineering-manager',
    role: 'Engineering Manager',
    level: 'lead',
    industry: 'software-data',
    salaryGhsMin: 26000,
    salaryGhsMax: 38000,
    yearsTypical: 4,
    description: 'Manage a team of 5–10 engineers; hire, coach, set direction.',
    requiredSkills: ['Leadership', 'Project Management', 'Communication', 'Stakeholder Engagement'],
    nextNodeSlugs: []
  },
  {
    slug: 'principal-staff-engineer',
    role: 'Staff / Principal Engineer',
    level: 'principal',
    industry: 'software-data',
    salaryGhsMin: 40000,
    salaryGhsMax: 65000,
    yearsTypical: 5,
    description: 'Set architecture across multiple teams; the deepest IC technical role.',
    requiredSkills: ['Cloud Computing', 'Leadership', 'Critical Thinking', 'Communication'],
    nextNodeSlugs: []
  },

  // ===== Business / Finance ==============================================
  {
    slug: 'junior-financial-analyst',
    role: 'Financial Analyst',
    level: 'junior',
    industry: 'business-finance',
    salaryGhsMin: 4000,
    salaryGhsMax: 7000,
    yearsTypical: 2,
    description: 'Build models, support budgeting cycles, and run variance analysis.',
    requiredSkills: ['Financial Modeling', 'Excel', 'Data Analysis', 'Report Writing'],
    nextNodeSlugs: ['mid-financial-analyst', 'mid-investment-analyst']
  },
  {
    slug: 'mid-financial-analyst',
    role: 'Financial Analyst',
    level: 'mid',
    industry: 'business-finance',
    salaryGhsMin: 8000,
    salaryGhsMax: 13000,
    yearsTypical: 3,
    description: 'Own FP&A for a business unit; partner with leadership on planning.',
    requiredSkills: ['Financial Modeling', 'Budgeting', 'Cost Analysis', 'Communication'],
    nextNodeSlugs: ['senior-finance-manager']
  },
  {
    slug: 'mid-investment-analyst',
    role: 'Investment Analyst',
    level: 'mid',
    industry: 'business-finance',
    salaryGhsMin: 9000,
    salaryGhsMax: 15000,
    yearsTypical: 3,
    description: 'Screen deals, run DCFs, write investment memos for the IC.',
    requiredSkills: ['Financial Modeling', 'Market Research', 'Critical Thinking', 'Presentation Skills'],
    nextNodeSlugs: ['senior-finance-manager']
  },
  {
    slug: 'mid-auditor',
    role: 'Auditor',
    level: 'mid',
    industry: 'business-finance',
    salaryGhsMin: 7500,
    salaryGhsMax: 12500,
    yearsTypical: 3,
    description: 'Lead audit engagements end-to-end; manage juniors and client comms.',
    requiredSkills: ['Excel', 'Critical Thinking', 'Report Writing', 'Communication'],
    nextNodeSlugs: ['senior-finance-manager']
  },
  {
    slug: 'senior-finance-manager',
    role: 'Senior Finance Manager',
    level: 'senior',
    industry: 'business-finance',
    salaryGhsMin: 16000,
    salaryGhsMax: 25000,
    yearsTypical: 4,
    description: 'Run finance for a function or BU; reports into CFO / FD.',
    requiredSkills: ['Financial Modeling', 'Leadership', 'Stakeholder Engagement', 'Budgeting'],
    nextNodeSlugs: []
  },

  // ===== Policy / Public ==================================================
  {
    slug: 'junior-policy-analyst',
    role: 'Policy Analyst',
    level: 'junior',
    industry: 'policy-public',
    salaryGhsMin: 3500,
    salaryGhsMax: 6000,
    yearsTypical: 2,
    description: 'Research, brief, and draft policy memos for ministries or think tanks.',
    requiredSkills: ['Public Policy Analysis', 'Report Writing', 'Critical Thinking', 'Communication'],
    nextNodeSlugs: ['mid-policy-analyst', 'mid-climate-policy-analyst']
  },
  {
    slug: 'mid-policy-analyst',
    role: 'Policy Analyst',
    level: 'mid',
    industry: 'policy-public',
    salaryGhsMin: 7000,
    salaryGhsMax: 12000,
    yearsTypical: 3,
    description: 'Own a policy portfolio; lead consultations and stakeholder workshops.',
    requiredSkills: ['Public Policy Analysis', 'Stakeholder Engagement', 'Grant Writing', 'Data Analysis'],
    nextNodeSlugs: ['senior-policy-advisor']
  },
  {
    slug: 'mid-climate-policy-analyst',
    role: 'Climate Policy Analyst',
    level: 'mid',
    industry: 'policy-public',
    salaryGhsMin: 8000,
    salaryGhsMax: 14000,
    yearsTypical: 3,
    description: 'Translate climate science into actionable national policy and NDC commitments.',
    requiredSkills: ['Public Policy Analysis', 'Climate Change Mitigation', 'Stakeholder Engagement', 'Report Writing'],
    nextNodeSlugs: ['senior-policy-advisor', 'mid-esg-consultant']
  },
  {
    slug: 'mid-public-health-analyst',
    role: 'Public Health Analyst',
    level: 'mid',
    industry: 'policy-public',
    salaryGhsMin: 7000,
    salaryGhsMax: 12000,
    yearsTypical: 3,
    description: 'Analyse health data to design and evaluate public health interventions.',
    requiredSkills: ['Epidemiology', 'Statistics', 'Public Health Research', 'Data Analysis'],
    nextNodeSlugs: ['senior-policy-advisor']
  },
  {
    slug: 'senior-policy-advisor',
    role: 'Senior Policy Advisor',
    level: 'senior',
    industry: 'policy-public',
    salaryGhsMin: 13500,
    salaryGhsMax: 22000,
    yearsTypical: 4,
    description: 'Advise ministers / agency heads; lead inter-ministerial workstreams.',
    requiredSkills: ['Public Policy Analysis', 'Stakeholder Engagement', 'Leadership', 'Negotiation'],
    nextNodeSlugs: ['principal-sustainability-director']
  },

  // ===== Agribusiness =====================================================
  {
    slug: 'junior-agronomist',
    role: 'Agronomist',
    level: 'junior',
    industry: 'agribusiness',
    salaryGhsMin: 3200,
    salaryGhsMax: 6000,
    yearsTypical: 2,
    description: 'Run on-farm trials, advise smallholders, support extension officers.',
    requiredSkills: ['Agronomy', 'Soil Science', 'Crop Management', 'Communication'],
    nextNodeSlugs: ['mid-agronomist', 'mid-agribusiness-analyst']
  },
  {
    slug: 'mid-agronomist',
    role: 'Agronomist',
    level: 'mid',
    industry: 'agribusiness',
    salaryGhsMin: 6500,
    salaryGhsMax: 11000,
    yearsTypical: 3,
    description: 'Lead crop programmes for an agribusiness; design protocols and train field teams.',
    requiredSkills: ['Agronomy', 'Crop Management', 'Irrigation Design', 'Project Management'],
    nextNodeSlugs: ['senior-agribusiness-manager']
  },
  {
    slug: 'mid-agribusiness-analyst',
    role: 'Agribusiness Analyst',
    level: 'mid',
    industry: 'agribusiness',
    salaryGhsMin: 7000,
    salaryGhsMax: 12000,
    yearsTypical: 3,
    description: 'Run financial + market analysis across the agricultural value chain.',
    requiredSkills: ['Financial Modeling', 'Market Research', 'Excel', 'Data Analysis'],
    nextNodeSlugs: ['senior-agribusiness-manager']
  },
  {
    slug: 'mid-agri-supply-chain',
    role: 'Agri Supply Chain Manager',
    level: 'mid',
    industry: 'agribusiness',
    salaryGhsMin: 8000,
    salaryGhsMax: 13000,
    yearsTypical: 3,
    description: 'Plan procurement, storage, and distribution for crops or inputs across regions.',
    requiredSkills: ['Supply Chain Management', 'Procurement', 'Cost Analysis', 'Excel'],
    nextNodeSlugs: ['senior-agribusiness-manager']
  },
  {
    slug: 'senior-agribusiness-manager',
    role: 'Senior Agribusiness Manager',
    level: 'senior',
    industry: 'agribusiness',
    salaryGhsMin: 14000,
    salaryGhsMax: 22000,
    yearsTypical: 4,
    description: 'Run a full agri-vertical (crop or livestock) — operations, finance, growth.',
    requiredSkills: ['Leadership', 'Project Management', 'Financial Modeling', 'Stakeholder Engagement'],
    nextNodeSlugs: []
  },

  // ===== Consulting =======================================================
  {
    slug: 'junior-strategy-consultant',
    role: 'Strategy Consultant',
    level: 'junior',
    industry: 'consulting',
    salaryGhsMin: 5500,
    salaryGhsMax: 9000,
    yearsTypical: 2,
    description: 'Build slides, run analyses, and own workstreams on cross-industry projects.',
    requiredSkills: ['Excel', 'Presentation Skills', 'Critical Thinking', 'Communication'],
    nextNodeSlugs: ['mid-strategy-consultant']
  },
  {
    slug: 'mid-strategy-consultant',
    role: 'Strategy Consultant',
    level: 'mid',
    industry: 'consulting',
    salaryGhsMin: 11000,
    salaryGhsMax: 18000,
    yearsTypical: 3,
    description: 'Lead small teams; own client modules; structure ambiguous problems.',
    requiredSkills: ['Financial Modeling', 'Market Research', 'Presentation Skills', 'Stakeholder Engagement'],
    nextNodeSlugs: ['senior-management-consultant']
  },
  {
    slug: 'mid-esg-consultant',
    role: 'ESG Consultant',
    level: 'mid',
    industry: 'consulting',
    salaryGhsMin: 9000,
    salaryGhsMax: 15000,
    yearsTypical: 3,
    description: 'Advise organisations on environmental, social, and governance disclosure.',
    requiredSkills: ['ESG Analysis', 'Sustainability Reporting', 'Stakeholder Engagement', 'Report Writing'],
    nextNodeSlugs: ['senior-management-consultant', 'principal-sustainability-director']
  },
  {
    slug: 'senior-management-consultant',
    role: 'Senior Management Consultant',
    level: 'senior',
    industry: 'consulting',
    salaryGhsMin: 18000,
    salaryGhsMax: 28000,
    yearsTypical: 4,
    description: 'Manage full engagements; primary client relationship; coach teams.',
    requiredSkills: ['Leadership', 'Stakeholder Engagement', 'Negotiation', 'Project Management'],
    nextNodeSlugs: ['principal-sustainability-director']
  },
  {
    slug: 'principal-sustainability-director',
    role: 'Director of Sustainability',
    level: 'principal',
    industry: 'consulting',
    salaryGhsMin: 42000,
    salaryGhsMax: 75000,
    yearsTypical: 5,
    description: 'Set ESG and sustainability strategy at the executive level for a firm or client.',
    requiredSkills: ['Leadership', 'ESG Analysis', 'Stakeholder Engagement', 'Negotiation'],
    nextNodeSlugs: []
  }
];

export async function seedCareerPaths(): Promise<number> {
  let count = 0;
  for (const n of NODES) {
    await prisma.careerPathNode.upsert({
      where: { slug: n.slug },
      create: {
        slug: n.slug,
        role: n.role,
        level: n.level,
        industry: n.industry,
        salaryGhsMin: n.salaryGhsMin,
        salaryGhsMax: n.salaryGhsMax,
        yearsTypical: n.yearsTypical,
        description: n.description,
        requiredSkills: n.requiredSkills,
        nextNodeSlugs: n.nextNodeSlugs
      },
      update: {
        role: n.role,
        level: n.level,
        industry: n.industry,
        salaryGhsMin: n.salaryGhsMin,
        salaryGhsMax: n.salaryGhsMax,
        yearsTypical: n.yearsTypical,
        description: n.description,
        requiredSkills: n.requiredSkills,
        nextNodeSlugs: n.nextNodeSlugs
      }
    });
    count++;
  }
  return count;
}

// CLI entry point — run via `bun run server/src/lib/seedCareerPaths.ts`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  (async () => {
    console.log('Seeding career path nodes…');
    const n = await seedCareerPaths();
    console.log(`  upserted ${n} nodes`);
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
