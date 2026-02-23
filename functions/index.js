const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
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
  daily_morning: () => null, // handled by rotating messages below
  daily_evening: () => null,
};

// Rotating daily messages — picks one based on day of year so everyone gets the same one
const MORNING_MESSAGES = [
  { title: 'Rise & Grind', body: 'Today is yours for the taking. One workout, one step, one choice at a time.' },
  { title: 'Good Morning', body: 'You didn\'t come this far to only come this far. Let\'s get after it today.' },
  { title: 'New Day, New Gains', body: 'Your future self will thank you for what you do today. Make it count.' },
  { title: 'Let\'s Go', body: 'Champions are made on the days they don\'t feel like it. Show up today.' },
  { title: 'Morning Motivation', body: 'Small daily improvements lead to staggering long-term results. Keep pushing.' },
  { title: 'Time to Move', body: 'Your body can stand almost anything. It\'s your mind you have to convince.' },
  { title: 'You\'ve Got This', body: 'Every rep, every step, every healthy choice — it all adds up. Start strong today.' },
  { title: 'Wake Up & Win', body: 'Discipline is choosing between what you want now and what you want most.' },
  { title: 'Fresh Start', body: 'Yesterday is gone. Today is a brand new opportunity to be better than before.' },
  { title: 'Core Buddy Check-In', body: 'The only bad workout is the one that didn\'t happen. Make today count.' },
  { title: 'Good Morning', body: 'Progress, not perfection. Even 10 minutes of movement is a win today.' },
  { title: 'Rise & Shine', body: 'You\'re building something incredible — one day at a time. Keep going.' },
  { title: 'Let\'s Get It', body: 'Remember why you started. That reason hasn\'t changed. Go smash it today.' },
  { title: 'Morning Fuel', body: 'Motivation gets you started. Habits keep you going. Trust the process.' },
];

const EVENING_MESSAGES = [
  { title: 'Evening Check-In', body: 'How did today go? Log your habits and keep that streak alive!' },
  { title: 'Day\'s Almost Done', body: 'Did you move your body today? Every bit counts — don\'t forget to track it.' },
  { title: 'Reflect & Record', body: 'Take a moment to log today\'s wins. How did you show up for yourself?' },
  { title: 'End of Day Reminder', body: 'Before you wind down — have you ticked off your habits for today?' },
  { title: 'How\'d You Do?', body: 'Good day or tough day, you\'re still here. Log it and own it.' },
  { title: 'Evening Round-Up', body: 'Consistency beats intensity. Did you show up today? Track your progress.' },
  { title: 'Don\'t Break the Chain', body: 'Your streak is counting on you! Open up and log today\'s habits.' },
  { title: 'Daily Wrap-Up', body: 'What did you crush today? Log your habits before the day ends.' },
  { title: 'Quick Reminder', body: 'One tap to log your habits. Keep the momentum going — you\'re doing great.' },
  { title: 'Check In Time', body: 'How was your day? Whether you smashed it or survived it — track it.' },
  { title: 'Almost Bedtime', body: 'Don\'t let today go unrecorded. Your future self will love seeing the progress.' },
  { title: 'Evening Nudge', body: 'Did you hit your protein? Get your steps? Log your habits and finish strong.' },
  { title: 'Wind Down Right', body: 'Reflect on today\'s effort. Even small wins deserve to be tracked.' },
  { title: 'Last Call', body: 'Day\'s nearly done — have you logged your habits? Keep that streak going!' },
];

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

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
    let title, body;
    if (type === 'daily_morning' || type === 'daily_evening') {
      // Use the pre-set title/body from the notification document
      title = notif.title;
      body = notif.body;
    } else {
      const msgBuilder = NOTIF_MESSAGES[type];
      const msg = msgBuilder
        ? msgBuilder(fromName || 'Someone')
        : { title: 'Core Buddy', body: 'You have a new notification' };
      title = msg.title;
      body = msg.body;
    }

    if (!title || !body) return;

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

/**
 * Daily 6 AM motivational nudge (UK time).
 * Creates a notification for every client that has FCM tokens registered.
 */
exports.dailyMorningNotification = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'Europe/London' },
  async () => {
    const dayIndex = getDayOfYear();
    const msg = MORNING_MESSAGES[dayIndex % MORNING_MESSAGES.length];

    const clientsSnap = await db.collection('clients')
      .where('fcmTokens', '!=', [])
      .get();

    const batch = db.batch();
    let count = 0;

    clientsSnap.docs.forEach((clientDoc) => {
      const prefs = clientDoc.data().notificationPrefs || {};
      if (prefs.daily_morning === false) return;

      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        toId: clientDoc.id,
        fromId: 'system',
        fromName: 'Core Buddy',
        type: 'daily_morning',
        title: msg.title,
        body: msg.body,
        read: false,
        createdAt: new Date(),
      });
      count++;
    });

    if (count > 0) await batch.commit();
    console.log(`Morning notification created for ${count} clients`);
  }
);

/**
 * Daily 6 PM evening check-in (UK time).
 * Creates a notification for every client that has FCM tokens registered.
 */
exports.dailyEveningNotification = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'Europe/London' },
  async () => {
    const dayIndex = getDayOfYear();
    const msg = EVENING_MESSAGES[dayIndex % EVENING_MESSAGES.length];

    const clientsSnap = await db.collection('clients')
      .where('fcmTokens', '!=', [])
      .get();

    const batch = db.batch();
    let count = 0;

    clientsSnap.docs.forEach((clientDoc) => {
      const prefs = clientDoc.data().notificationPrefs || {};
      if (prefs.daily_evening === false) return;

      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        toId: clientDoc.id,
        fromId: 'system',
        fromName: 'Core Buddy',
        type: 'daily_evening',
        title: msg.title,
        body: msg.body,
        read: false,
        createdAt: new Date(),
      });
      count++;
    });

    if (count > 0) await batch.commit();
    console.log(`Evening notification created for ${count} clients`);
  }
);
