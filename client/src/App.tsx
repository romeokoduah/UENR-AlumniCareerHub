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
const CVBuilderPage = lazy(() => import('./pages/CVBuilderPage'));
const InterviewPrepPage = lazy(() => import('./pages/InterviewPrepPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminOpportunitiesPage = lazy(() => import('./pages/AdminOpportunitiesPage'));
const AdminLandingEditorPage = lazy(() => import('./pages/AdminLandingEditorPage'));
const CareerToolsHubPage = lazy(() => import('./pages/CareerToolsHubPage'));
const CareerToolPlaceholderPage = lazy(() => import('./pages/CareerToolPlaceholderPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
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
          <Route path="cv-builder" element={<RequireAuth><CVBuilderPage /></RequireAuth>} />
          <Route path="interview-prep" element={<InterviewPrepPage />} />
          <Route path="career-tools" element={<RequireAuth><CareerToolsHubPage /></RequireAuth>} />
          <Route path="career-tools/*" element={<RequireAuth><CareerToolPlaceholderPage /></RequireAuth>} />
          <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="admin" element={<RequireAuth roles={['ADMIN']}><AdminPage /></RequireAuth>} />
          <Route path="admin/opportunities" element={<RequireAuth roles={['ADMIN']}><AdminOpportunitiesPage /></RequireAuth>} />
          <Route path="admin/landing" element={<RequireAuth roles={['ADMIN']}><AdminLandingEditorPage /></RequireAuth>} />
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
