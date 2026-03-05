import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import { STRIPE_PRICES } from '../config/stripe';
import { Capacitor } from '@capacitor/core';
import ThemeToggle from '../components/ThemeToggle';
import './UpgradePage.css';

const isNative = Capacitor.isNativePlatform();

export default function UpgradePage() {
  const { currentUser, clientData } = useAuth();
  const { isPremium, subscriptionStatus, refreshEntitlement } = useTier();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [offerings, setOfferings] = useState(null);
  const [rcLoading, setRcLoading] = useState(isNative);

  // Load RevenueCat offerings on native (with 8s timeout)
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    (async () => {
      try {
        console.log('[UpgradePage] loading RC offerings…');
        console.log('[UpgradePage] importing revenueCatService…');
        const mod = await import('../services/revenueCatService');
        console.log('[UpgradePage] import ok, calling getOfferings…');
        const result = await Promise.race([
          mod.getOfferings(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RC offerings timeout')), 8000)),
        ]);
        console.log('[UpgradePage] offerings loaded:', result);
        if (!cancelled) setOfferings(result);
      } catch (err) {
        console.error('[UpgradePage] Failed to load offerings:', err?.message || err, JSON.stringify(err, Object.getOwnPropertyNames(err || {})));
      } finally {
        if (!cancelled) setRcLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
            Manage your subscription in your device's Settings &gt; Subscriptions.
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
    if (!offerings) return;
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

    const monthlyPrice = offerings?.monthly?.product?.priceString || '£9.99/mo';
    const annualPrice = offerings?.annual?.product?.priceString || '£99.99/yr';

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
              <span className="plan-amount">{monthlyPrice}</span>
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
            <button className="plan-cta" onClick={() => handleNativePurchase('monthly')} disabled={!!loading}>
              {loading === 'monthly' ? 'Loading...' : 'Start Free Trial'}
            </button>
          </div>

          <div className="plan-card plan-card-featured">
            <div className="plan-badge-save">Best Value</div>
            <div className="plan-name">Annual</div>
            <div className="plan-price">
              <span className="plan-amount">{annualPrice}</span>
            </div>
            <ul className="plan-features">
              <li>7-day free trial</li>
              <li>Unlimited workout durations</li>
              <li>Unlimited weekly workouts</li>
              <li>Save & replay workouts</li>
              <li>Nutrition tracking</li>
              <li>Buddies & social</li>
              <li>Best value</li>
            </ul>
            <button className="plan-cta plan-cta-featured" onClick={() => handleNativePurchase('annual')} disabled={!!loading}>
              {loading === 'annual' ? 'Loading...' : 'Start Free Trial'}
            </button>
          </div>
        </div>

        <button
          className="upgrade-manage-btn"
          style={{ marginTop: 16, opacity: 0.7 }}
          onClick={handleRestore}
          disabled={!!loading}
        >
          {loading === 'restore' ? 'Restoring...' : 'Restore Purchases'}
        </button>

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
