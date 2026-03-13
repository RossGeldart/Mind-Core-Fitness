import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import { STRIPE_PRICES } from '../config/stripe';
import { Capacitor } from '@capacitor/core';
import { openExternal } from '../utils/openExternal';
import ThemeToggle from '../components/ThemeToggle';
import './UpgradePage.css';

const isNative = Capacitor.isNativePlatform();
const isAndroid = isNative && Capacitor.getPlatform() === 'android';

const FREE_FEATURES = [
  { text: '2 workouts per week', included: true },
  { text: '5 & 10 min durations only', included: true },
  { text: '1 habit tracker', included: true },
  { text: 'Basic workout library', included: true },
  { text: 'Unlimited workouts', included: false },
  { text: 'All workout durations', included: false },
  { text: 'Unlimited habits', included: false },
  { text: '2 activity logs per week', included: true },
  { text: 'Unlimited activity logging', included: false },
  { text: 'Nutrition tracking', included: false },
  { text: 'Save & replay workouts', included: false },
  { text: 'Buddies & social', included: false },
  { text: 'Advanced metrics', included: false },
];

const PREMIUM_FEATURES_LIST = [
  { text: 'Unlimited workouts per week', included: true },
  { text: 'All workout durations', included: true },
  { text: 'Unlimited habit tracking', included: true },
  { text: 'Activity logging', included: true },
  { text: 'Nutrition tracking', included: true },
  { text: 'Save & replay workouts', included: true },
  { text: 'Buddies & social', included: true },
  { text: 'Advanced metrics', included: true },
  { text: 'Cancel anytime', included: true },
];

