import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ClientTools.css';

export default function ClientTools() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  if (authLoading) {
    return <div className="client-loading">Loading...</div>;
  }

  if (!currentUser || !isClient || !clientData) {
    return null;
  }

  return (
    <div className="client-tools-page">
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
        </div>
      </header>

      <main className="tools-main page-transition-enter">
        <button className="back-btn" onClick={() => navigate('/client')}>&larr; Back</button>

        <div className="tools-intro">
          <h2>Tools</h2>
          <p>Use these tools to help plan your nutrition and stay motivated.</p>
        </div>

        <div className="tools-grid">
          <div className="tool-select-card" onClick={() => navigate('/client/tools/macros')}>
            <div className="tool-select-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 6h16M4 12h16M4 18h7"/>
                <circle cx="17" cy="18" r="3"/>
                <path d="M17 15v6M14 18h6"/>
              </svg>
            </div>
            <div className="tool-select-info">
              <h3>Macro Calculator</h3>
              <p>Calculate your daily calorie and macro targets based on your goals.</p>
            </div>
            <svg className="tool-select-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
          </div>

          <div className="tool-select-card" onClick={() => navigate('/client/tools/snacks')}>
            <div className="tool-select-icon snack-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8h1a4 4 0 010 8h-1"/>
                <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/>
                <line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </div>
            <div className="tool-select-info">
              <h3>Protein Snack Generator</h3>
              <p>Quick, easy high-protein snack ideas to fuel your training.</p>
            </div>
            <svg className="tool-select-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
          </div>

          <div className="tool-select-card" onClick={() => navigate('/client/tools/motivation')}>
            <div className="tool-select-icon quote-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
            </div>
            <div className="tool-select-info">
              <h3>Daily Motivation</h3>
              <p>Get your daily dose of inspiration to keep you on track.</p>
            </div>
            <svg className="tool-select-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
          </div>
        </div>
      </main>
    </div>
  );
}
