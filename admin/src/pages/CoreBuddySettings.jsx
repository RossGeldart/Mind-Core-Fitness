import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import {
  isPushSupported,
  getPermissionState,
  requestPushPermission,
  revokePushToken,
} from '../utils/pushNotifications';
import {
  getNativePermissionState,
  requestNativePushPermission,
  revokeNativePushToken,
} from '../utils/nativePushNotifications';
import { openExternal } from '../utils/openExternal';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddySettings.css';

const isNative = Capacitor.isNativePlatform();

const NOTIF_PREFS = [
  { key: 'daily_morning', label: 'Morning motivation', desc: 'Daily 6 AM motivational nudge to start your day' },
  { key: 'daily_evening', label: 'Evening check-in', desc: 'Daily 6 PM reminder to log your habits' },
  { key: 'buddy_request', label: 'Buddy requests', desc: 'When someone sends you a buddy request' },
  { key: 'buddy_accept', label: 'Buddy accepted', desc: 'When your buddy request is accepted' },
  { key: 'like', label: 'Likes', desc: 'When someone likes your post' },
  { key: 'comment', label: 'Comments', desc: 'When someone comments on your post' },
  { key: 'mention', label: 'Mentions', desc: 'When someone @mentions you' },
  { key: 'announcement', label: 'Announcements', desc: 'When Mind Core Fitness posts a new announcement' },
];

