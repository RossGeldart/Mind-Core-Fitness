import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHiit, CATEGORIES } from '../contexts/HiitContext';
import HiitNav from '../components/HiitNav';
import './HiitLibrary.css';

const formatTime = (secs) => {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
};

export default function HiitLibrary() {
  const { library, saveToLibrary, loadFromLibrary, deleteFromLibrary, timerConfig, hiitTheme } = useHiit();
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('all');
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('custom');

  const filtered = activeCategory === 'all'
    ? library
    : library.filter(e => e.category === activeCategory);

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveToLibrary(saveName.trim(), saveCategory);
    setSaveName('');
    setShowSave(false);
  };

  const handleLoad = (id) => {
    loadFromLibrary(id);
    navigate('/hiit');
  };

  return (
    <div className="hiit-page" data-hiit-theme={hiitTheme}>
      <HiitNav title="Library" />
      <div className="hlib-content">

        {/* Save current workout */}
        {!showSave ? (
              <button className="hlib-save-btn" onClick={() => setShowSave(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Save Current Workout
              </button>
            ) : (
              <div className="hlib-save-form">
                <input
                  type="text"
                  className="hlib-save-input"
                  placeholder="Workout name..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <div className="hlib-save-categories">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.key}
                      className={`hlib-cat-pill${saveCategory === c.key ? ' active' : ''}`}
                      onClick={() => setSaveCategory(c.key)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="hlib-save-preview">
                  <span>{formatTime(timerConfig.work)} work</span>
                  <span>{formatTime(timerConfig.rest)} rest</span>
                  <span>{timerConfig.exercises} ex.</span>
                  <span>{timerConfig.rounds} rds</span>
                </div>
                <div className="hlib-save-actions">
                  <button className="hlib-cancel-btn" onClick={() => { setShowSave(false); setSaveName(''); }}>
                    Cancel
                  </button>
                  <button className="hlib-confirm-btn" onClick={handleSave} disabled={!saveName.trim()}>
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Category filter */}
            <div className="hlib-filter">
              <button
                className={`hlib-filter-pill${activeCategory === 'all' ? ' active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All
              </button>
              {CATEGORIES.map(c => (
                <button
                  key={c.key}
                  className={`hlib-filter-pill${activeCategory === c.key ? ' active' : ''}`}
                  onClick={() => setActiveCategory(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Workout list */}
            {filtered.length === 0 ? (
              <div className="hlib-empty">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                <h4>No saved workouts</h4>
                <p>Configure a workout on the Timer page, then come back here to save it.</p>
              </div>
            ) : (
              <div className="hlib-list">
                {filtered.map(entry => (
                  <div key={entry.id} className="hlib-card">
                    <div className="hlib-card-top">
                      <div className="hlib-card-info">
                        <span className="hlib-card-name">{entry.name}</span>
                        <span className="hlib-card-category">
                          {CATEGORIES.find(c => c.key === entry.category)?.label || 'Custom'}
                        </span>
                      </div>
                      <button className="hlib-card-delete" onClick={() => deleteFromLibrary(entry.id)} aria-label="Delete">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                    <div className="hlib-card-details">
                      <div className="hlib-card-stat">
                        <span className="hlib-card-stat-val">{formatTime(entry.config.work)}</span>
                        <span className="hlib-card-stat-lbl">Work</span>
                      </div>
                      <div className="hlib-card-stat">
                        <span className="hlib-card-stat-val">{formatTime(entry.config.rest)}</span>
                        <span className="hlib-card-stat-lbl">Rest</span>
                      </div>
                      <div className="hlib-card-stat">
                        <span className="hlib-card-stat-val">{entry.config.exercises}</span>
                        <span className="hlib-card-stat-lbl">Ex.</span>
                      </div>
                      <div className="hlib-card-stat">
                        <span className="hlib-card-stat-val">{entry.config.rounds}</span>
                        <span className="hlib-card-stat-lbl">Rounds</span>
                      </div>
                    </div>
                    <button className="hlib-load-btn" onClick={() => handleLoad(entry.id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      Load Workout
                    </button>
                  </div>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}
