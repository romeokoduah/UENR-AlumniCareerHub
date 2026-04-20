import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { AppLayout } from './components/layout/AppLayout';
import { CareerMateWidget } from './components/chatbot/CareerMateWidget';
import { PageLoader } from './components/ui/PageLoader';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const OpportunitiesPage = lazy(() => import('./pages/OpportunitiesPage'));
const OpportunityDetailPage = lazy(() => import('./pages/OpportunityDetailPage'));
const PostOpportunityPage = lazy(() => import('./pages/PostOpportunityPage'));
const ScholarshipsPage = lazy(() => import('./pages/ScholarshipsPage'));
const MentorsPage = lazy(() => import('./pages/MentorsPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const DirectoryPage = lazy(() => import('./pages/DirectoryPage'));
const InterviewPrepPage = lazy(() => import('./pages/InterviewPrepPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminOpportunitiesPage = lazy(() => import('./pages/AdminOpportunitiesPage'));
const AdminLandingEditorPage = lazy(() => import('./pages/AdminLandingEditorPage'));
const CareerToolsHubPage = lazy(() => import('./pages/CareerToolsHubPage'));
const CareerToolPlaceholderPage = lazy(() => import('./pages/CareerToolPlaceholderPage'));
const CVBuilderPage = lazy(() => import('./pages/career-tools/CVBuilderPage'));
const CVPrintPage = lazy(() => import('./pages/career-tools/CVPrintPage'));
const CoverLetterPage = lazy(() => import('./pages/career-tools/CoverLetterPage'));
const CoverLetterPrintPage = lazy(() => import('./pages/career-tools/CoverLetterPrintPage'));
const PortfolioEditorPage = lazy(() => import('./pages/career-tools/PortfolioEditorPage'));
const VaultPage = lazy(() => import('./pages/career-tools/VaultPage'));
const SkillsAssessmentPage = lazy(() => import('./pages/career-tools/SkillsAssessmentPage'));
const LearningHubPage = lazy(() => import('./pages/career-tools/LearningHubPage'));
const CertificationsPage = lazy(() => import('./pages/career-tools/CertificationsPage'));
const CareerPathsPage = lazy(() => import('./pages/career-tools/CareerPathsPage'));
const InterviewQuestionBankPage = lazy(() => import('./pages/career-tools/InterviewQuestionBankPage'));
const MockInterviewPage = lazy(() => import('./pages/career-tools/MockInterviewPage'));
const AptitudePage = lazy(() => import('./pages/career-tools/AptitudePage'));
const SalaryNegotiationPage = lazy(() => import('./pages/career-tools/SalaryNegotiationPage'));
const StartupResourcesPage = lazy(() => import('./pages/career-tools/StartupResourcesPage'));
const FreelancePage = lazy(() => import('./pages/career-tools/FreelancePage'));
const BusinessRegistrationPage = lazy(() => import('./pages/career-tools/BusinessRegistrationPage'));
const CounselingPage = lazy(() => import('./pages/career-tools/CounselingPage'));
const TranscriptsPage = lazy(() => import('./pages/career-tools/TranscriptsPage'));
const AchievementsWallPage = lazy(() => import('./pages/career-tools/AchievementsWallPage'));
const AtsPage = lazy(() => import('./pages/career-tools/AtsPage'));
const AtsJobBoardPage = lazy(() => import('./pages/career-tools/AtsJobBoardPage'));
const MyApplicationsPage = lazy(() => import('./pages/career-tools/MyApplicationsPage'));
const AdminLearningModerationPage = lazy(() => import('./pages/admin/AdminLearningModerationPage'));
const AdminAchievementsModerationPage = lazy(() => import('./pages/admin/AdminAchievementsModerationPage'));
const PublicTranscriptVerifyPage = lazy(() => import('./pages/PublicTranscriptVerifyPage'));
const PublicPortfolioPage = lazy(() => import('./pages/PublicPortfolioPage'));
const PublicShareViewerPage = lazy(() => import('./pages/PublicShareViewerPage'));
const PublicCertVerifyPage = lazy(() => import('./pages/PublicCertVerifyPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public, full-bleed routes (no Navbar/Footer chrome) */}
        <Route path="/p/:slug" element={<PublicPortfolioPage />} />
        <Route path="/v/:token" element={<PublicShareViewerPage />} />
        <Route path="/verify/cert/:slug" element={<PublicCertVerifyPage />} />
        <Route path="/verify/transcript/:token" element={<PublicTranscriptVerifyPage />} />
        <Route
          path="/career-tools/cover-letter/print/:id"
          element={<RequireAuth><CoverLetterPrintPage /></RequireAuth>}
        />

        {/* Standard chrome */}
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="opportunities" element={<OpportunitiesPage />} />
          <Route path="opportunities/new" element={<RequireAuth><PostOpportunityPage /></RequireAuth>} />
          <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
          <Route path="scholarships" element={<ScholarshipsPage />} />
          <Route path="mentors" element={<MentorsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="directory" element={<RequireAuth><DirectoryPage /></RequireAuth>} />
          <Route path="cv-builder" element={<Navigate to="/career-tools/cv-builder" replace />} />
          <Route path="interview-prep" element={<InterviewPrepPage />} />

          {/* Career Tools */}
          <Route path="career-tools" element={<RequireAuth><CareerToolsHubPage /></RequireAuth>} />
          <Route path="career-tools/cv-builder" element={<RequireAuth><CVBuilderPage /></RequireAuth>} />
          <Route path="career-tools/cv-builder/print/:id" element={<RequireAuth><CVPrintPage /></RequireAuth>} />
          <Route path="career-tools/cover-letter" element={<RequireAuth><CoverLetterPage /></RequireAuth>} />
          <Route path="career-tools/portfolio" element={<RequireAuth><PortfolioEditorPage /></RequireAuth>} />
          <Route path="career-tools/vault" element={<RequireAuth><VaultPage /></RequireAuth>} />
          <Route path="career-tools/skills" element={<RequireAuth><SkillsAssessmentPage /></RequireAuth>} />
          <Route path="career-tools/learn" element={<RequireAuth><LearningHubPage /></RequireAuth>} />
          <Route path="career-tools/certifications" element={<RequireAuth><CertificationsPage /></RequireAuth>} />
          <Route path="career-tools/paths" element={<RequireAuth><CareerPathsPage /></RequireAuth>} />
          <Route path="career-tools/interview/questions" element={<RequireAuth><InterviewQuestionBankPage /></RequireAuth>} />
          <Route path="career-tools/interview/mock" element={<RequireAuth><MockInterviewPage /></RequireAuth>} />
          <Route path="career-tools/aptitude" element={<RequireAuth><AptitudePage /></RequireAuth>} />
          <Route path="career-tools/salary" element={<RequireAuth><SalaryNegotiationPage /></RequireAuth>} />
          <Route path="career-tools/ventures/startup" element={<RequireAuth><StartupResourcesPage /></RequireAuth>} />
          <Route path="career-tools/ventures/freelance" element={<RequireAuth><FreelancePage /></RequireAuth>} />
          <Route path="career-tools/ventures/registration" element={<RequireAuth><BusinessRegistrationPage /></RequireAuth>} />
          <Route path="career-tools/counseling" element={<RequireAuth><CounselingPage /></RequireAuth>} />
          <Route path="career-tools/transcripts" element={<RequireAuth><TranscriptsPage /></RequireAuth>} />
          <Route path="career-tools/achievements" element={<RequireAuth><AchievementsWallPage /></RequireAuth>} />
          <Route path="career-tools/ats/my-applications" element={<RequireAuth><MyApplicationsPage /></RequireAuth>} />
          <Route path="career-tools/ats/jobs/:jobId" element={<RequireAuth roles={['EMPLOYER', 'ADMIN']}><AtsJobBoardPage /></RequireAuth>} />
          <Route path="career-tools/ats" element={<RequireAuth roles={['EMPLOYER', 'ADMIN']}><AtsPage /></RequireAuth>} />
          <Route path="career-tools/*" element={<RequireAuth><CareerToolPlaceholderPage /></RequireAuth>} />

          <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="admin" element={<RequireAuth roles={['ADMIN']}><AdminPage /></RequireAuth>} />
          <Route path="admin/opportunities" element={<RequireAuth roles={['ADMIN']}><AdminOpportunitiesPage /></RequireAuth>} />
          <Route path="admin/landing" element={<RequireAuth roles={['ADMIN']}><AdminLandingEditorPage /></RequireAuth>} />
          <Route path="admin/learning" element={<RequireAuth roles={['ADMIN']}><AdminLearningModerationPage /></RequireAuth>} />
          <Route path="admin/achievements" element={<RequireAuth roles={['ADMIN']}><AdminAchievementsModerationPage /></RequireAuth>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <CareerMateWidget />
    </Suspense>
  );
}

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
