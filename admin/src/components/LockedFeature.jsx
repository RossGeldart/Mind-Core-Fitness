import { Navigate } from 'react-router-dom';
import { useTier } from '../contexts/TierContext';

export default function LockedFeature({ feature, children }) {
  const { canAccess, loading } = useTier();

  // While auth/tier data is still loading, render children directly
  // to avoid flashing the redirect for users who are already premium.
  if (loading || canAccess(feature)) return children;

  // Free users get redirected to the upgrade page
  return <Navigate to="/upgrade" replace />;
}