export default function CoreBuddySettings() {
  const { currentUser, clientData, updateClientData, logout, loading: authLoading } = useAuth();
  const { isDark, toggleTheme, accent, setAccent, isMono, toggleMono } = useTheme();
  const { isPremium, subscriptionStatus } = useTier();
  const navigate = useNavigate();

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [permissionState, setPermissionState] = useState('default');
  const [notifPrefs, setNotifPrefs] = useState({
    daily_morning: true,
    daily_evening: true,
    buddy_request: true,
    buddy_accept: true,
    like: true,
    comment: true,
    mention: true,
    announcement: true,
  });
  const [toast, setToast] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Edit Profile state
  const [editName, setEditName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [nameEdited, setNameEdited] = useState(false);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Open Stripe billing portal for subscription management / cancellation
  const handleManageSubscription = async () => {
    if (!clientData?.stripeCustomerId) return;
    setPortalLoading(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
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
        showToast(data.error || 'Something went wrong', 'error');
      }
    } catch (err) {
      console.error('Portal error:', err);
      showToast('Unable to open subscription portal', 'error');
    } finally {
      setPortalLoading(false);
    }
  };

  // Sync edit name when clientData loads
  useEffect(() => {
    if (clientData?.name && !nameEdited) setEditName(clientData.name);
  }, [clientData?.name, nameEdited]);

  const handleSaveProfile = async () => {
    if (!clientData) return;
    const trimmed = editName.trim();
    if (!trimmed || trimmed === clientData.name) return;
    setProfileSaving(true);
    try {
      await updateDoc(doc(db, 'clients', clientData.id), { name: trimmed });
      updateClientData({ name: trimmed });
      setNameEdited(false);
      showToast('Profile updated', 'success');
    } catch (err) {
      console.error('Failed to update profile:', err);
      showToast('Failed to save — try again', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  // Auth guard
  useEffect(() => {
    if (!authLoading && !currentUser) navigate('/');
  }, [authLoading, currentUser, navigate]);

  // Load existing preferences from clientData
  useEffect(() => {
    if (!clientData) return;
    const prefs = clientData.notificationPrefs;
    if (prefs) {
      setNotifPrefs(prev => ({ ...prev, ...prefs }));
    }
    // Check if user has push enabled (has fcm tokens stored)
    const tokens = clientData.fcmTokens || [];
    if (tokens.length > 0) {
      setPushEnabled(true);
      setPushToken(tokens[tokens.length - 1]);
    }
    // Check permission state (async on native, sync on web)
    if (isNative) {
      getNativePermissionState().then(state => setPermissionState(state));
    } else {
      setPermissionState(getPermissionState());
    }
  }, [clientData]);

  // Toggle master push notifications
  const handlePushToggle = async () => {
    if (!clientData) return;

    setPushLoading(true);
    try {
      if (pushEnabled) {
        // Disable push
        if (pushToken) {
          if (isNative) {
            await revokeNativePushToken(clientData.id, pushToken);
          } else {
            await revokePushToken(clientData.id, pushToken);
          }
        }
        setPushEnabled(false);
        setPushToken(null);
        updateClientData({ fcmTokens: [] });
        showToast('Push notifications disabled', 'info');
      } else if (isNative) {
        // Native iOS push via @capacitor-firebase/messaging
        const result = await requestNativePushPermission(clientData.id);
        if (result.token) {
          setPushEnabled(true);
          setPushToken(result.token);
          // Write default notificationPrefs if not already stored
          const existingPrefs = clientData.notificationPrefs;
          const prefsToWrite = existingPrefs && Object.keys(existingPrefs).length > 0
            ? existingPrefs
            : notifPrefs;
          await updateDoc(doc(db, 'clients', clientData.id), {
            notificationPrefs: prefsToWrite,
          });
          updateClientData({
            fcmTokens: [...(clientData.fcmTokens || []), result.token],
            notificationPrefs: prefsToWrite,
          });
          showToast('Push notifications enabled!', 'success');
        } else if (result.error === 'permission-denied') {
          showToast('Notifications blocked — enable in Settings > Mind Core Fitness > Notifications', 'error');
        } else {
          showToast('Could not enable notifications — please try again', 'error');
        }
      } else {
        // Web push via FCM service worker
        if (!isPushSupported()) {
          showToast('Push notifications are not supported on this device', 'error');
          return;
        }
        // Always attempt requestPermission — on iOS Safari the cached
        // Notification.permission can stay 'denied' even after the user
        // re-enables notifications in iOS Settings.  Calling
        // requestPermission() again will pick up the updated state.
        const result = await requestPushPermission(clientData.id);
        const token = result?.token ?? result; // backwards compat
        const pushError = result?.error ?? null;
        const state = getPermissionState();
        setPermissionState(state);
        if (token) {
          setPushEnabled(true);
          setPushToken(token);
          // Write default notificationPrefs if not already stored
          const existingPrefs = clientData.notificationPrefs;
          const prefsToWrite = existingPrefs && Object.keys(existingPrefs).length > 0
            ? existingPrefs
            : notifPrefs;
          await updateDoc(doc(db, 'clients', clientData.id), {
            notificationPrefs: prefsToWrite,
          });
          updateClientData({
            fcmTokens: [...(clientData.fcmTokens || []), token],
            notificationPrefs: prefsToWrite,
          });
          showToast('Push notifications enabled!', 'success');
        } else if (pushError === 'sw-not-ready') {
          showToast('Service worker not ready — close the app fully, reopen from home screen and try again', 'error');
        } else if (pushError === 'messaging-init') {
          showToast('Could not start notification service — close and reopen the app', 'error');
        } else if (pushError?.startsWith('token-failed:')) {
          const detail = pushError.replace('token-failed:', '');
          if (state === 'denied') {
            showToast('Notifications blocked — enable in Settings > Notifications, then remove and re-add the app', 'error');
          } else {
            showToast(`Permission OK but registration failed (${detail}) — close app fully, reopen and try again`, 'error');
          }
        } else if (state === 'denied') {
          showToast('Notifications blocked — enable them in your device settings, remove the app from your home screen and re-add it', 'error');
        } else {
          showToast('Could not enable notifications — please try again', 'error');
        }
      }
    } catch (err) {
      console.error('Push toggle failed:', err);
      showToast('Something went wrong — please try again', 'error');
    } finally {
      setPushLoading(false);
    }
  };

  // Toggle individual notification type
  const handlePrefToggle = async (key) => {
    if (!clientData) return;
    const newPrefs = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(newPrefs);
    try {
      await updateDoc(doc(db, 'clients', clientData.id), {
        notificationPrefs: newPrefs,
      });
      updateClientData({ notificationPrefs: newPrefs });
    } catch (err) {
      console.error('Failed to save pref:', err);
      setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }));
      showToast('Failed to save preference', 'error');
    }
  };

  if (authLoading || !clientData) {
    return (
      <div className="cb-loading">
        <div className="cb-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="cb-settings">
      {/* Header */}
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            <button onClick={logout} aria-label="Log out">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="settings-main">
        <h1 className="settings-title">Settings</h1>

        {/* ===== Edit Profile Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Profile
          </h2>
          <div className="settings-profile-field">
            <label className="settings-profile-label" htmlFor="settings-name">Display Name</label>
            <input
              id="settings-name"
              className="settings-profile-input"
              type="text"
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setNameEdited(true); }}
              placeholder="Enter your name"
              maxLength={100}
            />
          </div>
          <div className="settings-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div className="settings-row-text">
              <span className="settings-row-desc">This is how you appear to your buddies</span>
            </div>
            <button
              className="settings-profile-save-btn"
              onClick={handleSaveProfile}
              disabled={profileSaving || !editName.trim() || editName.trim() === clientData?.name}
            >
              {profileSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>

        {/* ===== Accent Colour Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="13.5" r="2.5"/><circle cx="8.5" cy="8.5" r="2.5"/><circle cx="5" cy="15.5" r="2.5"/><circle cx="11" cy="19.5" r="2.5"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a2 2 0 0 0 2-2 10 10 0 0 0-7-13z"/></svg>
            Accent Colour
          </h2>
          <div className="settings-accent-row">
            {[
              { key: 'red', color: '#B8313D', label: 'Red' },
              { key: 'orange', color: '#FF8533', label: 'Orange' },
              { key: 'blue', color: '#1AADFF', label: 'Blue' },
              { key: 'green', color: '#C1FF72', label: 'Green' },
              { key: 'purple', color: '#CB6CE6', label: 'Purple' },
            ].map((c) => (
              <button
                key={c.key}
                className={`settings-accent-option${accent === c.key ? ' active' : ''}`}
                onClick={() => setAccent(c.key)}
                aria-label={`${c.label} accent`}
              >
                <span className="settings-accent-dot" style={{ background: c.color }} />
                <span className="settings-accent-label">{c.label}</span>
              </button>
            ))}
          </div>
          <div className="settings-row settings-mono-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Mono</span>
              <span className="settings-row-desc">Black & white with frosted glass</span>
            </div>
            <button
              className={`settings-toggle${isMono ? ' on' : ''}`}
              onClick={toggleMono}
              aria-label="Toggle mono theme"
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </section>

        {/* ===== Notifications Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Notifications
          </h2>

          {/* Push master toggle — shown on native or when web push is supported */}
          {(isNative || isPushSupported()) ? (
            <div className="settings-row">
              <div className="settings-row-text">
                <span className="settings-row-label">Push notifications</span>
                <span className="settings-row-desc">
                  Receive notifications even when the app is closed
                </span>
              </div>
              <button
                className={`settings-toggle${pushEnabled ? ' on' : ''}${pushLoading ? ' loading' : ''}`}
                onClick={handlePushToggle}
                disabled={pushLoading}
                aria-label="Toggle push notifications"
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          ) : (
            <p className="settings-hint">
              Add the app to your home screen for background push notifications.
              In-app notifications still work below.
            </p>
          )}

          {/* Individual notification type toggles */}
          <div className="settings-sub-section">
            <span className="settings-sub-title">Notify me about</span>
            {NOTIF_PREFS.map((pref) => (
              <div className="settings-row" key={pref.key}>
                <div className="settings-row-text">
                  <span className="settings-row-label">{pref.label}</span>
                  <span className="settings-row-desc">{pref.desc}</span>
                </div>
                <button
                  className={`settings-toggle${notifPrefs[pref.key] ? ' on' : ''}`}
                  onClick={() => handlePrefToggle(pref.key)}
                  aria-label={`Toggle ${pref.label}`}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Account Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Account
          </h2>
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Dark mode</span>
              <span className="settings-row-desc">Switch between light and dark themes</span>
            </div>
            <button
              className={`settings-toggle${isDark ? ' on' : ''}`}
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Email</span>
              <span className="settings-row-desc">{clientData?.email || '—'}</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Plan</span>
              <span className="settings-row-desc" style={{ textTransform: 'capitalize' }}>{clientData?.tier || 'free'}</span>
            </div>
          </div>
        </section>

        {/* ===== Subscription Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Subscription
          </h2>

          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Status</span>
              <span className="settings-row-desc">
                <span className={`settings-sub-badge ${isPremium ? (subscriptionStatus === 'cancelled' ? 'cancelled' : 'active') : 'free'}`}>
                  {isPremium
                    ? subscriptionStatus === 'trialing'
                      ? 'Trial'
                      : subscriptionStatus === 'cancelled'
                        ? 'Cancelled'
                        : subscriptionStatus === 'expired'
                          ? 'Expired'
                          : 'Active'
                    : 'Free'}
                </span>
              </span>
            </div>
          </div>

          {/* Self-signup premium users with Stripe — show manage/cancel */}
          {clientData?.stripeCustomerId ? (
            <div className="settings-row">
              <div className="settings-row-text">
                <span className="settings-row-label">Manage Subscription</span>
                <span className="settings-row-desc">Update payment method, change plan, or cancel</span>
              </div>
              <button
                className="settings-portal-btn"
                onClick={handleManageSubscription}
                disabled={portalLoading}
              >
                {portalLoading ? 'Opening...' : 'Manage'}
              </button>
            </div>
          ) : isPremium ? (
            /* Admin-granted premium — no self-service */
            <div className="settings-row">
              <div className="settings-row-text">
                <span className="settings-row-label">Managed by Coach</span>
                <span className="settings-row-desc">Your subscription is managed by your coach. Contact them for any changes.</span>
              </div>
            </div>
          ) : (
            /* Free tier — prompt to upgrade */
            <button className="settings-upgrade-btn" onClick={() => navigate('/upgrade')}>
              Upgrade to Premium
            </button>
          )}
        </section>

        {/* ===== Support & Feedback Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Support & Feedback
          </h2>
          <a href="mailto:ross@mindcorefitness.com?subject=Core%20Buddy%20Bug%20Report" className="settings-link-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Report a Bug</span>
              <span className="settings-row-desc">Found something not working? Let us know</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </a>
          <a href="mailto:ross@mindcorefitness.com?subject=Core%20Buddy%20Feature%20Request" className="settings-link-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Request a Feature</span>
              <span className="settings-row-desc">Have an idea to improve Core Buddy?</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </a>
          <a href="mailto:ross@mindcorefitness.com?subject=Core%20Buddy%20Feedback" className="settings-link-row">
            <div className="settings-row-text">
              <span className="settings-row-label">General Feedback</span>
              <span className="settings-row-desc">We'd love to hear from you</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </a>
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Contact Email</span>
              <span className="settings-row-desc">ross@mindcorefitness.com</span>
            </div>
          </div>
        </section>

        {/* ===== Legal Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Legal
          </h2>
          <button type="button" className="settings-link-row" onClick={() => openExternal('https://www.mindcorefitness.com/privacy-policy')}>
            <div className="settings-row-text">
              <span className="settings-row-label">Privacy Policy</span>
              <span className="settings-row-desc">How we collect, use, and protect your data</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button type="button" className="settings-link-row" onClick={() => openExternal('https://www.mindcorefitness.com/terms')}>
            <div className="settings-row-text">
              <span className="settings-row-label">Terms & Conditions</span>
              <span className="settings-row-desc">Terms of use for Core Buddy</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        </section>

        {/* ===== About Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            About
          </h2>
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Core Buddy</span>
              <span className="settings-row-desc">Food. Habits. Move.</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Version</span>
              <span className="settings-row-desc">1.0.0</span>
            </div>
          </div>
          <a href="/core-buddy" target="_blank" rel="noopener noreferrer" className="settings-link-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Visit Our Website</span>
              <span className="settings-row-desc">mindcorefitness.com</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`settings-toast ${toast.type}`}>{toast.message}</div>
      )}

      <CoreBuddyNav active="home" />
    </div>
  );
}
