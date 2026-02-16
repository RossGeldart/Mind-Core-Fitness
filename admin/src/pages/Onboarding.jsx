import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_PRICES } from '../config/stripe';
import ThemeToggle from '../components/ThemeToggle';
import './Onboarding.css';

import featureProfile from '../assets/feature_profile.PNG';
import featureProfileTabs from '../assets/feature_profile_tabs.PNG';
import featurePickAProgramme from '../assets/feature_pickaprogramme.PNG';
import featureMuscleGroup from '../assets/feature_musclegroup.PNG';
import featureRandomiseSelection from '../assets/feature_randomise_selection.PNG';
import featureRandomiseGenerated from '../assets/feature_randomise_generated_workout.PNG';
import featureWorkoutView from '../assets/feature_workout_view.PNG';
import featureNutritionView from '../assets/feature_nutritionview.PNG';
import featureJourneyPosts from '../assets/feature_journey_posts.PNG';

const FEATURES = [
  {
    title: 'Your Profile',
    desc: 'Set up your personal profile to track your fitness journey, view your stats, and showcase your progress.',
    image: featureProfile,
  },
  {
    title: 'Profile Tabs',
    desc: 'Explore your achievements, personal bests, and activity history — all organised in one place.',
    image: featureProfileTabs,
  },
  {
    title: 'Pick a Programme',
    desc: 'Choose from structured 4, 8, or 12-week programmes designed by professionals to match your goals.',
    image: featurePickAProgramme,
  },
  {
    title: 'Target Muscle Groups',
    desc: 'Select specific muscle groups to focus on and get workouts tailored to exactly what you want to train.',
    image: featureMuscleGroup,
  },
  {
    title: 'Randomise Your Workout',
    desc: 'Pick your preferences — focus area, difficulty, and duration — and let Core Buddy generate a workout for you.',
    image: featureRandomiseSelection,
  },
  {
    title: 'Generated Workout',
    desc: 'Your personalised workout is ready to go. Follow along with exercises, sets, and reps all laid out for you.',
    image: featureRandomiseGenerated,
  },
  {
    title: 'Workout View',
    desc: 'Track your progress in real time as you work through each exercise with a clear, easy-to-follow layout.',
    image: featureWorkoutView,
  },
  {
    title: 'Nutrition Tracking',
    desc: 'Log meals, scan barcodes, and track your macros and water intake to stay on top of your daily targets.',
    image: featureNutritionView,
  },
  {
    title: 'Journey Posts',
    desc: 'Share updates, celebrate wins, and connect with your Core Buddies through the community feed.',
    image: featureJourneyPosts,
  },
];

// Step order: 0=features, 1=buddy chat, 2=choose tier
const TOTAL_STEPS = 3;

