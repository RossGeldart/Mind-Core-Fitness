import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, addDoc, deleteDoc, updateDoc, serverTimestamp, Timestamp, setDoc
} from 'firebase/firestore';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';

const WORKOUT_FEATURES = [
  { id: 'randomiser', name: 'Randomiser', description: 'Generate random HIIT workouts' },
  { id: 'byo', name: 'Build Your Own', description: 'Pick exercises and build custom workouts' },
  { id: 'challenges', name: '4-Week Core Challenge', description: '28-day progressive HIIT challenge' },
];

const EVENT_TYPES = [
  { id: 'standard', name: 'Standard', description: 'Standard event with manual tracking' },
  { id: 'luckyDip', name: 'Lucky Dip', description: 'Daily reveal workout — same for all users' },
];

const LUCKY_DIP_FOCUS_OPTIONS = [
  { value: 'core', label: 'Core' },
  { value: 'upper', label: 'Upper Body' },
  { value: 'lower', label: 'Lower Body' },
  { value: 'fullbody', label: 'Full Body' },
  { value: 'mix', label: 'Mix It Up' },
];

const LUCKY_DIP_EQUIPMENT = ['dumbbells', 'kettlebells'];
const LUCKY_DIP_DURATION = 15;
const LUCKY_DIP_LEVEL = { key: 'intermediate', work: 40, rest: 20 };

