import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { isSessionCompleted } from '../utils/scheduleUtils';
import './Schedule.css';

const formatTime = (time) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes}${ampm}`;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isToday = (dateStr) => dateStr === formatDateKey(new Date());

const isTomorrow = (dateStr) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === formatDateKey(tomorrow);
};

const formatDateLabel = (dateStr) => {
  if (isToday(dateStr)) return 'Today';
  if (isTomorrow(dateStr)) return 'Tomorrow';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
};

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};


// Group a sorted array of date strings into week buckets for the collapsible sections
const groupDatesIntoWeeks = (dates) => {
  if (dates.length === 0) return [];

  const now = new Date();
  const thisMonday = new Date(now);
  const dow = thisMonday.getDay();
  thisMonday.setDate(thisMonday.getDate() - (dow === 0 ? 6 : dow - 1));
  thisMonday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);

  const weekAfterNext = new Date(nextMonday);
  weekAfterNext.setDate(weekAfterNext.getDate() + 7);

  const groups = new Map();

  dates.forEach(dateStr => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);

    let key, label, order;
    if (date < nextMonday) {
      key = 'this-week';
      label = 'This Week';
      order = 0;
    } else if (date < weekAfterNext) {
      key = 'next-week';
      label = 'Next Week';
      order = 1;
    } else {
      key = `${date.getFullYear()}-${date.getMonth()}`;
      label = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      order = 100 + date.getFullYear() * 12 + date.getMonth();
    }

    if (!groups.has(key)) groups.set(key, { key, label, order, dates: [] });
    groups.get(key).dates.push(dateStr);
  });

  return Array.from(groups.values()).sort((a, b) => a.order - b.order);
};

export default function Schedule() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date()); // drives 1-min re-renders
  const [jumpDate, setJumpDate] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  // Tracks groups the user has explicitly toggled.
  // This/Next Week default open; month groups default collapsed.
  // A toggle flips whichever the default is for that group.
  const [userToggledWeeks, setUserToggledWeeks] = useState(new Set());

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async () => {
    try {
      const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
      const sessionsData = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const today = formatDateKey(new Date());
      const upcomingSessions = sessionsData
        .filter(s => s.date >= today)
        .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time));
      setSessions(upcomingSessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
    setLoading(false);
  };

  const handleCancelSession = async (session) => {
    if (!window.confirm(`Cancel ${session.clientName}'s session at ${formatTime(session.time)} on ${formatDateLabel(session.date)}?`)) return;
    try {
      await deleteDoc(doc(db, 'sessions', session.id));
      setSessions(sessions.filter(s => s.id !== session.id));
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert('Failed to cancel session');
    }
  };

  const toggleWeek = (key) => {
    setUserToggledWeeks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) return <div className="schedule-loading">Loading schedule...</div>;

  // --- Derived data ---

  // Apply client name filter
  const filteredSessions = clientFilter
    ? sessions.filter(s => s.clientName.toLowerCase().includes(clientFilter.toLowerCase()))
    : sessions;

  // Group filtered sessions by date
  const groupedSessions = filteredSessions.reduce((groups, session) => {
    if (!groups[session.date]) groups[session.date] = [];
    groups[session.date].push(session);
    return groups;
  }, {});

  const dates = Object.keys(groupedSessions).sort();
  const todayStr = formatDateKey(new Date());
  const todaySessions = groupedSessions[todayStr] || [];
  const completedToday = todaySessions.filter(s => isSessionCompleted(s)).length;
  const remainingToday = todaySessions.length - completedToday;

  // Next uncompleted session for the "Up next" banner
  const nextSession = filteredSessions.find(s => !isSessionCompleted(s));
  const getCountdown = () => {
    if (!nextSession || nextSession.date !== formatDateKey(new Date())) return null;
    const [h, m] = nextSession.time.split(':').map(Number);
    const diff = (h * 60 + m) - (new Date().getHours() * 60 + new Date().getMinutes());
    if (diff <= 0 || diff > 180) return null;
    return diff < 60 ? `${diff}m` : `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };
  const countdown = getCountdown();

  // Week-grouped structure for collapsible sections
  const weekGroups = groupDatesIntoWeeks(dates);

  // Suppress the unused-state lint hint (currentTime drives re-renders only)
  void currentTime;

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
        {completedToday > 0 && (
          <button className="hide-completed-btn" onClick={() => setHideCompleted(h => !h)}>
            {hideCompleted ? 'Show all' : 'Hide done'}
          </button>
        )}
      </div>

      {/* Up-next banner — only within 3 hours of today's next session */}
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

      {/* Session list or empty state */}
      {dates.length === 0 ? (
        <div className="no-upcoming">
          <p>{clientFilter ? `No sessions found for "${clientFilter}"` : 'No upcoming sessions booked'}</p>
        </div>
      ) : (
        <>
          {/* Controls row: client filter + jump to date */}
          <div className="schedule-controls">
            <input
              className="client-filter-input"
              type="text"
              placeholder="Filter by client..."
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
            />
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

          {/* Week-grouped session list */}
          <div className="sessions-list">
            {weekGroups.map(({ key, label, dates: groupDates }) => {
              // Month groups (beyond Next Week) collapse by default; This/Next Week expand by default
              const isMonthGroup = key !== 'this-week' && key !== 'next-week';
              const isCollapsed = isMonthGroup ? !userToggledWeeks.has(key) : userToggledWeeks.has(key);
              const sessionCount = groupDates.reduce((sum, d) => sum + groupedSessions[d].length, 0);

              return (
                <div key={key} className="week-group">
                  <button
                    className={`week-group-header ${isCollapsed ? 'collapsed' : ''}`}
                    onClick={() => toggleWeek(key)}
                  >
                    <span className="week-label">{label}</span>
                    <span className="week-count">{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
                    <span className="week-chevron">{isCollapsed ? '▸' : '▾'}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="week-group-body">
                      {groupDates.map(date => {
                        const sessionsForDate = groupedSessions[date];
                        // When "hide done" is on, filter completed from today's group only
                        const visibleSessions = hideCompleted && isToday(date)
                          ? sessionsForDate.filter(s => !isSessionCompleted(s))
                          : sessionsForDate;

                        return (
                          <div key={date} id={`date-${date}`} className={`date-group ${isToday(date) ? 'today' : ''}`}>
                            <div className="date-header">
                              <span className="date-label">{formatDateLabel(date)}</span>
                              <span className="date-count">
                                {sessionsForDate.length} session{sessionsForDate.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="date-sessions">
                              {visibleSessions.length === 0 ? (
                                <div className="all-done-msg">All sessions completed ✓</div>
                              ) : (
                                visibleSessions.map(session => {
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
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
