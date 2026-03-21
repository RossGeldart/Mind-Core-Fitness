import { createContext, useContext } from 'react';

const TierContext = createContext();

export function TierProvider({ children }) {
  // For now, all users get full access — premium gating will be added later
  const value = { isHiitPremium: true };
  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier() {
  return useContext(TierContext);
}
