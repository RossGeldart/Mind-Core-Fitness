import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import './Calendar.css';

// Working hours configuration
const SCHEDULE = {
  monday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  tuesday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  wednesday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  thursday: { morning: { start: '06:15', end: '12:00' }, afternoon: { start: '15:00', end: '20:00' } },
  friday: { morning: { start: '08:00', end: '10:00' }, afternoon: null }
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Generate time slots (every 15 minutes)
const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 6; hour < 21; hour++) {
    for (let min = 0; min < 60; min += 15) {
      const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      slots.push(time);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

const formatTime = (time) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes}${ampm}`;
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

const formatDateKey = (date) => {
  return date.toISOString().split('T')[0];
};

const isWithinWorkingHours = (time, dayName) => {
  const schedule = SCHEDULE[dayName];
  if (!schedule) return false;

  const { morning, afternoon } = schedule;

  if (morning && time >= morning.start && time < morning.end) return true;
  if (afternoon && time >= afternoon.start && time < afternoon.end) return true;

  return false;
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

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setWeekDates(getWeekDates(currentDate));
  }, [currentDate]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch clients
      const clientsSnapshot = await getDocs(collection(db, 'clients'));
      const clientsData = clientsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(c => c.status === 'active');
      setClients(clientsData);

      // Fetch sessions
      const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
      const sessionsData = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(sessionsData);

      // Fetch holidays
      const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
      const holidaysData = holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHolidays(holidaysData);
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

  const getSessionAtSlot = (date, time) => {
    const dateKey = formatDateKey(date);
    return sessions.find(s => s.date === dateKey && s.time === time);
  };

  const isSlotAvailable = (date, time, clientDuration) => {
    const dayName = DAYS[date.getDay() - 1];
    if (!dayName) return false;

    // Check if within working hours
    if (!isWithinWorkingHours(time, dayName)) return false;

    // Check if holiday
    if (isHoliday(date)) return false;

    // Check if slot is already booked
    const dateKey = formatDateKey(date);
    const existingSession = sessions.find(s => s.date === dateKey && s.time === time);
    if (existingSession) return false;

    // Check if the slot + duration would overlap with another session or go outside working hours
    const endTime = addMinutesToTime(time, clientDuration);
    const schedule = SCHEDULE[dayName];

    // Check if end time is within working hours
    const isEndInMorning = schedule.morning && endTime <= schedule.morning.end;
    const isEndInAfternoon = schedule.afternoon && endTime <= schedule.afternoon.end;
    const startsInMorning = schedule.morning && time >= schedule.morning.start && time < schedule.morning.end;
    const startsInAfternoon = schedule.afternoon && time >= schedule.afternoon.start && time < schedule.afternoon.end;

    if (startsInMorning && !isEndInMorning) return false;
    if (startsInAfternoon && !isEndInAfternoon) return false;

    // Check if would overlap with any existing session
    for (const session of sessions) {
      if (session.date !== dateKey) continue;

      const sessionStart = timeToMinutes(session.time);
      const sessionEnd = sessionStart + (session.duration || 45);
      const slotStart = timeToMinutes(time);
      const slotEnd = slotStart + clientDuration;

      if (slotStart < sessionEnd && slotEnd > sessionStart) {
        return false;
      }
    }

    return true;
  };

  const handleSlotClick = async (date, time) => {
    if (!selectedClient) {
      setShowClientPicker(true);
      return;
    }

    const dateKey = formatDateKey(date);
    const existingSession = getSessionAtSlot(date, time);

    if (existingSession) {
      // Cancel session
      if (window.confirm(`Cancel ${existingSession.clientName}'s session?`)) {
        try {
          await deleteDoc(doc(db, 'sessions', existingSession.id));

          // Return session to client's remaining count
          const client = clients.find(c => c.id === existingSession.clientId);
          if (client) {
            await updateDoc(doc(db, 'clients', client.id), {
              sessionsRemaining: (client.sessionsRemaining || 0) + 1
            });
            setClients(clients.map(c =>
              c.id === client.id
                ? { ...c, sessionsRemaining: (c.sessionsRemaining || 0) + 1 }
                : c
            ));
          }

          setSessions(sessions.filter(s => s.id !== existingSession.id));
        } catch (error) {
          console.error('Error cancelling session:', error);
          alert('Failed to cancel session');
        }
      }
      return;
    }

    // Book new session
    if (!isSlotAvailable(date, time, selectedClient.sessionDuration || 45)) {
      alert('This slot is not available for this client\'s session duration');
      return;
    }

    if (selectedClient.sessionsRemaining <= 0) {
      alert(`${selectedClient.name} has no sessions remaining`);
      return;
    }

    try {
      const sessionData = {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        date: dateKey,
        time: time,
        duration: selectedClient.sessionDuration || 45,
        createdAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      setSessions([...sessions, { id: docRef.id, ...sessionData }]);

      // Decrement client's remaining sessions
      await updateDoc(doc(db, 'clients', selectedClient.id), {
        sessionsRemaining: selectedClient.sessionsRemaining - 1
      });

      setClients(clients.map(c =>
        c.id === selectedClient.id
          ? { ...c, sessionsRemaining: c.sessionsRemaining - 1 }
          : c
      ));
      setSelectedClient({ ...selectedClient, sessionsRemaining: selectedClient.sessionsRemaining - 1 });
    } catch (error) {
      console.error('Error booking session:', error);
      alert('Failed to book session');
    }
  };

  const handleAddHoliday = async () => {
    if (!holidayDate) return;

    try {
      const docRef = await addDoc(collection(db, 'holidays'), {
        date: holidayDate,
        createdAt: Timestamp.now()
      });
      setHolidays([...holidays, { id: docRef.id, date: holidayDate }]);
      setHolidayDate('');
      setShowHolidayModal(false);
    } catch (error) {
      console.error('Error adding holiday:', error);
      alert('Failed to add holiday');
    }
  };

  const handleRemoveHoliday = async (holidayId) => {
    try {
      await deleteDoc(doc(db, 'holidays', holidayId));
      setHolidays(holidays.filter(h => h.id !== holidayId));
    } catch (error) {
      console.error('Error removing holiday:', error);
    }
  };

  const getSlotClass = (date, time) => {
    const dayIndex = date.getDay();
    if (dayIndex === 0 || dayIndex === 6) return 'slot outside';

    const dayName = DAYS[dayIndex - 1];

    if (isHoliday(date)) return 'slot holiday';
    if (!isWithinWorkingHours(time, dayName)) return 'slot outside';

    const session = getSessionAtSlot(date, time);
    if (session) return 'slot booked';

    if (selectedClient) {
      if (isSlotAvailable(date, time, selectedClient.sessionDuration || 45)) {
        return 'slot available';
      }
      return 'slot unavailable';
    }

    return 'slot';
  };

  if (loading) {
    return <div className="calendar-loading">Loading calendar...</div>;
  }

  const weekStart = weekDates[0];
  const weekEnd = weekDates[4];
  const weekLabel = weekStart && weekEnd
    ? `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';

  return (
    <div className="calendar">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button onClick={() => navigateWeek(-1)}>&larr; Prev</button>
          <button onClick={goToToday}>Today</button>
          <button onClick={() => navigateWeek(1)}>Next &rarr;</button>
        </div>
        <h3>{weekLabel}</h3>
        <div className="calendar-actions">
          <button className="holiday-btn" onClick={() => setShowHolidayModal(true)}>
            Manage Holidays
          </button>
        </div>
      </div>

      <div className="client-selector">
        <label>Booking for:</label>
        {selectedClient ? (
          <div className="selected-client">
            <span>{selectedClient.name}</span>
            <span className="client-info">
              {selectedClient.sessionDuration || 45} min | {selectedClient.sessionsRemaining} sessions left
            </span>
            <button onClick={() => setSelectedClient(null)}>Change</button>
          </div>
        ) : (
          <button className="select-client-btn" onClick={() => setShowClientPicker(true)}>
            Select Client
          </button>
        )}
      </div>

      <div className="calendar-grid">
        <div className="time-column">
          <div className="day-header"></div>
          {TIME_SLOTS.map(time => (
            <div key={time} className="time-label">
              {time.endsWith(':00') || time.endsWith(':30') ? formatTime(time) : ''}
            </div>
          ))}
        </div>

        {weekDates.map((date, dayIndex) => (
          <div key={dayIndex} className="day-column">
            <div className={`day-header ${isHoliday(date) ? 'holiday' : ''}`}>
              <span className="day-name">{DAY_LABELS[dayIndex]}</span>
              <span className="day-date">{date.getDate()}</span>
            </div>
            {TIME_SLOTS.map(time => {
              const session = getSessionAtSlot(date, time);
              return (
                <div
                  key={time}
                  className={getSlotClass(date, time)}
                  onClick={() => handleSlotClick(date, time)}
                >
                  {session && (
                    <div className="session-info">
                      <span className="session-name">{session.clientName}</span>
                      <span className="session-duration">{session.duration}m</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {showClientPicker && (
        <div className="modal-overlay" onClick={() => setShowClientPicker(false)}>
          <div className="modal-content client-picker" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Client</h3>
              <button className="close-btn" onClick={() => setShowClientPicker(false)}>&times;</button>
            </div>
            <div className="client-list-picker">
              {clients.length === 0 ? (
                <p className="no-clients">No active clients</p>
              ) : (
                clients.map(client => (
                  <div
                    key={client.id}
                    className="client-option"
                    onClick={() => {
                      setSelectedClient(client);
                      setShowClientPicker(false);
                    }}
                  >
                    <span className="client-name">{client.name}</span>
                    <span className="client-details">
                      {client.sessionDuration || 45} min | {client.sessionsRemaining} sessions left
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showHolidayModal && (
        <div className="modal-overlay" onClick={() => setShowHolidayModal(false)}>
          <div className="modal-content holiday-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Holidays</h3>
              <button className="close-btn" onClick={() => setShowHolidayModal(false)}>&times;</button>
            </div>
            <div className="holiday-form">
              <input
                type="date"
                value={holidayDate}
                onChange={e => setHolidayDate(e.target.value)}
              />
              <button onClick={handleAddHoliday}>Add Holiday</button>
            </div>
            <div className="holiday-list">
              {holidays.length === 0 ? (
                <p className="no-holidays">No holidays set</p>
              ) : (
                holidays.map(holiday => (
                  <div key={holiday.id} className="holiday-item">
                    <span>{new Date(holiday.date).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}</span>
                    <button onClick={() => handleRemoveHoliday(holiday.id)}>Remove</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
