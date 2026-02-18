import { describe, it, expect } from 'vitest';
import BADGE_DEFS from './badgeConfig';

const VALID_CATEGORIES = ['workouts', 'streaks', 'pbs', 'nutrition', 'leaderboard', 'habits'];

describe('BADGE_DEFS integrity', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(BADGE_DEFS)).toBe(true);
    expect(BADGE_DEFS.length).toBeGreaterThan(0);
  });

  it('every badge has a unique id', () => {
    const ids = BADGE_DEFS.map(b => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every badge has required fields: id, name, desc, category, threshold', () => {
    for (const badge of BADGE_DEFS) {
      expect(badge.id, `${badge.id} missing id`).toBeTruthy();
      expect(badge.name, `${badge.id} missing name`).toBeTruthy();
      expect(badge.desc, `${badge.id} missing desc`).toBeTruthy();
      expect(badge.category, `${badge.id} missing category`).toBeTruthy();
      expect(typeof badge.threshold, `${badge.id} threshold type`).toBe('number');
    }
  });

  it('every badge has a valid category', () => {
    for (const badge of BADGE_DEFS) {
      expect(VALID_CATEGORIES, `${badge.id} has unknown category "${badge.category}"`).toContain(badge.category);
    }
  });

  it('all thresholds are positive integers', () => {
    for (const badge of BADGE_DEFS) {
      expect(badge.threshold).toBeGreaterThan(0);
      expect(Number.isInteger(badge.threshold)).toBe(true);
    }
  });

  it('workout badge thresholds are in ascending order', () => {
    const workoutBadges = BADGE_DEFS.filter(b => b.category === 'workouts');
    const thresholds = workoutBadges.map(b => b.threshold);
    const sorted = [...thresholds].sort((a, b) => a - b);
    expect(thresholds).toEqual(sorted);
  });

  it('streak badge thresholds are in ascending order', () => {
    const streakBadges = BADGE_DEFS.filter(b => b.category === 'streaks');
    const thresholds = streakBadges.map(b => b.threshold);
    const sorted = [...thresholds].sort((a, b) => a - b);
    expect(thresholds).toEqual(sorted);
  });

  it('every badge id matches its category prefix convention', () => {
    for (const badge of BADGE_DEFS) {
      // leaderboard_join is a special case with its own prefix
      if (badge.id === 'leaderboard_join') continue;
      const categoryPrefixMap = {
        workouts: ['first_workout', 'workouts_'],
        streaks: ['streak_'],
        pbs: ['first_pb', 'pbs_'],
        nutrition: ['nutrition_'],
        leaderboard: ['leaderboard_'],
        habits: ['habits_'],
      };
      const prefixes = categoryPrefixMap[badge.category] || [];
      const matches = prefixes.some(prefix => badge.id.startsWith(prefix));
      expect(matches, `badge id "${badge.id}" doesn't match any prefix for category "${badge.category}"`).toBe(true);
    }
  });
});
