import { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

const TierContext = createContext();

export function useTier() {
  return useContext(TierContext);
}

// Features that require premium access
const PREMIUM_FEATURES = [
  'nutrition',
  'buddies',
];

// Free users: only 5 & 10 min, 2 per week, 1 habit
const FREE_RANDOMISER_DURATIONS = [5, 10];
const FREE_RANDOMISER_WEEKLY_LIMIT = 2;
const FREE_HABIT_LIMIT = 1;

export function TierProvider({ children }) {
  const { clientData, loading } = useAuth();

  const value = useMemo(() => {
    const tier = clientData?.tier || 'free';
    const subscriptionStatus = clientData?.subscriptionStatus || null;
    // Admin-added clients (not self-initiated signup) are treated as premium
    const selfSignupSources = ['self_signup', 'google', 'apple'];
    const isAdminGranted = clientData && !selfSignupSources.includes(clientData.signupSource);
    const isPremium = tier === 'premium' || !!isAdminGranted;

    function canAccess(feature) {
      if (isPremium) return true;
      return !PREMIUM_FEATURES.includes(feature);
    }

    return {
      tier,
      subscriptionStatus,
      isPremium,
      canAccess,
      loading,
      FREE_RANDOMISER_DURATIONS,
      FREE_RANDOMISER_WEEKLY_LIMIT,
      FREE_HABIT_LIMIT,
    };
  }, [clientData?.tier, clientData?.subscriptionStatus, clientData?.signupSource, loading]);

  return (
    <TierContext.Provider value={value}>
      {children}
    </TierContext.Provider>
  );
}
