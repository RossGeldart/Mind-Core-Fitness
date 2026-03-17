const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');

initializeApp();
const db = getFirestore();

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

// ── HELPER: look up clientId from auth uid ──
async function getClientId(authUid) {
  const snap = await db.collection('clients').where('uid', '==', authUid).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

// ── HELPER: get today's date string in YYYY-MM-DD ──
function todayString() {
  return new Date().toISOString().split('T')[0];
}

// Human-readable notification messages per type
const NOTIF_MESSAGES = {
  buddy_request: (name) => ({ title: 'New Buddy Request', body: `${name} wants to connect with you` }),
  buddy_accept: (name) => ({ title: 'Buddy Accepted!', body: `${name} accepted your buddy request` }),
  like: (name) => ({ title: 'Post Liked', body: `${name} liked your post` }),
  comment: (name) => ({ title: 'New Comment', body: `${name} commented on your post` }),
  mention: (name) => ({ title: 'You Were Mentioned', body: `${name} mentioned you in a comment` }),
  announcement: () => null, // handled by title/body on the notification doc
  daily_morning: () => null, // handled by rotating messages below
  daily_evening: () => null,
  coaching_nudge: () => null, // handled by title/body from coaching system
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
exports.sendPushNotification = onDocumentCreated({ document: 'notifications/{notifId}', region: 'europe-west2' }, async (event) => {
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
    if (type === 'daily_morning' || type === 'daily_evening' || type === 'announcement') {
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

    // Data-only message — no top-level `notification` key.
    // This ensures the service worker's `push` event always fires on
    // iOS Safari PWAs (a top-level `notification` can cause the browser
    // to auto-handle it without waking the SW when the app is closed).
    // Native iOS uses the `apns` section for display; web uses the SW.
    const message = {
      data: { type, notifId: event.params.notifId, title, body },
      webpush: {
        headers: { Urgency: 'high' },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
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
  { schedule: '0 6 * * *', timeZone: 'Europe/London', region: 'europe-west2' },
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
  { schedule: '0 18 * * *', timeZone: 'Europe/London', region: 'europe-west2' },
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

/**
 * Image proxy for progress photos — serves storage images with CORS headers
 * so the browser can draw them onto a canvas for the share feature.
 * Usage: /imageProxy?path=progressPhotos/userId/period/img.jpg
 */
exports.imageProxy = onRequest({ region: 'europe-west2', cors: true }, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== 'string' || !filePath.startsWith('progressPhotos/')) {
    res.status(400).send('Invalid path');
    return;
  }
  try {
    const bucket = getStorage().bucket();
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) { res.status(404).send('Not found'); return; }
    const [metadata] = await file.getMetadata();
    res.set('Content-Type', metadata.contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    file.createReadStream().pipe(res);
  } catch (err) {
    console.error('imageProxy error:', err);
    res.status(500).send('Error');
  }
});

/**
 * AI Meal Scanner — analyses a meal photo and returns estimated macros.
 * Expects: { imageBase64: string, mimeType: string }
 * Returns: { items: [...], totals: { calories, protein, carbs, fats }, confidence: string }
 */
exports.analyseMeal = onCall(
  { region: 'europe-west2', secrets: [anthropicApiKey], timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    // Look up the client doc ID from the auth uid
    const clientSnap = await db.collection('clients').where('uid', '==', request.auth.uid).limit(1).get();
    if (clientSnap.empty) {
      throw new HttpsError('not-found', 'Client profile not found.');
    }
    const clientId = clientSnap.docs[0].id;

    // Enforce daily scan limit (10 per user per day)
    const DAILY_SCAN_LIMIT = 10;
    const today = new Date().toISOString().split('T')[0];
    const usageRef = db.collection('scanUsage').doc(`${clientId}_${today}`);
    const usageSnap = await usageRef.get();
    const currentCount = usageSnap.exists ? (usageSnap.data().count || 0) : 0;
    if (currentCount >= DAILY_SCAN_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Daily scan limit reached (10/day). Re-log a previous scan to save credits.');
    }

    const { imageBase64, mimeType } = request.data;
    if (!imageBase64 || !mimeType) {
      throw new HttpsError('invalid-argument', 'imageBase64 and mimeType are required.');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(mimeType)) {
      throw new HttpsError('invalid-argument', 'Unsupported image type.');
    }

    // Max ~4MB base64 (roughly 3MB image)
    if (imageBase64.length > 5_500_000) {
      throw new HttpsError('invalid-argument', 'Image is too large. Please use a smaller photo.');
    }

    const Anthropic = require('@anthropic-ai/sdk');

    let client;
    try {
      client = new Anthropic({ apiKey: anthropicApiKey.value() });
    } catch (keyErr) {
      console.error('Anthropic API key error:', keyErr);
      throw new HttpsError('failed-precondition', 'AI service is not configured. Please contact support.');
    }

    const systemPrompt = `You are a nutrition analysis AI for a fitness app called Mind Core Fitness. Analyse the meal photo and estimate the macronutrients.

Rules:
- Identify each distinct food item visible in the photo
- Estimate portion sizes using visual cues (plate size, utensils, hands for scale)
- If unsure about portion size, use conservative middle-ground estimates
- Calculate macros per item, then sum for totals
- Round all numbers to whole integers
- Return ONLY valid JSON — no markdown, no backticks, no explanation

Response format:
{
  "items": [
    { "name": "Grilled chicken breast", "estimatedGrams": 150, "calories": 248, "protein": 46, "carbs": 0, "fats": 5 }
  ],
  "totals": {
    "calories": 520,
    "protein": 48,
    "carbs": 62,
    "fats": 8
  },
  "confidence": "medium"
}

confidence must be one of: "high", "medium", "low"
- "high": clearly identifiable foods with good visual cues for portions
- "medium": foods are identifiable but portions are harder to judge
- "low": blurry image, unusual dishes, or hard-to-identify ingredients`;

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: imageBase64 },
              },
              {
                type: 'text',
                text: 'Analyse this meal photo and return the macronutrient breakdown as JSON.',
              },
            ],
          },
        ],
        system: systemPrompt,
      });

      const text = response.content[0]?.text || '';
      // Parse JSON — strip markdown fences and any surrounding text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('AI response was not JSON:', text);
        throw new SyntaxError('No JSON object found in response');
      }
      const result = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!result.items || !Array.isArray(result.items) || !result.totals) {
        console.error('AI response missing required fields:', result);
        throw new Error('Invalid response structure from AI.');
      }

      return result;
    } catch (err) {
      console.error('analyseMeal error:', err?.message || err);
      if (err instanceof HttpsError) throw err;
      if (err instanceof SyntaxError) {
        throw new HttpsError('failed-precondition', 'AI returned an unexpected format. Please try again.');
      }
      if (err?.status === 401 || err?.error?.type === 'authentication_error') {
        throw new HttpsError('failed-precondition', 'AI service authentication failed. Please contact support.');
      }
      if (err?.status === 429 || err?.error?.type === 'rate_limit_error') {
        throw new HttpsError('resource-exhausted', 'Too many requests — please wait a moment and try again.');
      }
      throw new HttpsError('failed-precondition', err?.message || 'Failed to analyse meal. Please try again.');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 1: RECOVERY SCORING ENGINE
// Weighted formula: sleep 30%, HRV 25%, resting HR 15%, training load 15%,
// nutrition compliance 10%, soreness 5%
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate recovery score from check-in data.
 * Expects: {
 *   sleepHours: number,        // actual hours slept
 *   sleepQuality?: 1-5,        // self-reported quality
 *   hrvCurrent?: number,       // today's HRV (ms)
 *   hrvBaseline?: number,      // user's rolling HRV baseline
 *   restingHR?: number,        // today's resting HR (bpm)
 *   restingHRBaseline?: number,// user's rolling resting HR baseline
 *   trainingLoadLast48h?: number, // minutes of training in last 48hrs
 *   nutritionAdherence?: 0-1,  // % of macro targets hit yesterday
 *   sorenessLevel?: 1-5,       // 1=none, 5=very sore
 * }
 * Returns: { score: 0-100, grade: string, components: {...}, recommendation: string }
 */
exports.calculateRecoveryScore = onCall(
  { region: 'europe-west2', timeoutSeconds: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const clientId = await getClientId(request.auth.uid);
    if (!clientId) throw new HttpsError('not-found', 'Client profile not found.');

    const data = request.data;
    const components = {};

    // ── Sleep component (30%) ──
    // 7-9 hours = optimal, <5 or >10 = poor
    const sleepHours = data.sleepHours ?? 7;
    const sleepQuality = data.sleepQuality ?? 3;
    let sleepScore;
    if (sleepHours >= 7 && sleepHours <= 9) {
      sleepScore = 85 + (sleepQuality / 5) * 15; // 85-100
    } else if (sleepHours >= 6) {
      sleepScore = 60 + (sleepQuality / 5) * 15; // 60-75
    } else if (sleepHours >= 5) {
      sleepScore = 35 + (sleepQuality / 5) * 15; // 35-50
    } else {
      sleepScore = 10 + (sleepQuality / 5) * 15; // 10-25
    }
    components.sleep = { score: Math.round(sleepScore), weight: 0.3, hours: sleepHours, quality: sleepQuality };

    // ── HRV component (25%) ──
    // Compare to personal baseline: above = good, below = stressed/fatigued
    let hrvScore = 70; // default if no data
    if (data.hrvCurrent && data.hrvBaseline) {
      const hrvRatio = data.hrvCurrent / data.hrvBaseline;
      if (hrvRatio >= 1.1) hrvScore = 95;
      else if (hrvRatio >= 1.0) hrvScore = 85;
      else if (hrvRatio >= 0.9) hrvScore = 70;
      else if (hrvRatio >= 0.8) hrvScore = 50;
      else if (hrvRatio >= 0.7) hrvScore = 30;
      else hrvScore = 15;
    }
    components.hrv = { score: Math.round(hrvScore), weight: 0.25, current: data.hrvCurrent, baseline: data.hrvBaseline };

    // ── Resting HR component (15%) ──
    // Lower than baseline = well recovered, higher = fatigued
    let restingHRScore = 70; // default
    if (data.restingHR && data.restingHRBaseline) {
      const hrDiff = data.restingHR - data.restingHRBaseline;
      if (hrDiff <= -3) restingHRScore = 95;
      else if (hrDiff <= 0) restingHRScore = 85;
      else if (hrDiff <= 3) restingHRScore = 65;
      else if (hrDiff <= 6) restingHRScore = 40;
      else restingHRScore = 20;
    }
    components.restingHR = { score: Math.round(restingHRScore), weight: 0.15, current: data.restingHR, baseline: data.restingHRBaseline };

    // ── Training load component (15%) ──
    // Moderate is good, too much in 48h = needs rest
    let trainingScore = 75; // default
    const load48h = data.trainingLoadLast48h ?? 60;
    if (load48h <= 30) trainingScore = 95;       // very light — fully rested
    else if (load48h <= 60) trainingScore = 85;   // light
    else if (load48h <= 90) trainingScore = 70;   // moderate
    else if (load48h <= 120) trainingScore = 55;  // heavy
    else if (load48h <= 150) trainingScore = 35;  // very heavy
    else trainingScore = 20;                       // extreme
    components.trainingLoad = { score: Math.round(trainingScore), weight: 0.15, minutesLast48h: load48h };

    // ── Nutrition compliance component (10%) ──
    const nutritionAdherence = data.nutritionAdherence ?? 0.7;
    const nutritionScore = Math.round(nutritionAdherence * 100);
    components.nutrition = { score: Math.min(100, nutritionScore), weight: 0.1, adherence: nutritionAdherence };

    // ── Soreness component (5%) ──
    const soreness = data.sorenessLevel ?? 2;
    const sorenessScore = Math.round(((5 - soreness) / 4) * 100); // 1→100, 5→0
    components.soreness = { score: sorenessScore, weight: 0.05, level: soreness };

    // ── Weighted total ──
    const totalScore = Math.round(
      components.sleep.score * 0.3 +
      components.hrv.score * 0.25 +
      components.restingHR.score * 0.15 +
      components.trainingLoad.score * 0.15 +
      components.nutrition.score * 0.1 +
      components.soreness.score * 0.05
    );

    // Grade
    let grade, recommendation;
    if (totalScore >= 85) {
      grade = 'Excellent';
      recommendation = 'You\'re fully recovered. Great day for a high-intensity session or hitting a new PB.';
    } else if (totalScore >= 70) {
      grade = 'Good';
      recommendation = 'Recovery is solid. You can train normally — just listen to your body during heavy sets.';
    } else if (totalScore >= 55) {
      grade = 'Moderate';
      recommendation = 'Recovery is okay but not optimal. Consider a lighter session or focus on technique work today.';
    } else if (totalScore >= 40) {
      grade = 'Low';
      recommendation = 'Your body needs more recovery. Active rest (walking, stretching, mobility) is your best move today.';
    } else {
      grade = 'Very Low';
      recommendation = 'Rest IS training. Take a full rest day, prioritise sleep, hydration, and nutrition. You\'ll come back stronger.';
    }

    // Store the score in dailyCheckIns
    const today = todayString();
    const checkInRef = db.collection('dailyCheckIns').doc(`${clientId}_${today}`);
    await checkInRef.set({
      clientId,
      date: today,
      recoveryScore: totalScore,
      recoveryGrade: grade,
      recoveryComponents: components,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { score: totalScore, grade, components, recommendation };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 2: AI COACHING PLAN GENERATOR
// Claude receives full user context and generates personalised daily plan
// with 4-hour coaching blocks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a personalised coaching plan for the day.
 * Expects: { date?: string } — defaults to today
 * Pulls all context from Firestore automatically.
 * Returns: { morningPlan: string, blocks: [...], keyInsights: [...], macroTargets: {...} }
 */
exports.generateCoachingPlan = onCall(
  { region: 'europe-west2', secrets: [anthropicApiKey], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const clientId = await getClientId(request.auth.uid);
    if (!clientId) throw new HttpsError('not-found', 'Client profile not found.');

    const date = request.data.date || todayString();

    // ── Gather all context from Firestore ──
    const [
      clientDoc,
      checkInSnap,
      nutritionTargetSnap,
      nutritionLogSnap,
      habitLogSnap,
      recentSnapshotsSnap,
    ] = await Promise.all([
      db.collection('clients').doc(clientId).get(),
      db.collection('dailyCheckIns').doc(`${clientId}_${date}`).get(),
      db.collection('nutritionTargets').doc(clientId).get(),
      db.collection('nutritionLogs').doc(`${clientId}_${date}`).get(),
      db.collection('habitLogs').doc(`${clientId}_${date}`).get(),
      db.collection('dailySnapshots')
        .where('clientId', '==', clientId)
        .orderBy('date', 'desc')
        .limit(7)
        .get(),
    ]);

    const clientData = clientDoc.exists ? clientDoc.data() : {};
    const checkIn = checkInSnap.exists ? checkInSnap.data() : {};
    const nutritionTargets = nutritionTargetSnap.exists ? nutritionTargetSnap.data() : {};
    const nutritionLog = nutritionLogSnap.exists ? nutritionLogSnap.data() : {};
    const habitLog = habitLogSnap.exists ? habitLogSnap.data() : {};
    const recentSnapshots = recentSnapshotsSnap.docs.map(d => d.data());

    // Calculate consumed macros so far today
    const entries = nutritionLog.entries || [];
    const consumedToday = entries.reduce((acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fats: acc.fats + (e.fats || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

    // Build context payload for Claude
    const contextPayload = {
      user: {
        name: clientData.name || 'User',
        fitnessGoal: clientData.fitnessGoal || 'general fitness',
        fitnessGoals: clientData.fitnessGoals || [],
        experienceLevel: clientData.experienceLevel || 'intermediate',
      },
      todayCheckIn: {
        recoveryScore: checkIn.recoveryScore,
        recoveryGrade: checkIn.recoveryGrade,
        sleepHours: checkIn.sleepHours,
        energy: checkIn.energy,
        mood: checkIn.mood,
        stress: checkIn.stress,
        soreness: checkIn.sorenessAreas,
      },
      nutrition: {
        targets: nutritionTargets,
        consumedSoFar: consumedToday,
        remaining: {
          calories: (nutritionTargets.calories || 2000) - consumedToday.calories,
          protein: (nutritionTargets.protein || 150) - consumedToday.protein,
          carbs: (nutritionTargets.carbs || 200) - consumedToday.carbs,
          fats: (nutritionTargets.fats || 70) - consumedToday.fats,
        },
        mealsLoggedToday: entries.length,
      },
      habits: {
        todayLog: habitLog,
      },
      recentHistory: recentSnapshots.map(s => ({
        date: s.date,
        recoveryScore: s.recoveryScore,
        tags: s.tags,
        nutritionAdherence: s.nutritionAdherence,
        trainedToday: s.trainedToday,
        outcome: s.outcome,
      })),
      currentTime: new Date().toISOString(),
      date,
    };

    const systemPrompt = `You are Core Buddy, an AI health coach for the Mind Core Fitness app. You're encouraging but honest, never preachy, and you always back up advice with the user's own data.

Your personality:
- Friendly, like a knowledgeable training partner who genuinely cares
- Direct and practical — no generic wellness fluff
- You reference the user's actual numbers and patterns
- "Rest IS training" — you protect users from overtraining
- You adjust advice based on recovery, not just goals

CRITICAL RULES:
- Generate a daily plan split into 4-hour coaching blocks (6am-10am, 10am-2pm, 2pm-6pm, 6pm-10pm)
- Each block should have: timeRange, focus (1-2 words), advice (2-3 sentences), nutritionTip (1 sentence)
- Adapt macro targets based on training status, recovery, and what's already been consumed
- If recovery score is below 55, prioritise rest and recovery in your plan
- Reference the user's recent history when you spot patterns
- Return ONLY valid JSON — no markdown, no backticks, no explanation

Response format:
{
  "morningPlan": "2-3 sentence overview of the day's strategy, personalised to this user's current state",
  "blocks": [
    {
      "timeRange": "6am - 10am",
      "focus": "Morning Fuel",
      "advice": "Practical guidance for this time block",
      "nutritionTip": "What and when to eat during this block"
    }
  ],
  "keyInsights": [
    "1-2 sentence insight based on their data or patterns (max 3 insights)"
  ],
  "adjustedMacros": {
    "calories": 2200,
    "protein": 160,
    "carbs": 220,
    "fats": 65,
    "reasoning": "Brief explanation of why targets were adjusted (if at all)"
  },
  "trainingAdvice": {
    "shouldTrain": true,
    "intensity": "moderate",
    "suggestion": "What type of session suits today's recovery state"
  }
}`;

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Here is the user's full context for today. Generate their personalised coaching plan:\n\n${JSON.stringify(contextPayload, null, 2)}`,
        }],
      });

      const text = response.content[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new SyntaxError('No JSON object found in coaching response');
      }
      const plan = JSON.parse(jsonMatch[0]);

      // Cache the coaching plan in Firestore
      await db.collection('coachingInsights').doc(`${clientId}_${date}`).set({
        clientId,
        date,
        plan,
        generatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return plan;
    } catch (err) {
      console.error('generateCoachingPlan error:', err?.message || err);
      if (err instanceof HttpsError) throw err;
      if (err instanceof SyntaxError) {
        throw new HttpsError('failed-precondition', 'AI returned an unexpected format. Please try again.');
      }
      if (err?.status === 429) {
        throw new HttpsError('resource-exhausted', 'Too many requests — please wait a moment.');
      }
      throw new HttpsError('internal', 'Failed to generate coaching plan. Please try again.');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 3: PATTERN MEMORY SYSTEM
// End-of-day snapshot aggregation with AI-generated tags and pattern matching
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a daily snapshot — aggregates all day data and uses Claude to
 * tag patterns and generate insights.
 * Can be called on-demand or by the scheduled job.
 * Expects: { date?: string } — defaults to today
 */
exports.generateDailySnapshot = onCall(
  { region: 'europe-west2', secrets: [anthropicApiKey], timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const clientId = await getClientId(request.auth.uid);
    if (!clientId) throw new HttpsError('not-found', 'Client profile not found.');

    const date = request.data.date || todayString();
    return await buildDailySnapshot(clientId, date);
  }
);

/**
 * Scheduled daily snapshot generation — runs at 11 PM UK time.
 * Generates snapshots for all active users.
 */
exports.scheduledDailySnapshot = onSchedule(
  { schedule: '0 23 * * *', timeZone: 'Europe/London', region: 'europe-west2', secrets: [anthropicApiKey], memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    const today = todayString();

    // Find all clients who logged at least one thing today
    const [nutritionSnap, habitSnap, checkInSnap] = await Promise.all([
      db.collection('nutritionLogs').where('date', '==', today).get(),
      db.collection('habitLogs').where('date', '==', today).get(),
      db.collection('dailyCheckIns').where('date', '==', today).get(),
    ]);

    // Collect unique client IDs from all sources
    const activeClients = new Set();
    [nutritionSnap, habitSnap, checkInSnap].forEach(snap => {
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.clientId) activeClients.add(data.clientId);
      });
    });

    let generated = 0;
    const errors = [];
    for (const cId of activeClients) {
      try {
        await buildDailySnapshot(cId, today);
        generated++;
      } catch (err) {
        errors.push({ clientId: cId, error: err.message });
      }
    }

    console.log(`Daily snapshots: ${generated} generated, ${errors.length} errors`);
    if (errors.length > 0) console.error('Snapshot errors:', errors);
  }
);

/**
 * Core snapshot builder — shared between on-demand and scheduled.
 */
async function buildDailySnapshot(clientId, date) {
  // Gather all data for this day
  const [
    checkInSnap,
    nutritionLogSnap,
    nutritionTargetSnap,
    habitLogSnap,
    workoutLogSnap,
    activityLogSnap,
    prevSnapshotsSnap,
  ] = await Promise.all([
    db.collection('dailyCheckIns').doc(`${clientId}_${date}`).get(),
    db.collection('nutritionLogs').doc(`${clientId}_${date}`).get(),
    db.collection('nutritionTargets').doc(clientId).get(),
    db.collection('habitLogs').doc(`${clientId}_${date}`).get(),
    db.collection('workoutLogs').where('clientId', '==', clientId).where('date', '==', date).limit(5).get(),
    db.collection('activityLogs').where('clientId', '==', clientId).where('date', '==', date).limit(10).get(),
    db.collection('dailySnapshots').where('clientId', '==', clientId).orderBy('date', 'desc').limit(14).get(),
  ]);

  const checkIn = checkInSnap.exists ? checkInSnap.data() : {};
  const nutritionLog = nutritionLogSnap.exists ? nutritionLogSnap.data() : {};
  const targets = nutritionTargetSnap.exists ? nutritionTargetSnap.data() : {};
  const habitLog = habitLogSnap.exists ? habitLogSnap.data() : {};
  const workouts = workoutLogSnap.docs.map(d => d.data());
  const activities = activityLogSnap.docs.map(d => d.data());
  const previousSnapshots = prevSnapshotsSnap.docs.map(d => d.data());

  // Calculate nutrition adherence
  const entries = nutritionLog.entries || [];
  const consumed = entries.reduce((acc, e) => ({
    calories: acc.calories + (e.calories || 0),
    protein: acc.protein + (e.protein || 0),
    carbs: acc.carbs + (e.carbs || 0),
    fats: acc.fats + (e.fats || 0),
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const targetCals = targets.calories || 2000;
  const targetProtein = targets.protein || 150;
  const nutritionAdherence = targetCals > 0
    ? Math.min(1, consumed.calories / targetCals)
    : 0;
  const proteinAdherence = targetProtein > 0
    ? Math.min(1, consumed.protein / targetProtein)
    : 0;

  const trainedToday = workouts.length > 0;
  const totalTrainingMinutes = workouts.reduce((sum, w) => sum + (w.durationMinutes || 0), 0)
    + activities.reduce((sum, a) => sum + (a.durationMinutes || 0), 0);

  // Build the raw snapshot data
  const snapshotData = {
    clientId,
    date,
    recoveryScore: checkIn.recoveryScore || null,
    recoveryGrade: checkIn.recoveryGrade || null,
    sleepHours: checkIn.sleepHours || null,
    energy: checkIn.energy || null,
    mood: checkIn.mood || null,
    stress: checkIn.stress || null,
    nutrition: {
      consumed,
      targets: { calories: targetCals, protein: targetProtein, carbs: targets.carbs, fats: targets.fats },
      adherence: Math.round(nutritionAdherence * 100),
      proteinAdherence: Math.round(proteinAdherence * 100),
      mealsLogged: entries.length,
    },
    nutritionAdherence: Math.round(nutritionAdherence * 100),
    trainedToday,
    trainingMinutes: totalTrainingMinutes,
    habitsCompleted: habitLog.completedCount || 0,
    habitsTotal: habitLog.totalCount || 0,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Use Claude to generate tags and insights from the day's data
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    const tagPrompt = `You are an AI pattern tagger for a fitness app. Analyse this day's data and generate:
1. Tags: short descriptive labels for pattern matching (e.g., "under_ate", "high_recovery", "rest_day", "heavy_training", "poor_sleep", "protein_target_hit", "low_energy")
2. A brief outcome summary (1 sentence)
3. Any notable patterns when compared to recent history

Return ONLY valid JSON:
{
  "tags": ["tag1", "tag2", "tag3"],
  "outcome": "Brief 1-sentence day summary",
  "patterns": ["Pattern observation 1"],
  "nextDayAdvice": "One sentence of advice for tomorrow based on today"
}

Today's data:
${JSON.stringify(snapshotData, null, 2)}

Recent 14-day history (most recent first):
${JSON.stringify(previousSnapshots.map(s => ({ date: s.date, tags: s.tags, recoveryScore: s.recoveryScore, nutritionAdherence: s.nutritionAdherence, trainedToday: s.trainedToday, outcome: s.outcome })), null, 2)}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: tagPrompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const aiResult = JSON.parse(jsonMatch[0]);
      snapshotData.tags = aiResult.tags || [];
      snapshotData.outcome = aiResult.outcome || '';
      snapshotData.patterns = aiResult.patterns || [];
      snapshotData.nextDayAdvice = aiResult.nextDayAdvice || '';
    }
  } catch (aiErr) {
    console.error('AI tagging failed, saving snapshot without tags:', aiErr.message);
    snapshotData.tags = [];
    snapshotData.outcome = '';
    snapshotData.patterns = [];
  }

  await db.collection('dailySnapshots').doc(`${clientId}_${date}`).set(snapshotData, { merge: true });
  return snapshotData;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL 4: ENHANCED MEAL ANALYSIS (Context-Aware)
// Analyses a meal photo WITH knowledge of remaining daily macros and goals
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context-aware meal analysis — same as analyseMeal but also returns
 * guidance on how this meal fits into the user's remaining daily targets.
 * Expects: { imageBase64: string, mimeType: string, mealType?: string }
 * Returns: { items, totals, confidence, dailyImpact: { remaining, advice } }
 */
exports.analyseMealWithContext = onCall(
  { region: 'europe-west2', secrets: [anthropicApiKey], timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const clientId = await getClientId(request.auth.uid);
    if (!clientId) throw new HttpsError('not-found', 'Client profile not found.');

    // Rate limit check
    const today = todayString();
    const usageRef = db.collection('scanUsage').doc(`${clientId}_${today}`);
    const usageSnap = await usageRef.get();
    const currentCount = usageSnap.exists ? (usageSnap.data().count || 0) : 0;
    if (currentCount >= 10) {
      throw new HttpsError('resource-exhausted', 'Daily scan limit reached (10/day).');
    }

    const { imageBase64, mimeType, mealType } = request.data;
    if (!imageBase64 || !mimeType) {
      throw new HttpsError('invalid-argument', 'imageBase64 and mimeType are required.');
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
      throw new HttpsError('invalid-argument', 'Unsupported image type.');
    }
    if (imageBase64.length > 5_500_000) {
      throw new HttpsError('invalid-argument', 'Image too large.');
    }

    // Fetch daily context
    const [nutritionTargetSnap, nutritionLogSnap] = await Promise.all([
      db.collection('nutritionTargets').doc(clientId).get(),
      db.collection('nutritionLogs').doc(`${clientId}_${today}`).get(),
    ]);

    const targets = nutritionTargetSnap.exists ? nutritionTargetSnap.data() : {};
    const logData = nutritionLogSnap.exists ? nutritionLogSnap.data() : {};
    const entries = logData.entries || [];
    const consumed = entries.reduce((acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fats: acc.fats + (e.fats || 0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

    const remaining = {
      calories: (targets.calories || 2000) - consumed.calories,
      protein: (targets.protein || 150) - consumed.protein,
      carbs: (targets.carbs || 200) - consumed.carbs,
      fats: (targets.fats || 70) - consumed.fats,
    };

    const now = new Date();
    const hour = now.getHours();
    const mealsLeftEstimate = hour < 10 ? 3 : hour < 14 ? 2 : hour < 18 ? 1 : 0;

    const systemPrompt = `You are a nutrition analysis AI for Mind Core Fitness. Analyse the meal photo and estimate macronutrients. Then provide contextual advice based on the user's remaining daily targets.

CONTEXT:
- Time: ${now.toLocaleTimeString('en-GB')}
- Meal type: ${mealType || 'unknown'}
- Daily targets: ${JSON.stringify(targets)}
- Already consumed today: ${JSON.stringify(consumed)}
- Remaining: ${JSON.stringify(remaining)}
- Estimated meals left today: ${mealsLeftEstimate}

Rules:
- Identify each food item, estimate portions, calculate macros
- Round all numbers to whole integers
- Provide brief contextual advice on how this meal fits their remaining targets
- Return ONLY valid JSON

Response format:
{
  "items": [
    { "name": "Food item", "estimatedGrams": 150, "calories": 248, "protein": 46, "carbs": 0, "fats": 5 }
  ],
  "totals": { "calories": 520, "protein": 48, "carbs": 62, "fats": 8 },
  "confidence": "medium",
  "dailyImpact": {
    "remainingAfterMeal": { "calories": 1480, "protein": 102, "carbs": 138, "fats": 62 },
    "advice": "1-2 sentence advice on what to focus on for remaining meals",
    "proteinOnTrack": true
  }
}`;

    const Anthropic = require('@anthropic-ai/sdk');
    const anthropicClient = new Anthropic({ apiKey: anthropicApiKey.value() });

    try {
      const response = await anthropicClient.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 768,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: 'Analyse this meal photo, estimate macros, and give contextual advice on how it fits my remaining daily targets.' },
          ],
        }],
      });

      const text = response.content[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new SyntaxError('No JSON found');
      const result = JSON.parse(jsonMatch[0]);

      if (!result.items || !result.totals) {
        throw new Error('Invalid response structure');
      }

      return result;
    } catch (err) {
      console.error('analyseMealWithContext error:', err?.message || err);
      if (err instanceof HttpsError) throw err;
      if (err instanceof SyntaxError) {
        throw new HttpsError('failed-precondition', 'AI returned unexpected format. Please try again.');
      }
      if (err?.status === 429) {
        throw new HttpsError('resource-exhausted', 'Too many requests — please wait.');
      }
      throw new HttpsError('internal', 'Failed to analyse meal. Please try again.');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// SMART COACHING NOTIFICATIONS
// Context-aware nudges — replaces generic morning/evening messages with
// personalised coaching insights
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Midday coaching nudge — runs at 1 PM UK time.
 * Checks each user's morning state and sends personalised nutrition/activity advice.
 */
exports.middayCoachingNudge = onSchedule(
  { schedule: '0 13 * * *', timeZone: 'Europe/London', region: 'europe-west2' },
  async () => {
    const today = todayString();

    // Find users who have checked in today
    const checkInsSnap = await db.collection('dailyCheckIns')
      .where('date', '==', today)
      .get();

    const batch = db.batch();
    let count = 0;

    for (const doc of checkInsSnap.docs) {
      const checkIn = doc.data();
      const cId = checkIn.clientId;
      if (!cId) continue;

      // Check if user has FCM tokens and allows notifications
      const clientDoc = await db.collection('clients').doc(cId).get();
      if (!clientDoc.exists) continue;
      const clientData = clientDoc.data();
      if (!clientData.fcmTokens || clientData.fcmTokens.length === 0) continue;
      if (clientData.notificationPrefs?.coaching === false) continue;

      // Check nutrition progress
      const nutritionSnap = await db.collection('nutritionLogs').doc(`${cId}_${today}`).get();
      const nutritionData = nutritionSnap.exists ? nutritionSnap.data() : {};
      const entries = nutritionData.entries || [];
      const consumed = entries.reduce((acc, e) => ({
        calories: acc.calories + (e.calories || 0),
        protein: acc.protein + (e.protein || 0),
      }), { calories: 0, protein: 0 });

      const targetSnap = await db.collection('nutritionTargets').doc(cId).get();
      const targets = targetSnap.exists ? targetSnap.data() : {};

      // Generate contextual nudge
      let title, body;
      const recoveryScore = checkIn.recoveryScore || 70;
      const proteinPct = targets.protein ? Math.round((consumed.protein / targets.protein) * 100) : 0;
      const calPct = targets.calories ? Math.round((consumed.calories / targets.calories) * 100) : 0;

      if (entries.length === 0) {
        title = 'Time to Fuel Up';
        body = 'No meals logged yet today. Your body needs fuel — even a quick scan of your lunch helps keep you on track.';
      } else if (proteinPct < 30) {
        title = 'Protein Check';
        body = `You're at ${consumed.protein}g protein (${proteinPct}% of target). Try to pack protein into your next meals to hit your goal.`;
      } else if (calPct < 25) {
        title = 'Under-Eating Alert';
        body = `Only ${calPct}% of your calories logged by midday. Make sure you're eating enough to fuel your ${recoveryScore >= 70 ? 'training' : 'recovery'}.`;
      } else if (recoveryScore < 50) {
        title = 'Recovery Day Reminder';
        body = `Recovery score: ${recoveryScore}/100. Focus on hydration, easy movement, and hitting your protein target today.`;
      } else {
        title = 'Afternoon Check-In';
        body = `${calPct}% of calories logged, ${proteinPct}% protein. ${recoveryScore >= 70 ? 'You\'re recovered well — great day for a solid session!' : 'Listen to your body and keep fuelling well.'}`;
      }

      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        toId: cId,
        fromId: 'system',
        fromName: 'Core Buddy',
        type: 'coaching_nudge',
        title,
        body,
        read: false,
        createdAt: new Date(),
      });
      count++;
    }

    if (count > 0) await batch.commit();
    console.log(`Midday coaching nudge sent to ${count} clients`);
  }
);

/**
 * Query similar past days for pattern matching.
 * Used by coaching plan to find "last time this happened, here's what worked".
 * Expects: { tags: string[], limit?: number }
 * Returns: { matches: [{ date, tags, outcome, nextDayAdvice, recoveryScore }] }
 */
exports.findSimilarDays = onCall(
  { region: 'europe-west2', timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.');
    }

    const clientId = await getClientId(request.auth.uid);
    if (!clientId) throw new HttpsError('not-found', 'Client profile not found.');

    const searchTags = request.data.tags || [];
    const limit = Math.min(request.data.limit || 5, 20);

    if (searchTags.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one tag is required.');
    }

    // Firestore array-contains can only match one tag at a time,
    // so we query the most distinctive tag and filter in memory
    const snapshotsSnap = await db.collection('dailySnapshots')
      .where('clientId', '==', clientId)
      .where('tags', 'array-contains', searchTags[0])
      .orderBy('date', 'desc')
      .limit(50)
      .get();

    // Score matches by number of overlapping tags
    const matches = snapshotsSnap.docs
      .map(doc => {
        const data = doc.data();
        const overlap = (data.tags || []).filter(t => searchTags.includes(t)).length;
        return { ...data, matchScore: overlap };
      })
      .filter(m => m.matchScore >= Math.max(1, Math.floor(searchTags.length / 2)))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit)
      .map(({ clientId: _cId, updatedAt, ...rest }) => rest); // strip internal fields

    return { matches };
  }
);
