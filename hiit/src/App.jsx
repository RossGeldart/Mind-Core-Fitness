import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
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

  // Authenticated — placeholder home screen
  return (
    <div className="hiit-home">
      <div className="hiit-home-header">
        <img src="/Logo.webp" alt="Mind Core Fitness" className="hiit-home-logo" />
        <h1>Core HIIT</h1>
        <p>Welcome, {currentUser.displayName || currentUser.email}</p>
      </div>
      <button className="hiit-logout-btn" onClick={logout}>
        Sign Out
      </button>
    </div>
  );
}

export default App;
