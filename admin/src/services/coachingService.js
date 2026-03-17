/**
 * Coaching Service — frontend utilities for the AI Health Coaching system.
 * Wraps Cloud Functions calls and provides local helpers.
 */
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { functions, db } from '../config/firebase';

// ── Cloud Function callables ──

const calculateRecoveryScoreFn = httpsCallable(functions, 'calculateRecoveryScore');
const generateCoachingPlanFn = httpsCallable(functions, 'generateCoachingPlan');
const generateDailySnapshotFn = httpsCallable(functions, 'generateDailySnapshot');
const analyseMealWithContextFn = httpsCallable(functions, 'analyseMealWithContext');
const findSimilarDaysFn = httpsCallable(functions, 'findSimilarDays');

// ── Recovery Score ──

/**
 * Calculate recovery score from check-in data.
 * @param {Object} checkInData - sleep, HRV, resting HR, training load, nutrition, soreness
 * @returns {Promise<{score, grade, components, recommendation}>}
 */
export async function calculateRecoveryScore(checkInData) {
  const { data } = await calculateRecoveryScoreFn(checkInData);
  return data;
}

// ── Coaching Plan ──

/**
 * Generate personalised coaching plan for a given day.
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {Promise<{morningPlan, blocks, keyInsights, adjustedMacros, trainingAdvice}>}
 */
export async function generateCoachingPlan(date) {
  const { data } = await generateCoachingPlanFn({ date });
  return data;
}

/**
 * Get cached coaching plan from Firestore (avoids re-generating).
 * @param {string} clientId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function getCachedCoachingPlan(clientId, date) {
  const docRef = doc(db, 'coachingInsights', `${clientId}_${date}`);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data().plan : null;
}

// ── Pattern Memory ──

/**
 * Generate daily snapshot (end-of-day aggregation with AI tags).
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {Promise<Object>}
 */
export async function generateDailySnapshot(date) {
  const { data } = await generateDailySnapshotFn({ date });
  return data;
}

/**
 * Find similar past days by tags.
 * @param {string[]} tags - tags to search for
 * @param {number} [limit=5]
 * @returns {Promise<{matches: Array}>}
 */
export async function findSimilarDays(tags, limit = 5) {
  const { data } = await findSimilarDaysFn({ tags, limit });
  return data;
}

// ── Context-Aware Meal Analysis ──

/**
 * Analyse a meal photo with knowledge of remaining daily macros.
 * @param {string} imageBase64
 * @param {string} mimeType
 * @param {string} [mealType]
 * @returns {Promise<{items, totals, confidence, dailyImpact}>}
 */
export async function analyseMealWithContext(imageBase64, mimeType, mealType) {
  const { data } = await analyseMealWithContextFn({ imageBase64, mimeType, mealType });
  return data;
}

// ── Daily Check-In helpers ──

/**
 * Save a morning/evening check-in to Firestore.
 * @param {string} clientId
 * @param {string} date - YYYY-MM-DD
 * @param {Object} checkInData - energy, mood, stress, soreness, sleepHours, etc.
 */
export async function saveCheckIn(clientId, date, checkInData) {
  const docRef = doc(db, 'dailyCheckIns', `${clientId}_${date}`);
  await setDoc(docRef, {
    clientId,
    date,
    ...checkInData,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Get today's check-in data.
 * @param {string} clientId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function getCheckIn(clientId, date) {
  const docRef = doc(db, 'dailyCheckIns', `${clientId}_${date}`);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
}

/**
 * Get the daily snapshot for pattern review.
 * @param {string} clientId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function getDailySnapshot(clientId, date) {
  const docRef = doc(db, 'dailySnapshots', `${clientId}_${date}`);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() : null;
}

// ── Health Data sync helper ──

/**
 * Save raw health data from HealthKit/Health Connect to Firestore.
 * @param {string} clientId
 * @param {string} date - YYYY-MM-DD
 * @param {Object} healthData - sleep, heartRate, hrv, steps, activeCalories, etc.
 */
export async function saveHealthData(clientId, date, healthData) {
  const docRef = doc(db, 'healthData', `${clientId}_${date}`);
  await setDoc(docRef, {
    clientId,
    date,
    ...healthData,
    syncedAt: serverTimestamp(),
  }, { merge: true });
}
