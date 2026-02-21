import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../config/firebase';

const VAPID_KEY = 'BNVNdqAPfJYhKBjF9qd-YPEMYIbecZLWiOGUF5tOBfNuv6P1iXgJS6IoS9dHLM5gp-WMrExfir0pCpkMzOdTWKY';

let messaging = null;

function getMessagingInstance() {
  if (!messaging) {
    try {
      messaging = getMessaging(getApp());
    } catch {
      return null;
    }
  }
  return messaging;
}

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get the current notification permission state
 * @returns {'default' | 'granted' | 'denied'}
 */
export function getPermissionState() {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Request push notification permission & register FCM token.
 * Includes retry logic for iOS Safari PWA where getToken() can fail
 * on the first attempt even after permission is granted.
 * @param {string} clientId - The Firestore client document ID
 * @returns {Promise<string|null>} The FCM token or null
 */
export async function requestPushPermission(clientId) {
  if (!isPushSupported()) return null;
  if (!VAPID_KEY) {
    console.warn('Push notifications: VAPID_KEY not configured');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const msg = getMessagingInstance();
    if (!msg) {
      console.error('Push: could not initialise Firebase Messaging');
      return null;
    }

    // Wait for service worker registration
    const swReg = await navigator.serviceWorker.ready;

    // Retry getToken up to 3 times — on iOS Safari PWAs the first
    // attempt frequently fails even though permission was just granted.
    let token = null;
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        token = await getToken(msg, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
        if (token) break;
      } catch (tokenErr) {
        console.warn(`Push getToken attempt ${attempt}/${MAX_RETRIES} failed:`, tokenErr);
      }
      // Small delay before retry to let the SW settle
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    if (token && clientId) {
      // Store token in the client's Firestore doc (supports multiple devices)
      await updateDoc(doc(db, 'clients', clientId), {
        fcmTokens: arrayUnion(token),
      });
    }

    return token;
  } catch (err) {
    console.error('Push permission request failed:', err);
    return null;
  }
}

/**
 * Unregister FCM token (disable push)
 * @param {string} clientId
 * @param {string} token
 */
export async function revokePushToken(clientId, token) {
  if (!token || !clientId) return;
  try {
    await updateDoc(doc(db, 'clients', clientId), {
      fcmTokens: arrayRemove(token),
    });
  } catch (err) {
    console.error('Token revoke failed:', err);
  }
}

/**
 * Listen for foreground push messages and show an in-app callback
 * @param {Function} callback - Called with { title, body, data }
 * @returns {Function} unsubscribe
 */
export function onForegroundMessage(callback) {
  const msg = getMessagingInstance();
  if (!msg) return () => {};
  return onMessage(msg, (payload) => {
    callback({
      title: payload.notification?.title || 'Core Buddy',
      body: payload.notification?.body || '',
      data: payload.data || {},
    });
  });
}
