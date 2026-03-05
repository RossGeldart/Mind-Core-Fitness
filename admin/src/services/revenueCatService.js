import { Capacitor } from '@capacitor/core';
import { REVENUECAT_API_KEY, RC_ENTITLEMENT_ID } from '../config/revenuecat';

let Purchases = null;
let configured = false;

async function getPurchases() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Purchases) {
    try {
      console.log('[RC] importing @revenuecat/purchases-capacitor…');
      const mod = await import('@revenuecat/purchases-capacitor');
      console.log('[RC] import done, mod keys:', Object.keys(mod));
      Purchases = mod.Purchases;
      console.log('[RC] Purchases object:', Purchases ? 'ok' : 'null');
    } catch (err) {
      console.error('[RC] import error:', err?.message || err);
      return null;
    }
  }
  return Purchases;
}

/**
 * Initialise RevenueCat with the current user's Firebase UID.
 * Call once after authentication.
 */
export async function initRevenueCat(uid) {
  const RC = await getPurchases();
  if (!RC) return;

  try {
    await RC.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: uid,
    });
    configured = true;
    console.log('[RC] configured for user', uid);
  } catch (err) {
    console.error('[RC] configure error:', err);
  }
}

/** Ensure RC is configured before making SDK calls */
async function ensureConfigured() {
  if (configured) return;
  // Wait up to 5s for TierContext to finish initRevenueCat
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (configured) return;
  }
  console.warn('[RC] timed out waiting for configure');
}

/**
 * Log out the current RevenueCat user (call on sign-out).
 */
export async function logOutRevenueCat() {
  const RC = await getPurchases();
  if (!RC) return;

  try {
    await RC.logOut();
    configured = false;
  } catch {
    // ignore — user may not have been logged in
  }
}

/**
 * Check if the current user has the "premium" entitlement.
 */
export async function checkEntitlement() {
  const RC = await getPurchases();
  if (!RC) return false;

  try {
    const { customerInfo } = await RC.getCustomerInfo();
    return RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  } catch (err) {
    console.error('[RC] entitlement check error:', err);
    return false;
  }
}

/**
 * Fetch available packages from the default offering.
 * Returns { monthly, annual } package objects (or null).
 */
export async function getOfferings() {
  const RC = await getPurchases();
  console.log('[RC] getPurchases returned:', RC ? 'ok' : 'null');
  if (!RC) return null;

  await ensureConfigured();
  console.log('[RC] configured:', configured);

  try {
    console.log('[RC] calling getOfferings…');
    const { offerings } = await RC.getOfferings();
    console.log('[RC] offerings response:', JSON.stringify(offerings?.current?.availablePackages?.length ?? 'no current'));
    const current = offerings.current;
    if (!current) return null;

    let monthly = null;
    let annual = null;

    for (const pkg of current.availablePackages) {
      if (pkg.packageType === 'MONTHLY') monthly = pkg;
      else if (pkg.packageType === 'ANNUAL') annual = pkg;
    }

    return { monthly, annual };
  } catch (err) {
    console.error('[RC] getOfferings error:', err);
    return null;
  }
}

/**
 * Purchase a package. Returns { isPremium, customerInfo } on success.
 * Throws on failure/cancellation.
 */
export async function purchasePackage(pkg) {
  const RC = await getPurchases();
  if (!RC) throw new Error('RevenueCat not available');

  const { customerInfo } = await RC.purchasePackage({ aPackage: pkg });
  const isPremium = RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  return { isPremium, customerInfo };
}

/**
 * Restore previous purchases (e.g. after reinstall).
 */
export async function restorePurchases() {
  const RC = await getPurchases();
  if (!RC) throw new Error('RevenueCat not available');

  const { customerInfo } = await RC.restorePurchases();
  const isPremium = RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  return { isPremium, customerInfo };
}
