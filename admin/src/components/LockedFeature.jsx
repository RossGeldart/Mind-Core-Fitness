import { useNavigate } from 'react-router-dom';
import { useTier } from '../contexts/TierContext';
import './LockedFeature.css';

const FEATURE_MESSAGES = {
  nutrition: 'Track meals and scan food with AI',
  metrics: 'See your detailed fitness insights',
  charts: 'Visualise your progress over time',
  consistency: 'Track your daily habits',
};

export default function LockedFeature({ feature, children }) {
  const { canAccess, loading } = useTier();
  const navigate = useNavigate();

  // While auth/tier data is still loading, render children directly
  // to avoid flashing the overlay for users who are already premium.
  if (loading || canAccess(feature)) return children;

  // Free users see the page blurred with an upgrade overlay
  return (
    <div className="locked-feature-wrap">
      <div className="locked-feature-bg">{children}</div>
      <div className="locked-feature-overlay">
        <button className="locked-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="locked-feature-card">
          <div className="locked-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>Premium Feature</h2>
          <p>{FEATURE_MESSAGES[feature] || 'Upgrade to unlock this feature'}</p>
          <button className="locked-upgrade-btn" onClick={() => navigate('/upgrade')}>
            Upgrade to Premium
          </button>
        </div>
      </div>
    </div>
  );
}
