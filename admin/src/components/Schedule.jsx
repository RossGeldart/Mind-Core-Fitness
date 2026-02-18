import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import './Schedule.css';

const formatTime = (time) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes}${ampm}`;
};

const formatDateKey = (date) => {
  // Use local date to avoid timezone issues
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isToday = (dateStr) => {
  return dateStr === formatDateKey(new Date());
};

const isTomorrow = (dateStr) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === formatDateKey(tomorrow);
};

const formatDateLabel = (dateStr) => {
  if (isToday(dateStr)) return 'Today';
  if (isTomorrow(dateStr)) return 'Tomorrow';

  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  });
};

// Check if a session has been completed (time has passed)
const isSessionCompleted = (session) => {
  const now = new Date();
  const today = formatDateKey(now);
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // Past dates are completed
  if (session.date < today) return true;
  // Today: check if session time + duration has passed
  if (session.date === today) {
    const sessionEndMinutes = timeToMinutes(session.time) + (session.duration || 45);
    const currentMinutes = timeToMinutes(currentTime);
    return currentMinutes >= sessionEndMinutes;
  }
  return false;
};

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export default function Schedule() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [jumpDate, setJumpDate] = useState('');

  useEffect(() => {
    fetchSessions();

    // Update current time every minute to refresh completed status
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async () => {
    try {
      const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
      const sessionsData = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter to today and future, sort by date and time
      const today = formatDateKey(new Date());
      const upcomingSessions = sessionsData
        .filter(s => s.date >= today)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.time.localeCompare(b.time);
        });

      setSessions(upcomingSessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
    setLoading(false);
  };

  const handleCancelSession = async (session) => {
    if (!window.confirm(`Cancel ${session.clientName}'s session at ${formatTime(session.time)} on ${formatDateLabel(session.date)}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'sessions', session.id));
      setSessions(sessions.filter(s => s.id !== session.id));
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert('Failed to cancel session');
    }
  };

  if (loading) {
    return <div className="schedule-loading">Loading schedule...</div>;
  }

  // Group sessions by date
  const groupedSessions = sessions.reduce((groups, session) => {
    const date = session.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(session);
    return groups;
  }, {});

  const dates = Object.keys(groupedSessions).sort();
  const todayStr = formatDateKey(new Date());
  const todaySessions = groupedSessions[todayStr] || [];
  const completedToday = todaySessions.filter(s => isSessionCompleted(s)).length;
  const remainingToday = todaySessions.length - completedToday;

  // Find the very next upcoming session (not yet completed)
  const nextSession = sessions.find(s => !isSessionCompleted(s));

  // Minutes until next session
  const getNextSessionCountdown = () => {
    if (!nextSession) return null;
    const now = new Date();
    const todayKey = formatDateKey(now);
    if (nextSession.date !== todayKey) return null; // only show countdown for today
    const [h, m] = nextSession.time.split(':').map(Number);
    const sessionStart = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const diff = sessionStart - nowMinutes;
    if (diff <= 0 || diff > 180) return null; // only within 3 hours
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const countdown = getNextSessionCountdown();

  return (
    <div className="schedule">
      {/* Today's Summary */}
      <div className="today-summary">
        <h3>Today's Sessions</h3>
        <div className="today-count">
          {todaySessions.length === 0 ? (
            <span className="no-sessions">No sessions today</span>
          ) : (
            <div className="today-stats">
              <span className="completed-count">{completedToday} completed</span>
              <span className="remaining-count">{remainingToday} remaining</span>
            </div>
          )}
        </div>
      </div>

      {/* Next Session Banner — shown when a session is within 3 hours */}
      {nextSession && countdown && (
        <div className="next-session-banner">
          <div className="next-session-label">Up next</div>
          <div className="next-session-info">
            <span className="next-session-name">{nextSession.clientName}</span>
            <span className="next-session-time">{formatTime(nextSession.time)}</span>
          </div>
          <div className="next-session-countdown">{countdown}</div>
        </div>
      )}

      {/* Sessions List */}
      {dates.length === 0 ? (
        <div className="no-upcoming">
          <p>No upcoming sessions booked</p>
        </div>
      ) : (
        <>
          {/* Jump-to-date nav */}
          <div className="schedule-nav">
            <select
              className="date-jump-select"
              value={jumpDate}
              onChange={(e) => {
                const date = e.target.value;
                setJumpDate(date);
                if (date) {
                  document.getElementById(`date-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setTimeout(() => setJumpDate(''), 600);
                }
              }}
            >
              <option value="">Jump to date...</option>
              {dates.map(date => (
                <option key={date} value={date}>
                  {formatDateLabel(date)} ({groupedSessions[date].length})
                </option>
              ))}
            </select>
          </div>

        <div className="sessions-list">
          {dates.map(date => (
            <div key={date} id={`date-${date}`} className={`date-group ${isToday(date) ? 'today' : ''}`}>
              <div className="date-header">
                <span className="date-label">{formatDateLabel(date)}</span>
                <span className="date-count">{groupedSessions[date].length} session{groupedSessions[date].length !== 1 ? 's' : ''}</span>
              </div>
              <div className="date-sessions">
                {groupedSessions[date].map(session => {
                  const completed = isSessionCompleted(session);
                  return (
                    <div key={session.id} className={`session-card ${completed ? 'completed' : ''}`}>
                      <div className="session-time">{formatTime(session.time)}</div>
                      <div className="session-details">
                        <strong>{session.clientName}</strong>
                        <span>{session.duration}min session</span>
                      </div>
                      {completed ? (
                        <div className="completed-badge">✓</div>
                      ) : (
                        <button
                          className="cancel-session-btn"
                          onClick={() => handleCancelSession(session)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
