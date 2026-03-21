import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import HiitTimer from './pages/HiitTimer';
import HiitSettings from './pages/HiitSettings';
import HiitLibrary from './pages/HiitLibrary';
import HiitStatistics from './pages/HiitStatistics';
import HiitPremiumPage from './pages/HiitPremiumPage';
import './App.css';

function App() {
  const { currentUser, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="hiit-login-loading">
        <div className="hiit-login-spinner" />
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/hiit" element={<HiitTimer />} />
      <Route path="/hiit/settings" element={<HiitSettings />} />
      <Route path="/hiit/library" element={<HiitLibrary />} />
      <Route path="/hiit/stats" element={<HiitStatistics />} />
      <Route path="/hiit/premium" element={<HiitPremiumPage />} />
      <Route path="*" element={<Navigate to="/hiit" replace />} />
    </Routes>
  );
}

export default App;
