import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { STRIPE_PRICES } from '../config/stripe';
import './Onboarding.css';

import onboardSelectOptions from '../assets/onboard-select-options.PNG';
import onboardGeneratedWorkout from '../assets/onboard-generated-workout.PNG';
import onboardWorkoutView from '../assets/onboard-workout-view.PNG';
import onboardTrackFoods from '../assets/onboard-track-foods.PNG';
import onboardHabits from '../assets/onboard-habits.PNG';
import onboardProfileView from '../assets/onboard-profile-view.PNG';

const FEATURES = [
  {
    title: 'Build Your Workout',
    desc: 'Choose your equipment, time, focus area and difficulty — then let Core Buddy generate a workout tailored to you.',
    image: onboardSelectOptions,
  },
  {
    title: 'Your Workout, Ready to Go',
    desc: 'Your personalised workout is generated instantly. Not feeling it? Hit reshuffle for a new one, or save it for later.',
    image: onboardGeneratedWorkout,
  },
  {
    title: 'Follow Along with Video',
    desc: 'Every exercise comes with a video demo so you can nail your form. Track sets, reps and weights as you go.',
    image: onboardWorkoutView,
  },
  {
    title: 'Track Your Nutrition',
    desc: 'Log meals with our barcode scanner, save favourites for quick logging, and use copy day to repeat a good day of eating.',
    image: onboardTrackFoods,
  },
  {
    title: 'Build Better Habits',
    desc: 'Set daily habits and track your streaks. Small wins every day add up to big results.',
    image: onboardHabits,
  },
  {
    title: 'Your Profile & Community',
    desc: 'Track your stats, climb the leaderboards, and connect with your Core Buddies — all from your profile dashboard.',
    image: onboardProfileView,
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

const EXPERIENCE_LEVELS = [
  { key: 'beginner', label: 'Beginner', desc: 'New to exercise or returning after a long break' },
  { key: 'intermediate', label: 'Intermediate', desc: 'Training regularly for 6+ months' },
  { key: 'advanced', label: 'Advanced', desc: 'Training consistently for 2+ years' },
];

export default function Onboarding() {
  const { currentUser, clientData, updateClientData, resolveClient, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Block unverified self-signup users — send them back to the verification screen
  useEffect(() => {
    if (!authLoading && currentUser && !currentUser.emailVerified && clientData?.signupSource === 'self_signup') {
      navigate('/signup', { replace: true });
    }
  }, [authLoading, currentUser, clientData, navigate]);

  // If the user already has a paid subscription (set by Stripe webhook),
  // or is returning from a successful Stripe checkout, skip to the welcome form.
  const alreadySubscribed = clientData?.tier === 'premium' || !!clientData?.stripeSubscriptionId;
  const fromCheckout = searchParams.get('checkout') === 'success';
  const [step, setStep] = useState(alreadySubscribed || fromCheckout ? 2 : 0); // 0=features, 1=subscription, 2=welcome, 3=parq
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef(null);

  // Subscription
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);

  // Clear loading state when user navigates back from Stripe (bfcache restore)
  useEffect(() => {
    const onPageShow = (e) => { if (e.persisted) setCheckoutLoading(null); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

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
  const sigDrawingRef = useRef(false);
  const [sigHasContent, setSigHasContent] = useState(false);

  // Keep the canvas internal resolution in sync with its CSS display size
  useEffect(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
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

  // If the Stripe webhook fires while the user is still on the feature
  // showcase or subscription picker, auto-advance to the welcome form.
  useEffect(() => {
    const paid = clientData?.tier === 'premium' || !!clientData?.stripeSubscriptionId;
    if (paid && step < 2) {
      setStep(2);
    }
  }, [clientData?.tier, clientData?.stripeSubscriptionId, step]);

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

  // ── Step 0: Feature Showcase ──
  if (step === 0) {
    const isLastSlide = activeSlide === FEATURES.length - 1;

    return (
      <div className="ob-page ob-page--showcase">
        <div className="ob-content ob-content--showcase">
          <div className="ob-showcase-header">
            <img src="/Logo.webp" alt="Mind Core Fitness" className="ob-logo" width="48" height="48" />
            <div style={{ flex: 1 }}>
              <h1 className="ob-title" style={{ textAlign: 'left', marginBottom: 2 }}>Core Buddy</h1>
              <p className="ob-subtitle" style={{ textAlign: 'left', margin: 0 }}>Here's what you can do</p>
            </div>
            <button className="ob-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
              )}
            </button>
          </div>

          <div className="ob-showcase-carousel" ref={scrollRef} onScroll={handleScroll}>
            {FEATURES.map((f, i) => (
              <div key={i} className="ob-showcase-slide">
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

          <div className="ob-dots">
            {FEATURES.map((_, i) => (
              <span
                key={i}
                className={`ob-dot${activeSlide === i ? ' active' : ''}`}
                onClick={() => scrollToSlide(i)}
              />
            ))}
          </div>

          <div className="ob-showcase-actions">
            {isLastSlide ? (
              <button className="ob-primary-btn" onClick={() => setStep(1)}>
                Get Started
              </button>
            ) : (
              <>
                <button className="ob-primary-btn" onClick={() => scrollToSlide(activeSlide + 1)}>
                  Next
                </button>
                <button className="ob-skip-btn" onClick={() => setStep(1)}>
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Subscription Picker ──
  if (step === 1) {
    const handlePlanSelect = async (plan) => {
      if (typeof window.fbq === 'function') {
        if (plan === 'free') {
          fbq('track', 'Lead', { content_name: 'Core Buddy Free', content_category: 'Onboarding' });
        } else {
          fbq('track', 'InitiateCheckout', {
            content_name: `Core Buddy ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
            content_category: 'Onboarding',
            value: plan === 'annual' ? 99.99 : 9.99,
            currency: 'GBP',
          });
        }
      }

      if (plan === 'free') {
        setStep(2);
        return;
      }

      if (!clientData?.id || !currentUser?.uid || !currentUser?.email) {
        setCheckoutError('Account is still loading — please wait a moment and try again.');
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
            clientId: clientData.id,
            uid: currentUser.uid,
            email: currentUser.email,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          let msg;
          try { msg = JSON.parse(text).error; } catch { msg = text; }
          setCheckoutError(msg || `Server error (${res.status})`);
          setCheckoutLoading(null);
          return;
        }

        const data = await res.json();
        if (data.url) {
          // Persist clientId so we can recover after Stripe redirect
          try { localStorage.setItem('mcf_clientId', clientData.id); } catch {};
          window.location.href = data.url;
        } else {
          setCheckoutError('No checkout URL returned — please try again');
          setCheckoutLoading(null);
        }
      } catch (err) {
        console.error('Checkout error:', err);
        setCheckoutError('Unable to reach checkout — check your connection');
        setCheckoutLoading(null);
      }
    };

    return (
      <div className="ob-page">
        <button className="ob-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
          )}
        </button>
        <div className="ob-content">
          <div className="ob-step-indicator">
            <span className="ob-step-num">1 of 3</span>
          </div>
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
                <li><span className="ob-plan-feat-icon">&#127947;</span> 2 workouts per week</li>
                <li><span className="ob-plan-feat-icon">&#9889;</span> Limited time selection (5 &amp; 10 min)</li>
                <li><span className="ob-plan-feat-icon">&#128202;</span> Basic dashboard</li>
              </ul>
              <div className="ob-plan-cta-outline">Continue Free</div>
            </button>

            {/* Monthly */}
            <button className="ob-plan-card" onClick={() => handlePlanSelect('monthly')} disabled={!!checkoutLoading}>
              <div className="ob-plan-badge">Most Popular</div>
              <div className="ob-plan-name">Monthly</div>
              <div className="ob-plan-price">
                <span className="ob-plan-currency">£</span>
                <span className="ob-plan-amount">9.99</span>
                <span className="ob-plan-period">/month</span>
              </div>
              <ul className="ob-plan-features">
                <li><span className="ob-plan-feat-icon">&#10024;</span> 7-day free trial</li>
                <li><span className="ob-plan-feat-icon">&#128275;</span> All features unlocked</li>
                <li><span className="ob-plan-feat-icon">&#10060;</span> Cancel anytime</li>
              </ul>
              <div className="ob-plan-cta">{checkoutLoading === 'monthly' ? 'Loading...' : 'Start Free Trial'}</div>
            </button>

            {/* Annual */}
            <button className="ob-plan-card ob-plan-featured" onClick={() => handlePlanSelect('annual')} disabled={!!checkoutLoading}>
              <div className="ob-plan-badge">Best Value — Save 17%</div>
              <div className="ob-plan-name">Annual</div>
              <div className="ob-plan-price">
                <span className="ob-plan-currency">£</span>
                <span className="ob-plan-amount">99.99</span>
                <span className="ob-plan-period">/year</span>
              </div>
              <div className="ob-plan-price-sub">Just £8.33/month</div>
              <ul className="ob-plan-features">
                <li><span className="ob-plan-feat-icon">&#10024;</span> 7-day free trial</li>
                <li><span className="ob-plan-feat-icon">&#128275;</span> All features unlocked</li>
                <li><span className="ob-plan-feat-icon">&#11088;</span> Best value</li>
              </ul>
              <div className="ob-plan-cta ob-plan-cta-featured">{checkoutLoading === 'annual' ? 'Loading...' : 'Start Free Trial'}</div>
            </button>
          </div>

          {checkoutError && <p className="ob-error">{checkoutError}</p>}
        </div>
      </div>
    );
  }

  // ── Step 2: Welcome Form ──
  if (step === 2) {
    const welcomeValid = dob && gender && goal && experience;

    return (
      <div className="ob-page">
        <button className="ob-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
          )}
        </button>
        <div className="ob-content">
          <div className="ob-step-indicator">
            <span className="ob-step-num">2 of 3</span>
          </div>
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

            <label className="ob-label">What's Your Main Fitness Goal?</label>
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
    if (!canSubmitParq || parqSubmitting) return;
    setParqSubmitting(true);

    try {
      // Resolve client record — uses context if available, otherwise falls
      // back to localStorage / uid-query via AuthContext.resolveClient().
      const client = await resolveClient();
      if (!client) {
        alert('Could not find your account. Please try logging out and back in.');
        setParqSubmitting(false);
        return;
      }

      // Get signature as data URL
      const signatureData = sigCanvasRef.current.toDataURL('image/png');

      // Save onboarding data
      await setDoc(doc(db, 'onboardingSubmissions', client.id), {
        clientId: client.id,
        clientName: client.name,
        email: client.email,
        selectedPlan: client.tier || 'free',
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

      // Mark onboarding complete on client doc (only whitelisted fields —
      // tier/subscriptionStatus are managed server-side by the Stripe webhook).
      await updateDoc(doc(db, 'clients', client.id), {
        onboardingComplete: true,
        fitnessGoal: goal,
        experienceLevel: experience,
        dob: dob || null,
      });

      // Optimistically set tier in local state so premium features unlock
      // immediately. The Stripe webhook writes the real value to Firestore;
      // the onSnapshot listener in AuthContext will reconcile on next load.
      const localUpdates = { onboardingComplete: true, fitnessGoal: goal, experienceLevel: experience, dob };
      if (fromCheckout) {
        localUpdates.tier = 'premium';
        localUpdates.subscriptionStatus = 'trialing';
      }
      updateClientData(localUpdates);
      navigate('/client/core-buddy');
    } catch (err) {
      console.error('Onboarding submit error:', err);
      alert('Failed to save — please try again.\n' + (err.code || err.message || ''));
    } finally {
      setParqSubmitting(false);
    }
  };

  return (
    <div className="ob-page">
      <button className="ob-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {isDark ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
        )}
      </button>
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
