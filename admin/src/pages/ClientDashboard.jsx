import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './ClientDashboard.css';

export default function ClientDashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const { currentUser, isClient, clientData, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (clientData) {
      fetchSessions();
    }
  }, [clientData]);

  const fetchSessions = async () => {
    try {
      const sessionsQuery = query(
        collection(db, 'sessions'),
        where('clientId', '==', clientData.id)
      );
      const snapshot = await getDocs(sessionsQuery);
      const sessionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by date and time
      sessionsData.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });

      setSessions(sessionsData);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
    setLoading(false);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };

  const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes}${ampm}`;
  };

  const formatBlockDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const isSessionPast = (session) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (session.date < today) return true;
    if (session.date === today && session.time < currentTime) return true;
    return false;
  };

  const getCompletedCount = () => {
    return sessions.filter(s => isSessionPast(s)).length;
  };

  const getUpcomingSessions = () => {
    return sessions.filter(s => !isSessionPast(s));
  };

  const handleCancelSession = async (session) => {
    if (!window.confirm(`Cancel your session on ${formatDate(session.date)} at ${formatTime(session.time)}?\n\nThis cannot be undone.`)) {
      return;
    }

    setCancellingId(session.id);
    try {
      await deleteDoc(doc(db, 'sessions', session.id));
      setSessions(sessions.filter(s => s.id !== session.id));
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert('Failed to cancel session. Please try again.');
    }
    setCancellingId(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  if (authLoading || loading) {
    return <div className="client-loading">Loading...</div>;
  }

  if (!currentUser || !isClient || !clientData) {
    return null;
  }

  const completed = getCompletedCount();
  const remaining = clientData.totalSessions - completed;
  const upcomingSessions = getUpcomingSessions();

  return (
    <div className="client-dashboard">
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
        </div>
      </header>

      <main className="client-main">
        <div className="welcome-section">
          <h2>Welcome, {clientData.name.split(' ')[0]}</h2>
          <button className="logout-btn" onClick={handleLogout}>Log Out</button>
        </div>

        <div className="quick-actions">
          <button className="forms-btn" onClick={() => navigate('/client/forms')}>
            Forms & Questionnaires
          </button>
          <button className="tools-btn" onClick={() => navigate('/client/tools')}>
            Tools & Calculators
          </button>
        </div>

        <div className="block-info-card">
          <h3>Your Training Block</h3>
          <div className="block-stats">
            <div className="stat">
              <span className="stat-value">{remaining}</span>
              <span className="stat-label">Sessions Remaining</span>
            </div>
            <div className="stat">
              <span className="stat-value">{completed}</span>
              <span className="stat-label">Completed</span>
            </div>
            <div className="stat">
              <span className="stat-value">{clientData.totalSessions}</span>
              <span className="stat-label">Total Package</span>
            </div>
          </div>
          <div className="block-dates">
            <div className="date-item">
              <span className="date-label">Start Date</span>
              <span className="date-value">{formatBlockDate(clientData.startDate)}</span>
            </div>
            <div className="date-item">
              <span className="date-label">End Date</span>
              <span className="date-value">{formatBlockDate(clientData.endDate)}</span>
            </div>
            <div className="date-item">
              <span className="date-label">Session Duration</span>
              <span className="date-value">{clientData.sessionDuration} minutes</span>
            </div>
          </div>
        </div>

        <div className="sessions-section">
          <h3>Upcoming Sessions ({upcomingSessions.length})</h3>
          {upcomingSessions.length === 0 ? (
            <div className="no-sessions">
              <p>No upcoming sessions scheduled</p>
              <span>Contact your trainer to book sessions</span>
            </div>
          ) : (
            <div className="sessions-list">
              {upcomingSessions.map(session => (
                <div key={session.id} className="session-card">
                  <div className="session-info">
                    <div className="session-date">{formatDate(session.date)}</div>
                    <div className="session-time">{formatTime(session.time)} ({session.duration} min)</div>
                  </div>
                  <button
                    className="cancel-btn"
                    onClick={() => handleCancelSession(session)}
                    disabled={cancellingId === session.id}
                  >
                    {cancellingId === session.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="completed-section">
          <h3>Completed Sessions ({completed})</h3>
          {completed === 0 ? (
            <div className="no-sessions">
              <p>No completed sessions yet</p>
            </div>
          ) : (
            <div className="sessions-list completed">
              {sessions.filter(s => isSessionPast(s)).slice(-5).reverse().map(session => (
                <div key={session.id} className="session-card completed">
                  <div className="session-info">
                    <div className="session-date">{formatDate(session.date)}</div>
                    <div className="session-time">{formatTime(session.time)}</div>
                  </div>
                  <span className="completed-badge">Completed</span>
                </div>
              ))}
              {completed > 5 && (
                <div className="more-sessions">
                  And {completed - 5} more completed sessions
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
