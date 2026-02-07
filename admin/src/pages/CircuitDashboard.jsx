import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CircuitDashboard.css';

const getNextSaturday = () => {
  const now = new Date();
  const day = now.getDay();
  let daysUntil = (6 - day + 7) % 7;
  if (daysUntil === 0) {
    const classEnd = new Date(now);
    classEnd.setHours(9, 45, 0, 0);
    if (now > classEnd) daysUntil = 7;
  }
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next;
};

const getDateString = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatSaturdayDate = (dateStr) => {
  const date = new Date(dateStr + 'T09:00:00');
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export default function CircuitDashboard() {
  const [loading, setLoading] = useState(true);
  const [liveCountdown, setLiveCountdown] = useState(null);
  const [mySlot, setMySlot] = useState(null);
  const [stats, setStats] = useState({ attended: 0, streak: 0, strikes: 0 });
  const [toast, setToast] = useState(null);

  const { currentUser, isClient, clientData, logout, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  // Live countdown to next Saturday 9am
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const nextSat = getNextSaturday();
      nextSat.setHours(9, 0, 0, 0);
      const diff = nextSat - now;
      if (diff <= 0) {
        setLiveCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setLiveCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (clientData) fetchData();
  }, [clientData]);

  const fetchData = async () => {
    try {
      const nextSatDate = getDateString(getNextSaturday());

      // Check this week's session for my slot
      const sessionRef = doc(db, 'circuitSessions', nextSatDate);
      const sessionDoc = await getDoc(sessionRef);
      if (sessionDoc.exists()) {
        const data = sessionDoc.data();
        const slot = data.slots?.find(s => s.memberId === clientData.id);
        setMySlot(slot || null);
      } else {
        setMySlot(null);
      }

      // Calculate stats from all past sessions
      const snapshot = await getDocs(collection(db, 'circuitSessions'));
      const allSessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let attended = 0;
      const attendedDates = [];
      allSessions.forEach(session => {
        const sessionDate = new Date(session.date + 'T09:00:00');
        if (sessionDate < today) {
          const wasPresent = session.slots?.some(s => s.memberId === clientData.id && (s.status === 'confirmed' || s.status === 'attended'));
          if (wasPresent) {
            attended++;
            attendedDates.push(session.date);
          }
        }
      });

      // Calculate streak
      attendedDates.sort((a, b) => b.localeCompare(a));
      let streak = 0;
      let checkDate = new Date(today);
      const dayOfWeek = checkDate.getDay();
      const daysBack = dayOfWeek >= 6 ? dayOfWeek - 6 : dayOfWeek + 1;
      checkDate.setDate(checkDate.getDate() - daysBack);

      for (const dateStr of attendedDates) {
        if (dateStr === getDateString(checkDate)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 7);
        } else {
          break;
        }
      }

      setStats({
        attended,
        streak,
        strikes: clientData.circuitStrikes || 0,
        banUntil: clientData.circuitBanUntil || null,
      });
    } catch (error) {
      console.error('Error fetching circuit data:', error);
    }
    setLoading(false);
  };

  if (authLoading || loading) {
    return (
      <div className="circuit-page">
        <div className="circuit-loading">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="circuit-loading-logo" />
        </div>
      </div>
    );
  }

  const nextSatDate = getDateString(getNextSaturday());
  const memberType = clientData?.clientType || 'block';
  const isCircuitOnly = memberType === 'circuit_vip' || memberType === 'circuit_dropin';
  const typeLabel = memberType === 'circuit_vip' ? 'VIP' : memberType === 'circuit_dropin' ? 'Drop-in' : 'Block';

  return (
    <div className={`circuit-page ${isDark ? 'dark' : ''}`}>
      <header className="circuit-header">
        <div className="circuit-header-left">
          {!isCircuitOnly && (
            <button className="circuit-back-btn" onClick={() => navigate('/client')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
          )}
          <img src="/Logo.PNG" alt="MCF" className="circuit-header-logo" />
        </div>
        <div className="circuit-header-right">
          <button className="circuit-icon-btn" onClick={toggleTheme}>
            {isDark ? '\u2600' : '\u263E'}
          </button>
          {isCircuitOnly && (
            <button className="circuit-icon-btn logout" onClick={logout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          )}
        </div>
      </header>

      <main className="circuit-main">
        <div className="circuit-intro">
          <h2>Circuit Class</h2>
          <p>Hey {clientData?.name?.split(' ')[0]}! Your Saturday session awaits.</p>
        </div>

        {/* Countdown Ring Timer */}
        {liveCountdown && (
          <div className="circuit-countdown">
            <div className="circuit-ring">
              <svg className="circuit-ring-svg" viewBox="0 0 200 200">
                {[...Array(60)].map((_, i) => {
                  const angle = (i * 6 - 90) * (Math.PI / 180);
                  const innerR = 85;
                  const outerR = 96;
                  const x1 = 100 + innerR * Math.cos(angle);
                  const y1 = 100 + innerR * Math.sin(angle);
                  const x2 = 100 + outerR * Math.cos(angle);
                  const y2 = 100 + outerR * Math.sin(angle);
                  const elapsed = 60 - liveCountdown.seconds;
                  const isElapsed = i < elapsed;
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                      className={`circuit-tick ${isElapsed ? 'elapsed' : 'remaining'}`}
                      strokeWidth={i % 5 === 0 ? '3' : '2'}
                    />
                  );
                })}
              </svg>
              <div className="circuit-ring-center">
                <div className="circuit-ring-label">Next Class</div>
                <div className="circuit-ring-countdown">
                  {liveCountdown.days > 0 && (
                    <>
                      <span className="circuit-digit">{String(liveCountdown.days).padStart(2, '0')}</span>
                      <span className="circuit-colon">:</span>
                    </>
                  )}
                  <span className="circuit-digit">{String(liveCountdown.hours).padStart(2, '0')}</span>
                  <span className="circuit-colon">:</span>
                  <span className="circuit-digit">{String(liveCountdown.minutes).padStart(2, '0')}</span>
                  <span className="circuit-colon">:</span>
                  <span className="circuit-digit circuit-seconds">{String(liveCountdown.seconds).padStart(2, '0')}</span>
                </div>
                <div className="circuit-ring-sub">Saturday 9:00am</div>
              </div>
            </div>
            <p className="circuit-date-full">{formatSaturdayDate(nextSatDate)}</p>
          </div>
        )}

        {/* Booking Status Card */}
        <div className={`circuit-status-card ${mySlot ? 'booked' : 'not-booked'}`}>
          {mySlot ? (
            <>
              <div className="circuit-status-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="circuit-status-info">
                <h3>You're Locked In</h3>
                <p>Slot #{mySlot.slotNumber} &bull; {typeLabel}</p>
              </div>
            </>
          ) : (
            <>
              <div className="circuit-status-alert">!</div>
              <div className="circuit-status-info">
                <h3>Not Booked Yet</h3>
                <p>Tap below to view and book your slot</p>
              </div>
              <button className="circuit-book-now-btn" onClick={() => navigate('/client/circuit/booking')}>
                Book Now
              </button>
            </>
          )}
        </div>

        {/* Stats Card */}
        <div className="circuit-stats-card">
          <h3>Your Stats</h3>
          <div className="circuit-stats-grid">
            <div className="circuit-stat">
              <span className="circuit-stat-value">{stats.attended}</span>
              <span className="circuit-stat-label">Classes</span>
            </div>
            <div className="circuit-stat">
              <span className="circuit-stat-value">{stats.streak}</span>
              <span className="circuit-stat-label">Week Streak</span>
            </div>
            <div className="circuit-stat">
              <span className={`circuit-stat-value ${stats.strikes >= 2 ? 'warning' : ''}`}>{stats.strikes}/3</span>
              <span className="circuit-stat-label">Strikes</span>
            </div>
          </div>
          {stats.banUntil && (() => {
            const banDate = stats.banUntil.toDate ? stats.banUntil.toDate() : new Date(stats.banUntil.seconds * 1000);
            return banDate > new Date() ? (
              <div className="circuit-ban-notice">
                Booking suspended until {banDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
              </div>
            ) : null;
          })()}
        </div>

        {/* Rules Reminder */}
        <div className="circuit-rules">
          <h4>Class Rules</h4>
          <ul>
            <li>Lock in your slot by <strong>Wednesday</strong></li>
            <li>Cancel at least <strong>24 hours</strong> before class</li>
            <li>3 no-show strikes = 1 month booking ban</li>
          </ul>
        </div>
      </main>

      {/* FAB → Booking Page */}
      <button className="circuit-fab" onClick={() => navigate('/client/circuit/booking')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      </button>

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
