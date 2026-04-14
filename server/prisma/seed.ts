import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const J = (v: unknown) => JSON.stringify(v);

async function main() {
  // Idempotency guard — if admin already exists, assume seeded and bail.
  // Lets us safely run `bun prisma/seed.ts` on every deploy.
  const existing = await prisma.user.findUnique({ where: { email: 'admin@uenr.edu.gh' } });
  if (existing) {
    console.log('Database already seeded; skipping.');
    return;
  }

  console.log('Seeding database...');

  const adminPass = await bcrypt.hash('admin12345', 10);
  const userPass = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@uenr.edu.gh' },
    update: {},
    create: {
      email: 'admin@uenr.edu.gh',
      passwordHash: adminPass,
      firstName: 'UENR',
      lastName: 'Admin',
      role: 'ADMIN',
      isApproved: true,
      isVerified: true,
      profileComplete: true
    }
  });

  const alumniSeeds: [string, string, string, number, string, string][] = [
    ['Kwame', 'Mensah', 'Environmental Engineering', 2019, 'Senior Sustainability Analyst', 'AfriSolar Ltd'],
    ['Abena', 'Boateng', 'Renewable Energy Engineering', 2020, 'Solar Project Manager', 'Bui Power Authority'],
    ['Kofi', 'Asante', 'Computer Science', 2021, 'Software Engineer', 'mPharma'],
    ['Ama', 'Owusu', 'Business Administration', 2018, 'Product Manager', 'Hubtel'],
    ['Yaw', 'Darko', 'Nursing', 2022, 'ICU Nurse', 'Komfo Anokye Teaching Hospital']
  ];

  const alumni = [];
  for (const [firstName, lastName, programme, graduationYear, currentRole, currentCompany] of alumniSeeds) {
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@alumni.uenr.edu.gh`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: userPass,
        firstName, lastName,
        role: 'ALUMNI',
        programme,
        graduationYear,
        currentRole,
        currentCompany,
        location: 'Accra, Ghana',
        bio: `UENR ${programme} graduate passionate about ${currentRole.toLowerCase()}.`,
        skills: J(['Communication', 'Problem Solving', 'Leadership']),
        isApproved: true, isVerified: true, profileComplete: true
      }
    });
    alumni.push({ ...u, currentRole, currentCompany });
  }

  await prisma.user.upsert({
    where: { email: 'student@uenr.edu.gh' },
    update: {},
    create: {
      email: 'student@uenr.edu.gh',
      passwordHash: userPass,
      firstName: 'Akosua',
      lastName: 'Test',
      role: 'STUDENT',
      programme: 'Computer Science',
      studentId: 'UEB0001220',
      isApproved: true,
      isVerified: true
    }
  });

  const employer = await prisma.user.upsert({
    where: { email: 'recruiter@afrisolar.com' },
    update: {},
    create: {
      email: 'recruiter@afrisolar.com',
      passwordHash: userPass,
      firstName: 'AfriSolar',
      lastName: 'Recruiting',
      role: 'EMPLOYER',
      currentCompany: 'AfriSolar Ltd',
      isApproved: true, isVerified: true
    }
  });

  const opportunities = [
    { title: 'Solar Energy Intern', description: 'Join our solar projects team to design and monitor installations across Ghana. Hands-on mentorship included.', company: 'AfriSolar Ltd', location: 'Accra', locationType: 'HYBRID', type: 'INTERNSHIP', industry: 'Renewable Energy', requiredSkills: ['Python', 'Solar PV', 'Data Analysis'], salaryMin: null, salaryMax: null },
    { title: 'Environmental Analyst', description: 'Conduct EIAs and sustainability audits for mining and agri clients.', company: 'GreenPath Consulting', location: 'Kumasi', locationType: 'ONSITE', type: 'FULL_TIME', industry: 'Environmental', requiredSkills: ['GIS', 'Report Writing', 'Field Research'], salaryMin: 3500, salaryMax: 5500 },
    { title: 'Junior Software Engineer', description: 'Build and ship features on our fintech platform using React and Node.', company: 'Hubtel', location: 'Remote', locationType: 'REMOTE', type: 'FULL_TIME', industry: 'Technology', requiredSkills: ['React', 'TypeScript', 'Node.js'], salaryMin: 4000, salaryMax: 7000 },
    { title: 'National Service — Data Officer', description: 'Support monitoring & evaluation for renewable energy projects.', company: 'Energy Commission Ghana', location: 'Accra', locationType: 'ONSITE', type: 'NATIONAL_SERVICE', industry: 'Public Sector', requiredSkills: ['Excel', 'SQL', 'Communication'], salaryMin: null, salaryMax: null },
    { title: 'Community Health Volunteer', description: 'Support rural health education campaigns in the Bono region.', company: 'Ghana Health Service', location: 'Sunyani', locationType: 'ONSITE', type: 'VOLUNTEER', industry: 'Healthcare', requiredSkills: ['Empathy', 'Twi', 'First Aid'], salaryMin: null, salaryMax: null },
    { title: 'Mechanical Design Intern', description: 'Design components for mini-hydro turbines. AutoCAD/Fusion360 preferred.', company: 'Bui Power Authority', location: 'Bui', locationType: 'ONSITE', type: 'INTERNSHIP', industry: 'Engineering', requiredSkills: ['AutoCAD', 'Fusion 360', 'Mechanical Engineering'], salaryMin: null, salaryMax: null }
  ];

  for (const opp of opportunities) {
    await prisma.opportunity.create({
      data: {
        title: opp.title,
        description: opp.description,
        company: opp.company,
        location: opp.location,
        locationType: opp.locationType,
        type: opp.type,
        industry: opp.industry,
        requiredSkills: J(opp.requiredSkills),
        salaryMin: opp.salaryMin ?? undefined,
        salaryMax: opp.salaryMax ?? undefined,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        postedById: employer.id,
        isApproved: true
      }
    });
  }

  const scholarships = [
    { title: 'MasterCard Foundation Scholars Program', provider: 'MasterCard Foundation', description: 'Full funding for African students to pursue undergraduate and graduate studies.', eligibility: 'African students with strong academic record and leadership potential', daysOut: 60, applicationUrl: 'https://mastercardfdn.org/all/scholars/', level: 'UNDERGRAD', awardAmount: 'Full tuition + stipend', fieldOfStudy: 'Any', tags: ['Africa', 'Full Funding', 'Leadership'] },
    { title: 'Chevening Scholarships', provider: 'UK Government', description: 'Fully-funded masters study in the UK for emerging leaders.', eligibility: 'Graduates with 2 years work experience', daysOut: 90, applicationUrl: 'https://www.chevening.org/', level: 'MASTERS', awardAmount: 'Full tuition + stipend', fieldOfStudy: 'Any', tags: ['UK', 'Masters', 'Leadership'] },
    { title: 'DAAD In-Country Scholarships', provider: 'DAAD Germany', description: 'Masters and PhD scholarships for African students studying in Africa.', eligibility: 'African nationals pursuing postgraduate studies', daysOut: 45, applicationUrl: 'https://www.daad.de/', level: 'MASTERS', awardAmount: '€500/month + tuition', fieldOfStudy: 'Energy, Environment, Engineering', tags: ['Africa', 'Germany'] },
    { title: 'Ghana Scholarship Secretariat Awards', provider: 'Government of Ghana', description: 'Undergraduate scholarships for Ghanaian students.', eligibility: 'Ghanaian citizens, need-based', daysOut: 20, applicationUrl: 'https://scholarships.gov.gh/', level: 'UNDERGRAD', awardAmount: 'Tuition', fieldOfStudy: 'STEM priority', tags: ['Ghana', 'Need-based'] }
  ];

  for (const s of scholarships) {
    await prisma.scholarship.create({
      data: {
        title: s.title, provider: s.provider, description: s.description, eligibility: s.eligibility,
        deadline: new Date(Date.now() + s.daysOut * 86400000),
        applicationUrl: s.applicationUrl, level: s.level, awardAmount: s.awardAmount,
        fieldOfStudy: s.fieldOfStudy, tags: J(s.tags),
        submittedById: admin.id, isApproved: true
      }
    });
  }

  for (let i = 0; i < 3; i++) {
    await prisma.mentorProfile.upsert({
      where: { userId: alumni[i].id },
      update: {},
      create: {
        userId: alumni[i].id,
        expertise: J(['Career Advice', 'Industry Insight', 'CV Review']),
        bio: `${alumni[i].currentRole} at ${alumni[i].currentCompany}. Happy to help UENR students navigate their careers.`,
        currentRole: alumni[i].currentRole,
        company: alumni[i].currentCompany,
        yearsExperience: 4 + i,
        mentoringTopics: J(['Career Path', 'Interviews', 'Skill Building']),
        mentoringStyles: J(['Career advice', 'CV review', 'Mock interviews']),
        availability: 'Weekday evenings',
        averageRating: 4.5 + i * 0.1,
        sessionsCompleted: 12 + i * 4
      }
    });
  }

  await prisma.event.createMany({
    data: [
      { title: 'CV Writing Masterclass', description: 'Learn how to build an ATS-friendly CV that lands interviews.', date: new Date(Date.now() + 7 * 86400000), location: 'Online (Zoom)', isOnline: true, capacity: 200, type: 'Workshop', hostId: admin.id },
      { title: 'Renewable Energy Careers Panel', description: 'Meet UENR alumni working in solar, hydro, and wind across Africa.', date: new Date(Date.now() + 14 * 86400000), location: 'UENR Main Auditorium', isOnline: false, capacity: 300, type: 'Panel', hostId: admin.id },
      { title: 'LinkedIn Optimization Bootcamp', description: 'Hands-on workshop to level up your LinkedIn profile.', date: new Date(Date.now() + 21 * 86400000), location: 'Online (Zoom)', isOnline: true, capacity: 150, type: 'Workshop', hostId: admin.id }
    ]
  });

  const roadmaps = [
    { programme: 'Environmental Engineering', title: 'Environmental Engineer → Director of Sustainability', steps: [{ step: 'Graduate Trainee' }, { step: 'EIA Analyst' }, { step: 'Environmental Consultant' }, { step: 'Senior Sustainability Lead' }, { step: 'Director of Sustainability' }] },
    { programme: 'Renewable Energy Engineering', title: 'Renewable Energy Engineer Path', steps: [{ step: 'Solar Installer' }, { step: 'Design Engineer' }, { step: 'Project Manager' }, { step: 'Head of Renewables' }] },
    { programme: 'Computer Science', title: 'Software Engineer Path', steps: [{ step: 'Junior Developer' }, { step: 'Software Engineer' }, { step: 'Senior Engineer' }, { step: 'Tech Lead' }, { step: 'Engineering Manager' }] }
  ];
  for (const r of roadmaps) {
    await prisma.careerRoadmap.upsert({
      where: { programme: r.programme },
      update: {},
      create: { programme: r.programme, title: r.title, steps: J(r.steps) }
    });
  }

  console.log('Seed complete.');
  console.log('Admin: admin@uenr.edu.gh / admin12345');
  console.log('Student: student@uenr.edu.gh / password123');
  console.log('Alumni: kwame.mensah@alumni.uenr.edu.gh / password123');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
