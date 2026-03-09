import { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import './ActivityLogger.css';

const ACTIVITY_TYPES = [
  { id: 'walking', label: 'Walking', icon: '01' },
  { id: 'running', label: 'Running', icon: '02' },
  { id: 'cycling', label: 'Cycling', icon: '03' },
  { id: 'swimming', label: 'Swimming', icon: '04' },
  { id: 'hiking', label: 'Hiking', icon: '05' },
  { id: 'yoga', label: 'Yoga', icon: '06' },
  { id: 'football', label: 'Football', icon: '07' },
  { id: 'boxing', label: 'Boxing', icon: '08' },
  { id: 'rowing', label: 'Rowing', icon: '09' },
  { id: 'dancing', label: 'Dancing', icon: '10' },
  { id: 'climbing', label: 'Climbing', icon: '11' },
  { id: 'other', label: 'Other', icon: '12' },
];

const ACTIVITY_ICONS = {
  walking: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="2"/><path d="M7 21l3-4"/><path d="M16 21l-2-4-3-3 1-6"/><path d="M6 12l2-3 4-1"/>
    </svg>
  ),
  running: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="2"/><path d="M4 17l3.5-1 2.5-5"/><path d="M15 21l-2-5-3-2 2-4"/><path d="M7 12l-2 2"/>
    </svg>
  ),
  cycling: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/>
    </svg>
  ),
  swimming: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0"/><path d="M2 16c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0"/><circle cx="9" cy="7" r="2"/><path d="M15 11l-4-3-3 3"/>
    </svg>
  ),
  hiking: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 4v16"/><path d="M17 4l-4 4-4-4"/><path d="M8 20l5-5 5 5"/><circle cx="13" cy="2" r="1"/>
    </svg>
  ),
  yoga: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="2"/><path d="M4 20h16"/><path d="M12 6v6"/><path d="M8 10l4 2 4-2"/><path d="M9 20l3-8 3 8"/>
    </svg>
  ),
  football: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
    </svg>
  ),
  boxing: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11h-4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h4V11z"/><path d="M18 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v5"/><path d="M10 16v4"/><path d="M14 16v4"/>
    </svg>
  ),
  rowing: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0"/><path d="M4 16l8-8 4 4"/><circle cx="14" cy="6" r="2"/>
    </svg>
  ),
  dancing: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="2"/><path d="M12 6v4"/><path d="M8 14l4-4 4 4"/><path d="M9 20l3-6 3 6"/><path d="M6 10l2 2"/><path d="M18 10l-2 2"/>
    </svg>
  ),
  climbing: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20"/><path d="M8 6l4 4 4-4"/><path d="M8 14l4 4 4-4"/><circle cx="12" cy="2" r="1"/>
    </svg>
  ),
  other: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
};

const DURATION_PRESETS = [15, 30, 45, 60, 90];

export default function ActivityLogger({ open, onClose, clientData, onLogged }) {
  const [step, setStep] = useState('type'); // type | details
  const [activityType, setActivityType] = useState(null);
  const [duration, setDuration] = useState(30);
  const [customDuration, setCustomDuration] = useState('');
  const [customName, setCustomName] = useState('');
  const [notes, setNotes] = useState('');
  const [calories, setCalories] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep('type');
    setActivityType(null);
    setDuration(30);
    setCustomDuration('');
    setCustomName('');
    setNotes('');
    setCalories('');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectType = (type) => {
    setActivityType(type);
    setStep('details');
  };

  const handleBack = () => {
    setStep('type');
  };

  const handleSave = async () => {
    if (!activityType || !clientData?.id) return;
    const finalDuration = customDuration ? parseInt(customDuration, 10) : duration;
    if (!finalDuration || finalDuration <= 0) return;

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const label = activityType.id === 'other' && customName.trim()
        ? customName.trim()
        : activityType.label;
      const caloriesBurned = calories ? parseInt(calories, 10) : null;
      await addDoc(collection(db, 'activityLogs'), {
        clientId: clientData.id,
        activityType: activityType.id,
        activityLabel: label,
        duration: finalDuration,
        ...(caloriesBurned ? { calories: caloriesBurned } : {}),
        notes: notes.trim() || null,
        date: today,
        completedAt: Timestamp.now(),
      });
      onLogged && onLogged({ activityType: activityType.id, duration: finalDuration });
      handleClose();
    } catch (err) {
      console.error('Error logging activity:', err);
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="al-overlay" onClick={handleClose}>
      <div className="al-modal" onClick={(e) => e.stopPropagation()}>
        {step === 'type' && (
          <>
            <div className="al-header">
              <h3>Log Activity</h3>
              <button className="al-close" onClick={handleClose} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <p className="al-subtitle">What did you do?</p>
            <div className="al-type-grid">
              {ACTIVITY_TYPES.map((type) => (
                <button
                  key={type.id}
                  className="al-type-btn"
                  onClick={() => handleSelectType(type)}
                >
                  <div className="al-type-icon">
                    {ACTIVITY_ICONS[type.id]}
                  </div>
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'details' && activityType && (
          <>
            <div className="al-header">
              <button className="al-back" onClick={handleBack} aria-label="Back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <h3>{activityType.label}</h3>
              <button className="al-close" onClick={handleClose} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="al-details">
              {activityType.id === 'other' && (
                <>
                  <label className="al-label">Activity name</label>
                  <input
                    type="text"
                    className="al-custom-name"
                    placeholder="e.g. Tennis, Pilates, Skateboarding..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    maxLength={40}
                    autoFocus
                  />
                </>
              )}
              <label className="al-label">Duration (minutes)</label>
              <div className="al-duration-presets">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    className={`al-duration-btn${duration === d && !customDuration ? ' active' : ''}`}
                    onClick={() => { setDuration(d); setCustomDuration(''); }}
                  >
                    {d}
                  </button>
                ))}
                <input
                  type="number"
                  className={`al-duration-custom${customDuration ? ' active' : ''}`}
                  placeholder="Custom"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  min="1"
                  max="600"
                  inputMode="numeric"
                />
              </div>

              <label className="al-label">Calories burned (optional)</label>
              <div className="al-calories-row">
                <input
                  type="number"
                  inputMode="numeric"
                  className="al-calories-input"
                  placeholder="0"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  min="0"
                  max="9999"
                />
                <span className="al-calories-unit">kcal</span>
              </div>

              <label className="al-label">Notes (optional)</label>
              <textarea
                className="al-notes"
                placeholder="e.g. 5km morning run, felt great..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={200}
              />

              <button
                className="al-save-btn"
                onClick={handleSave}
                disabled={saving || (!duration && !customDuration)}
              >
                {saving ? 'Saving...' : 'Log Activity'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
