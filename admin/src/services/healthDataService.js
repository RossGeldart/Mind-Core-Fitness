/**
 * Health Data Service — reads HealthKit (iOS) and Health Connect (Android)
 * data via @capgo/capacitor-health and syncs to Firestore.
 *
 * Native only — does nothing on web. Guarded by Capacitor.isNativePlatform().
 * Data read: sleep, steps, active calories.
 */
import { Capacitor } from '@capacitor/core';
import { Health } from '@capgo/capacitor-health';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// ── Helpers ──

function todayString() {
  return new Date().toISOString().split('T')[0];
}

/** Start of today (midnight local time) */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start of yesterday (for sleep data that spans overnight) */
function startOfYesterday() {
  const d = startOfToday();
  d.setDate(d.getDate() - 1);
  return d;
}

// ── Permissions ──

/**
 * Check if health data is available on this device.
 * Returns false on web or unsupported devices.
 */
export async function isHealthAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await Health.isAvailable();
    return available;
  } catch {
    return false;
  }
}

/**
 * Request permission to read sleep, steps, and active calories.
 * Should be called once (e.g. first app open after update).
 * The OS shows its own permission dialog — we don't control the UI.
 */
export async function requestHealthPermissions() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await Health.requestAuthorization({
      read: ['steps', 'sleep', 'calories'],
      write: [],
    });
    return true;
  } catch (err) {
    console.warn('Health permission request failed:', err);
    return false;
  }
}

// ── Data Reading ──

/**
 * Read today's step count.
 * Returns total steps as a number.
 */
export async function readStepsToday() {
  try {
    const { samples } = await Health.readSamples({
      dataType: 'steps',
      startDate: startOfToday().toISOString(),
      endDate: new Date().toISOString(),
      limit: 1000,
    });
    // Sum all step samples for today
    return samples.reduce((total, s) => total + (s.value || 0), 0);
  } catch (err) {
    console.warn('Failed to read steps:', err);
    return 0;
  }
}

/**
 * Read today's active calories burned.
 * Returns total active calories as a number.
 */
export async function readActiveCaloriesToday() {
  try {
    const { samples } = await Health.readSamples({
      dataType: 'calories',
      startDate: startOfToday().toISOString(),
      endDate: new Date().toISOString(),
      limit: 1000,
    });
    return Math.round(samples.reduce((total, s) => total + (s.value || 0), 0));
  } catch (err) {
    console.warn('Failed to read active calories:', err);
    return 0;
  }
}

/**
 * Read last night's sleep data.
 * Queries from yesterday 6 PM to today noon to capture overnight sleep.
 * Returns { totalMinutes, stages: { awake, light, deep, rem, asleep } }
 */
export async function readSleepLastNight() {
  try {
    // Sleep sessions typically span from evening to morning
    const queryStart = new Date(startOfYesterday());
    queryStart.setHours(18, 0, 0, 0); // yesterday 6 PM
    const queryEnd = new Date(startOfToday());
    queryEnd.setHours(12, 0, 0, 0); // today noon

    const { samples } = await Health.readSamples({
      dataType: 'sleep',
      startDate: queryStart.toISOString(),
      endDate: queryEnd.toISOString(),
      limit: 500,
    });

    if (!samples || samples.length === 0) {
      return { totalMinutes: 0, totalHours: 0, stages: {} };
    }

    // Tally minutes per sleep stage
    const stages = { awake: 0, light: 0, deep: 0, rem: 0, asleep: 0 };
    let totalMinutes = 0;

    for (const sample of samples) {
      const minutes = sample.value || 0;
      const state = (sample.sleepState || 'asleep').toLowerCase();

      if (state === 'awake') {
        stages.awake += minutes;
        // Don't count awake time toward total sleep
      } else {
        totalMinutes += minutes;
        if (stages[state] !== undefined) {
          stages[state] += minutes;
        } else {
          stages.asleep += minutes;
        }
      }
    }

    return {
      totalMinutes: Math.round(totalMinutes),
      totalHours: Math.round((totalMinutes / 60) * 10) / 10, // 1 decimal place
      stages: {
        awake: Math.round(stages.awake),
        light: Math.round(stages.light),
        deep: Math.round(stages.deep),
        rem: Math.round(stages.rem),
        asleep: Math.round(stages.asleep),
      },
    };
  } catch (err) {
    console.warn('Failed to read sleep:', err);
    return { totalMinutes: 0, totalHours: 0, stages: {} };
  }
}

// ── Sync to Firestore ──

/**
 * Read all health data and sync to Firestore healthData/{clientId}_{date}.
 * Call this on app open/resume.
 *
 * @param {string} clientId - The user's client document ID
 * @returns {Object|null} - The synced health data, or null if unavailable
 */
export async function syncHealthData(clientId) {
  if (!Capacitor.isNativePlatform()) return null;
  if (!clientId) return null;

  const available = await isHealthAvailable();
  if (!available) return null;

  // Request permissions (no-ops if already granted)
  const granted = await requestHealthPermissions();
  if (!granted) return null;

  // Read all data in parallel
  const [steps, activeCalories, sleep] = await Promise.all([
    readStepsToday(),
    readActiveCaloriesToday(),
    readSleepLastNight(),
  ]);

  const today = todayString();
  const healthData = {
    clientId,
    date: today,
    steps,
    activeCalories,
    sleep,
    syncedAt: serverTimestamp(),
    platform: Capacitor.getPlatform(), // 'ios' or 'android'
  };

  // Write to Firestore
  try {
    const docRef = doc(db, 'healthData', `${clientId}_${today}`);
    await setDoc(docRef, healthData, { merge: true });
  } catch (err) {
    console.warn('Failed to sync health data to Firestore:', err);
  }

  return healthData;
}
