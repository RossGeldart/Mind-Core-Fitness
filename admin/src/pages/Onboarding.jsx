import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_PRICES } from '../config/stripe';
import './Onboarding.css';

const FEATURES = [
  {
    title: 'Randomiser Workouts',
    desc: 'Quick, effective workouts generated for you. Choose your focus, level, and time — we handle the rest.',
    icon: 'M1 9h2v6H1V9zm3-2h2v10H4V7zm3 4h10v2H7v-2zm10-4h2v10h-2V7zm3 2h2v6h-2V9z',
    color: '#FF6B35',
  },
  {
    title: 'Nutrition Tracking',
    desc: 'Track macros, scan barcodes, log meals and water intake to hit your daily targets.',
    icon: 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z',
    color: '#14b8a6',
    stroke: true,
  },
  {
    title: 'Structured Programmes',
    desc: 'Follow 4, 8, or 12-week programmes designed by professionals. Full body, core, upper, and lower splits.',
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
    color: '#8B5CF6',
    stroke: true,
  },
  {
    title: 'Buddies & Social',
    desc: 'Connect with other members, share your journey, like and comment on posts.',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    color: '#38B6FF',
    stroke: true,
  },
  {
    title: 'Achievements & PBs',
    desc: 'Track personal bests, earn badges, and celebrate every milestone on your fitness journey.',
    icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z',
    color: '#eab308',
    stroke: true,
  },
  {
    title: 'Leaderboard',
    desc: 'Compete with your Core Buddies. Opt in, climb the ranks, and stay motivated together.',
    icon: 'M8 21v-4M16 21v-2M12 21V11M3 7l9-4 9 4M4 10v6l8 4 8-4v-6',
    color: '#e74c3c',
    stroke: true,
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
  'Stay active',
  'Sport performance',
];

const EXPERIENCE_LEVELS = [
  { key: 'beginner', label: 'Beginner', desc: 'New to exercise or returning after a long break' },
  { key: 'intermediate', label: 'Intermediate', desc: 'Training regularly for 6+ months' },
  { key: 'advanced', label: 'Advanced', desc: 'Training consistently for 2+ years' },
];

export default function Onboarding() {
  const { currentUser, clientData, updateClientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // If returning from Stripe checkout, skip straight to welcome form (step 2)
  const fromCheckout = searchParams.get('checkout') === 'success';
  const [step, setStep] = useState(fromCheckout ? 2 : 0); // 0=features, 1=subscription, 2=welcome, 3=parq
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef(null);

  // Subscription
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);

  // Welcome form
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState('');
  const [injuries, setInjuries] = useState('');

  // PARQ form
  const [parqAnswers, setParqAnswers] = useState(PARQ_QUESTIONS.map(() => null));
  const [parqDeclare, setParqDeclare] = useState(false);
  const [parqSubmitting, setParqSubmitting] = useState(false);

  // Signature pad
  const sigCanvasRef = useRef(null);
  const [sigDrawing, setSigDrawing] = useState(false);
  const [sigHasContent, setSigHasContent] = useState(false);

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
    setSigDrawing(true);
  };

  const sigMove = (e) => {
    if (!sigDrawing) return;
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

  const sigEnd = () => setSigDrawing(false);

  const sigClear = () => {
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigHasContent(false);
  };

  // Loading state while returning from checkout
  const [checkoutReturning, setCheckoutReturning] = useState(fromCheckout);

  // Redirect if already completed onboarding
  useEffect(() => {
    if (!authLoading && clientData?.onboardingComplete) {
      navigate('/client/core-buddy');
    }
  }, [authLoading, clientData, navigate]);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate('/');
    }
  }, [authLoading, currentUser, navigate]);

  // Clear checkout loading state once auth is ready
  useEffect(() => {
    if (fromCheckout && !authLoading && clientData) {
      setCheckoutReturning(false);
    }
  }, [fromCheckout, authLoading, clientData]);

  // Show loading screen while returning from Stripe
  if (checkoutReturning) {
    return (
      <div className="ob-page">
        <div className="ob-content" style={{ justifyContent: 'center', minHeight: '60dvh' }}>
          <div className="ob-loading-spinner" />
          <h1 className="ob-title">Payment Successful</h1>
          <p className="ob-subtitle">Setting up your account, please wait...</p>
        </div>
      </div>
    );
  }

  // Handle feature carousel scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const slideWidth = el.firstChild?.offsetWidth || 1;
    const gap = 12;
    const idx = Math.round(el.scrollLeft / (slideWidth + gap));
    setActiveSlide(Math.min(idx, FEATURES.length - 1));
  };

  // ── Step 0: Feature Showcase ──
  if (step === 0) {
    return (
      <div className="ob-page">
        <div className="ob-content">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="ob-logo" width="60" height="60" />
          <h1 className="ob-title">Welcome to Core Buddy</h1>
          <p className="ob-subtitle">Your all-in-one fitness companion</p>

          <div className="ob-carousel-wrap">
            <div className="ob-carousel" ref={scrollRef} onScroll={handleScroll}>
              {FEATURES.map((f, i) => (
                <div key={i} className="ob-feature-card" style={{ '--accent': f.color }}>
                  <div className="ob-feature-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill={f.stroke ? 'none' : 'currentColor'} stroke={f.stroke ? 'currentColor' : 'none'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
            <div className="ob-dots">
              {FEATURES.map((_, i) => (
                <span key={i} className={`ob-dot${activeSlide === i ? ' active' : ''}`} />
              ))}
            </div>
          </div>

          <button className="ob-primary-btn" onClick={() => setStep(1)}>
            Get Started
          </button>
        </div>
      </div>
    );
  }

  // ── Step 1: Subscription Picker ──
  if (step === 1) {
    const handlePlanSelect = async (plan) => {
      if (plan === 'free') {
        setSelectedPlan('free');
        setStep(2);
        return;
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
        <div className="ob-content">
          <div className="ob-step-indicator">
            <span className="ob-step-num">1 of 3</span>
          </div>
          <h1 className="ob-title">Choose Your Plan</h1>
          <p className="ob-subtitle">Start free or unlock everything with Premium</p>

          <div className="ob-plans">
            {/* Free */}
            <button className="ob-plan-card" onClick={() => handlePlanSelect('free')} disabled={!!checkoutLoading}>
              <div className="ob-plan-name">Free</div>
              <div className="ob-plan-price"><span className="ob-plan-amount">£0</span></div>
              <ul className="ob-plan-features">
                <li>Randomiser workouts (5 & 10 min)</li>
                <li>1 workout per week</li>
                <li>Basic dashboard</li>
              </ul>
              <div className="ob-plan-cta-outline">Continue Free</div>
            </button>

            {/* Monthly */}
            <button className="ob-plan-card" onClick={() => handlePlanSelect('monthly')} disabled={!!checkoutLoading}>
              <div className="ob-plan-name">Monthly</div>
              <div className="ob-plan-price">
                <span className="ob-plan-amount">£19.99</span>
                <span className="ob-plan-period">/month</span>
              </div>
              <ul className="ob-plan-features">
                <li>7-day free trial</li>
                <li>All features unlocked</li>
                <li>Cancel anytime</li>
              </ul>
              <div className="ob-plan-cta">
                {checkoutLoading === 'monthly' ? 'Loading...' : 'Start Free Trial'}
              </div>
            </button>

            {/* Annual */}
            <button className="ob-plan-card ob-plan-featured" onClick={() => handlePlanSelect('annual')} disabled={!!checkoutLoading}>
              <div className="ob-plan-save">Save 17%</div>
              <div className="ob-plan-name">Annual</div>
              <div className="ob-plan-price">
                <span className="ob-plan-amount">£199.99</span>
                <span className="ob-plan-period">/year</span>
              </div>
              <ul className="ob-plan-features">
                <li>7-day free trial</li>
                <li>All features unlocked</li>
                <li>Best value</li>
              </ul>
              <div className="ob-plan-cta ob-plan-cta-featured">
                {checkoutLoading === 'annual' ? 'Loading...' : 'Start Free Trial'}
              </div>
            </button>
          </div>

          {checkoutError && <p className="ob-error">{checkoutError}</p>}
        </div>
      </div>
    );
  }

  // ── Step 2: Welcome Form ──
  if (step === 2) {
    const welcomeValid = dob && goal && experience;

    return (
      <div className="ob-page">
        <div className="ob-content">
          <div className="ob-step-indicator">
            <span className="ob-step-num">2 of 3</span>
          </div>
          <h1 className="ob-title">About You</h1>
          <p className="ob-subtitle">Help us personalise your experience</p>

          <div className="ob-form">
            <label className="ob-label">Date of Birth</label>
            <input
              type="date"
              className="ob-input"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />

            <label className="ob-label">Gender <span className="ob-optional">(optional)</span></label>
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

            <label className="ob-label">Primary Fitness Goal</label>
            <div className="ob-chip-group">
              {FITNESS_GOALS.map((g) => (
                <button
                  key={g}
                  className={`ob-chip${goal === g ? ' active' : ''}`}
                  onClick={() => setGoal(g)}
                >
                  {g}
                </button>
              ))}
            </div>

            <label className="ob-label">Experience Level</label>
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

            <label className="ob-label">Injuries or Conditions <span className="ob-optional">(optional)</span></label>
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
            onClick={() => setStep(3)}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: PARQ Form ──
  const allParqAnswered = parqAnswers.every((a) => a !== null);
  const canSubmitParq = allParqAnswered && parqDeclare && sigHasContent;

  const handleParqSubmit = async () => {
    if (!canSubmitParq || parqSubmitting || !clientData) return;
    setParqSubmitting(true);

    try {
      // Get signature as data URL
      const signatureData = sigCanvasRef.current.toDataURL('image/png');

      // Save onboarding data
      await setDoc(doc(db, 'onboardingSubmissions', clientData.id), {
        clientId: clientData.id,
        clientName: clientData.name,
        email: clientData.email,
        selectedPlan: selectedPlan || 'free',
        welcome: {
          dob,
          gender: gender || null,
          goal,
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

      // Mark onboarding complete on client doc
      await updateDoc(doc(db, 'clients', clientData.id), {
        onboardingComplete: true,
        fitnessGoal: goal,
        experienceLevel: experience,
        dob: dob || null,
      });

      updateClientData({ onboardingComplete: true, fitnessGoal: goal, experienceLevel: experience, dob });
      navigate('/client/core-buddy');
    } catch (err) {
      console.error('Onboarding submit error:', err);
      alert('Failed to save — please try again.');
    } finally {
      setParqSubmitting(false);
    }
  };

  return (
    <div className="ob-page">
      <div className="ob-content">
        <div className="ob-step-indicator">
          <span className="ob-step-num">3 of 3</span>
        </div>
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
            width={380}
            height={140}
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

        <button
          className="ob-primary-btn"
          disabled={!canSubmitParq || parqSubmitting}
          onClick={handleParqSubmit}
        >
          {parqSubmitting ? 'Saving...' : 'Complete Setup'}
        </button>
      </div>
    </div>
  );
}
