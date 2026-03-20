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
        <div className="hiit-home-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
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
