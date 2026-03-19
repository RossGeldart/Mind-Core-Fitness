import { useHiit } from '../contexts/HiitContext';
import HiitNav from '../components/HiitNav';
import './HiitHistory.css';

const formatDuration = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatDate = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today - dateDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (secs) => {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
};

export default function HiitHistory() {
  const { history, clearHistory } = useHiit();

  return (
    <div className="hiit-page">
      <HiitNav title="History" />
      <div className="hiit-history-content">
        {history.length === 0 ? (
          <div className="hiit-empty">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
            </svg>
            <h4>No workouts yet</h4>
            <p>Complete a HIIT session to see it here</p>
          </div>
        ) : (
          <>
            <div className="hiit-history-list">
              {history.map(entry => (
                <div key={entry.id} className="hiit-history-card">
                  <div className="hiit-history-card-top">
                    <div className="hiit-history-date">{formatDate(entry.date)}</div>
                    <div className={`hiit-history-status${entry.completed ? ' completed' : ''}`}>
                      {entry.completed ? 'Completed' : 'Stopped'}
                    </div>
                  </div>
                  <div className="hiit-history-details">
                    <div className="hiit-history-detail">
                      <span className="hiit-history-detail-val">{formatTime(entry.config.work)}</span>
                      <span className="hiit-history-detail-lbl">Work</span>
                    </div>
                    <div className="hiit-history-detail">
                      <span className="hiit-history-detail-val">{formatTime(entry.config.rest)}</span>
                      <span className="hiit-history-detail-lbl">Rest</span>
                    </div>
                    <div className="hiit-history-detail">
                      <span className="hiit-history-detail-val">{entry.config.exercises}</span>
                      <span className="hiit-history-detail-lbl">Ex.</span>
                    </div>
                    <div className="hiit-history-detail">
                      <span className="hiit-history-detail-val">{entry.config.rounds}</span>
                      <span className="hiit-history-detail-lbl">Rounds</span>
                    </div>
                  </div>
                  <div className="hiit-history-duration">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {formatDuration(entry.duration)}
                  </div>
                </div>
              ))}
            </div>
            {history.length > 0 && (
              <button className="hiit-clear-history" onClick={clearHistory}>
                Clear History
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
