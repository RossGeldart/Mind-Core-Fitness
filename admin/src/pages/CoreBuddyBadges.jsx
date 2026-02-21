import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import BADGE_DEFS from '../utils/badgeConfig';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddyBadges.css';

const CATEGORY_LABELS = {
  workouts: 'Workouts',
  streaks: 'Streaks',
  pbs: 'Personal Bests',
  nutrition: 'Nutrition',
  leaderboard: 'Leaderboard',
  habits: 'Habits',
  challenges: 'Challenges',
};

const CATEGORY_ORDER = ['workouts', 'streaks', 'pbs', 'nutrition', 'leaderboard', 'habits', 'challenges'];

export default function CoreBuddyBadges() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [earnedIds, setEarnedIds] = useState(new Set());
  const [earnedMap, setEarnedMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState(null);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (!clientData) return;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'coreBuddyBadges', clientData.id));
        if (snap.exists()) {
          const earned = snap.data().earned || [];
          setEarnedIds(new Set(earned.map(b => b.id)));
          const map = {};
          earned.forEach(b => { map[b.id] = b; });
          setEarnedMap(map);
        }
      } catch (err) {
        console.error('Failed to load badges:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientData]);

  const grouped = CATEGORY_ORDER
    .map(cat => ({
      key: cat,
      label: CATEGORY_LABELS[cat],
      badges: BADGE_DEFS.filter(b => b.category === cat),
    }))
    .filter(g => g.badges.length > 0);

  const totalEarned = BADGE_DEFS.filter(b => earnedIds.has(b.id)).length;

  if (authLoading || !clientData) {
    return <div className="bdg-loading"><div className="bdg-spinner" /></div>;
  }

  return (
    <div className="bdg-page" data-theme={isDark ? 'dark' : 'light'}>
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          </div>
        </div>
      </header>

      <main className="bdg-main">
        <h1 className="bdg-title">Badges</h1>
        <p className="bdg-subtitle">{totalEarned} / {BADGE_DEFS.length} earned</p>

        {loading ? (
          <div className="bdg-loading-inline"><div className="bdg-spinner" /></div>
        ) : (
          grouped.map(group => (
            <div key={group.key} className="bdg-category">
              <h2 className="bdg-category-title">{group.label}</h2>
              <div className="bdg-grid">
                {group.badges.map(badge => {
                  const earned = earnedIds.has(badge.id);
                  return (
                    <button
                      key={badge.id}
                      className={`bdg-item${earned ? ' earned' : ' locked'}`}
                      onClick={() => setSelectedBadge(badge)}
                    >
                      <div className="bdg-img-wrap">
                        {badge.img ? (
                          <img src={badge.img} alt={badge.name} className="bdg-img" />
                        ) : (
                          <div className="bdg-img-placeholder">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M9 14l-4 8h14l-4-8"/></svg>
                          </div>
                        )}
                        {!earned && <div className="bdg-lock-overlay">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        </div>}
                      </div>
                      <span className="bdg-name">{badge.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Badge detail modal */}
      {selectedBadge && (
        <div className="bdg-modal-backdrop" onClick={() => setSelectedBadge(null)}>
          <div className="bdg-modal" onClick={e => e.stopPropagation()}>
            <div className={`bdg-modal-img-wrap${earnedIds.has(selectedBadge.id) ? ' earned' : ' locked'}`}>
              {selectedBadge.img ? (
                <img src={selectedBadge.img} alt={selectedBadge.name} className="bdg-modal-img" />
              ) : (
                <div className="bdg-modal-placeholder">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M9 14l-4 8h14l-4-8"/></svg>
                </div>
              )}
            </div>
            <h2 className="bdg-modal-name">{selectedBadge.name}</h2>
            <p className="bdg-modal-desc">{selectedBadge.desc}</p>
            {earnedIds.has(selectedBadge.id) ? (
              <span className="bdg-modal-status earned">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                Earned{earnedMap[selectedBadge.id]?.earnedAt
                  ? ` — ${new Date(earnedMap[selectedBadge.id].earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </span>
            ) : (
              <span className="bdg-modal-status locked">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Locked
              </span>
            )}
            <button className="bdg-modal-close" onClick={() => setSelectedBadge(null)}>Close</button>
          </div>
        </div>
      )}

      <CoreBuddyNav active="badges" />
    </div>
  );
}
