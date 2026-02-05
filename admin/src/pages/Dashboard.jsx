import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ClientList from '../components/ClientList';
import Calendar from '../components/Calendar';
import Schedule from '../components/Schedule';
import './Dashboard.css';

export default function Dashboard() {
  const [activeView, setActiveView] = useState('schedule');
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { currentUser, logout, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const startY = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    if (!loading && (!currentUser || !isAdmin)) {
      navigate('/');
    }
  }, [currentUser, isAdmin, loading, navigate]);

  // Pull-to-refresh handlers
  useEffect(() => {
    const handleTouchStart = (e) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling.current) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 0 && window.scrollY === 0) {
        setPullDistance(Math.min(diff * 0.5, 80));
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance > 60) {
        setIsRefreshing(true);
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPullDistance(0);
      }
      isPulling.current = false;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const handleAddClient = () => {
    navigate('/add-client');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!currentUser || !isAdmin) {
    return null;
  }

  return (
    <div className="dashboard">
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div className="pull-indicator" style={{ height: pullDistance }}>
          <div className={`pull-spinner ${isRefreshing ? 'spinning' : ''}`}>
            {isRefreshing ? '↻' : '↓'}
          </div>
          <span>{isRefreshing ? 'Refreshing...' : pullDistance > 60 ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      )}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Mind Core Fitness</h1>
          <span className="admin-badge">Admin</span>
        </div>
        <nav className="header-nav">
          <button
            className={`nav-btn ${activeView === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveView('schedule')}
          >
            Today
          </button>
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
        {activeView === 'schedule' && (
          <div className="schedule-view">
            <div className="view-header">
              <h2>Schedule</h2>
            </div>
            <Schedule />
          </div>
        )}

        {activeView === 'clients' && (
          <div className="clients-view">
            <div className="view-header">
              <h2>Clients</h2>
              <button
                className="add-btn"
                onClick={handleAddClient}
              >
                + Add Client
              </button>
            </div>

            <ClientList />
          </div>
        )}

        {activeView === 'calendar' && (
          <div className="calendar-view">
            <div className="view-header">
              <h2>Calendar</h2>
            </div>
            <Calendar />
          </div>
        )}
      </main>
    </div>
  );
}
