import { describe, it, expect } from 'vitest';
import getClientHomePath from './getClientHomePath';

describe('getClientHomePath', () => {
  it('sends self-signup user with incomplete onboarding to /onboarding', () => {
    const clientData = { signupSource: 'self_signup', onboardingComplete: false };
    expect(getClientHomePath(clientData)).toBe('/onboarding');
  });

  it('sends self-signup user with completed onboarding to /client', () => {
    const clientData = { signupSource: 'self_signup', onboardingComplete: true };
    expect(getClientHomePath(clientData)).toBe('/client');
  });

  it('sends core_buddy client to /client/core-buddy', () => {
    const clientData = { clientType: 'core_buddy' };
    expect(getClientHomePath(clientData)).toBe('/client/core-buddy');
  });

  it('sends circuit_vip client to /client/circuit', () => {
    const clientData = { clientType: 'circuit_vip' };
    expect(getClientHomePath(clientData)).toBe('/client/circuit');
  });

  it('sends circuit_dropin client to /client/circuit', () => {
    const clientData = { clientType: 'circuit_dropin' };
    expect(getClientHomePath(clientData)).toBe('/client/circuit');
  });

  it('sends a standard client to /client', () => {
    const clientData = { clientType: 'standard' };
    expect(getClientHomePath(clientData)).toBe('/client');
  });

  it('returns /client when clientData is null', () => {
    expect(getClientHomePath(null)).toBe('/client');
  });

  it('sends Google sign-up user with incomplete onboarding to /onboarding', () => {
    const clientData = { signupSource: 'google', onboardingComplete: false };
    expect(getClientHomePath(clientData)).toBe('/onboarding');
  });

  it('sends Google sign-up user with completed onboarding to /client', () => {
    const clientData = { signupSource: 'google', onboardingComplete: true };
    expect(getClientHomePath(clientData)).toBe('/client');
  });

  it('sends Apple sign-up user with incomplete onboarding to /onboarding', () => {
    const clientData = { signupSource: 'apple', onboardingComplete: false };
    expect(getClientHomePath(clientData)).toBe('/onboarding');
  });

  it('sends Apple sign-up user with completed onboarding to /client', () => {
    const clientData = { signupSource: 'apple', onboardingComplete: true };
    expect(getClientHomePath(clientData)).toBe('/client');
  });

  it('onboarding check only applies to self-initiated signups — admin-added core_buddy goes to /client/core-buddy', () => {
    // admin-added user: no signupSource field, has a clientType
    const clientData = { clientType: 'core_buddy', onboardingComplete: false };
    expect(getClientHomePath(clientData)).toBe('/client/core-buddy');
  });
});