const ADVANCED_CORE_EXERCISES = new Set([
  'single leg v-up', 'hollow hold to v-sit', 'reverse crunch to leg raise',
  'side plank rotation', 'hip dips plank', 'alternating cross body v-up',
  'alternating cross body v up', 'bent hollow hold', 'heels elevated glute bridge',
  'hollow body hold', 'hollow body rock', 'star side plank', 'straddle leg lift',
  'leg raise to hip lift', 'scorpion kicks', 'seated v hold',
]);

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

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
    eventType: 'standard',
    luckyDipFocus: 'mix',
    luckyDipEquipment: ['dumbbells', 'kettlebells'],
    luckyDipDuration: 15,
  });

  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState('');

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
    setForm({ title: '', description: '', category: 'fitness', leaderboardStat: 'workouts', startDate: '', endDate: '', linkedChallenge: '', eventType: 'standard', luckyDipFocus: 'mix', luckyDipEquipment: ['dumbbells', 'kettlebells'], luckyDipDuration: 15 });
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
      const isLuckyDip = form.eventType === 'luckyDip';
      const eventData = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: isLuckyDip ? 'fitness' : form.category,
        leaderboardStat: isLuckyDip ? 'daysCompleted' : form.leaderboardStat,
        startDate: Timestamp.fromDate(new Date(form.startDate)),
        endDate: Timestamp.fromDate(new Date(form.endDate)),
        linkedChallenge: isLuckyDip ? 'randomiser' : (form.linkedChallenge || null),
        participantCount: 0,
        eventType: form.eventType,
        ...(isLuckyDip && {
          luckyDipFocus: form.luckyDipFocus,
          luckyDipEquipment: form.luckyDipEquipment,
          luckyDipDuration: form.luckyDipDuration,
          luckyDipLevel: LUCKY_DIP_LEVEL.key,
        }),
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
      eventType: evt.eventType || 'standard',
      luckyDipFocus: evt.luckyDipFocus || 'mix',
      luckyDipEquipment: evt.luckyDipEquipment || ['dumbbells', 'kettlebells'],
      luckyDipDuration: evt.luckyDipDuration || 15,
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

  // Load exercises and compute workout structure for Lucky Dip generation
  const loadLuckyDipExercisePool = async (evt) => {
    const focus = evt.luckyDipFocus || 'mix';
    const equipment = evt.luckyDipEquipment || LUCKY_DIP_EQUIPMENT;

    let focusKeys;
    if (focus === 'mix') focusKeys = ['core', 'upper', 'lower'];
    else if (focus === 'fullbody') focusKeys = ['upper', 'lower'];
    else focusKeys = [focus];

    const paths = [];
    for (const eq of equipment) {
      for (const fk of focusKeys) {
        paths.push(`exercises/${eq}/${fk}`);
      }
    }

    const allItems = [];
    for (const path of paths) {
      try {
        const folderRef = ref(storage, path);
        const result = await listAll(folderRef);
        allItems.push(...result.items);
      } catch { /* folder might not exist */ }
    }

    if (allItems.length === 0) return null;

    const seen = new Set();
    const uniqueItems = allItems.filter(item => {
      const name = item.name.replace(/\.(mp4|gif)$/i, '');
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });

    const exercises = await Promise.all(
      uniqueItems.map(async (item) => {
        const url = await getDownloadURL(item);
        const name = toTitleCase(item.name.replace(/\.(mp4|gif)$/i, ''));
        const isGif = /\.gif$/i.test(item.name);
        return { name, videoUrl: url, isGif };
      })
    );

    const evtDuration = evt.luckyDipDuration || LUCKY_DIP_DURATION;
    const config = LUCKY_DIP_LEVEL;
    const intervalTime = config.work + config.rest;
    const totalSeconds = evtDuration * 60;
    const totalIntervals = Math.floor(totalSeconds / intervalTime);

    let exPerRound, numRounds;
    if (totalIntervals <= 6) {
      exPerRound = Math.max(3, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    } else if (totalIntervals <= 12) {
      exPerRound = Math.min(6, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    } else {
      exPerRound = Math.min(10, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    }
    numRounds = Math.max(2, numRounds);

    return { exercises, exPerRound, numRounds, focus, equipment, config, evtDuration };
  };

  // Save a single day's Lucky Dip workout to Firestore
  const saveDailyWorkout = async (evtId, date, pool) => {
    const { exercises, exPerRound, numRounds, focus, equipment, config, evtDuration } = pool;
    const filtered = exercises.filter(e => !ADVANCED_CORE_EXERCISES.has(e.name.toLowerCase()));
    const shuffled = shuffleArray(filtered.length > 0 ? filtered : exercises);
    const selected = shuffled.slice(0, Math.min(exPerRound, shuffled.length));

    await setDoc(doc(db, 'events', evtId, 'dailyWorkouts', date), {
      exercises: selected,
      rounds: numRounds,
      duration: evtDuration,
      level: config.key,
      work: config.work,
      rest: config.rest,
      focus,
      equipment,
      generatedAt: serverTimestamp(),
    });
  };

  // Pre-generate all Lucky Dip daily workouts for an event
  const generateLuckyDipWorkouts = async (evt) => {
    if (!window.confirm(`Pre-generate all daily workouts for "${evt.title}"? This will overwrite any existing daily workouts.`)) return;
    setGenerating(true);
    setGenerateProgress('Loading exercises...');
    try {
      const pool = await loadLuckyDipExercisePool(evt);
      if (!pool) {
        showToast('No exercises found for this equipment/focus combo', 'error');
        return;
      }

      setGenerateProgress('Resolving exercise URLs...');

      const start = evt.startDate;
      const end = evt.endDate;
      const days = [];
      const d = new Date(start);
      while (d <= end) {
        days.push(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() + 1);
      }

      setGenerateProgress(`Generating ${days.length} daily workouts...`);

      for (let i = 0; i < days.length; i++) {
        await saveDailyWorkout(evt.id, days[i], pool);
        setGenerateProgress(`Generated ${i + 1} of ${days.length} workouts...`);
      }

      showToast(`${days.length} daily workouts generated!`, 'success');
    } catch (err) {
      console.error('Error generating Lucky Dip workouts:', err);
      showToast('Failed to generate workouts', 'error');
    } finally {
      setGenerating(false);
      setGenerateProgress('');
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
              <label>Event Type</label>
              <select
                value={form.eventType}
                onChange={e => {
                  const type = e.target.value;
                  if (type === 'luckyDip') {
                    setForm(f => ({ ...f, eventType: type, category: 'fitness', leaderboardStat: 'daysCompleted', linkedChallenge: 'randomiser' }));
                  } else {
                    setForm(f => ({ ...f, eventType: type }));
                  }
                }}
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
                ))}
              </select>
            </div>
          </div>
          {form.eventType === 'luckyDip' && (
            <div className="admin-events-form-row">
              <div className="admin-events-form-group">
                <label>Workout Focus</label>
                <select
                  value={form.luckyDipFocus}
                  onChange={e => setForm(f => ({ ...f, luckyDipFocus: e.target.value }))}
                >
                  {LUCKY_DIP_FOCUS_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="admin-events-form-group">
                <label>Equipment</label>
                <div className="admin-events-checkbox-group">
                  {[{ key: 'bodyweight', label: 'Bodyweight' }, { key: 'dumbbells', label: 'Dumbbells' }, { key: 'kettlebells', label: 'Kettlebells' }].map(eq => (
                    <label key={eq.key} className="admin-events-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.luckyDipEquipment.includes(eq.key)}
                        onChange={e => {
                          setForm(f => {
                            const next = e.target.checked
                              ? [...f.luckyDipEquipment, eq.key]
                              : f.luckyDipEquipment.filter(k => k !== eq.key);
                            return { ...f, luckyDipEquipment: next.length > 0 ? next : f.luckyDipEquipment };
                          });
                        }}
                      />
                      {eq.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="admin-events-form-group">
                <label>Duration</label>
                <select
                  value={form.luckyDipDuration}
                  onChange={e => setForm(f => ({ ...f, luckyDipDuration: Number(e.target.value) }))}
                >
                  {[5, 10, 15, 20, 30].map(d => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {form.eventType !== 'luckyDip' && (
            <>
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
            </>
          )}
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
              {evt.eventType === 'luckyDip' && (
                <p className="admin-event-linked">🎲 Lucky Dip · {LUCKY_DIP_FOCUS_OPTIONS.find(f => f.value === evt.luckyDipFocus)?.label || 'Mix'} · {evt.luckyDipDuration || 15} min · {(evt.luckyDipEquipment || []).join(' + ')}</p>
              )}
              {evt.linkedChallenge && evt.eventType !== 'luckyDip' && (
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
                {evt.eventType === 'luckyDip' && (
                  <button
                    className="admin-event-edit-btn"
                    onClick={() => generateLuckyDipWorkouts(evt)}
                    disabled={generating}
                  >
                    {generating ? generateProgress || 'Generating...' : '🎲 Generate Workouts'}
                  </button>
                )}
                <button className="admin-event-delete-btn" onClick={() => handleDelete(evt.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
