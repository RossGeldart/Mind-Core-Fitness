import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyAchievements.css';

// Exercise group mapping for all weighted exercises in programme templates
const EXERCISE_GROUPS = {
  // Push
  'Dumbbell Floor Press': 'push',
  'Seated Dumbbell Shoulder Press': 'push',
  'Seated Dumbbell Arnold Press': 'push',
  'Dumbbell Overhead Tricep Extension': 'push',
  'Skullcrushers': 'push',
  'Dumbbell Lateral Raise': 'push',
  'Dumbbell Front Raise': 'push',
  // Pull
  'Dumbbell Bent Over Row': 'pull',
  'Single Arm Bent Over Row': 'pull',
  'Bicep Curl': 'pull',
  'Hammer Curl': 'pull',
  'Dumbbell Bent Over Rear Delt Fly': 'pull',
  'Renegade Row': 'pull',
  // Lower
  'Dumbbell Goblet Squats': 'lower',
  'Romanian Deadlifts': 'lower',
  'Forward Dumbbell Lunges': 'lower',
  'Dumbbell Sumo Squats': 'lower',
  'Weighted Calf Raises': 'lower',
  '1 Legged RDL': 'lower',
  'Dumbbell Box Step Ups': 'lower',
  'Dumbbell Squat Pulses': 'lower',
  'Dumbbell Reverse Lunges': 'lower',
  'Kettlebell Romanian Deadlift': 'lower',
  // Core
  'Russian Twists Dumbbell': 'core',
  'Kettlebell Russian Twist': 'core',
  'Kettlebell Side Bends': 'core',
  'Kneeling Kettlebell Halo': 'core',
};

const GROUP_META = {
  push: { label: 'Push', color: '#c75f6b', icon: 'M4 12h3l3-9 4 18 3-9h3' },
  pull: { label: 'Pull', color: '#5f8ac7', icon: 'M12 2v10m0 0l-4-4m4 4l4-4M4 20h16' },
  lower: { label: 'Lower', color: '#5fc77a', icon: 'M12 2v8m-4 4l4 8 4-8m-8 0h8' },
  core: { label: 'Core', color: '#c7a45f', icon: 'M12 2a4 4 0 014 4v1h-2V6a2 2 0 10-4 0v1H8V6a4 4 0 014-4zM8 9h8v2H8V9zm-1 4h10l-1 9H8l-1-9z' },
};

const VOLUME_MILESTONES = [
  { threshold: 1000, label: '1 Tonne', icon: '1T' },
  { threshold: 5000, label: '5 Tonne', icon: '5T' },
  { threshold: 10000, label: '10 Tonne', icon: '10T' },
  { threshold: 25000, label: '25 Tonne', icon: '25T' },
  { threshold: 50000, label: '50 Tonne', icon: '50T' },
  { threshold: 100000, label: '100 Tonne', icon: '100T' },
  { threshold: 250000, label: '250 Tonne', icon: '250T' },
  { threshold: 500000, label: '500 Tonne', icon: '500T' },
  { threshold: 1000000, label: '1 Million kg', icon: '1M' },
];

function getGroup(exerciseName) {
  return EXERCISE_GROUPS[exerciseName] || 'push';
}

