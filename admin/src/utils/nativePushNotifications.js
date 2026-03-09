import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Native iOS push notifications using @capacitor-firebase/messaging.
 * This bridges APNs tokens to FCM automatically, so the server-side
 * notification sending (which uses FCM) works unchanged.
 */

/**
 * Check current permission status on native
 * @returns {Promise<'prompt'|'granted'|'denied'>}
 */
export async function getNativePermissionState() {
  const result = await FirebaseMessaging.checkPermissions();
  return result.receive; // 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'
}

/**
 * Request push permission and register the FCM token in Firestore.
 * @param {string} clientId - Firestore client document ID
 * @returns {Promise<{token: string|null, error: string|null}>}
 */
export async function requestNativePushPermission(clientId) {
  try {
    // 1. Request permission from the OS
    const permResult = await FirebaseMessaging.requestPermissions();
    if (permResult.receive !== 'granted') {
      return { token: null, error: 'permission-denied' };
    }

    // 2. Get the FCM token (bridges APNs → FCM automatically)
    const { token } = await FirebaseMessaging.getToken();
    if (!token) {
      return { token: null, error: 'no-token' };
    }

    // 3. Store FCM token in Firestore (same field as web push)
    if (clientId) {
      await updateDoc(doc(db, 'clients', clientId), {
        fcmTokens: arrayUnion(token),
      });
    }

    return { token, error: null };
  } catch (err) {
    console.error('[NativePush] requestPermission error:', err);
    return { token: null, error: `exception:${err.message}` };
  }
}

/**
 * Remove the FCM token from Firestore (disable push)
 * @param {string} clientId
 * @param {string} token
 */
export async function revokeNativePushToken(clientId, token) {
  if (!token || !clientId) return;
  try {
    await updateDoc(doc(db, 'clients', clientId), {
      fcmTokens: arrayRemove(token),
    });
    await FirebaseMessaging.deleteToken();
  } catch (err) {
    console.error('[NativePush] revoke error:', err);
  }
}

/**
 * Listen for foreground push messages on native
 * @param {Function} callback - Called with { title, body, data }
 * @returns {Promise<Function>} unsubscribe
 */
export async function onNativeForegroundMessage(callback) {
  const listener = await FirebaseMessaging.addListener('notificationReceived', (notification) => {
    callback({
      title: notification.title || 'Core Buddy',
      body: notification.body || '',
      data: notification.data || {},
    });
  });
  return () => listener.remove();
}
