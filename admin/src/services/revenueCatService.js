import { Capacitor } from '@capacitor/core';
import { REVENUECAT_API_KEY, RC_ENTITLEMENT_ID } from '../config/revenuecat';

let configured = false;
let RC = null;

async function getRC() {
  if (!Capacitor.isNativePlatform()) return null;
  if (RC) return RC;
  try {
    const mod = await import('@revenuecat/purchases-capacitor');
    RC = mod.Purchases;
    console.log('[RC] plugin loaded');
    return RC;
  } catch (err) {
    console.error('[RC] import error:', err?.message || err);
    return null;
  }
}

/**
 * Initialise RevenueCat with the current user's Firebase UID.
 */
export async function initRevenueCat(uid) {
  console.log('[RC] initRevenueCat called for', uid);
  const P = await getRC();
  if (!P || configured) return;

  try {
    console.log('[RC] calling configure…');
    await P.configure({ apiKey: REVENUECAT_API_KEY, appUserID: uid });
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
  const P = await getRC();
  if (!P) return;
  try {
    await P.logOut();
    configured = false;
  } catch {
    // ignore
  }
}

/**
 * Check if the current user has the "premium" entitlement.
 */
export async function checkEntitlement() {
  const P = await getRC();
  if (!P) return false;
  try {
    const { customerInfo } = await P.getCustomerInfo();
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
  console.log('[RC] getOfferings called, uid:', uid, 'configured:', configured);
  const P = await getRC();
  if (!P) return null;

  // Configure inline if not yet done
  if (!configured && uid) {
    try {
      console.log('[RC] getOfferings — configuring inline…');
      await P.configure({ apiKey: REVENUECAT_API_KEY, appUserID: uid });
      configured = true;
      console.log('[RC] getOfferings — configured OK');
    } catch (err) {
      console.error('[RC] getOfferings — configure failed:', err?.message || err);
      return null;
    }
  }

  if (!configured) {
    console.warn('[RC] getOfferings — not configured, returning null');
    return null;
  }

  try {
    console.log('[RC] calling getOfferings…');
    const result = await P.getOfferings();
    console.log('[RC] getOfferings raw:', JSON.stringify(result).substring(0, 300));
    const current = result?.offerings?.current;
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
  const P = await getRC();
  if (!P) throw new Error('RevenueCat not available');
  const { customerInfo } = await P.purchasePackage({ aPackage: pkg });
  const isPremium = RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  return { isPremium, customerInfo };
}

/**
 * Restore previous purchases.
 */
export async function restorePurchases() {
  const P = await getRC();
  if (!P) throw new Error('RevenueCat not available');
  const { customerInfo } = await P.restorePurchases();
  const isPremium = RC_ENTITLEMENT_ID in (customerInfo.entitlements.active || {});
  return { isPremium, customerInfo };
}
