const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

// Human-readable notification messages per type
const NOTIF_MESSAGES = {
  buddy_request: (name) => ({ title: 'New Buddy Request', body: `${name} wants to connect with you` }),
  buddy_accept: (name) => ({ title: 'Buddy Accepted!', body: `${name} accepted your buddy request` }),
  like: (name) => ({ title: 'Post Liked', body: `${name} liked your post` }),
  comment: (name) => ({ title: 'New Comment', body: `${name} commented on your post` }),
  mention: (name) => ({ title: 'You Were Mentioned', body: `${name} mentioned you in a comment` }),
};

/**
 * Triggered when a new notification document is created in the
 * "notifications" collection. Looks up the recipient's FCM tokens
 * and notification preferences, then sends a push notification.
 */
exports.sendPushNotification = onDocumentCreated('notifications/{notifId}', async (event) => {
  const notif = event.data?.data();
  if (!notif) return;

  const { toId, fromName, type } = notif;
  if (!toId || !type) return;

  try {
    // Look up recipient client document
    const clientDoc = await db.collection('clients').doc(toId).get();
    if (!clientDoc.exists) return;

    const clientData = clientDoc.data();
    const tokens = clientData.fcmTokens || [];
    if (tokens.length === 0) return;

    // Check notification preferences — if the user disabled this type, skip
    const prefs = clientData.notificationPrefs || {};
    if (prefs[type] === false) return;

    // Build notification payload
    const msgBuilder = NOTIF_MESSAGES[type];
    const { title, body } = msgBuilder
      ? msgBuilder(fromName || 'Someone')
      : { title: 'Core Buddy', body: 'You have a new notification' };

    const message = {
      notification: { title, body },
      data: { type, notifId: event.params.notifId },
      webpush: {
        notification: {
          icon: 'https://www.mindcorefitness.com/login/Logo.webp',
          badge: 'https://www.mindcorefitness.com/login/Logo.webp',
          tag: type,
        },
      },
    };

    // Send to all registered device tokens
    const staleTokens = [];
    const results = await Promise.allSettled(
      tokens.map((token) =>
        getMessaging()
          .send({ ...message, token })
          .catch((err) => {
            // Token is invalid or expired — mark for cleanup
            if (
              err.code === 'messaging/invalid-registration-token' ||
              err.code === 'messaging/registration-token-not-registered'
            ) {
              staleTokens.push(token);
            }
            throw err;
          })
      )
    );

    // Clean up stale tokens
    if (staleTokens.length > 0) {
      const { FieldValue } = require('firebase-admin/firestore');
      await db
        .collection('clients')
        .doc(toId)
        .update({ fcmTokens: FieldValue.arrayRemove(...staleTokens) });
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`Push sent to ${sent}/${tokens.length} devices for ${type} → ${toId}`);
  } catch (err) {
    console.error('sendPushNotification error:', err);
  }
});
