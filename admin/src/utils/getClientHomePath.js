/**
 * Return the correct landing path for an authenticated client.
 * Used by Login and SignUp to avoid duplicating redirect logic.
 */
export default function getClientHomePath(clientData) {
  if (['self_signup', 'google', 'apple'].includes(clientData?.signupSource) && !clientData?.onboardingComplete) {
    return '/onboarding';
  }
  const type = clientData?.clientType;
  if (type === 'core_buddy') return '/client/core-buddy';
  if (type === 'circuit_vip' || type === 'circuit_dropin') return '/client/circuit';
  return '/client';
}
