import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './AddClient.css';

const CLIENT_TYPES = [
  { value: 'block', label: 'Block (1-2-1)' },
  { value: 'circuit_vip', label: 'Circuit VIP' },
  { value: 'circuit_dropin', label: 'Circuit Drop-in' },
  { value: 'core_buddy', label: 'Core Buddy' },
];

export default function AddClient() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    clientType: 'block',
    circuitAccess: false,
    coreBuddyAccess: false,
    weeksInBlock: '',
    numberOfSessions: '',
    sessionDuration: '45',
    startDate: '',
    endDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!currentUser || !isAdmin)) {
      navigate('/');
    }
  }, [currentUser, isAdmin, authLoading, navigate]);

  // Auto-calculate end date when start date or weeks change
  useEffect(() => {
    if (formData.startDate && formData.weeksInBlock) {
      const start = new Date(formData.startDate);
      const weeks = parseInt(formData.weeksInBlock);
      if (!isNaN(weeks) && weeks > 0) {
        const end = new Date(start);
        end.setDate(end.getDate() + (weeks * 7));
        const year = end.getFullYear();
        const month = (end.getMonth() + 1).toString().padStart(2, '0');
        const day = end.getDate().toString().padStart(2, '0');
        setFormData(prev => ({
          ...prev,
          endDate: `${year}-${month}-${day}`
        }));
      }
    }
  }, [formData.startDate, formData.weeksInBlock]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Create Firebase Auth account for portal access
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        formData.email.trim().toLowerCase(),
        formData.password
      );
      await signOut(secondaryAuth);

      const isBlock = formData.clientType === 'block';

      const clientDoc = {
        uid: userCredential.user.uid,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        clientType: formData.clientType,
        status: 'active',
        createdAt: Timestamp.now()
      };

      if (isBlock) {
        clientDoc.circuitAccess = formData.circuitAccess;
        clientDoc.coreBuddyAccess = formData.coreBuddyAccess;
        clientDoc.weeksInBlock = parseInt(formData.weeksInBlock);
        clientDoc.totalSessions = parseInt(formData.numberOfSessions);
        clientDoc.sessionsRemaining = parseInt(formData.numberOfSessions);
        clientDoc.sessionDuration = parseInt(formData.sessionDuration);
        clientDoc.startDate = Timestamp.fromDate(new Date(formData.startDate));
        clientDoc.endDate = Timestamp.fromDate(new Date(formData.endDate));
      } else if (formData.clientType === 'core_buddy') {
        clientDoc.coreBuddyAccess = true;
      } else {
        clientDoc.circuitStrikes = 0;
        clientDoc.circuitBanUntil = null;
      }

      await addDoc(collection(db, 'clients'), clientDoc);
      navigate('/dashboard');
    } catch (err) {
      console.error('Error adding client:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError('Failed to add client. Please try again.');
      }
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/dashboard');
  };

  if (authLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!currentUser || !isAdmin) {
    return null;
  }

  const isBlock = formData.clientType === 'block';

  return (
    <div className="add-client-page">
      <header className="page-header">
        <button className="back-btn" onClick={handleCancel} aria-label="Go back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1>Add New Client</h1>
      </header>

      <main className="page-content">
        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Client Type Selector */}
          <div className="form-group">
            <label>Client Type</label>
            <div className="client-type-toggle">
              {CLIENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`type-btn ${formData.clientType === t.value ? 'active' : ''}`}
                  onClick={() => setFormData(prev => ({ ...prev, clientType: t.value }))}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="name">Client Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Smith"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Client Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Client Portal Password</label>
            <input
              type="text"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Set a password for client login"
              minLength="6"
              required
            />
            <span className="helper-text">Minimum 6 characters. Share this with your client.</span>
          </div>

          {/* Circuit access toggle for block clients */}
          {isBlock && (
            <div className="form-group">
              <label className="circuit-toggle-label">
                <input
                  type="checkbox"
                  name="circuitAccess"
                  checked={formData.circuitAccess}
                  onChange={handleChange}
                />
                <span>Also allow Circuit Class access</span>
              </label>
            </div>
          )}

          {/* Core Buddy access toggle for block clients */}
          {isBlock && (
            <div className="form-group">
              <label className="circuit-toggle-label">
                <input
                  type="checkbox"
                  name="coreBuddyAccess"
                  checked={formData.coreBuddyAccess}
                  onChange={handleChange}
                />
                <span>Enable Core Buddy access</span>
              </label>
            </div>
          )}

          {/* Block-specific fields */}
          {isBlock && (
            <>
              <div className="form-group">
                <label htmlFor="weeksInBlock">Weeks in Block</label>
                <input
                  type="number"
                  id="weeksInBlock"
                  name="weeksInBlock"
                  value={formData.weeksInBlock}
                  onChange={handleChange}
                  placeholder="8"
                  min="1"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="numberOfSessions">Number of Sessions</label>
                <input
                  type="number"
                  id="numberOfSessions"
                  name="numberOfSessions"
                  value={formData.numberOfSessions}
                  onChange={handleChange}
                  placeholder="16"
                  min="1"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="sessionDuration">Session Duration</label>
                <select
                  id="sessionDuration"
                  name="sessionDuration"
                  value={formData.sessionDuration}
                  onChange={handleChange}
                  required
                >
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="startDate">Start Date</label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="endDate">End Date (auto-calculated)</label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  required
                />
                <span className="helper-text">Calculated from start date + weeks</span>
              </div>
            </>
          )}

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Saving...' : 'Save Client'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