export default function UpgradePage() {
  const { currentUser, clientData } = useAuth();
  const { isPremium, subscriptionStatus, refreshEntitlement } = useTier();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [offerings, setOfferings] = useState(null);
  const [rcLoading, setRcLoading] = useState(isNative);
  const [tierTab, setTierTab] = useState('premium');
  const [selectedPlan, setSelectedPlan] = useState('annual');

  // Load RevenueCat offerings on native (with 20s timeout)
  const [rcRetry, setRcRetry] = useState(0);
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    setRcLoading(true);
    setError(null);
    (async () => {
      try {
        const mod = await import('../services/revenueCatService');
        const result = await Promise.race([
          mod.getOfferings(currentUser?.uid),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RC offerings timeout')), 20000)),
        ]);
        if (!cancelled) setOfferings(result);
      } catch (err) {
        console.error('[UpgradePage] Failed to load offerings:', err?.message || err, JSON.stringify(err, Object.getOwnPropertyNames(err || {})));
        if (!cancelled) setError('Unable to load subscription options. Tap below to retry.');
      } finally {
        if (!cancelled) setRcLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rcRetry]);

  // Clear loading state when user navigates back from Stripe (bfcache restore)
  useEffect(() => {
    const onPageShow = (e) => { if (e.persisted) setLoading(null); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

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
      if (typeof fbq === 'function') {
        fbq('track', 'InitiateCheckout', {
          content_name: 'Core Buddy ' + (plan === 'annual' ? 'Annual' : 'Monthly'),
          content_category: 'Fitness App',
          value: plan === 'annual' ? 99.99 : 9.99,
          currency: 'GBP'
        });
      }

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

        {isNative ? (
          <p style={{ textAlign: 'center', opacity: 0.7, marginTop: 16 }}>
            {isAndroid
              ? 'Manage your subscription in Google Play Store \u203A Payments & subscriptions \u203A Subscriptions.'
              : 'Manage your subscription in Settings \u203A Apple ID \u203A Subscriptions.'}
          </p>
        ) : clientData?.stripeCustomerId ? (
          <button
            className="upgrade-manage-btn"
            onClick={handleManageSubscription}
            disabled={loading === 'manage'}
          >
            {loading === 'manage' ? 'Opening...' : 'Manage Subscription'}
          </button>
        ) : null}

        {error && <p className="upgrade-error">{error}</p>}
      </div>
    );
  }

  // Native in-app purchase handler
  async function handleNativePurchase(plan) {
    if (!offerings) {
      setError('Subscription options not loaded yet. Tap "Retry" below.');
      return;
    }
    const pkg = plan === 'annual' ? offerings.annual : offerings.monthly;
    if (!pkg) {
      setError('Package not available');
      return;
    }

    setLoading(plan);
    setError(null);

    try {
      const { purchasePackage } = await import('../services/revenueCatService');
      const { isPremium: nowPremium } = await purchasePackage(pkg);
      if (nowPremium && refreshEntitlement) {
        await refreshEntitlement();
      }
    } catch (err) {
      if (err.code === 'PURCHASE_CANCELLED' || err.message?.includes('cancelled')) {
        // User cancelled — not an error
      } else {
        console.error('Purchase error:', err);
        setError('Purchase failed — please try again');
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleRestore() {
    setLoading('restore');
    setError(null);
    try {
      const { restorePurchases } = await import('../services/revenueCatService');
      const { isPremium: nowPremium } = await restorePurchases();
      if (nowPremium && refreshEntitlement) {
        await refreshEntitlement();
      } else {
        setError('No previous purchases found');
      }
    } catch (err) {
      console.error('Restore error:', err);
      setError('Unable to restore purchases');
    } finally {
      setLoading(null);
    }
  }

  // Free tier — native in-app purchase UI
  if (isNative) {
    if (rcLoading) {
      return (
        <div className="upgrade-page">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--color-primary-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'app-spin .7s linear infinite' }} />
          </div>
        </div>
      );
    }

    const monthlyPrice = '\u00a314.99';
    const annualPrice = '\u00a3119.99';
    const features = tierTab === 'premium' ? PREMIUM_FEATURES_LIST : FREE_FEATURES;

    return (
      <div className="upgrade-page upgrade-page-native">
        <div className="upgrade-native-top-row">
          <button className="upgrade-back-btn" onClick={() => navigate(-1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="upgrade-native-logo-inline" />
          <div className="upgrade-native-header-text">
            <h1>Unlock Your Full Potential</h1>
            <p>Train smarter with Premium</p>
          </div>
        </div>

        <div className="upgrade-tier-toggle">
          <button
            className={`tier-toggle-btn ${tierTab === 'free' ? 'tier-toggle-active' : ''}`}
            onClick={() => setTierTab('free')}
          >
            Free
          </button>
          <button
            className={`tier-toggle-btn ${tierTab === 'premium' ? 'tier-toggle-active' : ''}`}
            onClick={() => setTierTab('premium')}
          >
            Premium
          </button>
        </div>

        <ul className="upgrade-feature-list upgrade-feature-grid">
          {features.map((f, i) => (
            <li key={i} className={f.included ? 'feature-included' : 'feature-excluded'}>
              <span className="feature-icon">
                {f.included ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="var(--color-primary)"/><path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="var(--text-tertiary)" opacity="0.3"/><path d="M8 8l8 8M16 8l-8 8" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"/></svg>
                )}
              </span>
              <span className={f.included ? '' : 'feature-text-muted'}>{f.text}</span>
            </li>
          ))}
        </ul>

        <div className="upgrade-native-spacer" />

        {tierTab === 'premium' && (
          <>
            <div className="upgrade-pricing-cards">
              <button
                className={`pricing-card ${selectedPlan === 'annual' ? 'pricing-card-selected' : ''}`}
                onClick={() => setSelectedPlan('annual')}
              >
                <div className="pricing-card-badge">SAVE 33%</div>
                <div className="pricing-card-info">
                  <div className="pricing-card-label">Yearly</div>
                  <div className="pricing-card-price">{annualPrice}<span>/yr</span></div>
                  <div className="pricing-card-sub">~{'\u00a3'}9.99/mo</div>
                </div>
                <div className={`pricing-card-radio ${selectedPlan === 'annual' ? 'radio-selected' : ''}`} />
              </button>

              <button
                className={`pricing-card ${selectedPlan === 'monthly' ? 'pricing-card-selected' : ''}`}
                onClick={() => setSelectedPlan('monthly')}
              >
                <div className="pricing-card-info">
                  <div className="pricing-card-label">Monthly</div>
                  <div className="pricing-card-price">{monthlyPrice}<span>/mo</span></div>
                  <div className="pricing-card-sub">Billed monthly</div>
                </div>
                <div className={`pricing-card-radio ${selectedPlan === 'monthly' ? 'radio-selected' : ''}`} />
              </button>
            </div>

            <div className="upgrade-native-spacer" />

            <button
              className="upgrade-continue-btn"
              onClick={() => handleNativePurchase(selectedPlan)}
              disabled={!!loading}
            >
              {loading ? 'Loading...' : 'Continue'}
            </button>

            <p className="upgrade-subscription-disclosure">
              {selectedPlan === 'annual'
                ? `Core Buddy Premium — Annual Subscription. ${annualPrice}/year (${'\u00a3'}9.99/mo).`
                : `Core Buddy Premium — Monthly Subscription. ${monthlyPrice}/month.`}
              {' '}Includes a 7-day free trial.{' '}
              {isAndroid
                ? 'Payment will be charged to your Google account at confirmation of purchase. Subscription automatically renews unless it is cancelled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to Google Play Store \u203A Payments & subscriptions \u203A Subscriptions.'
                : 'Payment will be charged to your Apple ID account at the confirmation of purchase. Subscription automatically renews unless it is cancelled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your device Settings \u203A Apple ID \u203A Subscriptions.'}
            </p>
          </>
        )}

        {tierTab === 'free' && (
          <>
            <div className="upgrade-native-spacer" />
            <div className="upgrade-free-cta">
              <p>Want more from your training?</p>
              <button className="upgrade-continue-btn" onClick={() => setTierTab('premium')}>
                See Premium
              </button>
            </div>
          </>
        )}

        {!offerings && !rcLoading && (
          <button
            className="upgrade-continue-btn"
            style={{ background: 'var(--text-secondary)', marginBottom: 8 }}
            onClick={() => setRcRetry(r => r + 1)}
          >
            Retry Loading
          </button>
        )}

        <div className="upgrade-footer-links">
          <button onClick={handleRestore} disabled={!!loading}>
            {loading === 'restore' ? 'Restoring...' : 'Restore Purchases'}
          </button>
          <button type="button" onClick={() => openExternal('https://www.mindcorefitness.com/terms.html')}>Terms of Use (EULA)</button>
          <button type="button" onClick={() => openExternal('https://www.mindcorefitness.com/privacy-policy.html')}>Privacy Policy</button>
        </div>

        {error && <p className="upgrade-error">{error}</p>}
      </div>
    );
  }

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
