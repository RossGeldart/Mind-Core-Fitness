import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AddClientForm from '../components/AddClientForm';
import ClientList from '../components/ClientList';
import './Dashboard.css';

export default function Dashboard() {
  const [activeView, setActiveView] = useState('clients');
  const [showAddClient, setShowAddClient] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { currentUser, logout, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!currentUser || !isAdmin)) {
      navigate('/');
    }
  }, [currentUser, isAdmin, loading, navigate]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const handleClientAdded = () => {
    setShowAddClient(false);
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!currentUser || !isAdmin) {
    return null;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Mind Core Fitness</h1>
          <span className="admin-badge">Admin</span>
        </div>
        <nav className="header-nav">
          <button
            className={`nav-btn ${activeView === 'clients' ? 'active' : ''}`}
            onClick={() => setActiveView('clients')}
          >
            Clients
          </button>
          <button
            className={`nav-btn ${activeView === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveView('calendar')}
          >
            Calendar
          </button>
        </nav>
        <button className="logout-btn" onClick={handleLogout}>
          Log Out
        </button>
      </header>

      <main className="dashboard-main">
        {activeView === 'clients' && (
          <div className="clients-view">
            <div className="view-header">
              <h2>Clients</h2>
              <button
                className="add-btn"
                onClick={() => setShowAddClient(true)}
              >
                + Add Client
              </button>
            </div>

            {showAddClient && (
              <AddClientForm
                onClose={() => setShowAddClient(false)}
                onClientAdded={handleClientAdded}
              />
            )}

            <ClientList key={refreshKey} />
          </div>
        )}

        {activeView === 'calendar' && (
          <div className="calendar-view">
            <div className="view-header">
              <h2>Calendar</h2>
            </div>
            <div className="coming-soon">
              <p>Calendar view coming in Phase 2</p>
              <span>Assign clients to days and times here</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