export default function Onboarding() {
  const { currentUser, clientData, updateClientData, resolveClient, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // If returning from a successful Stripe checkout, onboarding is complete.
  const fromCheckout = searchParams.get('checkout') === 'success';

  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState('right');
  const [animating, setAnimating] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef(null);

  // Subscription
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);

  // ── Buddy Chat State ──
  const [chatMessages, setChatMessages] = useState([]); // { role: 'user'|'assistant', content: string }
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [chatComplete, setChatComplete] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // ── Step transition helper ──
  const goToStep = useCallback((target) => {
    if (animating) return;
    setSlideDir(target > step ? 'right' : 'left');
    setAnimating(true);
    setTimeout(() => {
      setStep(target);
      setAnimating(false);
      window.scrollTo(0, 0);
    }, 250);
  }, [step, animating]);

  // ── Auto-scroll chat to bottom ──
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatLoading]);

  // ── Send Buddy's opening message when entering step 1 ──
  useEffect(() => {
    if (step === 1 && chatMessages.length === 0 && !chatLoading) {
      sendBuddyMessage([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Redirect if already completed onboarding
  useEffect(() => {
    if (!authLoading && clientData?.onboardingComplete) {
      navigate('/client/core-buddy');
    }
  }, [authLoading, clientData, navigate]);

  // If returning from a successful Stripe checkout, finalise onboarding
  useEffect(() => {
    if (!fromCheckout || !clientData?.id || clientData?.onboardingComplete) return;
    const finalise = async () => {
      try {
        await updateDoc(doc(db, 'clients', clientData.id), { onboardingComplete: true });
        updateClientData({ onboardingComplete: true, tier: 'premium', subscriptionStatus: 'trialing' });
        navigate('/client/core-buddy');
      } catch (err) {
        console.error('Post-checkout finalise error:', err);
      }
    };
    finalise();
  }, [fromCheckout, clientData?.id, clientData?.onboardingComplete, updateClientData, navigate]);

  // Safety net: if Stripe webhook already set premium but onboardingComplete wasn't written
  useEffect(() => {
    if (authLoading || !clientData?.id) return;
    if (clientData.onboardingComplete) return;
    if (clientData.tier === 'premium' || clientData.stripeSubscriptionId) {
      const autoComplete = async () => {
        try {
          await updateDoc(doc(db, 'clients', clientData.id), { onboardingComplete: true });
          updateClientData({ onboardingComplete: true });
          navigate('/client/core-buddy');
        } catch (err) {
          console.error('Auto-complete onboarding error:', err);
        }
      };
      autoComplete();
    }
  }, [authLoading, clientData?.id, clientData?.tier, clientData?.stripeSubscriptionId, clientData?.onboardingComplete, updateClientData, navigate]);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate('/');
    }
  }, [authLoading, currentUser, navigate]);

  // Wait for auth to initialise
  if (authLoading) {
    return (
      <div className="ob-page">
        <div className="ob-content" style={{ justifyContent: 'center', minHeight: '60dvh' }}>
          <div className="ob-loading-spinner" />
        </div>
      </div>
    );
  }

  // ── Buddy Chat Helpers ──
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

    // Focus back on input
    if (chatInputRef.current) chatInputRef.current.focus();

    sendBuddyMessage(newHistory);
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
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

  // ── Keyboard handling for feature carousel ──
  const handleCarouselKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeSlide < FEATURES.length - 1) scrollToSlide(activeSlide + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeSlide > 0) scrollToSlide(activeSlide - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeSlide === FEATURES.length - 1) goToStep(1);
      else scrollToSlide(activeSlide + 1);
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const slideWidth = el.firstChild?.offsetWidth || 1;
    const idx = Math.round(el.scrollLeft / slideWidth);
    setActiveSlide(Math.min(idx, FEATURES.length - 1));
  };

  const scrollToSlide = (index) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const slideWidth = el.firstChild?.offsetWidth || 1;
    el.scrollTo({ left: slideWidth * index, behavior: 'smooth' });
  };

  // ── Step animation class ──
  const stepClass = animating
    ? `ob-step-anim ob-step-exit-${slideDir}`
    : 'ob-step-anim ob-step-enter';

  // ── Progress Bar ──
  const ProgressBar = ({ current }) => {
    if (current === 0) return null;
    const total = TOTAL_STEPS - 1; // 2 numbered steps
    const pct = (current / total) * 100;
    return (
      <div className="ob-progress">
        <div className="ob-progress-bar">
          <div className="ob-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="ob-progress-label">Step {current} of {total}</span>
      </div>
    );
  };

  // ── Step 0: Feature Showcase ──
  if (step === 0) {
    const isLastSlide = activeSlide === FEATURES.length - 1;

    return (
      <div className="ob-page ob-page--showcase">
        <div className={`ob-content ob-content--showcase ${stepClass}`}>
          <div className="ob-showcase-header">
            <img src="/Logo.webp" alt="Mind Core Fitness" className="ob-logo" width="48" height="48" />
            <div style={{ flex: 1 }}>
              <h1 className="ob-title" style={{ textAlign: 'left', marginBottom: 2 }}>Core Buddy</h1>
              <p className="ob-subtitle" style={{ textAlign: 'left', margin: 0 }}>Here's what you can do</p>
            </div>
            <ThemeToggle className="ob-theme-toggle" />
          </div>

          <div
            className="ob-showcase-carousel"
            ref={scrollRef}
            onScroll={handleScroll}
            onKeyDown={handleCarouselKeyDown}
            tabIndex={0}
            role="region"
            aria-label="Feature showcase"
            aria-roledescription="carousel"
          >
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="ob-showcase-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${FEATURES.length}: ${f.title}`}
              >
                <div className="ob-showcase-img-wrap">
                  <img src={f.image} alt={f.title} className="ob-showcase-img" />
                </div>
                <div className="ob-showcase-text">
                  <h3 className="ob-showcase-title">{f.title}</h3>
                  <p className="ob-showcase-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="ob-dots" role="tablist" aria-label="Slide indicators">
            {FEATURES.map((_, i) => (
              <span
                key={i}
                className={`ob-dot${activeSlide === i ? ' active' : ''}`}
                onClick={() => scrollToSlide(i)}
                role="tab"
                aria-selected={activeSlide === i}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <div className="ob-showcase-actions">
            {isLastSlide ? (
              <button className="ob-primary-btn" onClick={() => goToStep(1)}>
                Get Started
              </button>
            ) : (
              <>
                <button className="ob-primary-btn" onClick={() => scrollToSlide(activeSlide + 1)}>
                  Next
                </button>
                <button className="ob-skip-btn" onClick={() => goToStep(1)}>
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Buddy Chat ──
  if (step === 1) {
    return (
      <div className="ob-page ob-page--chat">
        <ThemeToggle className="ob-theme-toggle" />
        <div className={`ob-chat-container ${stepClass}`}>
          <ProgressBar current={1} />

          <div className="ob-chat-header">
            <div className="ob-chat-avatar">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                <path d="M18 14c2 1 3 3 3 5v2H3v-2c0-2 1-4 3-5"/>
                <circle cx="9" cy="7" r="0.5" fill="currentColor"/>
                <circle cx="15" cy="7" r="0.5" fill="currentColor"/>
                <path d="M9.5 10a2.5 2.5 0 0 0 5 0"/>
              </svg>
            </div>
            <div>
              <h2 className="ob-chat-name">Buddy</h2>
              <span className="ob-chat-status">
                {chatLoading ? 'typing...' : 'Your AI Coach'}
              </span>
            </div>
          </div>

          <div className="ob-chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`ob-chat-bubble ob-chat-${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="ob-chat-bubble-avatar">B</div>
                )}
                <div className="ob-chat-bubble-content">
                  {msg.content}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="ob-chat-bubble ob-chat-assistant">
                <div className="ob-chat-bubble-avatar">B</div>
                <div className="ob-chat-bubble-content ob-chat-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {chatError && (
              <div className="ob-chat-error">
                {chatError}
                <button onClick={() => sendBuddyMessage(chatMessages)}>Retry</button>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {chatComplete ? (
            <div className="ob-chat-done">
              <button className="ob-primary-btn" onClick={() => goToStep(2)}>
                Continue
              </button>
            </div>
          ) : (
            <div className="ob-chat-input-wrap">
              <textarea
                ref={chatInputRef}
                className="ob-chat-input"
                placeholder="Type your message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={1}
                disabled={chatLoading}
              />
              <button
                className="ob-chat-send"
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

          <button className="ob-back-btn" onClick={() => goToStep(0)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Choose Your Plan ──
  const handlePlanSelect = async (plan) => {
    if (plan === 'free') {
      try {
        const client = await resolveClient();
        if (client) {
          await updateDoc(doc(db, 'clients', client.id), { onboardingComplete: true });
        }
        updateClientData({ onboardingComplete: true });
        navigate('/client/core-buddy');
      } catch (err) {
        console.error('Free plan finalise error:', err);
        setCheckoutError('Something went wrong — please try again.');
      }
      return;
    }

    if (!clientData?.id || !currentUser?.uid || !currentUser?.email) {
      setCheckoutError('Account is still loading — please wait a moment and try again.');
      return;
    }

    if (!currentUser.emailVerified) {
      setCheckoutError('Please verify your email before subscribing. Check your inbox for a verification link.');
      return;
    }

    setCheckoutLoading(plan);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: STRIPE_PRICES[plan],
          clientId: clientData?.id,
          uid: currentUser?.uid,
          email: currentUser?.email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        try { localStorage.setItem('mcf_clientId', clientData.id); } catch {}
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error || 'Something went wrong');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutError('Unable to start checkout');
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="ob-page">
      <ThemeToggle className="ob-theme-toggle" />
      <div className={`ob-content ${stepClass}`}>
        <ProgressBar current={2} />
        <h1 className="ob-title">Choose Your Plan</h1>
        <p className="ob-subtitle">Start free or unlock everything with Premium</p>

        <div className="ob-plans">
          {/* Free */}
          <button className="ob-plan-card ob-plan-free" onClick={() => handlePlanSelect('free')} disabled={!!checkoutLoading}>
            <div className="ob-plan-name">Free</div>
            <div className="ob-plan-price">
              <span className="ob-plan-currency">£</span>
              <span className="ob-plan-amount">0</span>
            </div>
            <ul className="ob-plan-features">
              <li><span className="ob-plan-feat-icon">&#9889;</span> Randomiser workouts (5 &amp; 10 min)</li>
              <li><span className="ob-plan-feat-icon">&#127947;</span> 1 workout per week</li>
              <li><span className="ob-plan-feat-icon">&#128202;</span> Basic dashboard</li>
            </ul>
            <div className="ob-plan-cta-free">Get Started Free</div>
          </button>

          {/* Monthly */}
          <button className="ob-plan-card" onClick={() => handlePlanSelect('monthly')} disabled={!!checkoutLoading}>
            <div className="ob-plan-badge">Most Popular</div>
            <div className="ob-plan-name">Monthly</div>
            <div className="ob-plan-price">
              <span className="ob-plan-currency">£</span>
              <span className="ob-plan-amount">19.99</span>
              <span className="ob-plan-period">/month</span>
            </div>
            <ul className="ob-plan-features">
              <li><span className="ob-plan-feat-icon">&#10024;</span> 7-day free trial</li>
              <li><span className="ob-plan-feat-icon">&#128275;</span> All features unlocked</li>
              <li><span className="ob-plan-feat-icon">&#10060;</span> Cancel anytime</li>
            </ul>
            <div className="ob-plan-cta">
              {checkoutLoading === 'monthly' ? 'Loading...' : 'Start Free Trial'}
            </div>
          </button>

          {/* Annual */}
          <button className="ob-plan-card ob-plan-featured" onClick={() => handlePlanSelect('annual')} disabled={!!checkoutLoading}>
            <div className="ob-plan-badge">Best Value — Save 17%</div>
            <div className="ob-plan-name">Annual</div>
            <div className="ob-plan-price">
              <span className="ob-plan-currency">£</span>
              <span className="ob-plan-amount">199.99</span>
              <span className="ob-plan-period">/year</span>
            </div>
            <ul className="ob-plan-features">
              <li><span className="ob-plan-feat-icon">&#10024;</span> 7-day free trial</li>
              <li><span className="ob-plan-feat-icon">&#128275;</span> All features unlocked</li>
              <li><span className="ob-plan-feat-icon">&#11088;</span> Best value</li>
            </ul>
            <div className="ob-plan-cta ob-plan-cta-featured">
              {checkoutLoading === 'annual' ? 'Loading...' : 'Start Free Trial'}
            </div>
          </button>
        </div>

        {checkoutError && <p className="ob-error">{checkoutError}</p>}

        <button className="ob-back-btn" onClick={() => goToStep(1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back
        </button>
      </div>
    </div>
  );
}
