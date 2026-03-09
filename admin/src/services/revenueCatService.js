import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { REVENUECAT_API_KEY, RC_ENTITLEMENT_ID } from '../config/revenuecat';

const isNative = Capacitor.isNativePlatform();
let configured = false;

/**
 * Initialise RevenueCat with the current user's Firebase UID.
 */
export async function initRevenueCat(uid) {
  if (!isNative || configured) return;
  console.log('[RC] initRevenueCat called for', uid);
  try {
    console.log('[RC] calling configure…');
    await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: uid });
    configured = true;
    console.log('[RC] configured OK');
  } catch (err) {
    console.error('[RC] configure failed:', err?.message || err);
  }
}

/**
 * Log out the current RevenueCat user.
 */
export async function logOutRevenueCat() {
  if (!isNative) return;
  try {
    await Purchases.logOut();
    configured = false;
  } catch {
    // ignore
  }
}

/**
 * Check if the current user has the "premium" entitlement.
 */
export async function checkEntitlement() {
  if (!isNative) return false;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  } catch (err) {
    console.error('[RC] entitlement check error:', err);
    return false;
  }
}

/**
 * Fetch available packages from the default offering.
 */
export async function getOfferings(uid) {
  if (!isNative) return null;
  console.log('[RC] getOfferings called, configured:', configured);

  // Configure inline if not yet done
  if (!configured && uid) {
    try {
      console.log('[RC] getOfferings — configuring inline for', uid);
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: uid });
      configured = true;
      console.log('[RC] getOfferings — configured OK');
    } catch (err) {
      console.error('[RC] getOfferings — configure failed:', err?.message || err);
      return null;
    }
  }

  if (!configured) {
    console.warn('[RC] not configured, returning null');
    return null;
  }

  try {
    console.log('[RC] calling getOfferings…');
    const result = await Purchases.getOfferings();
    console.log('[RC] getOfferings raw:', JSON.stringify(result).substring(0, 300));
    // Capacitor plugin returns offerings directly (not wrapped in { offerings })
    const current = result?.current ?? result?.offerings?.current;
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
 * Purchase a package.
 */
export async function purchasePackage(pkg) {
  if (!isNative) throw new Error('RevenueCat not available');
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  const isPremium = RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  return { isPremium, customerInfo };
}

/**
 * Restore previous purchases.
 */
export async function restorePurchases() {
  if (!isNative) throw new Error('RevenueCat not available');
  const { customerInfo } = await Purchases.restorePurchases();
  const isPremium = RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  return { isPremium, customerInfo };
}
