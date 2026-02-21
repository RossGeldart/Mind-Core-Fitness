import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  isPushSupported,
  getPermissionState,
  requestPushPermission,
  revokePushToken,
} from '../utils/pushNotifications';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddySettings.css';

const NOTIF_PREFS = [
  { key: 'buddy_request', label: 'Buddy requests', desc: 'When someone sends you a buddy request' },
  { key: 'buddy_accept', label: 'Buddy accepted', desc: 'When your buddy request is accepted' },
  { key: 'like', label: 'Likes', desc: 'When someone likes your post' },
  { key: 'comment', label: 'Comments', desc: 'When someone comments on your post' },
  { key: 'mention', label: 'Mentions', desc: 'When someone @mentions you' },
];

export default function CoreBuddySettings() {
  const { currentUser, clientData, updateClientData, logout, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [permissionState, setPermissionState] = useState('default');
  const [notifPrefs, setNotifPrefs] = useState({
    buddy_request: true,
    buddy_accept: true,
    like: true,
    comment: true,
    mention: true,
  });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

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
    setPermissionState(getPermissionState());
  }, [clientData]);

  // Toggle master push notifications
  const handlePushToggle = async () => {
    if (!clientData) return;
    setPushLoading(true);

    if (pushEnabled) {
      // Disable push
      if (pushToken) {
        await revokePushToken(clientData.id, pushToken);
      }
      setPushEnabled(false);
      setPushToken(null);
      showToast('Push notifications disabled', 'info');
    } else {
      // Enable push
      if (!isPushSupported()) {
        showToast('Push notifications are not supported on this device', 'error');
        setPushLoading(false);
        return;
      }
      const token = await requestPushPermission(clientData.id);
      if (token) {
        setPushEnabled(true);
        setPushToken(token);
        setPermissionState('granted');
        showToast('Push notifications enabled!', 'success');
      } else {
        const state = getPermissionState();
        setPermissionState(state);
        if (state === 'denied') {
          showToast('Notifications blocked — enable them in your browser settings', 'error');
        } else {
          showToast('Could not enable notifications', 'error');
        }
      }
    }
    setPushLoading(false);
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
    <div className="cb-settings" data-theme={isDark ? 'dark' : 'light'}>
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

        {/* ===== Notifications Section ===== */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Notifications
          </h2>

          {/* Push master toggle */}
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Push notifications</span>
              <span className="settings-row-desc">
                {permissionState === 'denied'
                  ? 'Blocked in browser — update in your device/browser settings'
                  : 'Receive notifications even when the app is closed'}
              </span>
            </div>
            <button
              className={`settings-toggle${pushEnabled ? ' on' : ''}${pushLoading ? ' loading' : ''}`}
              onClick={handlePushToggle}
              disabled={pushLoading || permissionState === 'denied'}
              aria-label="Toggle push notifications"
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>

          {!isPushSupported() && (
            <p className="settings-hint">Push notifications aren't supported on this browser. Try using the app from your home screen.</p>
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
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="settings-link-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Privacy Policy</span>
              <span className="settings-row-desc">How we collect, use, and protect your data</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="settings-link-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Terms & Conditions</span>
              <span className="settings-row-desc">Terms of use for Core Buddy</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
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
