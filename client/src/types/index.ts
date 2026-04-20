export type Role = 'STUDENT' | 'ALUMNI' | 'EMPLOYER' | 'ADMIN';

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatar?: string;
  bio?: string;
  programme?: string;
  graduationYear?: number;
  skills?: string[];
  linkedinUrl?: string;
  phone?: string;
  location?: string;
  currentRole?: string;
  currentCompany?: string;
  profileComplete?: boolean;
  isApproved?: boolean;
  isSuperuser?: boolean;
  // Set when this session was minted by a superuser impersonating
  // someone — drives the sticky red banner + "End impersonation" button.
  actingAs?: { adminId: string };
};

export type Opportunity = {
  id: string;
  title: string;
  description: string;
  company: string;
  location: string;
  locationType: 'REMOTE' | 'ONSITE' | 'HYBRID';
  type: 'FULL_TIME' | 'PART_TIME' | 'INTERNSHIP' | 'NATIONAL_SERVICE' | 'VOLUNTEER' | 'CONTRACT';
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  deadline: string;
  requiredSkills: string[];
  industry?: string;
  applicationUrl?: string;
  postedBy?: { firstName: string; lastName: string; avatar?: string };
  createdAt: string;
};

export type Scholarship = {
  id: string;
  title: string;
  provider: string;
  description: string;
  eligibility: string;
  deadline: string;
  awardAmount?: string;
  applicationUrl: string;
  level: 'UNDERGRAD' | 'MASTERS' | 'PHD' | 'POSTDOC' | 'OTHER';
  fieldOfStudy?: string;
  tags: string[];
};

export type MentorProfile = {
  id: string;
  userId: string;
  expertise: string[];
  bio: string;
  currentRole: string;
  company: string;
  yearsExperience: number;
  mentoringTopics: string[];
  mentoringStyles: string[];
  averageRating: number;
  sessionsCompleted: number;
  user: { id: string; firstName: string; lastName: string; avatar?: string; programme?: string; graduationYear?: number };
};

export type EventItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  isOnline: boolean;
  capacity: number;
  type: string;
  host: { firstName: string; lastName: string; avatar?: string };
  _count: { registrations: number };
};
