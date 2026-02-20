import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import { STRIPE_PRICES } from '../config/stripe';
import ThemeToggle from '../components/ThemeToggle';
import './UpgradePage.css';

export default function UpgradePage() {
  const { currentUser, clientData } = useAuth();
  const { isPremium, subscriptionStatus } = useTier();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  async function handleManageSubscription() {
    if (!clientData?.stripeCustomerId) return;
    setLoading('manage');
    setError(null);
    try {
      const headers = { 'Content-Type': 'application/json' };
      // Pass Firebase ID token so the API can verify ownership
      if (currentUser) {
        const token = await currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stripeCustomerId: clientData.stripeCustomerId,
          clientId: clientData.id,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      console.error('Portal error:', err);
      setError('Unable to open subscription portal');
    } finally {
      setLoading(null);
    }
  }

  async function handleSelectPlan(plan) {
    setLoading(plan);
    setError(null);

    if (!currentUser?.uid || !currentUser?.email || !clientData?.id) {
      setError('Please sign in again and retry');
      setLoading(null);
      return;
    }

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
        setError(msg || `Server error (${res.status})`);
        setLoading(null);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('No checkout URL returned — please try again');
        setLoading(null);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Unable to reach checkout — check your connection');
      setLoading(null);
    }
  }

  // Already premium — show manage subscription
  if (isPremium) {
    return (
      <div className="upgrade-page">
        <ThemeToggle className="upgrade-theme-toggle" />
        <button className="upgrade-back-btn" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back
        </button>

        <div className="upgrade-header">
          <div className="upgrade-icon upgrade-icon-active">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
          </div>
          <h1>You're on Premium!</h1>
          <p className="upgrade-status">Status: <strong>{subscriptionStatus || 'active'}</strong></p>
        </div>

        {clientData?.stripeCustomerId && (
          <button
            className="upgrade-manage-btn"
            onClick={handleManageSubscription}
            disabled={loading === 'manage'}
          >
            {loading === 'manage' ? 'Opening...' : 'Manage Subscription'}
          </button>
        )}

        {error && <p className="upgrade-error">{error}</p>}
      </div>
    );
  }

  // Free tier — show plan selection
  return (
    <div className="upgrade-page">
      <ThemeToggle className="upgrade-theme-toggle" />
      <button className="upgrade-back-btn" onClick={() => navigate(-1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        Back
      </button>

      <div className="upgrade-header">
        <div className="upgrade-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
        </div>
        <h1>Upgrade to Premium</h1>
        <p>Unlock all Core Buddy features with a 7-day free trial</p>
      </div>

      <div className="upgrade-plans">
        <div className="plan-card">
          <div className="plan-name">Monthly</div>
          <div className="plan-price">
            <span className="plan-amount">£9.99</span>
            <span className="plan-period">/month</span>
          </div>
          <ul className="plan-features">
            <li>7-day free trial</li>
            <li>Unlimited workout durations</li>
            <li>Unlimited weekly workouts</li>
            <li>Save & replay workouts</li>
            <li>Nutrition tracking</li>
            <li>Buddies & social</li>
            <li>Cancel anytime</li>
          </ul>
          <button className="plan-cta" onClick={() => handleSelectPlan('monthly')} disabled={!!loading}>
            {loading === 'monthly' ? 'Loading...' : 'Start Free Trial'}
          </button>
        </div>

        <div className="plan-card plan-card-featured">
          <div className="plan-badge-save">Best Value — Save 17%</div>
          <div className="plan-name">Annual</div>
          <div className="plan-price">
            <span className="plan-amount">£99.99</span>
            <span className="plan-period">/year</span>
          </div>
          <div className="plan-price-sub">That's just £8.33/month</div>
          <ul className="plan-features">
            <li>7-day free trial</li>
            <li>Unlimited workout durations</li>
            <li>Unlimited weekly workouts</li>
            <li>Save & replay workouts</li>
            <li>Nutrition tracking</li>
            <li>Buddies & social</li>
            <li>Best value</li>
          </ul>
          <button className="plan-cta plan-cta-featured" onClick={() => handleSelectPlan('annual')} disabled={!!loading}>
            {loading === 'annual' ? 'Loading...' : 'Start Free Trial'}
          </button>
        </div>
      </div>

      {error && <p className="upgrade-error">{error}</p>}
    </div>
  );
}
