import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
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

const PARQ_QUESTIONS = [
  'Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?',
  'Do you feel pain in your chest when you do physical activity?',
  'In the past month, have you had chest pain when you were not doing physical activity?',
  'Do you lose your balance because of dizziness or do you ever lose consciousness?',
  'Do you have a bone or joint problem (e.g. back, knee, or hip) that could be made worse by a change in your physical activity?',
  'Is your doctor currently prescribing drugs (e.g. water pills) for your blood pressure or heart condition?',
  'Do you know of any other reason why you should not do physical activity?',
];

const FITNESS_GOALS = [
  'Lose weight',
  'Build muscle',
  'Improve fitness',
  'Get stronger',
  'Tone up',
  'Sport performance',
  'Stress relief',
  'Stay active',
];

const MAX_GOALS = 3;

const EXPERIENCE_LEVELS = [
  { key: 'beginner', label: 'Beginner', desc: 'New to exercise or returning after a long break' },
  { key: 'intermediate', label: 'Intermediate', desc: 'Training regularly for 6+ months' },
  { key: 'advanced', label: 'Advanced', desc: 'Training consistently for 2+ years' },
];

// Step order: 0=features, 1=welcome, 2=parq, 3=choose tier
const TOTAL_STEPS = 4;

export default function Onboarding() {
  const { currentUser, clientData, updateClientData, resolveClient, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // If returning from a successful Stripe checkout, onboarding is complete.
  const fromCheckout = searchParams.get('checkout') === 'success';

  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState('right'); // 'right' = forward, 'left' = back
  const [animating, setAnimating] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef(null);

  // Subscription
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);

  // Welcome form
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [goals, setGoals] = useState([]); // multi-select (1-3)
  const [experience, setExperience] = useState('');
  const [injuries, setInjuries] = useState('');

  // PARQ form
  const [parqAnswers, setParqAnswers] = useState(PARQ_QUESTIONS.map(() => null));
  const [parqDeclare, setParqDeclare] = useState(false);
  const [parqSubmitting, setParqSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Signature pad
  const sigCanvasRef = useRef(null);
  const sigDrawingRef = useRef(false);
  const [sigHasContent, setSigHasContent] = useState(false);

  // ── Step transition helper ──
  const goToStep = useCallback((target) => {
    if (animating) return;
    setSlideDir(target > step ? 'right' : 'left');
    setAnimating(true);
    // Small delay to let the exit animation play
    setTimeout(() => {
      setStep(target);
      setAnimating(false);
    }, 250);
  }, [step, animating]);

  // ── Restore draft from Firestore on mount ──
  useEffect(() => {
    if (!clientData?.id) return;
    const loadDraft = async () => {
      try {
        const snap = await getDoc(doc(db, 'onboardingDrafts', clientData.id));
        if (snap.exists()) {
          const d = snap.data();
          if (d.dob) setDob(d.dob);
          if (d.gender) setGender(d.gender);
          if (d.goals?.length) setGoals(d.goals);
          if (d.experience) setExperience(d.experience);
          if (d.injuries) setInjuries(d.injuries);
        }
      } catch (e) {
        // Non-critical — just start fresh
      }
    };
    loadDraft();
  }, [clientData?.id]);

  // ── Save draft to Firestore when advancing from welcome form ──
  const saveDraft = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      await setDoc(doc(db, 'onboardingDrafts', clientData.id), {
        dob, gender, goals, experience, injuries: injuries.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      // Non-critical
    }
  }, [clientData?.id, dob, gender, goals, experience, injuries]);

  // Keep the canvas internal resolution in sync with its CSS display size.
  useEffect(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        setSigHasContent(false);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [step]);

  const getSigPos = (e) => {
    const canvas = sigCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const sigStart = (e) => {
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getSigPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    sigDrawingRef.current = true;
  };

  const sigMove = (e) => {
    if (!sigDrawingRef.current) return;
    e.preventDefault();
    const ctx = sigCanvasRef.current.getContext('2d');
    const pos = getSigPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setSigHasContent(true);
  };

  const sigEnd = () => { sigDrawingRef.current = false; };

  const sigClear = () => {
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigHasContent(false);
  };

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

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate('/');
    }
  }, [authLoading, currentUser, navigate]);

  // Wait for auth to initialise so we know if the user is logged in
  if (authLoading) {
    return (
      <div className="ob-page">
        <div className="ob-content" style={{ justifyContent: 'center', minHeight: '60dvh' }}>
          <div className="ob-loading-spinner" />
        </div>
      </div>
    );
  }

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

  // Handle feature carousel scroll
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

  // Multi-goal toggle
  const toggleGoal = (g) => {
    setGoals(prev => {
      if (prev.includes(g)) return prev.filter(x => x !== g);
      if (prev.length >= MAX_GOALS) return prev;
      return [...prev, g];
    });
  };

  // ── Step animation class ──
  const stepClass = animating
    ? `ob-step-anim ob-step-exit-${slideDir}`
    : 'ob-step-anim ob-step-enter';

  // ── Progress Bar Component ──
  // Steps 1-3 show as "Step X of 3" (step 0 = showcase doesn't count)
  const ProgressBar = ({ current }) => {
    if (current === 0) return null;
    const total = TOTAL_STEPS - 1; // 3 numbered steps
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

  // ── Step 1: Welcome Form ──
  if (step === 1) {
    const welcomeValid = dob && gender && goals.length > 0 && experience;

    const handleWelcomeContinue = () => {
      saveDraft();
      goToStep(2);
    };

    return (
      <div className="ob-page">
        <ThemeToggle className="ob-theme-toggle" />
        <div className={`ob-content ${stepClass}`}>
          <ProgressBar current={1} />
          <h1 className="ob-title">Let's Get To Know You</h1>
          <p className="ob-subtitle">Tell us a bit about yourself and where you're at with your fitness — we're in this together</p>

          <div className="ob-form">
            <label className="ob-label">Date of Birth</label>
            <input
              type="date"
              className="ob-input"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />

            <label className="ob-label">Sex</label>
            <div className="ob-chip-group">
              {['Male', 'Female', 'Other', 'Prefer not to say'].map((g) => (
                <button
                  key={g}
                  className={`ob-chip${gender === g ? ' active' : ''}`}
                  onClick={() => setGender(g)}
                >
                  {g}
                </button>
              ))}
            </div>

            <label className="ob-label">
              What Are Your Fitness Goals? <span className="ob-optional">(pick up to {MAX_GOALS})</span>
            </label>
            <div className="ob-chip-group">
              {FITNESS_GOALS.map((g) => (
                <button
                  key={g}
                  className={`ob-chip${goals.includes(g) ? ' active' : ''}${!goals.includes(g) && goals.length >= MAX_GOALS ? ' disabled' : ''}`}
                  onClick={() => toggleGoal(g)}
                  disabled={!goals.includes(g) && goals.length >= MAX_GOALS}
                >
                  {g}
                </button>
              ))}
            </div>

            <label className="ob-label">Where Are You At Right Now?</label>
            <div className="ob-level-group">
              {EXPERIENCE_LEVELS.map((lvl) => (
                <button
                  key={lvl.key}
                  className={`ob-level-card${experience === lvl.key ? ' active' : ''}`}
                  onClick={() => setExperience(lvl.key)}
                >
                  <strong>{lvl.label}</strong>
                  <span>{lvl.desc}</span>
                </button>
              ))}
            </div>

            <label className="ob-label">Any Injuries or Conditions We Should Know About? <span className="ob-optional">(optional)</span></label>
            <textarea
              className="ob-textarea"
              placeholder="E.g. bad knee, lower back pain, asthma..."
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>

          <button
            className="ob-primary-btn"
            disabled={!welcomeValid}
            onClick={handleWelcomeContinue}
          >
            Continue
          </button>

          <button className="ob-back-btn" onClick={() => goToStep(0)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: PARQ Form ──
  if (step === 2) {
    const allParqAnswered = parqAnswers.every((a) => a !== null);
    const canSubmitParq = allParqAnswered && parqDeclare && sigHasContent;

    // Save onboarding submission (welcome + PARQ) then advance to tier selection
    const handleParqSubmit = async () => {
      if (!canSubmitParq || parqSubmitting) return;
      setParqSubmitting(true);
      setSubmitError(null);

      try {
        const client = await resolveClient();
        if (!client) {
          setSubmitError('Could not find your account. Please try logging out and back in.');
          setParqSubmitting(false);
          return;
        }

        // Get signature as data URL
        const signatureData = sigCanvasRef.current.toDataURL('image/png');

        // Save onboarding submission data
        await setDoc(doc(db, 'onboardingSubmissions', client.id), {
          clientId: client.id,
          clientName: client.name,
          email: client.email,
          welcome: {
            dob,
            gender: gender || null,
            goals,
            experience,
            injuries: injuries.trim() || null,
          },
          parq: {
            questions: PARQ_QUESTIONS,
            answers: parqAnswers,
            hasYes: parqAnswers.includes(true),
            declaration: true,
            signature: signatureData,
          },
          submittedAt: serverTimestamp(),
        });

        // Save fitness data to client doc (but don't mark onboardingComplete yet)
        await updateDoc(doc(db, 'clients', client.id), {
          fitnessGoal: goals[0],
          fitnessGoals: goals,
          experienceLevel: experience,
          dob: dob || null,
        });

        // Clean up draft
        try {
          const { deleteDoc: delDoc } = await import('firebase/firestore');
          await delDoc(doc(db, 'onboardingDrafts', client.id));
        } catch {}

        // Update local state
        updateClientData({ fitnessGoal: goals[0], fitnessGoals: goals, experienceLevel: experience, dob });

        // Advance to tier selection
        goToStep(3);
      } catch (err) {
        console.error('Onboarding submit error:', err);
        setSubmitError('Failed to save — please try again.' + (err.code ? ` (${err.code})` : ''));
      } finally {
        setParqSubmitting(false);
      }
    };

    return (
      <div className="ob-page">
        <ThemeToggle className="ob-theme-toggle" />
        <div className={`ob-content ${stepClass}`}>
          <ProgressBar current={2} />
          <h1 className="ob-title">Health Questionnaire</h1>
          <p className="ob-subtitle">PAR-Q — please answer honestly for your safety</p>

          <div className="ob-parq">
            {PARQ_QUESTIONS.map((q, i) => (
              <div key={i} className="ob-parq-item">
                <p className="ob-parq-question">{q}</p>
                <div className="ob-parq-btns">
                  <button
                    className={`ob-parq-btn${parqAnswers[i] === true ? ' yes' : ''}`}
                    onClick={() => setParqAnswers((prev) => prev.map((a, j) => (j === i ? true : a)))}
                  >
                    Yes
                  </button>
                  <button
                    className={`ob-parq-btn${parqAnswers[i] === false ? ' no' : ''}`}
                    onClick={() => setParqAnswers((prev) => prev.map((a, j) => (j === i ? false : a)))}
                  >
                    No
                  </button>
                </div>
              </div>
            ))}
          </div>

          {parqAnswers.includes(true) && (
            <div className="ob-parq-warning">
              You answered YES to one or more questions. We recommend consulting your doctor before starting an exercise programme.
            </div>
          )}

          {/* Declaration */}
          <label className="ob-declare-label" onClick={() => setParqDeclare(!parqDeclare)}>
            <span className={`ob-declare-box${parqDeclare ? ' checked' : ''}`}>
              {parqDeclare && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
            </span>
            <span className="ob-declare-text">
              I confirm that I have read and answered each question honestly.
              I understand that if my health changes I should inform my trainer.
              I take full responsibility for my participation in physical activity.
            </span>
          </label>

          {/* Signature pad */}
          <div className="ob-sig-section">
            <div className="ob-sig-header">
              <label className="ob-label" style={{ margin: 0 }}>Signature</label>
              {sigHasContent && (
                <button type="button" className="ob-sig-clear" onClick={sigClear}>Clear</button>
              )}
            </div>
            <canvas
              ref={sigCanvasRef}
              className="ob-sig-canvas"
              onMouseDown={sigStart}
              onMouseMove={sigMove}
              onMouseUp={sigEnd}
              onMouseLeave={sigEnd}
              onTouchStart={sigStart}
              onTouchMove={sigMove}
              onTouchEnd={sigEnd}
            />
            {!sigHasContent && (
              <p className="ob-sig-hint">Draw your signature above</p>
            )}
          </div>

          {submitError && <p className="ob-error">{submitError}</p>}

          <button
            className="ob-primary-btn"
            disabled={!canSubmitParq || parqSubmitting}
            onClick={handleParqSubmit}
          >
            {parqSubmitting ? 'Saving...' : 'Continue'}
          </button>

          <button className="ob-back-btn" onClick={() => goToStep(1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Choose Your Plan ──
  const handlePlanSelect = async (plan) => {
    if (plan === 'free') {
      // Free tier — mark onboarding complete and go to dashboard
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

    // Check email is verified before Stripe checkout
    if (!currentUser.emailVerified) {
      setCheckoutError('Please verify your email before subscribing. Check your inbox for a verification link.');
      return;
    }

    // Mark onboarding complete before Stripe redirect so the user
    // doesn't get bounced back to onboarding if the webhook fires slowly.
    try {
      await updateDoc(doc(db, 'clients', clientData.id), { onboardingComplete: true });
      updateClientData({ onboardingComplete: true });
    } catch (err) {
      console.error('Pre-checkout onboarding save error:', err);
    }

    // Stripe checkout for monthly/annual
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
        // Persist clientId so we can recover after Stripe redirect
        try { localStorage.setItem('mcf_clientId', clientData.id); } catch {};
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
        <ProgressBar current={3} />
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

        <button className="ob-back-btn" onClick={() => goToStep(2)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back
        </button>
      </div>
    </div>
  );
}
