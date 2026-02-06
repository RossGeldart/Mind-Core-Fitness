// Shared schedule configuration and utilities

// Working hours configuration
export const SCHEDULE = {
  monday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  tuesday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  wednesday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  thursday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  friday: { morning: { start: '08:00', end: '10:00' }, afternoon: null }
};

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const formatTime = (time) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes}${ampm}`;
};

export const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const addMinutesToTime = (time, minutes) => {
  const totalMinutes = timeToMinutes(time) + minutes;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Generate time slots for a specific day
export const generateTimeSlotsForDay = (dayName) => {
  const schedule = SCHEDULE[dayName];
  if (!schedule) return [];

  const slots = [];

  if (schedule.morning) {
    let current = schedule.morning.start;
    while (current < schedule.morning.end) {
      slots.push({ time: current, period: 'morning' });
      current = addMinutesToTime(current, 15);
    }
  }

  if (schedule.afternoon) {
    let current = schedule.afternoon.start;
    while (current < schedule.afternoon.end) {
      slots.push({ time: current, period: 'afternoon' });
      current = addMinutesToTime(current, 15);
    }
  }

  return slots;
};

// Check if a date is a weekday (Mon-Fri)
export const isWeekday = (date) => {
  const day = date.getDay();
  return day >= 1 && day <= 5;
};

// Get day name from date
export const getDayName = (date) => {
  const day = date.getDay();
  if (day === 0 || day === 6) return null; // Weekend
  return DAYS[day - 1];
};

// Check if a time slot is available
export const isSlotAvailable = (date, time, sessionDuration, sessions, holidays, excludeSessionId = null, blockedTimes = []) => {
  const dayName = getDayName(date);
  if (!dayName) return false;

  const dateKey = formatDateKey(date);

  // Check if it's a holiday
  if (holidays.some(h => h.date === dateKey)) return false;

  // Check if any time during the session is blocked
  // For a 45-min session starting at 9:15, check 9:15, 9:30, and 9:45
  const slotsToCheck = Math.ceil(sessionDuration / 15);
  for (let i = 0; i < slotsToCheck; i++) {
    const checkTime = addMinutesToTime(time, i * 15);
    if (blockedTimes.some(bt => bt.date === dateKey && bt.time === checkTime)) return false;
  }

  // Check if slot is in the past
  const now = new Date();
  const today = formatDateKey(now);
  if (dateKey < today) return false;
  if (dateKey === today) {
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (time < currentTime) return false;
  }

  // Check if slot overlaps with any existing session
  const endTime = addMinutesToTime(time, sessionDuration);
  const schedule = SCHEDULE[dayName];

  // Check if the slot fits within working hours
  const startsInMorning = schedule.morning && time >= schedule.morning.start && time < schedule.morning.end;
  const startsInAfternoon = schedule.afternoon && time >= schedule.afternoon.start && time < schedule.afternoon.end;
  const isEndInMorning = schedule.morning && endTime <= schedule.morning.end;
  const isEndInAfternoon = schedule.afternoon && endTime <= schedule.afternoon.end;

  if (startsInMorning && !isEndInMorning) return false;
  if (startsInAfternoon && !isEndInAfternoon) return false;
  if (!startsInMorning && !startsInAfternoon) return false;

  // Check for overlapping sessions
  for (const session of sessions) {
    // Skip the session being rescheduled
    if (excludeSessionId && session.id === excludeSessionId) continue;
    if (session.date !== dateKey) continue;

    const sessionStart = timeToMinutes(session.time);
    const sessionEnd = sessionStart + (session.duration || 45);
    const slotStart = timeToMinutes(time);
    const slotEnd = slotStart + sessionDuration;

    if (slotStart < sessionEnd && slotEnd > sessionStart) {
      return false;
    }
  }

  return true;
};

// Get all available slots for a specific date
export const getAvailableSlotsForDate = (date, sessionDuration, sessions, holidays, excludeSessionId = null, blockedTimes = []) => {
  const dayName = getDayName(date);
  if (!dayName) return [];

  const allSlots = generateTimeSlotsForDay(dayName);
  return allSlots.filter(slot => isSlotAvailable(date, slot.time, sessionDuration, sessions, holidays, excludeSessionId, blockedTimes));
};
