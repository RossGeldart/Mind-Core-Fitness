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
          <img src="/Logo.webp" alt="Mind Core Fitness" className="circuit-loading-logo" />
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
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            {isCircuitOnly && (
              <button onClick={logout} aria-label="Log out">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </button>
            )}
          </div>
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
                <div className="circuit-ring-logo">
                  <img src="/Logo.webp" alt="Mind Core Fitness" />
                </div>
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
            <li>Book your slot <strong>anytime before class</strong></li>
            <li>Cancel at least <strong>24 hours</strong> before class</li>
            <li>3 no-show strikes = 1 month booking ban</li>
          </ul>
        </div>

        {/* VIP Upgrade Card — drop-in and block members only */}
        {memberType !== 'circuit_vip' && (
          <div className="circuit-vip-promo">
            <div className="vip-promo-badge">VIP</div>
            <h3>Become a VIP Member</h3>
            <p className="vip-promo-price">Just <strong>&pound;25</strong>/month</p>
            <p className="vip-promo-desc">Full access with a priority spot every week — your slot is automatically locked in before anyone else can book.</p>
            <ul className="vip-promo-perks">
              <li>Guaranteed slot every Saturday</li>
              <li>Auto-booked — no need to race for a spot</li>
              <li>Cancel anytime for the week, reinstated the next</li>
            </ul>
            <a
              href="https://wa.me/447449782055?text=Hi%20Ross%2C%20I%27d%20like%20to%20become%20a%20VIP%20circuit%20member!"
              target="_blank"
              rel="noopener noreferrer"
              className="vip-promo-wa-btn"
            >
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Message on WhatsApp
            </a>
          </div>
        )}
      </main>

      {/* Bottom Tab Nav */}
      <nav className="circuit-bottom-nav">
        {!isCircuitOnly && (
          <button className="circuit-nav-tab" onClick={() => navigate('/client')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            <span>Dashboard</span>
          </button>
        )}
        <button className="circuit-nav-tab active" onClick={() => navigate('/client/circuit')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </button>
        <button className="circuit-nav-tab" onClick={() => navigate('/client/circuit/booking')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Class</span>
        </button>
      </nav>

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
