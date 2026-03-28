import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, addDoc, deleteDoc, updateDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const WORKOUT_FEATURES = [
  { id: 'randomiser', name: 'Randomiser', description: 'Generate random HIIT workouts' },
  { id: 'byo', name: 'Build Your Own', description: 'Pick exercises and build custom workouts' },
  { id: 'challenges', name: '4-Week Core Challenge', description: '28-day progressive HIIT challenge' },
];

const STAT_OPTIONS = {
  fitness:     [
    { value: 'workouts', label: 'Total Workouts' },
    { value: 'minutes',  label: 'Total Minutes' },
    { value: 'volume',   label: 'Total Volume (weight × reps)' },
  ],
  strength:    [
    { value: 'workouts', label: 'Total Workouts' },
    { value: 'volume',   label: 'Total Volume (weight × reps)' },
  ],
  cardio:      [
    { value: 'workouts', label: 'Total Workouts' },
    { value: 'minutes',  label: 'Total Minutes' },
  ],
  habits:      [
    { value: 'completion', label: 'Days Completed' },
  ],
  nutrition:   [
    { value: 'daysTracked', label: 'Days Tracked' },
  ],
  flexibility: [
    { value: 'workouts', label: 'Total Sessions' },
    { value: 'minutes',  label: 'Total Minutes' },
  ],
  mindset:     [
    { value: 'completion', label: 'Days Completed' },
  ],
  wellness:    [
    { value: 'completion', label: 'Days Completed' },
  ],
  recovery:    [
    { value: 'completion', label: 'Days Completed' },
  ],
  community:   [
    { value: 'workouts', label: 'Total Workouts' },
    { value: 'minutes',  label: 'Total Minutes' },
  ],
};

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'fitness',
    leaderboardStat: 'workouts',
    startDate: '',
    endDate: '',
    linkedChallenge: '',
  });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'events'));
      const now = new Date();
      const evts = snap.docs.map(d => {
        const data = d.data();
        const start = data.startDate?.toDate?.() || new Date(data.startDate);
        const end = data.endDate?.toDate?.() || new Date(data.endDate);
        let status = 'upcoming';
        if (now >= start && now <= end) status = 'active';
        else if (now > end) status = 'completed';
        return { id: d.id, ...data, startDate: start, endDate: end, status };
      }).sort((a, b) => {
        const order = { active: 0, upcoming: 1, completed: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.startDate - b.startDate;
      });
      setEvents(evts);
    } catch (err) {
      console.error('Error loading events:', err);
      showToast('Failed to load events', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const resetForm = () => {
    setForm({ title: '', description: '', category: 'fitness', leaderboardStat: 'workouts', startDate: '', endDate: '', linkedChallenge: '' });
    setEditingEvent(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate || !form.endDate) {
      showToast('Please fill in title, start date and end date', 'error');
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      showToast('End date must be after start date', 'error');
      return;
    }
    setSaving(true);
    try {
      const eventData = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        leaderboardStat: form.leaderboardStat,
        startDate: Timestamp.fromDate(new Date(form.startDate)),
        endDate: Timestamp.fromDate(new Date(form.endDate)),
        linkedChallenge: form.linkedChallenge || null,
        participantCount: 0,
      };

      if (editingEvent) {
        await updateDoc(doc(db, 'events', editingEvent.id), eventData);
        showToast('Event updated', 'success');
      } else {
        eventData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'events'), eventData);
        showToast('Event created', 'success');
      }
      resetForm();
      await fetchEvents();
    } catch (err) {
      console.error('Error saving event:', err);
      showToast('Failed to save event', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (evt) => {
    const cat = evt.category || 'fitness';
    const statOpts = STAT_OPTIONS[cat] || STAT_OPTIONS.fitness;
    setForm({
      title: evt.title || '',
      description: evt.description || '',
      category: cat,
      leaderboardStat: evt.leaderboardStat || statOpts[0].value,
      startDate: evt.startDate.toISOString().split('T')[0],
      endDate: evt.endDate.toISOString().split('T')[0],
      linkedChallenge: evt.linkedChallenge || '',
    });
    setEditingEvent(evt);
    setShowForm(true);
  };

  const handleDelete = async (evtId) => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'events', evtId));
      showToast('Event deleted', 'info');
      await fetchEvents();
    } catch (err) {
      console.error('Error deleting event:', err);
      showToast('Failed to delete event', 'error');
    }
  };

  const formatDate = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const categories = [
    { value: 'fitness', label: 'Fitness' },
    { value: 'habits', label: 'Habits' },
    { value: 'nutrition', label: 'Nutrition' },
    { value: 'mindset', label: 'Mindset' },
    { value: 'flexibility', label: 'Flexibility' },
    { value: 'strength', label: 'Strength' },
    { value: 'cardio', label: 'Cardio' },
    { value: 'community', label: 'Community' },
  ];

  return (
    <div className="admin-events">
      {toast && (
        <div className={`admin-events-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="admin-events-header">
        <p className="admin-events-subtitle">Create and manage community events for your members</p>
        <button className="admin-events-add-btn" onClick={() => { resetForm(); setShowForm(true); }}>
          + New Event
        </button>
      </div>

      {showForm && (
        <form className="admin-events-form" onSubmit={handleSubmit}>
          <h4>{editingEvent ? 'Edit Event' : 'Create Event'}</h4>
          <div className="admin-events-form-group">
            <label>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. 30 Day Daily Stretching"
              maxLength={100}
              required
            />
          </div>
          <div className="admin-events-form-group">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the event, what members should do, goals..."
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="admin-events-form-row">
            <div className="admin-events-form-group">
              <label>Category</label>
              <select
                value={form.category}
                onChange={e => {
                  const cat = e.target.value;
                  const opts = STAT_OPTIONS[cat] || STAT_OPTIONS.fitness;
                  setForm(f => ({ ...f, category: cat, leaderboardStat: opts[0].value }));
                }}
              >
                {categories.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="admin-events-form-group">
              <label>Leaderboard Stat</label>
              <select
                value={form.leaderboardStat}
                onChange={e => setForm(f => ({ ...f, leaderboardStat: e.target.value }))}
              >
                {(STAT_OPTIONS[form.category] || STAT_OPTIONS.fitness).map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-events-form-row">
            <div className="admin-events-form-group">
              <label>Link Workout Feature (optional)</label>
              <select
                value={form.linkedChallenge}
                onChange={e => setForm(f => ({ ...f, linkedChallenge: e.target.value }))}
              >
                <option value="">None — no feature linked</option>
                {WORKOUT_FEATURES.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.description}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-events-form-row">
            <div className="admin-events-form-group">
              <label>Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div className="admin-events-form-group">
              <label>End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="admin-events-form-actions">
            <button type="button" className="admin-events-cancel-btn" onClick={resetForm}>Cancel</button>
            <button type="submit" className="admin-events-save-btn" disabled={saving}>
              {saving ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="admin-events-loading">
          <div className="admin-events-spinner" />
        </div>
      ) : events.length === 0 ? (
        <div className="admin-events-empty">
          <p>No events created yet. Click "+ New Event" to get started.</p>
        </div>
      ) : (
        <div className="admin-events-list">
          {events.map(evt => (
            <div key={evt.id} className={`admin-event-card admin-event-${evt.status}`}>
              <div className="admin-event-card-header">
                <span className={`admin-event-status admin-event-status-${evt.status}`}>
                  {evt.status === 'active' ? 'Active' : evt.status === 'upcoming' ? 'Upcoming' : 'Completed'}
                </span>
                <span className="admin-event-category">{evt.category}</span>
                {evt.leaderboardStat && (
                  <span className="admin-event-category">{(STAT_OPTIONS[evt.category] || []).find(s => s.value === evt.leaderboardStat)?.label || evt.leaderboardStat}</span>
                )}
              </div>
              <h4 className="admin-event-title">{evt.title}</h4>
              {evt.description && <p className="admin-event-desc">{evt.description}</p>}
              {evt.linkedChallenge && (
                <p className="admin-event-linked">
                  🔗 {WORKOUT_FEATURES.find(f => f.id === evt.linkedChallenge)?.name || evt.linkedChallenge}
                </p>
              )}
              <div className="admin-event-dates">
                {formatDate(evt.startDate)} — {formatDate(evt.endDate)}
                {evt.participantCount > 0 && (
                  <span className="admin-event-participants"> · {evt.participantCount} participants</span>
                )}
              </div>
              <div className="admin-event-actions">
                <button className="admin-event-edit-btn" onClick={() => handleEdit(evt)}>Edit</button>
                <button className="admin-event-delete-btn" onClick={() => handleDelete(evt.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
