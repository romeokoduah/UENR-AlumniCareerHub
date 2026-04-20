import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Navbar } from './Navbar';
import { MobileTabBar } from './MobileTabBar';
import { Footer } from './Footer';
import { useThemeStore } from '../../store/theme';
import { ImpersonationBanner } from '../admin/ImpersonationBanner';

export function AppLayout() {
  const location = useLocation();
  const initTheme = useThemeStore((s) => s.init);
  useEffect(() => { initTheme(); }, [initTheme]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky red bar — only renders when the current session is an impersonation. */}
      <ImpersonationBanner />
      <Navbar />
      <main className="flex-1 pb-20 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  );
}
