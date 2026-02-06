import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, deleteDoc, query, where, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import ClientList from '../components/ClientList';
import Calendar from '../components/Calendar';
import Schedule from '../components/Schedule';
import Availability from '../components/Availability';
import './Dashboard.css';

export default function Dashboard() {
  const [activeView, setActiveView] = useState('schedule');
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rescheduleRequests, setRescheduleRequests] = useState([]);
  const [processingRequest, setProcessingRequest] = useState(null);
  const { currentUser, logout, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const startY = useRef(0);
  const isPulling = useRef(false);
  const mainRef = useRef(null);

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
      if (getScrollTop() <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling.current) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 0 && getScrollTop() <= 0) {
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
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request. Please try again.');
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
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Failed to reject request. Please try again.');
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
          <button
            className={`nav-btn ${activeView === 'requests' ? 'active' : ''} ${pendingCount > 0 ? 'has-badge' : ''}`}
            onClick={() => setActiveView('requests')}
          >
            Requests
            {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </button>
          <button
            className={`nav-btn ${activeView === 'availability' ? 'active' : ''}`}
            onClick={() => setActiveView('availability')}
          >
            Slots
          </button>
        </nav>
        <div className="header-actions">
          <button className="refresh-btn" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? '↻' : '⟳'}
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            Log Out
          </button>
        </div>
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

        {activeView === 'requests' && (
          <div className="requests-view">
            <div className="view-header">
              <h2>Reschedule Requests</h2>
            </div>

            {rescheduleRequests.length === 0 ? (
              <div className="no-requests">
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

        {activeView === 'availability' && (
          <div className="availability-view">
            <div className="view-header">
              <h2>Available Slots</h2>
            </div>
            <Availability />
          </div>
        )}
      </main>
    </div>
  );
}
