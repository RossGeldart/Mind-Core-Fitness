import { Capacitor } from '@capacitor/core';
import { REVENUECAT_API_KEY, RC_ENTITLEMENT_ID } from '../config/revenuecat';

let Purchases = null;

async function getPurchases() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Purchases) {
    const mod = await import('@revenuecat/purchases-capacitor');
    Purchases = mod.Purchases;
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
    console.log('[RC] configured for user', uid);
  } catch (err) {
    console.error('[RC] configure error:', err);
  }
}

/**
 * Log out the current RevenueCat user (call on sign-out).
 */
export async function logOutRevenueCat() {
  const RC = await getPurchases();
  if (!RC) return;

  try {
    await RC.logOut();
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
  if (!RC) return null;

  try {
    const { offerings } = await RC.getOfferings();
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
