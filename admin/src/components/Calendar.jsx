import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
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
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

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

  // Morning slots
  if (schedule.morning) {
    let current = schedule.morning.start;
    while (current < schedule.morning.end) {
      slots.push({ time: current, period: 'morning' });
      current = addMinutesToTime(current, 15);
    }
  }

  // Afternoon slots
  if (schedule.afternoon) {
    let current = schedule.afternoon.start;
    while (current < schedule.afternoon.end) {
      slots.push({ time: current, period: 'afternoon' });
      current = addMinutesToTime(current, 15);
    }
  }

  return slots;
};

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayEndDate, setHolidayEndDate] = useState('');
  const [holidayMode, setHolidayMode] = useState('single'); // 'single' or 'range'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setWeekDates(getWeekDates(currentDate));
  }, [currentDate]);

  useEffect(() => {
    fetchData();
  }, []);

  // When a client is selected, jump to their start date
  const handleClientSelect = (client) => {
    setSelectedClient(client);
    setShowClientPicker(false);

    // Jump to client's start date
    if (client.startDate) {
      const startDate = client.startDate.toDate ? client.startDate.toDate() : new Date(client.startDate);
      setCurrentDate(startDate);
    }
    setSelectedDay(null);
  };

  // Get client's date range info
  const getClientDateInfo = () => {
    if (!selectedClient) return null;

    const startDate = selectedClient.startDate?.toDate ? selectedClient.startDate.toDate() : new Date(selectedClient.startDate);
    const endDate = selectedClient.endDate?.toDate ? selectedClient.endDate.toDate() : new Date(selectedClient.endDate);

    // Calculate which week we're viewing within the client's block
    const weekStart = weekDates[0];
    if (!weekStart) return null;

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weekNumber = Math.floor((weekStart - startDate) / msPerWeek) + 1;
    const totalWeeks = selectedClient.weeksInBlock || Math.ceil((endDate - startDate) / msPerWeek);

    const isWithinBlock = weekStart >= startDate && weekStart <= endDate;

    return {
      startDate,
      endDate,
      weekNumber,
      totalWeeks,
      isWithinBlock
    };
  };

  const goToClientStart = () => {
    if (selectedClient?.startDate) {
      const startDate = selectedClient.startDate.toDate ? selectedClient.startDate.toDate() : new Date(selectedClient.startDate);
      setCurrentDate(startDate);
      setSelectedDay(null);
    }
  };

  const goToClientEnd = () => {
    if (selectedClient?.endDate) {
      const endDate = selectedClient.endDate.toDate ? selectedClient.endDate.toDate() : new Date(selectedClient.endDate);
      setCurrentDate(endDate);
      setSelectedDay(null);
    }
  };

  // Calculate completed sessions (sessions that have passed)
  const getCompletedSessionsCount = (clientId) => {
    const now = new Date();
    const today = formatDateKey(now);
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    return sessions.filter(s => {
      if (s.clientId !== clientId) return false;
      // Session is completed if date is in past, or if today and time has passed
      if (s.date < today) return true;
      if (s.date === today && s.time < currentTime) return true;
      return false;
    }).length;
  };

  // Calculate remaining sessions for a client
  const getSessionsRemaining = (client) => {
    const completed = getCompletedSessionsCount(client.id);
    return (client.totalSessions || 0) - completed;
  };

  // Calculate booked sessions for a client
  const getBookedSessionsCount = (clientId) => {
    return sessions.filter(s => s.clientId === clientId).length;
  };

  const fetchData = async () => {
    try {
      const clientsSnapshot = await getDocs(collection(db, 'clients'));
      const clientsData = clientsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(c => c.status === 'active');
      setClients(clientsData);

      const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
      const sessionsData = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(sessionsData);

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
    setSelectedDay(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(null);
  };

  const isHoliday = (date) => {
    const dateKey = formatDateKey(date);
    return holidays.some(h => h.date === dateKey);
  };

  const getSessionsForDate = (date) => {
    const dateKey = formatDateKey(date);
    return sessions.filter(s => s.date === dateKey);
  };

  const getSessionAtSlot = (date, time) => {
    const dateKey = formatDateKey(date);
    return sessions.find(s => s.date === dateKey && s.time === time);
  };

  const isSlotAvailable = (date, time, clientDuration) => {
    const dayName = DAYS[date.getDay() - 1];
    if (!dayName) return false;

    if (isHoliday(date)) return false;

    const dateKey = formatDateKey(date);
    const existingSession = sessions.find(s => s.date === dateKey && s.time === time);
    if (existingSession) return false;

    const endTime = addMinutesToTime(time, clientDuration);
    const schedule = SCHEDULE[dayName];

    const isEndInMorning = schedule.morning && endTime <= schedule.morning.end;
    const isEndInAfternoon = schedule.afternoon && endTime <= schedule.afternoon.end;
    const startsInMorning = schedule.morning && time >= schedule.morning.start && time < schedule.morning.end;
    const startsInAfternoon = schedule.afternoon && time >= schedule.afternoon.start && time < schedule.afternoon.end;

    if (startsInMorning && !isEndInMorning) return false;
    if (startsInAfternoon && !isEndInAfternoon) return false;

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
    const existingSession = getSessionAtSlot(date, time);

    if (existingSession) {
      if (window.confirm(`Cancel ${existingSession.clientName}'s session at ${formatTime(time)}?`)) {
        try {
          await deleteDoc(doc(db, 'sessions', existingSession.id));
          setSessions(sessions.filter(s => s.id !== existingSession.id));
        } catch (error) {
          console.error('Error cancelling session:', error);
          alert('Failed to cancel session');
        }
      }
      return;
    }

    if (!selectedClient) {
      alert('Please select a client first');
      return;
    }

    if (!isSlotAvailable(date, time, selectedClient.sessionDuration || 45)) {
      alert('This slot is not available for this client\'s session duration');
      return;
    }

    // Check if client can book more sessions (total - already booked)
    const clientBookedSessions = sessions.filter(s => s.clientId === selectedClient.id).length;
    if (clientBookedSessions >= selectedClient.totalSessions) {
      alert(`${selectedClient.name} has already booked all ${selectedClient.totalSessions} sessions`);
      return;
    }

    try {
      const dateKey = formatDateKey(date);
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
    } catch (error) {
      console.error('Error booking session:', error);
      alert('Failed to book session');
    }
  };

  // Repeat current week's sessions across all weeks in client's block
  const handleRepeatWeekly = async () => {
    if (!selectedClient) return;

    const clientStart = selectedClient.startDate?.toDate ? selectedClient.startDate.toDate() : new Date(selectedClient.startDate);
    const clientEnd = selectedClient.endDate?.toDate ? selectedClient.endDate.toDate() : new Date(selectedClient.endDate);

    // Get current week's sessions for this client
    const currentWeekSessions = sessions.filter(s => {
      if (s.clientId !== selectedClient.id) return false;
      return weekDates.some(d => formatDateKey(d) === s.date);
    });

    if (currentWeekSessions.length === 0) {
      alert('No sessions in current week to repeat. Book some sessions first, then use this button.');
      return;
    }

    // Calculate how many weeks in the block
    const totalWeeks = selectedClient.weeksInBlock || Math.ceil((clientEnd - clientStart) / (7 * 24 * 60 * 60 * 1000));

    // Get the day of week and time for each current session
    const sessionPatterns = currentWeekSessions.map(s => {
      const sessionDate = new Date(s.date);
      const dayOfWeek = sessionDate.getDay(); // 0=Sun, 1=Mon, etc.
      return { dayOfWeek, time: s.time };
    });

    // First pass: count how many sessions would actually be created
    let sessionsToCreate = [];
    const existingClientSessions = sessions.filter(s => s.clientId === selectedClient.id).length;

    for (let week = 0; week < totalWeeks; week++) {
      const weekStartDate = new Date(clientStart);
      weekStartDate.setDate(weekStartDate.getDate() + (week * 7));

      const monday = new Date(weekStartDate);
      const day = monday.getDay();
      const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
      monday.setDate(diff);

      for (const pattern of sessionPatterns) {
        const sessionDate = new Date(monday);
        const daysToAdd = pattern.dayOfWeek === 0 ? 6 : pattern.dayOfWeek - 1;
        sessionDate.setDate(monday.getDate() + daysToAdd);

        const dateKey = formatDateKey(sessionDate);

        // Skip if session already exists
        if (sessions.some(s => s.clientId === selectedClient.id && s.date === dateKey && s.time === pattern.time)) {
          continue;
        }

        // Skip if outside client's block
        if (sessionDate < clientStart || sessionDate > clientEnd) {
          continue;
        }

        // Skip holidays
        if (holidays.some(h => h.date === dateKey)) {
          continue;
        }

        sessionsToCreate.push({ dateKey, time: pattern.time, sessionDate });
      }
    }

    // Check if this would exceed the package
    const totalAfterCreation = existingClientSessions + sessionsToCreate.length;
    if (totalAfterCreation > selectedClient.totalSessions) {
      alert(`This would create ${sessionsToCreate.length} new sessions (${totalAfterCreation} total), but client only has ${selectedClient.totalSessions} sessions in their package.\n\nYou can still book ${selectedClient.totalSessions - existingClientSessions} more sessions.`);
      return;
    }

    if (sessionsToCreate.length === 0) {
      alert('All weeks already have sessions booked for this pattern.');
      return;
    }

    if (!window.confirm(`This will create ${sessionsToCreate.length} new sessions across the block.\n\n(${existingClientSessions} existing + ${sessionsToCreate.length} new = ${totalAfterCreation} total)\n\nContinue?`)) {
      return;
    }

    try {
      const newSessions = [];

      for (const slot of sessionsToCreate) {
        const sessionData = {
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          date: slot.dateKey,
          time: slot.time,
          duration: selectedClient.sessionDuration || 45,
          createdAt: Timestamp.now()
        };

        const docRef = await addDoc(collection(db, 'sessions'), sessionData);
        newSessions.push({ id: docRef.id, ...sessionData });
      }

      setSessions([...sessions, ...newSessions]);
      alert(`Created ${newSessions.length} new sessions!`);
    } catch (error) {
      console.error('Error repeating weekly:', error);
      alert('Failed to repeat sessions');
    }
  };

  const handleAddHoliday = async () => {
    if (!holidayDate) return;

    try {
      const newHolidays = [];

      if (holidayMode === 'range' && holidayEndDate) {
        // Add all dates in the range
        const start = new Date(holidayDate);
        const end = new Date(holidayEndDate);

        if (end < start) {
          alert('End date must be after start date');
          return;
        }

        const current = new Date(start);
        while (current <= end) {
          const dateKey = formatDateKey(current);
          // Check if holiday already exists
          if (!holidays.some(h => h.date === dateKey)) {
            const docRef = await addDoc(collection(db, 'holidays'), {
              date: dateKey,
              createdAt: Timestamp.now()
            });
            newHolidays.push({ id: docRef.id, date: dateKey });
          }
          current.setDate(current.getDate() + 1);
        }

        setHolidays([...holidays, ...newHolidays]);
        alert(`Added ${newHolidays.length} holiday(s)`);
      } else {
        // Single date
        if (holidays.some(h => h.date === holidayDate)) {
          alert('This date is already marked as a holiday');
          return;
        }
        const docRef = await addDoc(collection(db, 'holidays'), {
          date: holidayDate,
          createdAt: Timestamp.now()
        });
        setHolidays([...holidays, { id: docRef.id, date: holidayDate }]);
      }

      setHolidayDate('');
      setHolidayEndDate('');
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
      {/* Header */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button onClick={() => navigateWeek(-1)}>&larr;</button>
          <button onClick={goToToday}>Today</button>
          <button onClick={() => navigateWeek(1)}>&rarr;</button>
        </div>
        <h3>{weekLabel}</h3>
        <button className="holiday-btn" onClick={() => setShowHolidayModal(true)}>
          Holidays
        </button>
      </div>

      {/* Client Selector */}
      <div className="client-selector">
        <span className="selector-label">Booking for:</span>
        {selectedClient ? (
          <div className="selected-client">
            <div className="selected-info">
              <strong>{selectedClient.name}</strong>
              <span>{selectedClient.sessionDuration || 45}min • {getSessionsRemaining(selectedClient)}/{selectedClient.totalSessions} remaining</span>
              <span className="booked-info">{getBookedSessionsCount(selectedClient.id)} booked</span>
            </div>
            <button onClick={() => setSelectedClient(null)}>Change</button>
          </div>
        ) : (
          <button className="select-client-btn" onClick={() => setShowClientPicker(true)}>
            Select Client
          </button>
        )}
      </div>

      {/* Repeat Weekly Button */}
      {selectedClient && (
        <div className="repeat-weekly-section">
          <button className="repeat-weekly-btn" onClick={handleRepeatWeekly}>
            Repeat This Week's Schedule For All Weeks
          </button>
          <span className="repeat-hint">Copies current week's sessions to all weeks in block</span>
        </div>
      )}

      {/* Day Cards */}
      <div className="day-cards">
        {weekDates.map((date, index) => {
          const daySessions = getSessionsForDate(date);
          const isToday = formatDateKey(date) === formatDateKey(new Date());
          const holiday = isHoliday(date);

          return (
            <div
              key={index}
              className={`day-card ${selectedDay === index ? 'selected' : ''} ${isToday ? 'today' : ''} ${holiday ? 'holiday' : ''}`}
              onClick={() => !holiday && setSelectedDay(selectedDay === index ? null : index)}
            >
              <div className="day-card-header">
                <span className="day-name">{DAY_SHORT[index]}</span>
                <span className="day-date">{date.getDate()}</span>
              </div>
              {holiday ? (
                <div className="day-card-status holiday">Unavailable</div>
              ) : (
                <div className="day-card-status">
                  {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time Slots Panel */}
      {selectedDay !== null && weekDates[selectedDay] && !isHoliday(weekDates[selectedDay]) && (
        <div className="time-panel">
          <div className="time-panel-header">
            <h4>{DAY_LABELS[selectedDay]} {weekDates[selectedDay].getDate()}</h4>
            <button className="close-panel" onClick={() => setSelectedDay(null)}>&times;</button>
          </div>

          <div className="time-slots">
            {generateTimeSlotsForDay(DAYS[selectedDay]).map(({ time, period }, idx, arr) => {
              const session = getSessionAtSlot(weekDates[selectedDay], time);
              const available = selectedClient && isSlotAvailable(weekDates[selectedDay], time, selectedClient.sessionDuration || 45);
              const showPeriodLabel = idx === 0 || arr[idx - 1]?.period !== period;

              return (
                <div key={time}>
                  {showPeriodLabel && (
                    <div className="period-label">
                      {period === 'morning' ? 'Morning' : 'Afternoon'}
                    </div>
                  )}
                  <button
                    className={`time-slot ${session ? 'booked' : ''} ${available ? 'available' : ''} ${!session && !available && selectedClient ? 'unavailable' : ''}`}
                    onClick={() => handleSlotClick(weekDates[selectedDay], time)}
                  >
                    <span className="slot-time">{formatTime(time)}</span>
                    {session ? (
                      <span className="slot-client">{session.clientName} ({session.duration}m)</span>
                    ) : available ? (
                      <span className="slot-available">Available</span>
                    ) : selectedClient ? (
                      <span className="slot-unavailable">Unavailable</span>
                    ) : (
                      <span className="slot-empty">Select client to book</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Client Picker Modal */}
      {showClientPicker && (
        <div className="modal-overlay" onClick={() => setShowClientPicker(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Client</h3>
              <button className="close-btn" onClick={() => setShowClientPicker(false)}>&times;</button>
            </div>
            <div className="client-list-picker">
              {clients.length === 0 ? (
                <p className="no-items">No active clients</p>
              ) : (
                clients.map(client => {
                  const clientStart = client.startDate?.toDate ? client.startDate.toDate() : new Date(client.startDate);
                  const clientEnd = client.endDate?.toDate ? client.endDate.toDate() : new Date(client.endDate);
                  const remaining = getSessionsRemaining(client);
                  const booked = getBookedSessionsCount(client.id);
                  return (
                    <button
                      key={client.id}
                      className="client-option"
                      onClick={() => handleClientSelect(client)}
                    >
                      <strong>{client.name}</strong>
                      <span>{client.sessionDuration || 45}min • {remaining}/{client.totalSessions} remaining • {booked} booked</span>
                      <span className="client-dates">
                        {clientStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {clientEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Holiday Modal */}
      {showHolidayModal && (
        <div className="modal-overlay" onClick={() => setShowHolidayModal(false)}>
          <div className="modal-content holiday-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Holidays</h3>
              <button className="close-btn" onClick={() => setShowHolidayModal(false)}>&times;</button>
            </div>

            {/* Mode Toggle */}
            <div className="holiday-mode-toggle">
              <button
                className={`mode-btn ${holidayMode === 'single' ? 'active' : ''}`}
                onClick={() => setHolidayMode('single')}
              >
                Single Day
              </button>
              <button
                className={`mode-btn ${holidayMode === 'range' ? 'active' : ''}`}
                onClick={() => setHolidayMode('range')}
              >
                Date Range
              </button>
            </div>

            <div className="holiday-form">
              <div className="date-inputs">
                <div className="date-field">
                  <label>{holidayMode === 'range' ? 'Start Date' : 'Date'}</label>
                  <input
                    type="date"
                    value={holidayDate}
                    onChange={e => setHolidayDate(e.target.value)}
                  />
                </div>
                {holidayMode === 'range' && (
                  <div className="date-field">
                    <label>End Date</label>
                    <input
                      type="date"
                      value={holidayEndDate}
                      onChange={e => setHolidayEndDate(e.target.value)}
                      min={holidayDate}
                    />
                  </div>
                )}
              </div>
              <button className="add-holiday-btn" onClick={handleAddHoliday}>
                {holidayMode === 'range' ? 'Add Range' : 'Add Day'}
              </button>
            </div>

            <div className="holiday-list">
              <div className="holiday-list-header">
                <span>Scheduled Holidays ({holidays.length})</span>
              </div>
              {holidays.length === 0 ? (
                <p className="no-items">No holidays set</p>
              ) : (
                [...holidays]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(holiday => (
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
