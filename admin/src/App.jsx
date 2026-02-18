import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TierProvider } from './contexts/TierContext';
import Login from './pages/Login';
import LockedFeature from './components/LockedFeature';
import './styles/theme.css';

// Eagerly import CoreBuddy pages (shared bottom-nav group — no loading gap)
import CoreBuddyDashboard from './pages/CoreBuddyDashboard';
import CoreBuddyNutrition from './pages/CoreBuddyNutrition';
import CoreBuddyWorkouts from './pages/CoreBuddyWorkouts';
import CoreBuddyProgrammes from './pages/CoreBuddyProgrammes';
import CoreBuddyAchievements from './pages/CoreBuddyAchievements';
import CoreBuddyConsistency from './pages/CoreBuddyConsistency';
import CoreBuddyBuddies from './pages/CoreBuddyBuddies';
import CoreBuddyProfile from './pages/CoreBuddyProfile';
import CoreBuddyCoach from './pages/CoreBuddyCoach';
import PersonalBests from './pages/PersonalBests';

// Lazy-load pages outside the CoreBuddy nav group
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AddClient = lazy(() => import('./pages/AddClient'));
const ClientDashboard = lazy(() => import('./pages/ClientDashboard'));
const ClientForms = lazy(() => import('./pages/ClientForms'));
const ClientTools = lazy(() => import('./pages/ClientTools'));
const MacroCalculator = lazy(() => import('./pages/MacroCalculator'));
const ProteinSnacks = lazy(() => import('./pages/ProteinSnacks'));
const DailyMotivation = lazy(() => import('./pages/DailyMotivation'));
const CircuitDashboard = lazy(() => import('./pages/CircuitDashboard'));
const CircuitBooking = lazy(() => import('./pages/CircuitBooking'));
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

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TierProvider>
        <BrowserRouter basename="/login">
          <RedirectHandler />
          <ScrollToTop>
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}><div style={{ width: 36, height: 36, border: '3px solid var(--color-primary-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'app-spin .7s linear infinite' }} /></div>}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
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
            <Route path="/client/core-buddy/nutrition" element={<LockedFeature feature="nutrition"><CoreBuddyNutrition /></LockedFeature>} />
            <Route path="/client/core-buddy/workouts" element={<CoreBuddyWorkouts />} />
            <Route path="/client/core-buddy/programmes" element={<LockedFeature feature="programmes"><CoreBuddyProgrammes /></LockedFeature>} />
            <Route path="/client/core-buddy/achievements" element={<LockedFeature feature="achievements"><CoreBuddyAchievements /></LockedFeature>} />
            <Route path="/client/core-buddy/consistency" element={<LockedFeature feature="consistency"><CoreBuddyConsistency /></LockedFeature>} />
            <Route path="/client/core-buddy/buddies" element={<LockedFeature feature="buddies"><CoreBuddyBuddies /></LockedFeature>} />
            <Route path="/client/core-buddy/buddy" element={<CoreBuddyCoach />} />
            <Route path="/client/core-buddy/profile/:userId" element={<CoreBuddyProfile />} />
            <Route path="/client/leaderboard" element={<LockedFeature feature="leaderboard"><Leaderboard /></LockedFeature>} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </ScrollToTop>
        </BrowserRouter>
        </TierProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
