import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AddClient from './pages/AddClient';
import ClientDashboard from './pages/ClientDashboard';

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
    <AuthProvider>
      <BrowserRouter basename="/login">
        <RedirectHandler />
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/add-client" element={<AddClient />} />
          <Route path="/client" element={<ClientDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
