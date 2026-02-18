import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDateKey,
  timeToMinutes,
  addMinutesToTime,
  generateTimeSlotsForDay,
  isWeekday,
  getDayName,
} from './scheduleUtils';

describe('formatTime', () => {
  it('formats morning time correctly', () => {
    expect(formatTime('06:15')).toBe('6:15am');
  });

  it('formats noon correctly', () => {
    expect(formatTime('12:00')).toBe('12:00pm');
  });

  it('formats afternoon time correctly', () => {
    expect(formatTime('15:30')).toBe('3:30pm');
  });

  it('formats midnight correctly', () => {
    expect(formatTime('00:00')).toBe('12:00am');
  });
});

describe('formatDateKey', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(formatDateKey(new Date(2024, 0, 5))).toBe('2024-01-05');
  });

  it('pads month and day with leading zeros', () => {
    expect(formatDateKey(new Date(2024, 8, 9))).toBe('2024-09-09');
  });
});

describe('timeToMinutes', () => {
  it('converts 00:00 to 0 minutes', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('converts 06:15 correctly', () => {
    expect(timeToMinutes('06:15')).toBe(375);
  });

  it('converts 12:00 to 720 minutes', () => {
    expect(timeToMinutes('12:00')).toBe(720);
  });

  it('converts 15:30 correctly', () => {
    expect(timeToMinutes('15:30')).toBe(930);
  });
});

describe('addMinutesToTime', () => {
  it('adds 15 minutes to 06:15', () => {
    expect(addMinutesToTime('06:15', 15)).toBe('06:30');
  });

  it('handles hour rollover', () => {
    expect(addMinutesToTime('11:45', 15)).toBe('12:00');
  });

  it('adds 0 minutes unchanged', () => {
    expect(addMinutesToTime('09:00', 0)).toBe('09:00');
  });

  it('adds 60 minutes (1 hour)', () => {
    expect(addMinutesToTime('08:00', 60)).toBe('09:00');
  });
});

describe('isWeekday', () => {
  it('returns true for Monday', () => {
    // 2024-01-01 is a Monday
    expect(isWeekday(new Date(2024, 0, 1))).toBe(true);
  });

  it('returns true for Friday', () => {
    // 2024-01-05 is a Friday
    expect(isWeekday(new Date(2024, 0, 5))).toBe(true);
  });

  it('returns false for Saturday', () => {
    // 2024-01-06 is a Saturday
    expect(isWeekday(new Date(2024, 0, 6))).toBe(false);
  });

  it('returns false for Sunday', () => {
    // 2024-01-07 is a Sunday
    expect(isWeekday(new Date(2024, 0, 7))).toBe(false);
  });
});

describe('getDayName', () => {
  it('returns monday for a Monday date', () => {
    expect(getDayName(new Date(2024, 0, 1))).toBe('monday');
  });

  it('returns friday for a Friday date', () => {
    expect(getDayName(new Date(2024, 0, 5))).toBe('friday');
  });

  it('returns null for Saturday', () => {
    expect(getDayName(new Date(2024, 0, 6))).toBeNull();
  });

  it('returns null for Sunday', () => {
    expect(getDayName(new Date(2024, 0, 7))).toBeNull();
  });
});

describe('generateTimeSlotsForDay', () => {
  it('returns empty array for unknown day', () => {
    expect(generateTimeSlotsForDay('saturday')).toEqual([]);
  });

  it('generates slots for monday in 15-min increments', () => {
    const slots = generateTimeSlotsForDay('monday');
    expect(slots.length).toBeGreaterThan(0);
    // First slot should be morning start
    expect(slots[0]).toEqual({ time: '06:15', period: 'morning' });
  });

  it('all morning slots have period "morning"', () => {
    const slots = generateTimeSlotsForDay('tuesday');
    const morningSlots = slots.filter(s => s.period === 'morning');
    expect(morningSlots.every(s => s.time >= '06:15' && s.time < '12:00')).toBe(true);
  });

  it('all afternoon slots have period "afternoon"', () => {
    const slots = generateTimeSlotsForDay('wednesday');
    const afternoonSlots = slots.filter(s => s.period === 'afternoon');
    expect(afternoonSlots.length).toBeGreaterThan(0);
    expect(afternoonSlots.every(s => s.time >= '15:00' && s.time < '20:00')).toBe(true);
  });

  it('consecutive slots are exactly 15 minutes apart', () => {
    const slots = generateTimeSlotsForDay('monday');
    // Check within the morning block
    const morningSlots = slots.filter(s => s.period === 'morning');
    for (let i = 1; i < morningSlots.length; i++) {
      const diff = timeToMinutes(morningSlots[i].time) - timeToMinutes(morningSlots[i - 1].time);
      expect(diff).toBe(15);
    }
  });
});
