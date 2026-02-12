import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import './FormSubmissions.css';

const ACTIVITY_LABELS = {
  'sedentary': 'Sedentary (little to no exercise)',
  'light': 'Lightly Active (1-2 days/week)',
  'moderate': 'Moderately Active (3-4 days/week)',
  'active': 'Very Active (5+ days/week)',
  'athlete': 'Athlete/Highly Active'
};

const SLEEP_LABELS = {
  'less-5': 'Less than 5 hours',
  '5-6': '5-6 hours',
  '7-8': '7-8 hours',
  'more-8': 'More than 8 hours'
};

const STRESS_LABELS = {
  'low': 'Low',
  'moderate': 'Moderate',
  'high': 'High',
  'very-high': 'Very High'
};

const PARQ_QUESTIONS = [
  { key: 'q1HeartCondition', text: 'Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?' },
  { key: 'q2ChestPain', text: 'Do you feel pain in your chest when you do physical activity?' },
  { key: 'q3ChestPainLastMonth', text: 'In the past month, have you had chest pain when you were not doing physical activity?' },
  { key: 'q4Balance', text: 'Do you lose your balance because of dizziness or do you ever lose consciousness?' },
  { key: 'q5BoneJoint', text: 'Do you have a bone or joint problem that could be made worse by a change in your physical activity?' },
  { key: 'q6BloodPressure', text: 'Is your doctor currently prescribing drugs for your blood pressure or heart condition?' },
  { key: 'q7OtherReason', text: 'Do you know of any other reason why you should not do physical activity?' }
];

