import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AddClient from './pages/AddClient';
import ClientDashboard from './pages/ClientDashboard';
import ClientForms from './pages/ClientForms';
import ClientTools from './pages/ClientTools';
import MacroCalculator from './pages/MacroCalculator';
import ProteinSnacks from './pages/ProteinSnacks';
import DailyMotivation from './pages/DailyMotivation';
import PersonalBests from './pages/PersonalBests';
import CircuitDashboard from './pages/CircuitDashboard';
import CircuitBooking from './pages/CircuitBooking';
import CoreBuddyDashboard from './pages/CoreBuddyDashboard';
import CoreBuddyNutrition from './pages/CoreBuddyNutrition';
import CoreBuddyWorkouts from './pages/CoreBuddyWorkouts';
import CoreBuddyProgrammes from './pages/CoreBuddyProgrammes';
import CoreBuddyAchievements from './pages/CoreBuddyAchievements';
import CoreBuddyConsistency from './pages/CoreBuddyConsistency';
import Leaderboard from './pages/Leaderboard';
import './styles/theme.css';

// Scroll to top + fade-in on route change
function PageTransition({ children }) {
  const { pathname } = useLocation();

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="page-transition" key={pathname}>
      {children}
    </div>
  );
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
        <BrowserRouter basename="/login">
          <RedirectHandler />
          <PageTransition>
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
            <Route path="/client/core-buddy/nutrition" element={<CoreBuddyNutrition />} />
            <Route path="/client/core-buddy/workouts" element={<CoreBuddyWorkouts />} />
            <Route path="/client/core-buddy/programmes" element={<CoreBuddyProgrammes />} />
            <Route path="/client/core-buddy/achievements" element={<CoreBuddyAchievements />} />
            <Route path="/client/core-buddy/consistency" element={<CoreBuddyConsistency />} />
            <Route path="/client/leaderboard" element={<Leaderboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PageTransition>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
