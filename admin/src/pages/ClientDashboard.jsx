import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, deleteDoc, doc, addDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  SCHEDULE,
  DAYS,
  formatTime as formatTimeUtil,
  formatDateKey,
  getAvailableSlotsForDate,
  isWeekday,
  getDayName
} from '../utils/scheduleUtils';
import './ClientDashboard.css';

export default function ClientDashboard() {
  const [sessions, setSessions] = useState([]);
  const [allSessions, setAllSessions] = useState([]); // All sessions for availability check
  const [holidays, setHolidays] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);

  // Reschedule modal state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleSession, setRescheduleSession] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);

  const { currentUser, isClient, clientData, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (clientData) {
      fetchAllData();
    }
  }, [clientData]);

  const fetchAllData = async () => {
    try {
      // Fetch client's sessions
      const sessionsQuery = query(
        collection(db, 'sessions'),
        where('clientId', '==', clientData.id)
      );
      const sessionsSnapshot = await getDocs(sessionsQuery);
      const sessionsData = sessionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      sessionsData.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });
      setSessions(sessionsData);

      // Fetch all sessions for availability check
      const allSessionsSnapshot = await getDocs(collection(db, 'sessions'));
      setAllSessions(allSessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Fetch holidays
      const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
      setHolidays(holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Fetch blocked times
      const blockedTimesSnapshot = await getDocs(collection(db, 'blockedTimes'));
      setBlockedTimes(blockedTimesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Fetch pending reschedule requests for this client
      const requestsQuery = query(
        collection(db, 'rescheduleRequests'),
        where('clientId', '==', clientData.id)
      );
      const requestsSnapshot = await getDocs(requestsQuery);
      const requestsData = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingRequests(requestsData.filter(r => r.status === 'pending'));

      // Get recent notifications (approved/rejected in last 7 days)
      const recentNotifications = requestsData.filter(r => {
        if (r.status === 'pending') return false;
        if (!r.respondedAt) return false;
        const respondedDate = r.respondedAt.toDate ? r.respondedAt.toDate() : new Date(r.respondedAt);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return respondedDate > sevenDaysAgo && !r.dismissed;
      });
      setNotifications(recentNotifications);

    } catch (error) {
      console.error('Error fetching data:', error);
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
    const today = formatDateKey(now);
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

  // Check if session already has a pending reschedule request
  const hasPendingRequest = (sessionId) => {
    return pendingRequests.some(r => r.sessionId === sessionId);
  };

  // Reschedule functions
  const openRescheduleModal = (session) => {
    setRescheduleSession(session);
    setSelectedDate(null);
    setSelectedTime(null);
    setAvailableSlots([]);
    setShowRescheduleModal(true);
  };

  const closeRescheduleModal = () => {
    setShowRescheduleModal(false);
    setRescheduleSession(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setAvailableSlots([]);
  };

  const getBlockStartDate = () => {
    if (!clientData.startDate) return new Date();
    return clientData.startDate.toDate ? clientData.startDate.toDate() : new Date(clientData.startDate);
  };

  const getBlockEndDate = () => {
    if (!clientData.endDate) return new Date();
    return clientData.endDate.toDate ? clientData.endDate.toDate() : new Date(clientData.endDate);
  };

  const getAvailableDates = () => {
    const dates = [];
    const startDate = new Date();
    const endDate = getBlockEndDate();

    // Start from tomorrow
    const current = new Date(startDate);
    current.setDate(current.getDate() + 1);

    while (current <= endDate) {
      if (isWeekday(current)) {
        const dateKey = formatDateKey(current);
        const isHoliday = holidays.some(h => h.date === dateKey);
        if (!isHoliday) {
          dates.push(new Date(current));
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setSelectedTime(null);

    // Get available slots for this date
    const sessionDuration = rescheduleSession?.duration || clientData.sessionDuration || 45;
    let slots = getAvailableSlotsForDate(
      date,
      sessionDuration,
      allSessions,
      holidays,
      rescheduleSession?.id, // Exclude current session from conflict check
      blockedTimes
    );

    // If same date as original session, filter out the original time slot
    if (rescheduleSession && formatDateKey(date) === rescheduleSession.date) {
      slots = slots.filter(slot => slot.time !== rescheduleSession.time);
    }

    setAvailableSlots(slots);
  };

  const handleSubmitReschedule = async () => {
    if (!selectedDate || !selectedTime || !rescheduleSession) return;

    setSubmitting(true);
    try {
      // Create reschedule request
      await addDoc(collection(db, 'rescheduleRequests'), {
        sessionId: rescheduleSession.id,
        clientId: clientData.id,
        clientName: clientData.name,
        originalDate: rescheduleSession.date,
        originalTime: rescheduleSession.time,
        requestedDate: formatDateKey(selectedDate),
        requestedTime: selectedTime,
        duration: rescheduleSession.duration,
        status: 'pending',
        createdAt: Timestamp.now(),
        respondedAt: null,
        dismissed: false
      });

      alert('Reschedule request submitted! You will be notified when your trainer responds.');
      closeRescheduleModal();
      fetchAllData(); // Refresh to show pending request
    } catch (error) {
      console.error('Error submitting reschedule request:', error);
      alert('Failed to submit request. Please try again.');
    }
    setSubmitting(false);
  };

  const dismissNotification = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'rescheduleRequests', notificationId), {
        dismissed: true
      });
      setNotifications(notifications.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error dismissing notification:', error);
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
  const availableDates = showRescheduleModal ? getAvailableDates() : [];

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

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="notifications-section">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`notification ${notification.status}`}
              >
                <div className="notification-content">
                  <span className="notification-icon">
                    {notification.status === 'approved' ? '✓' : '✗'}
                  </span>
                  <div className="notification-text">
                    <strong>
                      {notification.status === 'approved' ? 'Reschedule Approved!' : 'Reschedule Declined'}
                    </strong>
                    <p>
                      {notification.status === 'approved'
                        ? `Your session has been moved to ${formatDate(notification.requestedDate)} at ${formatTime(notification.requestedTime)}`
                        : `Your request to reschedule from ${formatDate(notification.originalDate)} was declined. Please contact your trainer.`
                      }
                    </p>
                  </div>
                </div>
                <button
                  className="dismiss-btn"
                  onClick={() => dismissNotification(notification.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

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
                    {hasPendingRequest(session.id) && (
                      <div className="pending-badge">Reschedule pending</div>
                    )}
                  </div>
                  <div className="session-actions">
                    <button
                      className="reschedule-btn"
                      onClick={() => openRescheduleModal(session)}
                      disabled={hasPendingRequest(session.id)}
                    >
                      Reschedule
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={() => handleCancelSession(session)}
                      disabled={cancellingId === session.id}
                    >
                      {cancellingId === session.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
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

      {/* Reschedule Modal */}
      {showRescheduleModal && rescheduleSession && (
        <div className="modal-overlay" onClick={closeRescheduleModal}>
          <div className="reschedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reschedule Session</h3>
              <button className="close-modal-btn" onClick={closeRescheduleModal}>✕</button>
            </div>

            <div className="modal-body">
              <div className="current-session-info">
                <p>Current: <strong>{formatDate(rescheduleSession.date)}</strong> at <strong>{formatTime(rescheduleSession.time)}</strong></p>
              </div>

              <div className="date-selection">
                <h4>Select New Date</h4>
                {availableDates.length === 0 ? (
                  <p className="no-dates">No available dates within your training block</p>
                ) : (
                  <div className="dates-grid">
                    {availableDates.map((date, index) => (
                      <button
                        key={index}
                        className={`date-btn ${selectedDate && formatDateKey(selectedDate) === formatDateKey(date) ? 'selected' : ''}`}
                        onClick={() => handleDateSelect(date)}
                      >
                        <span className="date-day">{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                        <span className="date-num">{date.getDate()}</span>
                        <span className="date-month">{date.toLocaleDateString('en-GB', { month: 'short' })}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedDate && (
                <div className="time-selection">
                  <h4>Select Time</h4>
                  {availableSlots.length === 0 ? (
                    <p className="no-slots">No available slots on this date</p>
                  ) : (
                    <div className="times-grid">
                      {availableSlots.map((slot, index) => (
                        <button
                          key={index}
                          className={`time-btn ${selectedTime === slot.time ? 'selected' : ''} ${slot.period}`}
                          onClick={() => setSelectedTime(slot.time)}
                        >
                          {formatTime(slot.time)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="cancel-modal-btn" onClick={closeRescheduleModal}>
                Cancel
              </button>
              <button
                className="submit-reschedule-btn"
                onClick={handleSubmitReschedule}
                disabled={!selectedDate || !selectedTime || submitting}
              >
                {submitting ? 'Submitting...' : 'Request Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
