import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './ClientForms.css';
import './ClientDashboard.css';

export default function ClientForms() {
  const [activeForm, setActiveForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const { currentUser, isClient, clientData, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Welcome Form State
  const [welcomeForm, setWelcomeForm] = useState({
    fitnessGoals: '',
    currentActivityLevel: '',
    exerciseHistory: '',
    injuries: '',
    medicalConditions: '',
    sleepHours: '',
    stressLevel: '',
    dietaryInfo: '',
    availability: '',
    additionalInfo: ''
  });

  // PAR-Q Form State
  const [parqForm, setParqForm] = useState({
    q1HeartCondition: false,
    q2ChestPain: false,
    q3ChestPainLastMonth: false,
    q4Balance: false,
    q5BoneJoint: false,
    q6BloodPressure: false,
    q7OtherReason: false,
    additionalDetails: '',
    declaration: false
  });

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    // Pre-fill forms if data exists
    if (clientData?.welcomeForm) {
      setWelcomeForm(clientData.welcomeForm);
    }
    if (clientData?.parqForm) {
      setParqForm(clientData.parqForm);
    }
  }, [clientData]);

  const handleWelcomeChange = (e) => {
    const { name, value } = e.target;
    setWelcomeForm(prev => ({ ...prev, [name]: value }));
  };

  const handleParqChange = (e) => {
    const { name, type, checked, value } = e.target;
    setParqForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveWelcome = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clients', clientData.id), {
        welcomeForm: {
          ...welcomeForm,
          completedAt: Timestamp.now()
        }
      });
      alert('Welcome form saved successfully!');
      setActiveForm(null);
    } catch (error) {
      console.error('Error saving welcome form:', error);
      alert('Failed to save form. Please try again.');
    }
    setSaving(false);
  };

  const handleSaveParq = async () => {
    if (!parqForm.declaration) {
      alert('Please confirm the declaration to submit the form.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clients', clientData.id), {
        parqForm: {
          ...parqForm,
          completedAt: Timestamp.now()
        }
      });
      alert('PAR-Q form saved successfully!');
      setActiveForm(null);
    } catch (error) {
      console.error('Error saving PAR-Q form:', error);
      alert('Failed to save form. Please try again.');
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  if (authLoading) {
    return <div className="client-loading">Loading...</div>;
  }

  if (!currentUser || !isClient || !clientData) {
    return null;
  }

  const welcomeCompleted = !!clientData?.welcomeForm?.completedAt;
  const parqCompleted = !!clientData?.parqForm?.completedAt;

  return (
    <div className="client-forms-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
        </div>
      </header>

      <main className="forms-main page-transition-enter">

        {!activeForm ? (
          <>
            <div className="forms-intro">
              <h2>Forms</h2>
              <p>Please complete these forms to help us better understand your fitness journey and ensure your safety.</p>
            </div>

            <div className="forms-list">
              <div className={`form-card ${welcomeCompleted ? 'completed' : ''}`}>
                <div className="form-card-info">
                  <h3>Welcome Questionnaire</h3>
                  <p>Tell us about your fitness goals, experience, and lifestyle.</p>
                  {welcomeCompleted && <span className="completed-badge">Completed</span>}
                </div>
                <button onClick={() => setActiveForm('welcome')}>
                  {welcomeCompleted ? 'View / Edit' : 'Start'}
                </button>
              </div>

              <div className={`form-card ${parqCompleted ? 'completed' : ''}`}>
                <div className="form-card-info">
                  <h3>PAR-Q Health Screening</h3>
                  <p>Physical Activity Readiness Questionnaire for your safety.</p>
                  {parqCompleted && <span className="completed-badge">Completed</span>}
                </div>
                <button onClick={() => setActiveForm('parq')}>
                  {parqCompleted ? 'View / Edit' : 'Start'}
                </button>
              </div>
            </div>
          </>
        ) : activeForm === 'welcome' ? (
          <div className="form-container">
            <div className="form-header">
              <h2>Welcome Questionnaire</h2>
              <button className="close-form" onClick={() => setActiveForm(null)}>&times;</button>
            </div>

            <div className="form-body">
              <div className="form-group">
                <label>What are your main fitness goals?</label>
                <textarea
                  name="fitnessGoals"
                  value={welcomeForm.fitnessGoals}
                  onChange={handleWelcomeChange}
                  placeholder="e.g., Lose weight, build muscle, improve endurance, increase flexibility..."
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>How would you describe your current activity level?</label>
                <select
                  name="currentActivityLevel"
                  value={welcomeForm.currentActivityLevel}
                  onChange={handleWelcomeChange}
                >
                  <option value="">Select...</option>
                  <option value="sedentary">Sedentary (little to no exercise)</option>
                  <option value="light">Lightly Active (1-2 days/week)</option>
                  <option value="moderate">Moderately Active (3-4 days/week)</option>
                  <option value="active">Very Active (5+ days/week)</option>
                  <option value="athlete">Athlete/Highly Active</option>
                </select>
              </div>

              <div className="form-group">
                <label>What is your exercise history?</label>
                <textarea
                  name="exerciseHistory"
                  value={welcomeForm.exerciseHistory}
                  onChange={handleWelcomeChange}
                  placeholder="Describe your previous experience with exercise, sports, or training..."
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Do you have any current or past injuries?</label>
                <textarea
                  name="injuries"
                  value={welcomeForm.injuries}
                  onChange={handleWelcomeChange}
                  placeholder="List any injuries that may affect your training..."
                  rows="2"
                />
              </div>

              <div className="form-group">
                <label>Do you have any medical conditions we should know about?</label>
                <textarea
                  name="medicalConditions"
                  value={welcomeForm.medicalConditions}
                  onChange={handleWelcomeChange}
                  placeholder="e.g., Diabetes, asthma, heart conditions..."
                  rows="2"
                />
              </div>

              <div className="form-group">
                <label>How many hours of sleep do you typically get?</label>
                <select
                  name="sleepHours"
                  value={welcomeForm.sleepHours}
                  onChange={handleWelcomeChange}
                >
                  <option value="">Select...</option>
                  <option value="less-5">Less than 5 hours</option>
                  <option value="5-6">5-6 hours</option>
                  <option value="7-8">7-8 hours</option>
                  <option value="more-8">More than 8 hours</option>
                </select>
              </div>

              <div className="form-group">
                <label>How would you rate your current stress level?</label>
                <select
                  name="stressLevel"
                  value={welcomeForm.stressLevel}
                  onChange={handleWelcomeChange}
                >
                  <option value="">Select...</option>
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                  <option value="very-high">Very High</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tell us about your diet/nutrition</label>
                <textarea
                  name="dietaryInfo"
                  value={welcomeForm.dietaryInfo}
                  onChange={handleWelcomeChange}
                  placeholder="Any dietary restrictions, typical eating habits, nutrition goals..."
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>What is your preferred training schedule/availability?</label>
                <textarea
                  name="availability"
                  value={welcomeForm.availability}
                  onChange={handleWelcomeChange}
                  placeholder="Days and times that work best for you..."
                  rows="2"
                />
              </div>

              <div className="form-group">
                <label>Anything else you'd like us to know?</label>
                <textarea
                  name="additionalInfo"
                  value={welcomeForm.additionalInfo}
                  onChange={handleWelcomeChange}
                  placeholder="Any other information that might be helpful..."
                  rows="3"
                />
              </div>

              <div className="form-actions">
                <button className="cancel-btn" onClick={() => setActiveForm(null)}>Cancel</button>
                <button className="save-btn" onClick={handleSaveWelcome} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="form-container">
            <div className="form-header">
              <h2>PAR-Q Health Screening</h2>
              <button className="close-form" onClick={() => setActiveForm(null)}>&times;</button>
            </div>

            <div className="form-body">
              <div className="parq-intro">
                <p>The Physical Activity Readiness Questionnaire (PAR-Q) is designed to identify those who should check with a doctor before starting an exercise program.</p>
              </div>

              <div className="parq-questions">
                <div className="parq-question">
                  <label>
                    <input
                      type="checkbox"
                      name="q1HeartCondition"
                      checked={parqForm.q1HeartCondition}
                      onChange={handleParqChange}
                    />
                    <span>Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?</span>
                  </label>
                </div>

                <div className="parq-question">
                  <label>
                    <input
                      type="checkbox"
                      name="q2ChestPain"
                      checked={parqForm.q2ChestPain}
                      onChange={handleParqChange}
                    />
                    <span>Do you feel pain in your chest when you do physical activity?</span>
                  </label>
                </div>

                <div className="parq-question">
                  <label>
                    <input
                      type="checkbox"
                      name="q3ChestPainLastMonth"
                      checked={parqForm.q3ChestPainLastMonth}
                      onChange={handleParqChange}
                    />
                    <span>In the past month, have you had chest pain when you were not doing physical activity?</span>
                  </label>
                </div>

                <div className="parq-question">
                  <label>
                    <input
                      type="checkbox"
                      name="q4Balance"
                      checked={parqForm.q4Balance}
                      onChange={handleParqChange}
                    />
                    <span>Do you lose your balance because of dizziness or do you ever lose consciousness?</span>
                  </label>
                </div>

                <div className="parq-question">
                  <label>
                    <input
                      type="checkbox"
                      name="q5BoneJoint"
                      checked={parqForm.q5BoneJoint}
                      onChange={handleParqChange}
                    />
                    <span>Do you have a bone or joint problem that could be made worse by a change in your physical activity?</span>
                  </label>
                </div>

                <div className="parq-question">
                  <label>
                    <input
                      type="checkbox"
                      name="q6BloodPressure"
                      checked={parqForm.q6BloodPressure}
                      onChange={handleParqChange}
                    />
                    <span>Is your doctor currently prescribing drugs for your blood pressure or heart condition?</span>
                  </label>
                </div>

                <div className="parq-question">
                  <label>
                    <input
                      type="checkbox"
                      name="q7OtherReason"
                      checked={parqForm.q7OtherReason}
                      onChange={handleParqChange}
                    />
                    <span>Do you know of any other reason why you should not do physical activity?</span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>If you answered YES to any questions, please provide details:</label>
                <textarea
                  name="additionalDetails"
                  value={parqForm.additionalDetails}
                  onChange={handleParqChange}
                  placeholder="Please explain any conditions or concerns..."
                  rows="4"
                />
              </div>

              <div className="parq-declaration">
                <label>
                  <input
                    type="checkbox"
                    name="declaration"
                    checked={parqForm.declaration}
                    onChange={handleParqChange}
                  />
                  <span>I have read, understood and completed this questionnaire. Any questions I had were answered to my full satisfaction. I confirm that the information provided is accurate to the best of my knowledge.</span>
                </label>
              </div>

              <div className="form-actions">
                <button className="cancel-btn" onClick={() => setActiveForm(null)}>Cancel</button>
                <button className="save-btn" onClick={handleSaveParq} disabled={saving}>
                  {saving ? 'Saving...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Tab Nav */}
      <nav className="block-bottom-nav">
        <button className="block-nav-tab" onClick={() => navigate('/client')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </button>
        <button className="block-nav-tab active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Forms</span>
        </button>
        <button className="block-nav-tab" onClick={() => navigate('/client/tools')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span>Tools</span>
        </button>
        <button className="block-nav-tab" onClick={() => navigate('/client/personal-bests')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
          <span>PBs</span>
        </button>
        {clientData?.circuitAccess && (
          <button className="block-nav-tab" onClick={() => navigate('/client/circuit')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Circuit</span>
          </button>
        )}
      </nav>
    </div>
  );
}
