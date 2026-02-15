import { useState, useRef, useCallback } from 'react';

/**
 * Pull-to-refresh wrapper. Wrap any page's <main> content with this.
 * Triggers a full page reload when the user pulls down from the top.
 */
export default function PullToRefresh({ children, onRefresh }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback((e) => {
    // Only activate when scrolled to the very top
    if (window.scrollY <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isPulling.current || refreshing) return;

    const diff = e.touches[0].clientY - touchStartY.current;

    if (diff > 20 && window.scrollY <= 0) {
      e.preventDefault();
      setPullDistance(Math.min((diff - 20) * 0.35, 80));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance > 55 && !refreshing) {
      setRefreshing(true);
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
      // If onRefresh was used (no reload), reset state
      setRefreshing(false);
    }
    setPullDistance(0);
    isPulling.current = false;
  }, [pullDistance, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className={`pull-refresh-indicator ${pullDistance > 0 ? 'visible' : ''} ${refreshing ? 'refreshing' : ''}`}
        style={{ height: pullDistance }}
      >
        <div className={`refresh-spinner ${refreshing ? 'spinning' : ''}`}>
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </div>
        <span className="refresh-text">{refreshing ? 'Refreshing...' : 'Pull to refresh'}</span>
      </div>

      {children}
    </div>
  );
}
