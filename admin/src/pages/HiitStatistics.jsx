import { useState } from 'react';
import { useHiit } from '../contexts/HiitContext';
import HiitNav from '../components/HiitNav';
import './HiitStatistics.css';

const PERIODS = [
  { key: 'all', label: 'To Date' },
  { key: 'week', label: 'Last Week' },
  { key: 'month', label: 'Last Month' },
];

const formatTime = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function HiitStatistics() {
  const [period, setPeriod] = useState('all');
  const { getStats } = useHiit();

  const stats = getStats(period);

  return (
    <div className="hiit-page">
      <HiitNav title="Statistics" />
      <div className="hiit-stats-content">
        {/* Period selector */}
        <h3 className="hiit-stats-heading">Select Time</h3>
        <div className="hiit-seg-control">
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`hiit-seg-btn${period === p.key ? ' active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Stats cards */}
        <div className="hiit-stats-stack">
          <div className="hiit-stat-card">
            <div className="hiit-stat-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div className="hiit-stat-text">
              <span className="hiit-stat-label">Days in a row</span>
              <span className="hiit-stat-value">{stats.streak}</span>
            </div>
          </div>

          <div className="hiit-stat-card">
            <div className="hiit-stat-icon red">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <div className="hiit-stat-text">
              <span className="hiit-stat-label">Workouts completed</span>
              <span className="hiit-stat-value">{stats.completed}</span>
            </div>
          </div>

          <div className="hiit-stat-card">
            <div className="hiit-stat-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/><path d="M12 2v2"/>
              </svg>
            </div>
            <div className="hiit-stat-text">
              <span className="hiit-stat-label">Workouts time</span>
              <span className="hiit-stat-value">{formatTime(stats.totalTime)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
