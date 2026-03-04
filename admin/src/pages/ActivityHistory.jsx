import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import ActivityLogger from '../components/ActivityLogger';
import PullToRefresh from '../components/PullToRefresh';
import './ActivityHistory.css';

const ACTIVITY_ICONS = {
  walking: '\u{1F6B6}',
  running: '\u{1F3C3}',
  cycling: '\u{1F6B4}',
  swimming: '\u{1F3CA}',
  hiking: '\u26F0\uFE0F',
  yoga: '\u{1F9D8}',
  football: '\u26BD',
  boxing: '\u{1F94A}',
  rowing: '\u{1F6A3}',
  dancing: '\u{1F483}',
  climbing: '\u{1F9D7}',
  other: '\u26A1',
};

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().split('T')[0]) return 'Today';
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ActivityHistory() {
  const { currentUser, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogger, setShowLogger] = useState(false);
  const [toast, setToast] = useState(null);
  const [weeklyStats, setWeeklyStats] = useState({ count: 0, minutes: 0 });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!authLoading && !currentUser) navigate('/');
  }, [authLoading, currentUser, navigate]);

  const fetchActivities = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const q = query(
        collection(db, 'activityLogs'),
        where('clientId', '==', clientData.id)
      );
      const snap = await getDocs(q);
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.completedAt?.toDate?.() || new Date(0);
          const tb = b.completedAt?.toDate?.() || new Date(0);
          return tb - ta;
        });
      setActivities(items);

      // Weekly stats
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const mondayMs = monday.getTime();

      const weekItems = items.filter(a => {
        const ts = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : 0;
        return ts >= mondayMs;
      });
      setWeeklyStats({
        count: weekItems.length,
        minutes: weekItems.reduce((sum, a) => sum + (a.duration || 0), 0),
      });
    } catch (err) {
      console.error('Error loading activities:', err);
    } finally {
      setLoading(false);
    }
  }, [clientData]);

  useEffect(() => {
    if (clientData) fetchActivities();
  }, [clientData, fetchActivities]);

  const handleDelete = async (activityId) => {
    if (!window.confirm('Delete this activity?')) return;
    try {
      await deleteDoc(doc(db, 'activityLogs', activityId));
      setActivities(prev => prev.filter(a => a.id !== activityId));
      showToast('Activity deleted', 'info');
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete', 'error');
    }
  };

  const handleLogged = () => {
    fetchActivities();
    showToast('Activity logged!', 'success');
  };

  // Group activities by date
  const grouped = activities.reduce((acc, a) => {
    const date = a.date || 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(a);
    return acc;
  }, {});
  const dateKeys = Object.keys(grouped).sort().reverse();

  if (authLoading || !clientData) {
    return <div className="ah-loading"><div className="ah-loading-spinner" /></div>;
  }

  return (
    <PullToRefresh onRefresh={fetchActivities}>
    <div className="ah-page">
      <header className="ah-header">
        <button className="ah-back" onClick={() => navigate('/client/core-buddy')} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1>Activity Log</h1>
        <div style={{ width: 34 }} />
      </header>

      {/* Weekly summary */}
      <div className="ah-summary">
        <div className="ah-summary-stat">
          <span className="ah-summary-value">{weeklyStats.count}</span>
          <span className="ah-summary-label">This week</span>
        </div>
        <div className="ah-summary-divider" />
        <div className="ah-summary-stat">
          <span className="ah-summary-value">{weeklyStats.minutes}</span>
          <span className="ah-summary-label">Minutes</span>
        </div>
        <div className="ah-summary-divider" />
        <div className="ah-summary-stat">
          <span className="ah-summary-value">{activities.length}</span>
          <span className="ah-summary-label">Total</span>
        </div>
      </div>

      {/* Activity list */}
      <div className="ah-list">
        {loading ? (
          <div className="ah-skeleton-list">
            {[1, 2, 3].map(i => <div key={i} className="ah-skeleton-item" />)}
          </div>
        ) : dateKeys.length === 0 ? (
          <div className="ah-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <p>No activities logged yet</p>
            <span>Tap the button below to log your first activity</span>
          </div>
        ) : (
          dateKeys.map(date => (
            <div key={date} className="ah-day-group">
              <h3 className="ah-day-label">{formatDate(date)}</h3>
              {grouped[date].map(a => (
                <div key={a.id} className="ah-item">
                  <div className="ah-item-icon">
                    {ACTIVITY_ICONS[a.activityType] || '\u26A1'}
                  </div>
                  <div className="ah-item-info">
                    <span className="ah-item-name">{a.activityLabel || a.activityType}</span>
                    <span className="ah-item-meta">{a.duration} min{a.notes ? ` \u2022 ${a.notes}` : ''}</span>
                  </div>
                  <button className="ah-item-delete" onClick={() => handleDelete(a.id)} aria-label="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      <button className="ah-fab" onClick={() => setShowLogger(true)} aria-label="Log activity">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
      </button>

      {/* Toast */}
      {toast && (
        <div className={`ah-toast ah-toast-${toast.type}`}>{toast.message}</div>
      )}

      <ActivityLogger
        open={showLogger}
        onClose={() => setShowLogger(false)}
        clientData={clientData}
        onLogged={handleLogged}
      />

      <CoreBuddyNav active="home" />
    </div>
    </PullToRefresh>
  );
}
