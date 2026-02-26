import { describe, it, expect } from 'vitest';

// Test the tier access logic in isolation (pure function extracted from TierContext)
const PREMIUM_FEATURES = ['nutrition', 'personalBests', 'buddies', 'programmes'];

const SELF_SIGNUP_SOURCES = ['self_signup', 'google', 'apple'];

function buildTierValue(clientData) {
  const tier = clientData?.tier || 'free';
  const isAdminGranted = clientData && !SELF_SIGNUP_SOURCES.includes(clientData.signupSource);
  const isPremium = tier === 'premium' || !!isAdminGranted;

  function canAccess(feature) {
    if (isPremium) return true;
    return !PREMIUM_FEATURES.includes(feature);
  }

  return { tier, isPremium, canAccess };
}

describe('TierContext — isPremium', () => {
  it('free self-signup user is not premium', () => {
    const { isPremium } = buildTierValue({ tier: 'free', signupSource: 'self_signup' });
    expect(isPremium).toBe(false);
  });

  it('premium self-signup user is premium', () => {
    const { isPremium } = buildTierValue({ tier: 'premium', signupSource: 'self_signup' });
    expect(isPremium).toBe(true);
  });

  it('free Google sign-up user is not premium', () => {
    const { isPremium } = buildTierValue({ tier: 'free', signupSource: 'google' });
    expect(isPremium).toBe(false);
  });

  it('free Apple sign-up user is not premium', () => {
    const { isPremium } = buildTierValue({ tier: 'free', signupSource: 'apple' });
    expect(isPremium).toBe(false);
  });

  it('premium Google sign-up user is premium', () => {
    const { isPremium } = buildTierValue({ tier: 'premium', signupSource: 'google' });
    expect(isPremium).toBe(true);
  });

  it('premium Apple sign-up user is premium', () => {
    const { isPremium } = buildTierValue({ tier: 'premium', signupSource: 'apple' });
    expect(isPremium).toBe(true);
  });

  it('admin-added user (no signupSource) is treated as premium regardless of tier field', () => {
    const { isPremium } = buildTierValue({ tier: 'free' });
    expect(isPremium).toBe(true);
  });

  it('null clientData defaults to free tier', () => {
    const { tier, isPremium } = buildTierValue(null);
    expect(tier).toBe('free');
    expect(isPremium).toBe(false);
  });
});

describe('TierContext — canAccess', () => {
  it('free user cannot access nutrition', () => {
    const { canAccess } = buildTierValue({ tier: 'free', signupSource: 'self_signup' });
    expect(canAccess('nutrition')).toBe(false);
  });

  it('free user cannot access personalBests', () => {
    const { canAccess } = buildTierValue({ tier: 'free', signupSource: 'self_signup' });
    expect(canAccess('personalBests')).toBe(false);
  });

  it('free user cannot access buddies', () => {
    const { canAccess } = buildTierValue({ tier: 'free', signupSource: 'self_signup' });
    expect(canAccess('buddies')).toBe(false);
  });

  it('free user cannot access programmes', () => {
    const { canAccess } = buildTierValue({ tier: 'free', signupSource: 'self_signup' });
    expect(canAccess('programmes')).toBe(false);
  });

  it('free user CAN access non-premium features', () => {
    const { canAccess } = buildTierValue({ tier: 'free', signupSource: 'self_signup' });
    expect(canAccess('workouts')).toBe(true);
    expect(canAccess('tools')).toBe(true);
  });

  it('premium user can access all features', () => {
    const { canAccess } = buildTierValue({ tier: 'premium', signupSource: 'self_signup' });
    for (const feature of PREMIUM_FEATURES) {
      expect(canAccess(feature)).toBe(true);
    }
  });

  it('free Google user cannot access premium features', () => {
    const { canAccess } = buildTierValue({ tier: 'free', signupSource: 'google' });
    expect(canAccess('nutrition')).toBe(false);
    expect(canAccess('buddies')).toBe(false);
  });

  it('free Apple user cannot access premium features', () => {
    const { canAccess } = buildTierValue({ tier: 'free', signupSource: 'apple' });
    expect(canAccess('nutrition')).toBe(false);
    expect(canAccess('buddies')).toBe(false);
  });

  it('admin-added user can access all premium features', () => {
    const { canAccess } = buildTierValue({ tier: 'free' }); // admin-added (no signupSource)
    for (const feature of PREMIUM_FEATURES) {
      expect(canAccess(feature)).toBe(true);
    }
  });
});
