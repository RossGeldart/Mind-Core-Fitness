import { useTier } from '../contexts/TierContext';
import './LockedFeature.css';

/**
 * Wraps a page/section and shows an upgrade overlay if the user is on the free tier.
 *
 * Usage:
 *   <LockedFeature feature="nutrition">
 *     <CoreBuddyNutrition />
 *   </LockedFeature>
 *
 * Props:
 *   feature  – key from PREMIUM_FEATURES in TierContext
 *   children – the gated content (still rendered underneath the blur)
 */
export default function LockedFeature({ feature, children }) {
  const { canAccess } = useTier();

  if (canAccess(feature)) return children;

  return (
    <div className="locked-feature-wrap">
      {/* Render children behind the overlay so the page shape is visible */}
      <div className="locked-feature-bg" aria-hidden="true">{children}</div>

      <div className="locked-feature-overlay">
        <div className="locked-feature-card">
          <div className="locked-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>Premium Feature</h2>
          <p>Upgrade to Core Buddy Premium to unlock this feature and get full access to everything.</p>
          <button className="locked-upgrade-btn">Upgrade Now</button>
        </div>
      </div>
    </div>
  );
}