export default function FormSubmissions() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'clients'));
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      clientsData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
    setLoading(false);
  };

  const hasWelcome = (client) => !!client.welcomeForm?.completedAt;
  const hasParq = (client) => !!client.parqForm?.completedAt;
  const hasAnyForm = (client) => hasWelcome(client) || hasParq(client);
  const hasBothForms = (client) => hasWelcome(client) && hasParq(client);

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = !search || client.name?.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (filter === 'all') return true;
    if (filter === 'completed') return hasBothForms(client);
    if (filter === 'partial') return hasAnyForm(client) && !hasBothForms(client);
    if (filter === 'pending') return !hasAnyForm(client);
    return true;
  });

  const completedCount = clients.filter(hasBothForms).length;
  const partialCount = clients.filter(c => hasAnyForm(c) && !hasBothForms(c)).length;
  const pendingCount = clients.filter(c => !hasAnyForm(c)).length;

  const handleClientClick = (clientId) => {
    if (expandedClient === clientId) {
      setExpandedClient(null);
      setActiveForm(null);
    } else {
      setExpandedClient(clientId);
      setActiveForm(null);
    }
  };

  if (loading) {
    return <div className="forms-loading">Loading form submissions...</div>;
  }

  return (
    <div className="form-submissions">
      {/* Summary Stats */}
      <div className="forms-stats">
        <div className="forms-stat">
          <span className="stat-number">{completedCount}</span>
          <span className="stat-label">Complete</span>
        </div>
        <div className="forms-stat partial">
          <span className="stat-number">{partialCount}</span>
          <span className="stat-label">Partial</span>
        </div>
        <div className="forms-stat pending">
          <span className="stat-number">{pendingCount}</span>
          <span className="stat-label">Pending</span>
        </div>
      </div>

      {/* Search */}
      <div className="forms-search">
        <svg className="forms-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="forms-search-input"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="forms-search-clear" onClick={() => setSearch('')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="forms-filter">
        <button className={`forms-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All <span className="forms-filter-count">{clients.length}</span>
        </button>
        <button className={`forms-filter-btn ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>
          Complete <span className="forms-filter-count">{completedCount}</span>
        </button>
        <button className={`forms-filter-btn ${filter === 'partial' ? 'active' : ''}`} onClick={() => setFilter('partial')}>
          Partial <span className="forms-filter-count">{partialCount}</span>
        </button>
        <button className={`forms-filter-btn ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
          Pending <span className="forms-filter-count">{pendingCount}</span>
        </button>
      </div>

      {/* Client List */}
      {filteredClients.length === 0 ? (
        <div className="forms-empty">
          <div className="forms-empty-icon">
            <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="20" y="15" width="60" height="70" rx="4" />
              <path d="M35 35h30M35 50h30M35 65h20" />
              <circle cx="70" cy="70" r="18" fill="var(--bg-card)" strokeWidth="3" />
              <path d="M63 70h14M70 63v14" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <p>No clients match this filter</p>
          <span>Try adjusting your search or filter</span>
        </div>
      ) : (
        <div className="forms-client-list">
          {filteredClients.map(client => {
            const isExpanded = expandedClient === client.id;
            const welcome = hasWelcome(client);
            const parq = hasParq(client);

            return (
              <div key={client.id} className={`forms-client-card ${isExpanded ? 'expanded' : ''}`}>
                {/* Client Row */}
                <div className="forms-client-row" onClick={() => handleClientClick(client.id)}>
                  <div className="forms-client-left">
                    <div className="forms-client-initial">
                      {(client.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="forms-client-info">
                      <h3>{client.name || 'Unknown'}</h3>
                      <div className="forms-badges">
                        <span className={`form-badge ${welcome ? 'done' : 'not-done'}`}>
                          {welcome ? '✓' : '○'} Welcome
                        </span>
                        <span className={`form-badge ${parq ? 'done' : 'not-done'}`}>
                          {parq ? '✓' : '○'} PAR-Q
                        </span>
                      </div>
                    </div>
                  </div>
                  <svg className={`forms-chevron ${isExpanded ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>

                {/* Expanded Panel */}
                {isExpanded && (
                  <div className="forms-expand-panel">
                    {!welcome && !parq ? (
                      <div className="forms-no-data">
                        <p>No forms submitted yet</p>
                        <span>This client hasn't completed any forms</span>
                      </div>
                    ) : (
                      <>
                        {/* Form Toggle */}
                        <div className="forms-toggle">
                          {welcome && (
                            <button
                              className={`forms-toggle-btn ${activeForm === 'welcome' || (!activeForm && welcome) ? 'active' : ''}`}
                              onClick={() => setActiveForm('welcome')}
                            >
                              Welcome Questionnaire
                            </button>
                          )}
                          {parq && (
                            <button
                              className={`forms-toggle-btn ${activeForm === 'parq' || (!activeForm && !welcome && parq) ? 'active' : ''}`}
                              onClick={() => setActiveForm('parq')}
                            >
                              PAR-Q Health Screening
                            </button>
                          )}
                        </div>

                        {/* Welcome Form Data */}
                        {(activeForm === 'welcome' || (!activeForm && welcome)) && welcome && (
                          <div className="form-data">
                            <div className="form-data-header">
                              <span className="form-data-title">Welcome Questionnaire</span>
                              <span className="form-data-date">Submitted {formatDate(client.welcomeForm.completedAt)}</span>
                            </div>

                            {client.welcomeForm.fitnessGoals && (
                              <div className="form-data-field">
                                <label>Fitness Goals</label>
                                <p>{client.welcomeForm.fitnessGoals}</p>
                              </div>
                            )}

                            {client.welcomeForm.currentActivityLevel && (
                              <div className="form-data-field">
                                <label>Activity Level</label>
                                <p>{ACTIVITY_LABELS[client.welcomeForm.currentActivityLevel] || client.welcomeForm.currentActivityLevel}</p>
                              </div>
                            )}

                            {client.welcomeForm.exerciseHistory && (
                              <div className="form-data-field">
                                <label>Exercise History</label>
                                <p>{client.welcomeForm.exerciseHistory}</p>
                              </div>
                            )}

                            {client.welcomeForm.injuries && (
                              <div className="form-data-field">
                                <label>Injuries</label>
                                <p>{client.welcomeForm.injuries}</p>
                              </div>
                            )}

                            {client.welcomeForm.medicalConditions && (
                              <div className="form-data-field">
                                <label>Medical Conditions</label>
                                <p>{client.welcomeForm.medicalConditions}</p>
                              </div>
                            )}

                            {client.welcomeForm.sleepHours && (
                              <div className="form-data-field">
                                <label>Sleep</label>
                                <p>{SLEEP_LABELS[client.welcomeForm.sleepHours] || client.welcomeForm.sleepHours}</p>
                              </div>
                            )}

                            {client.welcomeForm.stressLevel && (
                              <div className="form-data-field">
                                <label>Stress Level</label>
                                <p>{STRESS_LABELS[client.welcomeForm.stressLevel] || client.welcomeForm.stressLevel}</p>
                              </div>
                            )}

                            {client.welcomeForm.dietaryInfo && (
                              <div className="form-data-field">
                                <label>Diet / Nutrition</label>
                                <p>{client.welcomeForm.dietaryInfo}</p>
                              </div>
                            )}

                            {client.welcomeForm.availability && (
                              <div className="form-data-field">
                                <label>Availability</label>
                                <p>{client.welcomeForm.availability}</p>
                              </div>
                            )}

                            {client.welcomeForm.additionalInfo && (
                              <div className="form-data-field">
                                <label>Additional Info</label>
                                <p>{client.welcomeForm.additionalInfo}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* PAR-Q Form Data */}
                        {activeForm === 'parq' && parq && (
                          <div className="form-data">
                            <div className="form-data-header">
                              <span className="form-data-title">PAR-Q Health Screening</span>
                              <span className="form-data-date">Submitted {formatDate(client.parqForm.completedAt)}</span>
                            </div>

                            <div className="parq-results">
                              {PARQ_QUESTIONS.map(q => {
                                const answered = client.parqForm[q.key];
                                return (
                                  <div key={q.key} className={`parq-result-item ${answered ? 'flagged' : ''}`}>
                                    <span className={`parq-answer ${answered ? 'yes' : 'no'}`}>
                                      {answered ? 'YES' : 'NO'}
                                    </span>
                                    <span className="parq-question-text">{q.text}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {client.parqForm.additionalDetails && (
                              <div className="form-data-field">
                                <label>Additional Details</label>
                                <p>{client.parqForm.additionalDetails}</p>
                              </div>
                            )}

                            <div className="parq-declaration-status">
                              <span className={client.parqForm.declaration ? 'declared' : 'not-declared'}>
                                {client.parqForm.declaration ? '✓ Declaration signed' : '✗ Declaration not signed'}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
