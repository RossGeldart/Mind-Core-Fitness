import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import './Availability.css';

// Working hours configuration
const SCHEDULE = {
  monday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  tuesday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  wednesday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  thursday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  friday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '12:00', end: '17:00' }, defaultBlocked: true }
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const formatTime = (time) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes}${ampm}`;
};

const formatDateKey = (date) => {
  // Use local date to avoid timezone issues
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekDates = (date) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);

  return DAYS.map((_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return d;
  });
};

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const addMinutesToTime = (time, minutes) => {
  const totalMinutes = timeToMinutes(time) + minutes;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Generate time slots for a specific day
const generateTimeSlotsForDay = (dayName) => {
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

export default function Availability() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [openedSlots, setOpenedSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionDuration, setSessionDuration] = useState(45);

  useEffect(() => {
    setWeekDates(getWeekDates(currentDate));
  }, [currentDate]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
      const sessionsData = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(sessionsData);

      const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
      const holidaysData = holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHolidays(holidaysData);

      const blockedTimesSnapshot = await getDocs(collection(db, 'blockedTimes'));
      setBlockedTimes(blockedTimesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const openedSlotsSnapshot = await getDocs(collection(db, 'openedSlots'));
      setOpenedSlots(openedSlotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isHoliday = (date) => {
    const dateKey = formatDateKey(date);
    return holidays.some(h => h.date === dateKey);
  };

  const isSlotAvailable = (date, time) => {
    const dayName = DAYS[date.getDay() - 1];
    if (!dayName) return false;

    if (isHoliday(date)) return false;

    const dateKey = formatDateKey(date);
    const schedule = SCHEDULE[dayName];

    const slotsToCheck = Math.ceil(sessionDuration / 15);

    // For defaultBlocked days: slot must be explicitly opened
    if (schedule.defaultBlocked) {
      for (let i = 0; i < slotsToCheck; i++) {
        const checkTime = addMinutesToTime(time, i * 15);
        if (!openedSlots.some(os => os.date === dateKey && os.time === checkTime)) return false;
      }
    } else {
      // Normal days: check if any time is blocked
      for (let i = 0; i < slotsToCheck; i++) {
        const checkTime = addMinutesToTime(time, i * 15);
        if (blockedTimes.some(bt => bt.date === dateKey && bt.time === checkTime)) return false;
      }
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

    // Check if the slot fits within working hours
    const startsInMorning = schedule.morning && time >= schedule.morning.start && time < schedule.morning.end;
    const startsInAfternoon = schedule.afternoon && time >= schedule.afternoon.start && time < schedule.afternoon.end;
    const isEndInMorning = schedule.morning && endTime <= schedule.morning.end;
    const isEndInAfternoon = schedule.afternoon && endTime <= schedule.afternoon.end;

    if (startsInMorning && !isEndInMorning) return false;
    if (startsInAfternoon && !isEndInAfternoon) return false;

    // Check for overlapping sessions
    for (const session of sessions) {
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

  const getAvailableSlotsForDay = (date, dayIndex) => {
    const dayName = DAYS[dayIndex];
    const allSlots = generateTimeSlotsForDay(dayName);
    return allSlots.filter(slot => isSlotAvailable(date, slot.time));
  };

  if (loading) {
    return <div className="availability-loading">Loading availability...</div>;
  }

  const weekStart = weekDates[0];
  const weekEnd = weekDates[4];
  const weekLabel = weekStart && weekEnd
    ? `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';

  return (
    <div className="availability">
      {/* Header */}
      <div className="availability-header">
        <div className="availability-nav">
          <button onClick={() => navigateWeek(-1)}>&larr;</button>
          <button onClick={goToToday}>Today</button>
          <button onClick={() => navigateWeek(1)}>&rarr;</button>
        </div>
        <h3>{weekLabel}</h3>
        <div className="duration-selector">
          <label>Session:</label>
          <select value={sessionDuration} onChange={(e) => setSessionDuration(Number(e.target.value))}>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
      </div>

      {/* Availability Grid */}
      <div className="availability-grid">
        {weekDates.map((date, index) => {
          const holiday = isHoliday(date);
          const availableSlots = holiday ? [] : getAvailableSlotsForDay(date, index);
          const isToday = formatDateKey(date) === formatDateKey(new Date());
          const isPast = date < new Date() && !isToday;

          return (
            <div key={index} className={`day-column ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}>
              <div className="day-header">
                <span className="day-name">{DAY_LABELS[index]}</span>
                <span className="day-date">{date.getDate()}/{date.getMonth() + 1}</span>
                {holiday && <span className="holiday-badge">Holiday</span>}
              </div>
              <div className="slots-container">
                {holiday ? (
                  <div className="no-slots">Unavailable</div>
                ) : availableSlots.length === 0 ? (
                  <div className="no-slots">Fully booked</div>
                ) : (
                  <>
                    <div className="slots-count">{availableSlots.length} slots</div>
                    <div className="slots-list">
                      {availableSlots.map(slot => (
                        <div key={slot.time} className={`slot ${slot.period}`}>
                          {formatTime(slot.time)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
