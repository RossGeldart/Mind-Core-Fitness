import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, deleteDoc, doc, addDoc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
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
  const [openedSlots, setOpenedSlots] = useState([]);
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

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Pull to refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const mainRef = useRef(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  // Swipe state for session cards
  const [swipedCardId, setSwipedCardId] = useState(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState(null);

  // Achievements
  const [achievements, setAchievements] = useState([]);

  // Progress ring animation state
  const [animateRing, setAnimateRing] = useState(false);

  // Live countdown state
  const [liveCountdown, setLiveCountdown] = useState(null);

  // Daily quote state
  const [dailyQuote, setDailyQuote] = useState(null);

  // Session notes state
  const [sessionNotes, setSessionNotes] = useState([]);
  const [expandedNote, setExpandedNote] = useState(null);
  const notesRef = useRef(null);

  const { currentUser, isClient, clientData, logout, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

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
    setTimeout(() => circle.remove(), 600);
  };

  // Pull to refresh handlers
  const handleTouchStart = (e) => {
    if (mainRef.current && mainRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e) => {
    if (!isPulling.current || !mainRef.current) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;

    // Only start showing indicator after 20px of pull (reduces accidental triggers)
    if (diff > 20 && mainRef.current.scrollTop === 0) {
      e.preventDefault();
      setPullDistance(Math.min((diff - 20) * 0.35, 80));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 55 && !refreshing) {
      setRefreshing(true);
      await fetchAllData();
      showToast('Refreshed!', 'success');
      setRefreshing(false);
    }
    setPullDistance(0);
    isPulling.current = false;
  };

  // Swipe handlers for session cards
  const handleSwipeStart = (e, sessionId) => {
    const touch = e.touches[0];
    e.currentTarget.dataset.startX = touch.clientX;
    e.currentTarget.dataset.startY = touch.clientY;
  };

  const handleSwipeMove = (e, sessionId) => {
    const touch = e.touches[0];
    const startX = parseFloat(e.currentTarget.dataset.startX);
    const startY = parseFloat(e.currentTarget.dataset.startY);
    const diffX = touch.clientX - startX;
    const diffY = touch.clientY - startY;

    // Only horizontal swipe
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      e.preventDefault();
      if (diffX < -50) {
        setSwipedCardId(sessionId);
      } else if (diffX > 50) {
        setSwipedCardId(null);
      }
    }
  };

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (clientData) {
      // Check context for daily quote immediately (before Firestore fetch)
      if (clientData.dailyQuote) {
        const today = new Date().toISOString().split('T')[0];
        if (clientData.dailyQuote.date === today) {
          setDailyQuote(clientData.dailyQuote);
        }
      }
      fetchAllData();
    }
  }, [clientData]);

  // Trigger progress ring animation on load
  useEffect(() => {
    if (!loading && clientData) {
      const timer = setTimeout(() => setAnimateRing(true), 300);
      return () => clearTimeout(timer);
    }
  }, [loading, clientData]);

  // Live countdown timer - updates every second
  useEffect(() => {
    const updateCountdown = () => {
      const upcoming = getUpcomingSessions();
      if (upcoming.length === 0) {
        setLiveCountdown(null);
        return;
      }

      const nextSession = upcoming[0];
      const now = new Date();
      const sessionDate = new Date(nextSession.date + 'T' + nextSession.time);
      const diff = sessionDate - now;

      if (diff <= 0) {
        setLiveCountdown(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setLiveCountdown({ days, hours, minutes, seconds, session: nextSession });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [sessions, loading]);

  const fetchAllData = async () => {
    try {
      // Fire ALL independent queries in parallel instead of sequentially
      const [
        sessionsSnapshot,
        allSessionsSnapshot,
        holidaysSnapshot,
        blockedTimesSnapshot,
        openedSlotsSnapshot,
        requestsSnapshot,
        achSnapshot,
        clientDoc,
        notesSnapshot,
      ] = await Promise.all([
        getDocs(query(collection(db, 'sessions'), where('clientId', '==', clientData.id))),
        getDocs(collection(db, 'sessions')),
        getDocs(collection(db, 'holidays')),
        getDocs(collection(db, 'blockedTimes')),
        getDocs(collection(db, 'openedSlots')),
        getDocs(query(collection(db, 'rescheduleRequests'), where('clientId', '==', clientData.id))),
        getDocs(query(collection(db, 'achievements'), where('clientId', '==', clientData.id))),
        getDoc(doc(db, 'clients', clientData.id)),
        getDocs(query(collection(db, 'sessionNotes'), where('clientId', '==', clientData.id))),
      ]);

      // Process sessions
      const sessionsData = sessionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      sessionsData.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });
      setSessions(sessionsData);

      setAllSessions(allSessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setHolidays(holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setBlockedTimes(blockedTimesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setOpenedSlots(openedSlotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Process reschedule requests
      const requestsData = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingRequests(requestsData.filter(r => r.status === 'pending'));

      const recentNotifications = requestsData.filter(r => {
        if (r.status === 'pending') return false;
        if (!r.respondedAt) return false;
        const respondedDate = r.respondedAt.toDate ? r.respondedAt.toDate() : new Date(r.respondedAt);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return respondedDate > sevenDaysAgo && !r.dismissed;
      });
      setNotifications(recentNotifications);

      // Process achievements
      if (!achSnapshot.empty) {
        const badges = achSnapshot.docs[0].data().badges || [];
        setAchievements(badges);
      }

      // Process daily quote
      const today = new Date().toISOString().split('T')[0];
      if (clientDoc.exists()) {
        const data = clientDoc.data();
        if (data.dailyQuote && data.dailyQuote.date === today) {
          setDailyQuote(data.dailyQuote);
        } else {
          setDailyQuote(null);
        }
      }

      // Process session notes
      const notes = notesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      notes.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setSessionNotes(notes);

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

  const isSessionToday = (session) => {
    const now = new Date();
    const today = formatDateKey(now);
    return session.date === today && !isSessionPast(session);
  };

  const getCompletedCount = () => {
    return sessions.filter(s => isSessionPast(s)).length;
  };

  const getUpcomingSessions = () => {
    return sessions.filter(s => !isSessionPast(s));
  };

  const handleCancelSession = (session) => {
    setConfirmModal({
      title: 'Cancel Session?',
      message: `Cancel your session on ${formatDate(session.date)} at ${formatTime(session.time)}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setCancellingId(session.id);
        setSwipedCardId(null);
        try {
          await deleteDoc(doc(db, 'sessions', session.id));
          setSessions(sessions.filter(s => s.id !== session.id));
          showToast('Session cancelled', 'success');
        } catch (error) {
          console.error('Error cancelling session:', error);
          showToast('Failed to cancel session. Please try again.', 'error');
        }
        setCancellingId(null);
      },
      onCancel: () => setConfirmModal(null)
    });
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
      blockedTimes,
      openedSlots
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

      closeRescheduleModal();
      showToast('Reschedule request submitted! You\'ll be notified when your trainer responds.', 'success');
      fetchAllData(); // Refresh to show pending request
    } catch (error) {
      console.error('Error submitting reschedule request:', error);
      showToast('Failed to submit request. Please try again.', 'error');
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

  // Calculate countdown to next session
  const getNextSessionCountdown = () => {
    const upcoming = getUpcomingSessions();
    if (upcoming.length === 0) return null;

    const nextSession = upcoming[0];
    const now = new Date();
    const sessionDate = new Date(nextSession.date + 'T' + nextSession.time);
    const diff = sessionDate - now;

    if (diff <= 0) return null;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes, session: nextSession };
  };

  if (authLoading || loading) {
    return (
      <div className="client-dashboard">
        <header className="client-header">
          <div className="header-content">
            <div className="skeleton skeleton-logo"></div>
          </div>
        </header>
        <main className="client-main">
          <div className="skeleton-welcome">
            <div className="skeleton skeleton-title"></div>
            <div className="skeleton skeleton-btn-small"></div>
          </div>
          <div className="skeleton-actions">
            <div className="skeleton skeleton-btn"></div>
            <div className="skeleton skeleton-btn"></div>
          </div>
          <div className="skeleton skeleton-card-large"></div>
          <div className="skeleton skeleton-card-medium"></div>
          <div className="skeleton skeleton-card-medium"></div>
        </main>
      </div>
    );
  }

  if (!currentUser || !isClient || !clientData) {
    return null;
  }

  const completed = getCompletedCount();
  const remaining = clientData.totalSessions - completed;
  const upcomingSessions = getUpcomingSessions();
  const availableDates = showRescheduleModal ? getAvailableDates() : [];
  const countdown = getNextSessionCountdown();
  const progressPercent = clientData.totalSessions > 0 ? (completed / clientData.totalSessions) * 100 : 0;

  return (
    <div className="client-dashboard">
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
        </div>
      </header>

      {/* Pull to refresh indicator */}
      <div
        className={`pull-refresh-indicator ${pullDistance > 0 ? 'visible' : ''} ${refreshing ? 'refreshing' : ''}`}
        style={{ height: pullDistance }}
      >
        <div className={`refresh-spinner ${refreshing ? 'spinning' : ''}`}>
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </div>
        <span className="refresh-text">{refreshing ? 'Refreshing...' : 'Pull to refresh'}</span>
      </div>

      <main
        className="client-main page-transition-enter"
        ref={mainRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="welcome-section">
          <h2>Welcome, {clientData.name.split(' ')[0]}</h2>
          <div className="welcome-actions">
            <button
              className="theme-toggle"
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
            <button className="logout-btn" onClick={handleLogout}>Log Out</button>
          </div>
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

        {/* Circular Ring Countdown Timer */}
        {liveCountdown && (
          <div className="ring-timer-container">
            <div className="ring-timer">
              {/* SVG Ring with 60 tick marks */}
              <svg className="ring-timer-svg" viewBox="0 0 200 200">
                {/* Generate 60 tick marks */}
                {[...Array(60)].map((_, i) => {
                  const angle = (i * 6 - 90) * (Math.PI / 180); // Start from top (12 o'clock)
                  const innerRadius = 85;
                  const outerRadius = 96;
                  const x1 = 100 + innerRadius * Math.cos(angle);
                  const y1 = 100 + innerRadius * Math.sin(angle);
                  const x2 = 100 + outerRadius * Math.cos(angle);
                  const y2 = 100 + outerRadius * Math.sin(angle);

                  // Calculate which ticks should be white (elapsed) vs red (remaining)
                  // Counterclockwise from 12 o'clock, ticks turn white as seconds pass
                  const currentSecond = liveCountdown.seconds;
                  const ticksElapsed = 60 - currentSecond; // Number of ticks that should be white
                  // Counterclockwise: tick 0 is at 12 o'clock, tick 1 is at 11:59, etc.
                  const isElapsed = i < ticksElapsed;

                  return (
                    <line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className={`ring-tick ${isElapsed ? 'elapsed' : 'remaining'}`}
                      strokeWidth={i % 5 === 0 ? "3" : "2"}
                    />
                  );
                })}
              </svg>

              {/* Center content - Logo and countdown */}
              <div className="ring-timer-center">
                <div className="ring-timer-logo">
                  <img src="/Logo.webp" alt="Mind Core Fitness" />
                </div>
                <div className="ring-timer-countdown">
                  {liveCountdown.days > 0 && (
                    <>
                      <span className="timer-digit">{String(liveCountdown.days).padStart(2, '0')}</span>
                      <span className="timer-colon">:</span>
                    </>
                  )}
                  <span className="timer-digit">{String(liveCountdown.hours).padStart(2, '0')}</span>
                  <span className="timer-colon">:</span>
                  <span className="timer-digit">{String(liveCountdown.minutes).padStart(2, '0')}</span>
                  <span className="timer-colon">:</span>
                  <span className="timer-digit timer-seconds">{String(liveCountdown.seconds).padStart(2, '0')}</span>
                </div>
                <div className="ring-timer-label">until next session</div>
              </div>
            </div>
            <div className="ring-timer-session-info">
              {formatDate(liveCountdown.session.date)} at {formatTime(liveCountdown.session.time)}
            </div>
          </div>
        )}

        <div className="block-info-card">
          <div className="block-header-row">
            <h3>Your Training Block</h3>
          </div>
          <div className="progress-section">
            <div className="progress-ring-container">
              <svg className="progress-ring" viewBox="0 0 100 100">
                <circle
                  className="progress-ring-bg"
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  strokeWidth="8"
                />
                <circle
                  className={`progress-ring-fill ${animateRing ? 'animate' : ''}`}
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={animateRing ? `${2 * Math.PI * 42 * (1 - progressPercent / 100)}` : `${2 * Math.PI * 42}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="progress-ring-text">
                <span className="progress-percent">{Math.round(progressPercent)}%</span>
                <span className="progress-label">complete</span>
              </div>
            </div>
            <div className="progress-stats">
              <div className="progress-stat">
                <span className="progress-stat-value">{completed}</span>
                <span className="progress-stat-label">Completed</span>
              </div>
              <div className="progress-stat">
                <span className="progress-stat-value">{remaining}</span>
                <span className="progress-stat-label">Remaining</span>
              </div>
              <div className="progress-stat">
                <span className="progress-stat-value">{clientData.totalSessions}</span>
                <span className="progress-stat-label">Total</span>
              </div>
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

        {/* Core Buddy Link */}
        {clientData?.coreBuddyAccess && (
          <div className="core-buddy-cta" onClick={() => navigate('/client/core-buddy')}>
            <div className="core-buddy-cta-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            </div>
            <div className="core-buddy-cta-text">
              <span className="core-buddy-cta-title">Core Buddy</span>
              <span className="core-buddy-cta-sub">Workouts, nutrition & habits</span>
            </div>
            <svg className="core-buddy-cta-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
          </div>
        )}

        {/* Session Notes Card */}
        {sessionNotes.length > 0 && (
          <div className="session-notes-card" ref={notesRef}>
            <div className="session-notes-header">
              <div className="session-notes-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <span>Session Notes</span>
              </div>
              <span className="session-notes-count">{sessionNotes.length}</span>
            </div>
            <div className="session-notes-list">
              {sessionNotes.slice(0, expandedNote === 'show-all' ? undefined : 3).map((note, i) => (
                <div
                  key={note.id}
                  className={`session-note-item ${expandedNote === note.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                >
                  <div className="session-note-top">
                    <span className="session-note-date">{note.date}</span>
                    <svg className={`session-note-chevron ${expandedNote === note.id ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                  {note.sessionNotes && (
                    <p className="session-note-preview">{expandedNote === note.id ? note.sessionNotes : note.sessionNotes.length > 80 ? note.sessionNotes.slice(0, 80) + '...' : note.sessionNotes}</p>
                  )}
                  {expandedNote === note.id && (
                    <div className="session-note-details">
                      {note.whatWentWell && (
                        <div className="session-note-section went-well">
                          <span className="session-note-label">What Went Well</span>
                          <p>{note.whatWentWell}</p>
                        </div>
                      )}
                      {note.whatWentWrong && (
                        <div className="session-note-section went-wrong">
                          <span className="session-note-label">What Went Wrong</span>
                          <p>{note.whatWentWrong}</p>
                        </div>
                      )}
                      {note.whatsNext && (
                        <div className="session-note-section whats-next">
                          <span className="session-note-label">What's Next</span>
                          <p>{note.whatsNext}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {sessionNotes.length > 3 && expandedNote === null && (
              <button className="session-notes-viewall" onClick={() => setExpandedNote('show-all')}>
                View all {sessionNotes.length} notes
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
              </button>
            )}
            {expandedNote === 'show-all' && sessionNotes.length > 3 && (
              <button className="session-notes-viewall" onClick={() => setExpandedNote(null)}>
                Show less
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ transform: 'rotate(180deg)' }}><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
              </button>
            )}
          </div>
        )}

        {achievements.length > 0 && (
          <div className="achievements-card">
            <div className="achievements-card-header">
              <div className="achievements-card-title">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <span>Targets Achieved</span>
              </div>
              <span className="achievements-card-count">{achievements.length}</span>
            </div>
            <div className="achievements-card-list">
              {[...achievements].reverse().slice(0, 3).map((badge, i) => (
                <div key={i} className="achievements-card-item">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  <span className="achievements-card-label">{badge.label}</span>
                  <span className="achievements-card-date">{badge.achievedMonth}</span>
                </div>
              ))}
            </div>
            {achievements.length > 3 && (
              <button className="achievements-card-viewall" onClick={() => navigate('/client/personal-bests')}>
                View all {achievements.length} achievements
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
              </button>
            )}
          </div>
        )}

        {/* Daily Quote Card */}
        {dailyQuote ? (
          <div className="daily-quote-card">
            <div className="daily-quote-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
              </svg>
            </div>
            <div className="daily-quote-content">
              <div className="daily-quote-label">Daily Motivation</div>
              <div className="daily-quote-text">{dailyQuote.text}</div>
              <div className="daily-quote-author">— {dailyQuote.author}</div>
              <div className="daily-quote-lock">
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
                </svg>
                New quote at midnight
              </div>
            </div>
          </div>
        ) : (
          <div className="daily-quote-cta" onClick={() => navigate('/client/tools/motivation')}>
            <div className="daily-quote-cta-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
            </div>
            <div className="daily-quote-cta-text">
              <span className="daily-quote-cta-title">Daily Motivation</span>
              <span className="daily-quote-cta-sub">Tap to get today's inspiration</span>
            </div>
            <svg className="daily-quote-cta-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
          </div>
        )}

        <div className="sessions-section">
          <h3>Upcoming Sessions ({upcomingSessions.length})</h3>
          {upcomingSessions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="20" y="15" width="60" height="70" rx="4" />
                  <line x1="20" y1="35" x2="80" y2="35" />
                  <line x1="35" y1="15" x2="35" y2="35" />
                  <line x1="65" y1="15" x2="65" y2="35" />
                  <circle cx="40" cy="55" r="4" fill="currentColor" opacity="0.3" />
                  <circle cx="60" cy="55" r="4" fill="currentColor" opacity="0.3" />
                  <circle cx="40" cy="70" r="4" fill="currentColor" opacity="0.3" />
                  <circle cx="60" cy="70" r="4" fill="currentColor" opacity="0.3" />
                </svg>
              </div>
              <h4>No upcoming sessions</h4>
              <p>Contact your trainer to book sessions</p>
            </div>
          ) : (
            <div className="sessions-list">
              {upcomingSessions.map(session => (
                <div
                  key={session.id}
                  className={`session-card-wrapper ${swipedCardId === session.id ? 'swiped' : ''}`}
                  onTouchStart={(e) => handleSwipeStart(e, session.id)}
                  onTouchMove={(e) => handleSwipeMove(e, session.id)}
                >
                  <div className="session-card-swipe-actions">
                    <button
                      className="swipe-action-btn reschedule ripple-btn"
                      onClick={(e) => { createRipple(e); setSwipedCardId(null); openRescheduleModal(session); }}
                      disabled={hasPendingRequest(session.id)}
                    >
                      Reschedule
                    </button>
                    <button
                      className="swipe-action-btn cancel ripple-btn"
                      onClick={(e) => { createRipple(e); handleCancelSession(session); }}
                      disabled={cancellingId === session.id}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className={`session-card ${isSessionToday(session) ? 'today-session' : ''}`} onClick={() => swipedCardId === session.id && setSwipedCardId(null)}>
                    <div className="session-info">
                      <div className="session-date">
                        {isSessionToday(session) && <span className="today-label">Today - </span>}
                        {formatDate(session.date)}
                      </div>
                      <div className="session-time">{formatTime(session.time)} ({session.duration} min)</div>
                      {hasPendingRequest(session.id) && (
                        <div className="pending-badge">Reschedule pending</div>
                      )}
                    </div>
                    <div className="session-actions">
                      <button
                        className="reschedule-btn ripple-btn"
                        onClick={(e) => { e.stopPropagation(); createRipple(e); openRescheduleModal(session); }}
                        disabled={hasPendingRequest(session.id)}
                      >
                        Reschedule
                      </button>
                      <button
                        className="cancel-btn ripple-btn"
                        onClick={(e) => { e.stopPropagation(); createRipple(e); handleCancelSession(session); }}
                        disabled={cancellingId === session.id}
                      >
                        {cancellingId === session.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                    {/* Mobile swipe hint */}
                    <div className="swipe-hint">
                      <span className="swipe-hint-text">Swipe</span>
                      <span className="swipe-hint-chevrons">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                        </svg>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                        </svg>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="completed-section">
          <h3>Completed Sessions ({completed})</h3>
          {completed === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="50" cy="50" r="35" />
                  <path d="M35 50 L45 60 L65 40" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
                  <path d="M50 25 L50 50 L65 55" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h4>No completed sessions yet</h4>
              <p>Your completed sessions will appear here</p>
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

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? (
              <svg className="success-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path className="check-path" d="M5 13 L9 17 L19 7" />
              </svg>
            ) : toast.type === 'error' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="confirm-modal-overlay" onClick={confirmModal.onCancel}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmModal.title}</h3>
            <p>{confirmModal.message}</p>
            <div className="confirm-modal-actions">
              <button className="confirm-cancel-btn ripple-btn" onClick={(e) => { createRipple(e); confirmModal.onCancel(); }}>
                Keep Session
              </button>
              <button className="confirm-btn ripple-btn" onClick={(e) => { createRipple(e); confirmModal.onConfirm(); }}>
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Nav */}
      <nav className="block-bottom-nav">
        <button className="block-nav-tab active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </button>
        <button className="block-nav-tab" onClick={() => navigate('/client/forms')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Forms</span>
        </button>
        <button className="block-nav-tab" onClick={() => navigate('/client/tools')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span>Tools</span>
        </button>
        <button className="block-nav-tab" onClick={() => navigate('/client/personal-bests')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
          <span>PBs</span>
        </button>
        {clientData?.circuitAccess && (
          <button className="block-nav-tab" onClick={() => navigate('/client/circuit')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Circuit</span>
          </button>
        )}
      </nav>
    </div>
  );
}
