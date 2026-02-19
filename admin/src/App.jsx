import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TierProvider } from './contexts/TierContext';
import Login from './pages/Login';
import LockedFeature from './components/LockedFeature';
import './styles/theme.css';

// Lazy-load pages
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
