import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './AddClient.css';

export default function AddClient() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
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
        setFormData(prev => ({
          ...prev,
          endDate: end.toISOString().split('T')[0]
        }));
      }
    }
  }, [formData.startDate, formData.weeksInBlock]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const clientData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        weeksInBlock: parseInt(formData.weeksInBlock),
        totalSessions: parseInt(formData.numberOfSessions),
        sessionsRemaining: parseInt(formData.numberOfSessions),
        sessionDuration: parseInt(formData.sessionDuration),
        startDate: Timestamp.fromDate(new Date(formData.startDate)),
        endDate: Timestamp.fromDate(new Date(formData.endDate)),
        status: 'active',
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, 'clients'), clientData);
      navigate('/dashboard');
    } catch (err) {
      console.error('Error adding client:', err);
      setError('Failed to add client. Please try again.');
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

  return (
    <div className="add-client-page">
      <header className="page-header">
        <button className="back-btn" onClick={handleCancel}>
          &larr; Back
        </button>
        <h1>Add New Client</h1>
      </header>

      <main className="page-content">
        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
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
