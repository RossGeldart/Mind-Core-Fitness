import { createContext, useContext, useMemo, useEffect, useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './AuthContext';
import { initRevenueCat, checkEntitlement, logOutRevenueCat } from '../services/revenueCatService';

const isNative = Capacitor.isNativePlatform();

const TierContext = createContext();

export function useTier() {
  return useContext(TierContext);
}

// Features that require premium access
const PREMIUM_FEATURES = [
  'nutrition',
  'metrics',
  'charts',
  'activity',
];

// Free users: only 5 & 10 min, 3 per week, 1 habit, 3 buddies
const FREE_RANDOMISER_DURATIONS = [5, 10];
const FREE_RANDOMISER_WEEKLY_LIMIT = 3;
const FREE_HABIT_LIMIT = 1;
const FREE_BUDDY_LIMIT = 3;

export function TierProvider({ children }) {
  const { clientData, currentUser, loading } = useAuth();
  const [rcPremium, setRcPremium] = useState(false);
  const rcInitialised = useRef(false);

  // Initialise RevenueCat on native when user signs in
  useEffect(() => {
    if (!isNative || !currentUser?.uid) {
      rcInitialised.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await initRevenueCat(currentUser.uid);
        rcInitialised.current = true;
        const hasPremium = await checkEntitlement();
        if (!cancelled) setRcPremium(hasPremium);
      } catch (err) {
        console.error('[RC] init/check error:', err);
      }
    })();

    return () => {
      cancelled = true;
      logOutRevenueCat();
      rcInitialised.current = false;
    };
  }, [currentUser?.uid]);

  const value = useMemo(() => {
    const tier = clientData?.tier || 'free';
    const subscriptionStatus = clientData?.subscriptionStatus || null;
    // Admin-added clients (not self-initiated signup) are treated as premium
    const selfSignupSources = ['self_signup', 'google', 'apple'];
    const isAdminGranted = clientData && !selfSignupSources.includes(clientData.signupSource);
    // On native, also grant premium if RevenueCat says so
    const isPremium = tier === 'premium' || !!isAdminGranted || (isNative && rcPremium);

    // Core HIIT Premium — separate product, not bundled with Core Buddy
    const hiitTier = clientData?.hiitTier || 'free';
    const isHiitPremium = hiitTier === 'premium';

    function canAccess(feature) {
      if (isPremium) return true;
      return !PREMIUM_FEATURES.includes(feature);
    }

    return {
      tier,
      subscriptionStatus,
      isPremium,
      isHiitPremium,
      canAccess,
      loading,
      FREE_RANDOMISER_DURATIONS,
      FREE_RANDOMISER_WEEKLY_LIMIT,
      FREE_HABIT_LIMIT,
      FREE_BUDDY_LIMIT,
      refreshEntitlement: async () => {
        if (!isNative) return;
        const hasPremium = await checkEntitlement();
        setRcPremium(hasPremium);
      },
    };
  }, [clientData?.tier, clientData?.hiitTier, clientData?.subscriptionStatus, clientData?.signupSource, loading, rcPremium]);

  return (
    <TierContext.Provider value={value}>
      {children}
    </TierContext.Provider>
  );
}