function formatVolume(kg) {
  if (kg >= 1000000) return `${(kg / 1000000).toFixed(1)}M`;
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`;
  return `${Math.round(kg)}`;
}

function formatVolumeUnit(kg) {
  if (kg >= 1000000) return 'million kg';
  if (kg >= 1000) return 'tonnes';
  return 'kg';
}

export default function CoreBuddyAchievements() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState(null);
  const [pbData, setPbData] = useState({});

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (!clientData) return;
    const load = async () => {
      try {
        const [achSnap, pbSnap] = await Promise.all([
          getDoc(doc(db, 'coreBuddyAchievements', clientData.id)),
          getDoc(doc(db, 'coreBuddyPBs', clientData.id)),
        ]);
        if (achSnap.exists()) setAchievements(achSnap.data());
        if (pbSnap.exists()) setPbData(pbSnap.data().exercises || {});
      } catch (err) {
        console.error('Error loading achievements:', err);
      }
      setLoading(false);
    };
    load();
  }, [clientData]);

  const badges = achievements?.badges || [];
  const totalVolume = achievements?.totalVolume || 0;
  const pbBadges = badges.filter(b => b.type === 'pb_target');
  const volumeBadges = badges.filter(b => b.type === 'volume_milestone');

  // Group PB badges by exercise group
  const groupedBadges = { push: [], pull: [], lower: [], core: [] };
  pbBadges.forEach(b => {
    const group = b.group || getGroup(b.exercise);
    if (groupedBadges[group]) groupedBadges[group].push(b);
  });

  // Find next volume milestone
  const nextMilestone = VOLUME_MILESTONES.find(m => totalVolume < m.threshold);
  const prevMilestoneValue = VOLUME_MILESTONES.filter(m => totalVolume >= m.threshold).pop()?.threshold || 0;
  const milestoneProgress = nextMilestone
    ? (totalVolume - prevMilestoneValue) / (nextMilestone.threshold - prevMilestoneValue)
    : 1;

  if (authLoading || loading) {
    return (
      <div className="ach-page" data-theme={isDark ? 'dark' : 'light'}>
        <header className="cb-header">
          <div className="cb-header-left">
            <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-header-logo" />
            <span className="cb-header-title">Achievements</span>
          </div>
        </header>
        <main className="ach-main">
          <div className="skeleton" style={{ width: 180, height: 28, marginBottom: 20, borderRadius: 8 }}></div>
          <div className="skeleton" style={{ height: 200, borderRadius: 16 }}></div>
        </main>
      </div>
    );
  }

  const totalBadges = badges.length;
  const hasAnyContent = totalBadges > 0 || totalVolume > 0;

  return (
    <div className="ach-page" data-theme={isDark ? 'dark' : 'light'}>
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="ach-main">
        <button className="nut-back-btn" onClick={() => navigate('/client/core-buddy')}>
          &larr; Back
        </button>

        {/* Stats Banner */}
        <div className="ach-stats-banner">
          <div className="ach-stat-item">
            <span className="ach-stat-num">{totalBadges}</span>
            <span className="ach-stat-label">{totalBadges === 1 ? 'Badge' : 'Badges'}</span>
          </div>
          <div className="ach-stat-divider" />
          <div className="ach-stat-item">
            <span className="ach-stat-num">{formatVolume(totalVolume)}</span>
            <span className="ach-stat-label">{formatVolumeUnit(totalVolume)} lifted</span>
          </div>
          <div className="ach-stat-divider" />
          <div className="ach-stat-item">
            <span className="ach-stat-num">{Object.keys(pbData).length}</span>
            <span className="ach-stat-label">PBs</span>
          </div>
        </div>

        {!hasAnyContent && (
          <div className="ach-empty">
            <div className="ach-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 15l-3-3h6l-3 3z" />
                <path d="M5 7h14l-1.5 9h-11L5 7z" />
                <path d="M8.5 7V5a3.5 3.5 0 017 0v2" />
              </svg>
            </div>
            <h4>No achievements yet</h4>
            <p>Complete workouts to track volume and set PB targets to start earning badges.</p>
          </div>
        )}

        {/* ====== VOLUME MILESTONES ====== */}
        <div className="ach-section">
          <h3 className="ach-section-title">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
            </svg>
            Volume Milestones
          </h3>

          {/* Volume counter */}
          <div className="ach-volume-hero">
            <div className="ach-volume-ring">
              <svg className="ach-volume-ring-svg" viewBox="0 0 200 200">
                {[...Array(60)].map((_, i) => {
                  const angle = (i * 6 - 90) * (Math.PI / 180);
                  const x1 = 100 + 78 * Math.cos(angle);
                  const y1 = 100 + 78 * Math.sin(angle);
                  const x2 = 100 + 94 * Math.cos(angle);
                  const y2 = 100 + 94 * Math.sin(angle);
                  const filled = i < Math.round(milestoneProgress * 60);
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                      className={filled ? 'ach-tick-filled' : 'ach-tick-empty'}
                      strokeWidth={i % 5 === 0 ? '3' : '2'} />
                  );
                })}
              </svg>
              <div className="ach-volume-center">
                <span className="ach-volume-number">{Math.round(totalVolume).toLocaleString()}</span>
                <span className="ach-volume-unit">kg lifted</span>
              </div>
            </div>
            {nextMilestone && (
              <div className="ach-volume-next">
                Next: <strong>{nextMilestone.label}</strong> ({(nextMilestone.threshold - totalVolume).toLocaleString()}kg to go)
              </div>
            )}
          </div>

          {/* Milestone shelf */}
          <div className="ach-milestone-shelf">
            {VOLUME_MILESTONES.map((milestone, i) => {
              const unlocked = totalVolume >= milestone.threshold;
              const earnedBadge = volumeBadges.find(b => b.milestone === milestone.threshold);
              return (
                <div key={i} className={`ach-milestone ${unlocked ? 'unlocked' : 'locked'}`}>
                  <div className="ach-milestone-hex">
                    <span className="ach-milestone-icon">{milestone.icon}</span>
                  </div>
                  <span className="ach-milestone-label">{milestone.label}</span>
                  {earnedBadge?.achievedAt && (
                    <span className="ach-milestone-date">
                      {(earnedBadge.achievedAt.toDate ? earnedBadge.achievedAt.toDate() : new Date(earnedBadge.achievedAt))
                        .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ====== PB TARGET BADGES ====== */}
        <div className="ach-section">
          <h3 className="ach-section-title">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            PB Target Badges
          </h3>

          {pbBadges.length === 0 ? (
            <div className="ach-pb-empty">
              <p>Set targets on your personal bests to start earning badges. Go to <strong>My Progress</strong> and tap "Set Target" on any PB.</p>
            </div>
          ) : (
            Object.entries(groupedBadges).map(([groupKey, groupBadges]) => {
              if (groupBadges.length === 0) return null;
              const meta = GROUP_META[groupKey];
              return (
                <div key={groupKey} className="ach-group">
                  <div className="ach-group-header" style={{ borderLeftColor: meta.color }}>
                    <span className="ach-group-label" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="ach-group-count">{groupBadges.length}</span>
                  </div>
                  <div className="ach-badge-grid">
                    {groupBadges.map((badge, i) => (
                      <div key={i} className="ach-badge-card" style={{ animationDelay: `${i * 0.06}s`, '--group-color': meta.color }}>
                        <div className="ach-badge-hex" style={{ borderColor: meta.color, boxShadow: `0 0 12px ${meta.color}33` }}>
                          <svg className="ach-badge-hex-icon" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2" strokeLinecap="round">
                            <path d={meta.icon} />
                          </svg>
                        </div>
                        <div className="ach-badge-info">
                          <span className="ach-badge-exercise">{badge.exercise}</span>
                          <span className="ach-badge-value" style={{ color: meta.color }}>{badge.targetWeight}kg</span>
                          {badge.achievedAt && (
                            <span className="ach-badge-date">
                              {(badge.achievedAt.toDate ? badge.achievedAt.toDate() : new Date(badge.achievedAt))
                                .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

export { EXERCISE_GROUPS, GROUP_META, VOLUME_MILESTONES };
