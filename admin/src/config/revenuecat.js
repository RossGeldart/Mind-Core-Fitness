import { Capacitor } from '@capacitor/core';

// RevenueCat API keys (public, safe to commit)
const REVENUECAT_IOS_KEY = 'appl_WUtkpZUhFQjIyGMlfzAfpXGnSqN';
const REVENUECAT_ANDROID_KEY = 'goog_YOUR_ANDROID_API_KEY'; // TODO: Replace with real Google Play API key from RevenueCat dashboard

export const REVENUECAT_API_KEY =
  Capacitor.getPlatform() === 'android' ? REVENUECAT_ANDROID_KEY : REVENUECAT_IOS_KEY;

// Product identifiers (must match App Store Connect)
export const RC_PRODUCT_IDS = {
  monthly: 'com.corebuddy.app.monthly',
  annual: 'com.corebuddy.app.annual',
};

// Entitlement identifier (must match RevenueCat dashboard)
export const RC_ENTITLEMENT_ID = 'premium';
