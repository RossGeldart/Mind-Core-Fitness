import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import { useHiit } from '../contexts/HiitContext';
import './HiitPremiumGate.css';

/**
 * Gate for HIIT premium features.
 * - No account → prompt to create one
 * - Account but not HIIT premium → prompt to upgrade
 * - HIIT premium → render children
 */
export default function HiitPremiumGate({ children, feature }) {
  const { currentUser } = useAuth();
  const { isHiitPremium } = useTier();
  const { hiitTheme } = useHiit();
  const navigate = useNavigate();

  if (isHiitPremium) return children;

  const needsAccount = !currentUser;

  return (
    <div className="hiit-page" data-hiit-theme={hiitTheme}>
      <div className="hpg-overlay">
        <div className="hpg-card">
          <div className="hpg-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 className="hpg-title">
            {needsAccount ? 'Create a Free Account' : 'Upgrade to Premium'}
          </h3>
          <p className="hpg-message">
            {needsAccount
              ? `${feature} is a Premium feature. Create a free account to get started.`
              : `${feature} requires Core HIIT Premium.`}
          </p>
          <button
            className="hpg-cta"
            onClick={() => navigate(needsAccount ? '/signup' : '/hiit/premium')}
          >
            {needsAccount ? 'Create Account' : 'View Plans'}
          </button>
          <button className="hpg-back" onClick={() => navigate('/hiit')}>
            Back to Timer
          </button>
        </div>
      </div>
    </div>
  );
}
