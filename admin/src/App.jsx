import { lazy, Suspense, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TierProvider } from './contexts/TierContext';
import mixpanel from './config/mixpanel';
import Login from './pages/Login';
import LoginPortal from './pages/LoginPortal';
import NativeLogin from './pages/NativeLogin';
import LockedFeature from './components/LockedFeature';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/theme.css';

const isNative = Capacitor.isNativePlatform();
const basename = isNative ? '' : '/login';

// Eagerly import CoreBuddy pages (shared bottom-nav group — no loading gap)
import CoreBuddyDashboard from './pages/CoreBuddyDashboard';
import NutritionHub from './pages/NutritionHub';
import CoreBuddyNutrition from './pages/CoreBuddyNutrition';
import CoreBuddyWorkouts from './pages/CoreBuddyWorkouts';
import CoreBuddyConsistency from './pages/CoreBuddyConsistency';
import CoreBuddyBuddies from './pages/CoreBuddyBuddies';
import CoreBuddyProfile from './pages/CoreBuddyProfile';
import CoreBuddyBuilder from './pages/CoreBuddyBuilder';
import CoreBuddySettings from './pages/CoreBuddySettings';
import Challenges from './pages/Challenges';
import CoreBuddyBadges from './pages/CoreBuddyBadges';
import CoreBuddyMetrics from './pages/CoreBuddyMetrics';
import ActivityHistory from './pages/ActivityHistory';
import AIMealScanner from './pages/AIMealScanner';
import CoreBuddyCharts from './pages/CoreBuddyCharts';

// Lazy-load pages outside the CoreBuddy nav group
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminCoreBuddy = lazy(() => import('./pages/AdminCoreBuddy'));
const AddClient = lazy(() => import('./pages/AddClient'));
const ClientDashboard = lazy(() => import('./pages/ClientDashboard'));
const ClientForms = lazy(() => import('./pages/ClientForms'));
const ClientTools = lazy(() => import('./pages/ClientTools'));
const MacroCalculator = lazy(() => import('./pages/MacroCalculator'));
const ProteinSnacks = lazy(() => import('./pages/ProteinSnacks'));
const DailyMotivation = lazy(() => import('./pages/DailyMotivation'));
const CircuitDashboard = lazy(() => import('./pages/CircuitDashboard'));
const CircuitBooking = lazy(() => import('./pages/CircuitBooking'));
const PersonalBests = lazy(() => import('./pages/PersonalBests'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const UpgradePage = lazy(() => import('./pages/UpgradePage'));
const SignUp = lazy(() => import('./pages/SignUp'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

// Scroll to top on route change
function ScrollToTop({ children }) {
  const { pathname } = useLocation();

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return children;
}

// Component to handle redirect from 404.html
function RedirectHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const redirect = sessionStorage.getItem('redirect');
    if (redirect) {
      sessionStorage.removeItem('redirect');
      // Extract the path after /login
      const path = redirect.replace('/login', '') || '/';
      navigate(path, { replace: true });
    }
  }, [navigate]);

  return null;
}

// Handle Android hardware back button
function AndroidBackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleBack = useCallback(() => {
    // If on a root/login screen, exit the app
    if (pathname === '/' || pathname === '/login') {
      CapApp.exitApp();
    } else {
      navigate(-1);
    }
  }, [pathname, navigate]);

  useEffect(() => {
    if (!isNative || Capacitor.getPlatform() !== 'android') return;
    const listener = CapApp.addListener('backButton', handleBack);
    return () => { listener.then(l => l.remove()); };
  }, [handleBack]);

  return null;
}

// Track page views + identify user in Mixpanel
function MixpanelTracker() {
  const { pathname } = useLocation();
  const { currentUser, clientData } = useAuth();

  // Identify user when they log in
  useEffect(() => {
    if (currentUser) {
      mixpanel.identify(currentUser.uid);
      mixpanel.people.set({
        $email: currentUser.email || '',
        $name: clientData?.name || currentUser.displayName || '',
        platform: isNative ? Capacitor.getPlatform() : 'web',
      });
    } else {
      mixpanel.reset();
    }
  }, [currentUser, clientData]);

  // Track page views on route change
  useEffect(() => {
    mixpanel.track('Page View', { path: pathname });
  }, [pathname]);

  return null;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TierProvider>
        <BrowserRouter basename={basename}>
          <RedirectHandler />
          <AndroidBackButton />
          <MixpanelTracker />
          <ScrollToTop>
          <ErrorBoundary>
          <Suspense fallback={<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-body)' }}><img src="/Logo.webp" alt="" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: '50%', border: '3px solid var(--color-primary)', animation: 'app-fade-in 1s ease-out both' }} /></div>}>
          <Routes>
            <Route path="/" element={isNative ? <NativeLogin /> : <LoginPortal />} />
            <Route path="/login" element={isNative ? <NativeLogin /> : <Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin/core-buddy" element={<AdminCoreBuddy />} />
            <Route path="/add-client" element={<AddClient />} />
            <Route path="/client" element={<ClientDashboard />} />
            <Route path="/client/forms" element={<ClientForms />} />
            <Route path="/client/tools" element={<ClientTools />} />
            <Route path="/client/tools/macros" element={<MacroCalculator />} />
            <Route path="/client/tools/snacks" element={<ProteinSnacks />} />
            <Route path="/client/tools/motivation" element={<DailyMotivation />} />
            <Route path="/client/personal-bests" element={<PersonalBests />} />
            <Route path="/client/circuit" element={<CircuitDashboard />} />
            <Route path="/client/circuit/booking" element={<CircuitBooking />} />
            <Route path="/client/core-buddy" element={<CoreBuddyDashboard />} />
            <Route path="/client/core-buddy/nutrition" element={<LockedFeature feature="nutrition"><NutritionHub /></LockedFeature>} />
            <Route path="/client/core-buddy/nutrition/manual" element={<Navigate to="/client/core-buddy/nutrition" replace />} />
            <Route path="/client/core-buddy/nutrition/ai-scanner" element={<LockedFeature feature="nutrition"><AIMealScanner /></LockedFeature>} />
            <Route path="/client/core-buddy/workouts" element={<CoreBuddyWorkouts />} />
            <Route path="/client/core-buddy/consistency" element={<CoreBuddyConsistency />} />
            <Route path="/client/core-buddy/buddies" element={<CoreBuddyBuddies />} />
            <Route path="/client/core-buddy/builder" element={<CoreBuddyBuilder />} />
            <Route path="/client/core-buddy/profile/:userId" element={<CoreBuddyProfile />} />
            <Route path="/client/core-buddy/settings" element={<CoreBuddySettings />} />
            <Route path="/client/core-buddy/challenges" element={<Challenges />} />
            <Route path="/client/core-buddy/badges" element={<CoreBuddyBadges />} />
            <Route path="/client/core-buddy/metrics" element={<LockedFeature feature="metrics"><CoreBuddyMetrics /></LockedFeature>} />
            <Route path="/client/core-buddy/activity" element={<ActivityHistory />} />
            <Route path="/client/core-buddy/charts" element={<LockedFeature feature="charts"><CoreBuddyCharts /></LockedFeature>} />
            <Route path="/client/leaderboard" element={<Leaderboard />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
          </ScrollToTop>
        </BrowserRouter>
        </TierProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
