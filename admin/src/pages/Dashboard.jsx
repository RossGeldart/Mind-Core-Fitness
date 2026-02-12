import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, deleteDoc, query, where, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ClientList from '../components/ClientList';
import Calendar from '../components/Calendar';
import Schedule from '../components/Schedule';
import FormSubmissions from '../components/FormSubmissions';
import CircuitManagement from '../components/CircuitManagement';
import './Dashboard.css';

export default function Dashboard() {
  const [activeView, setActiveViewState] = useState(() => localStorage.getItem('adminActiveView') || 'schedule');
  const setActiveView = (view) => {
    setActiveViewState(view);
    localStorage.setItem('adminActiveView', view);
  };
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rescheduleRequests, setRescheduleRequests] = useState([]);
  const [processingRequest, setProcessingRequest] = useState(null);
  const [toast, setToast] = useState(null);
  const { currentUser, logout, isAdmin, loading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const startY = useRef(0);
  const isPulling = useRef(false);
  const mainRef = useRef(null);

  // Toast notification helper
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Ripple effect helper
  const createRipple = (event) => {
    const button = event.currentTarget;
    const existingRipple = button.querySelector('.ripple');
    if (existingRipple) existingRipple.remove();

    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    const rect = button.getBoundingClientRect();

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add('ripple');

    button.appendChild(circle);
  };

  useEffect(() => {
    if (!loading && (!currentUser || !isAdmin)) {
      navigate('/');
    }
  }, [currentUser, isAdmin, loading, navigate]);

  // Fetch pending reschedule requests
  useEffect(() => {
    if (currentUser && isAdmin) {
      fetchRescheduleRequests();
    }
  }, [currentUser, isAdmin]);

  const fetchRescheduleRequests = async () => {
    try {
      const requestsQuery = query(
        collection(db, 'rescheduleRequests'),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(requestsQuery);
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by creation date, newest first
      requests.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });
      setRescheduleRequests(requests);
    } catch (error) {
      console.error('Error fetching reschedule requests:', error);
    }
  };

  // Cleanup orphaned sessions (sessions with no matching client)
  useEffect(() => {
    const cleanupOrphanedSessions = async () => {
      if (!currentUser || !isAdmin) return;

      try {
        const [clientsSnapshot, sessionsSnapshot] = await Promise.all([
          getDocs(collection(db, 'clients')),
          getDocs(collection(db, 'sessions'))
        ]);

        const clientIds = new Set(clientsSnapshot.docs.map(doc => doc.id));
        const orphanedSessions = sessionsSnapshot.docs.filter(
          sessionDoc => !clientIds.has(sessionDoc.data().clientId)
        );

        if (orphanedSessions.length > 0) {
          console.log(`Cleaning up ${orphanedSessions.length} orphaned sessions...`);
          const deletePromises = orphanedSessions.map(sessionDoc =>
            deleteDoc(doc(db, 'sessions', sessionDoc.id))
          );
          await Promise.all(deletePromises);
          console.log('Orphaned sessions cleaned up successfully');
        }
      } catch (error) {
        console.error('Error cleaning up orphaned sessions:', error);
      }
    };

    cleanupOrphanedSessions();
  }, [currentUser, isAdmin]);

  // Pull-to-refresh handlers
  useEffect(() => {
    const getScrollTop = () => {
      return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    };

    const handleTouchStart = (e) => {
      // Only allow pull-to-refresh if solidly at top (not during momentum scroll)
      if (getScrollTop() <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = false; // Don't set true yet — wait for confirmed downward pull
      }
    };

    const handleTouchMove = (e) => {
      const scrollTop = getScrollTop();
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      // Must be at the very top and pulling downward
      if (scrollTop > 5 || diff <= 0) {
        isPulling.current = false;
        setPullDistance(0);
        return;
      }

      // Require 20px deadzone before activating pull gesture
      if (diff > 20 && scrollTop <= 0) {
        isPulling.current = true;
        setPullDistance(Math.min((diff - 20) * 0.4, 80));
      }
    };

    const handleTouchEnd = () => {
      if (isPulling.current && pullDistance > 60) {
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

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

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

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes}${ampm}`;
  };

  const handleApproveRequest = async (request) => {
    if (!window.confirm(`Approve reschedule for ${request.clientName}?\n\nFrom: ${formatDate(request.originalDate)} at ${formatTime(request.originalTime)}\nTo: ${formatDate(request.requestedDate)} at ${formatTime(request.requestedTime)}`)) {
      return;
    }

    setProcessingRequest(request.id);
    try {
      // Update the session with new date/time
      await updateDoc(doc(db, 'sessions', request.sessionId), {
        date: request.requestedDate,
        time: request.requestedTime
      });

      // Update the request status
      await updateDoc(doc(db, 'rescheduleRequests', request.id), {
        status: 'approved',
        respondedAt: Timestamp.now()
      });

      // Remove from local state
      setRescheduleRequests(rescheduleRequests.filter(r => r.id !== request.id));
      showToast(`Approved reschedule for ${request.clientName}`, 'success');
    } catch (error) {
      console.error('Error approving request:', error);
      showToast('Failed to approve request', 'error');
    }
    setProcessingRequest(null);
  };

  const handleRejectRequest = async (request) => {
    if (!window.confirm(`Reject reschedule request from ${request.clientName}?`)) {
      return;
    }

    setProcessingRequest(request.id);
    try {
      // Update the request status
      await updateDoc(doc(db, 'rescheduleRequests', request.id), {
        status: 'rejected',
        respondedAt: Timestamp.now()
      });

      // Remove from local state
      setRescheduleRequests(rescheduleRequests.filter(r => r.id !== request.id));
      showToast(`Request from ${request.clientName} rejected`, 'info');
    } catch (error) {
      console.error('Error rejecting request:', error);
      showToast('Failed to reject request', 'error');
    }
    setProcessingRequest(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!currentUser || !isAdmin) {
    return null;
  }

  const pendingCount = rescheduleRequests.length;

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
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="admin-header-logo" />
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
          <button
            className={`nav-btn ${activeView === 'requests' ? 'active' : ''} ${pendingCount > 0 ? 'has-badge' : ''}`}
            onClick={() => setActiveView('requests')}
          >
            Requests
            {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </button>
          <button
            className={`nav-btn ${activeView === 'forms' ? 'active' : ''}`}
            onClick={() => setActiveView('forms')}
          >
            Forms
          </button>
          <button
            className={`nav-btn ${activeView === 'circuits' ? 'active' : ''}`}
            onClick={() => setActiveView('circuits')}
          >
            Circuits
          </button>
        </nav>
        <div className="header-actions">
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
              </svg>
            )}
          </button>
          <button className="refresh-btn" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? '↻' : '⟳'}
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-icon">
              {toast.type === 'success' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
              {toast.type === 'error' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              )}
              {toast.type === 'info' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
              )}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}

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

        {activeView === 'requests' && (
          <div className="requests-view">
            <div className="view-header">
              <h2>Reschedule Requests</h2>
            </div>

            {rescheduleRequests.length === 0 ? (
              <div className="no-requests">
                <div className="empty-icon">
                  <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="20" y="25" width="60" height="50" rx="4" />
                    <path d="M20 35 L50 55 L80 35" />
                    <circle cx="50" cy="70" r="3" fill="currentColor" />
                  </svg>
                </div>
                <p>No pending requests</p>
                <span>When clients request to reschedule, they will appear here</span>
              </div>
            ) : (
              <div className="requests-list">
                {rescheduleRequests.map(request => (
                  <div key={request.id} className="request-card">
                    <div className="request-header">
                      <span className="client-name">{request.clientName}</span>
                      <span className="request-time">
                        {request.createdAt?.toDate ?
                          request.createdAt.toDate().toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : ''}
                      </span>
                    </div>
                    <div className="request-details">
                      <div className="request-change">
                        <div className="from-session">
                          <span className="label">From:</span>
                          <span className="value">{formatDate(request.originalDate)} at {formatTime(request.originalTime)}</span>
                        </div>
                        <div className="arrow">→</div>
                        <div className="to-session">
                          <span className="label">To:</span>
                          <span className="value">{formatDate(request.requestedDate)} at {formatTime(request.requestedTime)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="request-actions">
                      <button
                        className="approve-btn"
                        onClick={() => handleApproveRequest(request)}
                        disabled={processingRequest === request.id}
                      >
                        {processingRequest === request.id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => handleRejectRequest(request)}
                        disabled={processingRequest === request.id}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'forms' && (
          <div className="forms-view">
            <div className="view-header">
              <h2>Client Forms</h2>
            </div>
            <FormSubmissions />
          </div>
        )}

        {activeView === 'circuits' && (
          <div className="circuits-view">
            <div className="view-header">
              <h2>Circuit Management</h2>
            </div>
            <CircuitManagement />
          </div>
        )}
      </main>
    </div>
  );
}
