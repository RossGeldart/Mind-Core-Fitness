import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { PROGRAMMABLE_EXERCISES } from '../config/buddyExercises';
import CoreBuddyNav from '../components/CoreBuddyNav';
import PullToRefresh from '../components/PullToRefresh';
import './CoreBuddyCoach.css';

export default function CoreBuddyCoach() {
  const navigate = useNavigate();
  const { clientData, currentUser, resolveClient, updateClientData } = useAuth();

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [chatComplete, setChatComplete] = useState(false);
  const [savedProfile, setSavedProfile] = useState(null);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Plan generation state
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [expandedWeek, setExpandedWeek] = useState(1);

  // Guard — if buddy not enabled, bounce back
  if (!clientData?.buddyEnabled) {
    return (
      <div className="buddy-page">
        <div className="buddy-container">
          <p>Buddy is not enabled on your account.</p>
          <button onClick={() => navigate('/client/core-buddy')}>Back to Dashboard</button>
        </div>
        <CoreBuddyNav active="home" />
      </div>
    );
  }

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatLoading]);

  // Send Buddy's opening message on mount
  useEffect(() => {
    if (chatMessages.length === 0 && !chatLoading) {
      sendBuddyMessage([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Chat helpers ──
  const sendBuddyMessage = async (history) => {
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await fetch('/api/buddy-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          clientName: clientData?.name || currentUser?.displayName || 'there',
        }),
      });
      const data = await res.json();
      if (data.error) {
        setChatError(data.error);
        return;
      }

      const assistantMsg = { role: 'assistant', content: data.reply };
      setChatMessages(prev => [...prev, assistantMsg]);

      // If profile data was extracted, save it
      if (data.profileData) {
        await saveProfileData(data.profileData);
        setSavedProfile(data.profileData);
        setChatComplete(true);
      }
    } catch (err) {
      console.error('Buddy chat error:', err);
      setChatError('Something went wrong — try sending again.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatSend = () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg = { role: 'user', content: text };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatInput('');

    if (chatInputRef.current) chatInputRef.current.focus();
    sendBuddyMessage(newHistory);
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  // Generate a personalised monthly plan using Buddy AI
  const generatePlan = async (profile) => {
    setGeneratingPlan(true);
    setPlanError(null);
    try {
      // Build a slim exercise library for the API (no storagePaths to save tokens)
      const exerciseLibrary = PROGRAMMABLE_EXERCISES.map(e => ({
        name: e.name,
        type: e.type,
        equipment: e.equipment,
        group: e.group,
      }));

      const res = await fetch('/api/buddy-generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            name: clientData?.name || currentUser?.displayName || 'Client',
            ...profile,
          },
          exerciseLibrary,
        }),
      });
      const data = await res.json();

      if (data.error && !data.plan) {
        setPlanError(data.error);
        return;
      }

      if (data.reply) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }

      if (data.plan) {
        setGeneratedPlan(data.plan);
      } else {
        setPlanError('Buddy couldn\'t structure the plan — try again.');
      }
    } catch (err) {
      console.error('Plan generation error:', err);
      setPlanError('Something went wrong generating your plan — try again.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const saveProfileData = async (profile) => {
    try {
      const client = await resolveClient();
      if (!client) return;

      // Save onboarding submission
      await setDoc(doc(db, 'onboardingSubmissions', client.id), {
        clientId: client.id,
        clientName: client.name,
        email: client.email,
        source: 'buddy_chat',
        welcome: {
          dob: profile.dob || null,
          gender: profile.gender || null,
          goals: profile.goals || [],
          experience: profile.experience || null,
          injuries: profile.injuries || null,
          activityLevel: profile.activityLevel || null,
          exerciseHistory: profile.exerciseHistory || null,
          sleepHours: profile.sleepHours || null,
          stressLevel: profile.stressLevel || null,
          dietaryInfo: profile.dietaryInfo || null,
          availability: profile.availability || null,
          additionalInfo: profile.additionalInfo || null,
        },
        submittedAt: serverTimestamp(),
      });

      // Save fitness data to client doc
      const goals = profile.goals || [];
      await updateDoc(doc(db, 'clients', client.id), {
        fitnessGoal: goals[0] || null,
        fitnessGoals: goals,
        experienceLevel: profile.experience || null,
        dob: profile.dob || null,
        injuries: profile.injuries || null,
      });

      // Update local state
      updateClientData({
        fitnessGoal: goals[0] || null,
        fitnessGoals: goals,
        experienceLevel: profile.experience,
        dob: profile.dob,
      });
    } catch (err) {
      console.error('Save profile error:', err);
    }
  };

  return (
    <PullToRefresh>
    <div className="buddy-page buddy-page--chat">
      <div className="buddy-chat-container">
        <div className="buddy-chat-top">
          <button className="buddy-back" onClick={() => navigate('/client/core-buddy')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>

          <div className="buddy-chat-header">
            <div className="buddy-chat-avatar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                <path d="M18 14c2 1 3 3 3 5v2H3v-2c0-2 1-4 3-5"/>
                <circle cx="9" cy="7" r="0.5" fill="currentColor"/>
                <circle cx="15" cy="7" r="0.5" fill="currentColor"/>
                <path d="M9.5 10a2.5 2.5 0 0 0 5 0"/>
              </svg>
            </div>
            <div>
              <h2 className="buddy-chat-name">Buddy</h2>
              <span className="buddy-chat-status">
                {chatLoading ? 'typing...' : 'Your AI Coach'}
              </span>
            </div>
          </div>
        </div>

        <div className="buddy-chat-messages">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`buddy-chat-bubble buddy-chat-${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="buddy-chat-bubble-avatar">B</div>
              )}
              <div className="buddy-chat-bubble-content">
                {msg.content}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="buddy-chat-bubble buddy-chat-assistant">
              <div className="buddy-chat-bubble-avatar">B</div>
              <div className="buddy-chat-bubble-content buddy-chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          {chatError && (
            <div className="buddy-chat-error">
              {chatError}
              <button onClick={() => sendBuddyMessage(chatMessages)}>Retry</button>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {chatComplete ? (
          <div className="buddy-chat-done">
            {generatedPlan ? (
              <>
                <div className="buddy-plan-preview">
                  <div className="buddy-plan-header">
                    <h3 className="buddy-plan-name">{generatedPlan.planName}</h3>
                    <div className="buddy-plan-meta">
                      {generatedPlan.daysPerWeek} days/week · 4 weeks · {generatedPlan.experienceLevel}
                    </div>
                    <div className="buddy-plan-goals">
                      {(generatedPlan.goals || []).map((g, i) => (
                        <span key={i} className="buddy-plan-goal-tag">{g}</span>
                      ))}
                    </div>
                  </div>

                  <div className="buddy-plan-weeks">
                    {(generatedPlan.weeks || []).map((week) => (
                      <div key={week.weekNumber} className="buddy-plan-week">
                        <button
                          className={`buddy-plan-week-toggle ${expandedWeek === week.weekNumber ? 'active' : ''}`}
                          onClick={() => setExpandedWeek(expandedWeek === week.weekNumber ? null : week.weekNumber)}
                        >
                          <span>Week {week.weekNumber}</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d={expandedWeek === week.weekNumber ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
                          </svg>
                        </button>

                        {expandedWeek === week.weekNumber && (
                          <div className="buddy-plan-days">
                            {(week.days || []).map((day) => (
                              <div key={day.dayNumber} className="buddy-plan-day">
                                <div className="buddy-plan-day-header">
                                  <span className="buddy-plan-day-num">Day {day.dayNumber}</span>
                                  <span className="buddy-plan-day-focus">{day.focus}</span>
                                </div>
                                <div className="buddy-plan-exercises">
                                  {(day.exercises || []).map((ex, ei) => (
                                    <div key={ei} className="buddy-plan-exercise">
                                      <span className="buddy-plan-ex-name">{ex.name}</span>
                                      <span className="buddy-plan-ex-detail">
                                        {ex.type === 'timed'
                                          ? `${ex.sets}×${ex.duration}s`
                                          : `${ex.sets}×${ex.reps}`
                                        }
                                      </span>
                                      {ex.notes && <span className="buddy-plan-ex-note">{ex.notes}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  className="buddy-chat-done-btn"
                  onClick={() => navigate('/client/core-buddy')}
                >
                  Back to Dashboard
                </button>
              </>
            ) : generatingPlan ? (
              <div className="buddy-plan-loading">
                <div className="buddy-plan-spinner" />
                <p>Buddy is building your monthly plan...</p>
              </div>
            ) : planError ? (
              <div className="buddy-plan-error">
                <p>{planError}</p>
                <button
                  className="buddy-chat-done-btn"
                  onClick={() => generatePlan(savedProfile)}
                >
                  Try Again
                </button>
              </div>
            ) : savedProfile ? (
              <>
                <p className="buddy-chat-done-text">Profile saved! Ready to build your personalised monthly plan?</p>
                <button
                  className="buddy-chat-done-btn"
                  onClick={() => generatePlan(savedProfile)}
                >
                  Generate My Plan
                </button>
                <button
                  className="buddy-chat-skip-btn"
                  onClick={() => navigate('/client/core-buddy')}
                >
                  Maybe later
                </button>
              </>
            ) : (
              <>
                <p className="buddy-chat-done-text">Profile saved — you're all set.</p>
                <button
                  className="buddy-chat-done-btn"
                  onClick={() => navigate('/client/core-buddy')}
                >
                  Back to Dashboard
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="buddy-chat-input-wrap">
            <textarea
              ref={chatInputRef}
              className="buddy-chat-input"
              placeholder="Type your message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              rows={1}
              disabled={chatLoading}
            />
            <button
              className="buddy-chat-send"
              onClick={handleChatSend}
              disabled={!chatInput.trim() || chatLoading}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <CoreBuddyNav active="home" />
    </div>
    </PullToRefresh>
  );
}
