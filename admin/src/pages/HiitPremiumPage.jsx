import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHiit } from '../contexts/HiitContext';
import HiitNav from '../components/HiitNav';
import './HiitPremiumPage.css';

const FEATURES = [
  { text: 'Save unlimited workout presets', icon: 'library' },
  { text: 'Organise by category', icon: 'folder' },
  { text: 'Quick-load saved workouts', icon: 'load' },
  { text: 'Full workout history', icon: 'history' },
  { text: 'Detailed statistics & streaks', icon: 'stats' },
  { text: 'Priority support', icon: 'support' },
];

const ICONS = {
  library: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  folder: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  load: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  history: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
  ),
  stats: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6"/>
    </svg>
  ),
  support: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
};

const PLANS = [
  {
    key: 'monthly',
    label: 'Monthly',
    price: '£2.99',
    period: '/mo',
    sub: 'Billed monthly',
    badge: null,
  },
  {
    key: 'annual',
    label: 'Annual',
    price: '£19.99',
    period: '/yr',
    sub: '~£1.67/mo',
    badge: 'SAVE 44%',
    featured: true,
  },
  {
    key: 'lifetime',
    label: 'Lifetime',
    price: '£39.99',
    period: '',
    sub: 'One-time payment',
    badge: 'BEST VALUE',
  },
];

export default function HiitPremiumPage() {
  const { hiitTheme } = useHiit();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState('annual');

  return (
    <div className="hiit-page" data-hiit-theme={hiitTheme}>
      <HiitNav title="Premium" />
      <div className="hp-content">

        {/* Hero */}
        <div className="hp-hero">
          <div className="hp-hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
            </svg>
          </div>
          <h2 className="hp-hero-title">Core HIIT Premium</h2>
          <p className="hp-hero-sub">Unlock your full workout library</p>
        </div>

        {/* Features */}
        <div className="hp-features">
          {FEATURES.map((f, i) => (
            <div key={i} className="hp-feature-row">
              <span className="hp-feature-icon">{ICONS[f.icon]}</span>
              <span className="hp-feature-text">{f.text}</span>
            </div>
          ))}
        </div>

        {/* Pricing cards */}
        <div className="hp-plans">
          {PLANS.map(plan => (
            <button
              key={plan.key}
              className={`hp-plan-card${selectedPlan === plan.key ? ' selected' : ''}${plan.featured ? ' featured' : ''}`}
              onClick={() => setSelectedPlan(plan.key)}
            >
              {plan.badge && <span className="hp-plan-badge">{plan.badge}</span>}
              <div className="hp-plan-info">
                <span className="hp-plan-label">{plan.label}</span>
                <span className="hp-plan-price">
                  {plan.price}<span className="hp-plan-period">{plan.period}</span>
                </span>
                <span className="hp-plan-sub">{plan.sub}</span>
              </div>
              <div className={`hp-plan-radio${selectedPlan === plan.key ? ' active' : ''}`} />
            </button>
          ))}
        </div>

        {/* CTA */}
        <button className="hp-cta-btn" onClick={() => {/* payment integration TBD */}}>
          {selectedPlan === 'lifetime' ? 'Buy Lifetime Access' : 'Subscribe Now'}
        </button>

        <p className="hp-disclaimer">
          {selectedPlan === 'lifetime'
            ? 'One-time payment of £39.99. Lifetime access to all Core HIIT Premium features.'
            : selectedPlan === 'annual'
              ? 'Core HIIT Premium — £19.99/year (~£1.67/mo). Cancel anytime.'
              : 'Core HIIT Premium — £2.99/month. Cancel anytime.'}
        </p>

        <button className="hp-back-link" onClick={() => navigate('/hiit')}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
