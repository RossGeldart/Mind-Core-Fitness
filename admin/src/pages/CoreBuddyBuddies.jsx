import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, addDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddyBuddies.css';

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function pairId(a, b) {
  return [a, b].sort().join('_');
}

export default function CoreBuddyBuddies() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [tab, setTab] = useState('buddies');       // buddies | requests | search
  const [buddies, setBuddies] = useState([]);       // confirmed buddy client objects
  const [incoming, setIncoming] = useState([]);      // pending incoming requests
  const [outgoing, setOutgoing] = useState([]);      // pending outgoing requests
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load buddy data
  const fetchData = useCallback(async () => {
    if (!clientData) return;
    setLoading(true);
    try {
      const myId = clientData.id;

      // 1. All clients (for search + name resolution)
      const clientsSnap = await getDocs(collection(db, 'clients'));
      const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllClients(clients);
      const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

      // 2. Confirmed buddies where I'm user1 or user2
      const b1 = await getDocs(query(collection(db, 'buddies'), where('user1', '==', myId)));
      const b2 = await getDocs(query(collection(db, 'buddies'), where('user2', '==', myId)));
      const buddyIds = new Set();
      [...b1.docs, ...b2.docs].forEach(d => {
        const data = d.data();
        const otherId = data.user1 === myId ? data.user2 : data.user1;
        buddyIds.add(otherId);
      });
      setBuddies(Array.from(buddyIds).map(id => clientMap[id]).filter(Boolean));

      // 3. Incoming requests (to me, pending)
      const inSnap = await getDocs(query(
        collection(db, 'buddyRequests'),
        where('toId', '==', myId),
        where('status', '==', 'pending')
      ));
      setIncoming(inSnap.docs.map(d => ({
        reqId: d.id,
        ...d.data(),
        fromClient: clientMap[d.data().fromId]
      })).filter(r => r.fromClient));

      // 4. Outgoing requests (from me, pending)
      const outSnap = await getDocs(query(
        collection(db, 'buddyRequests'),
        where('fromId', '==', myId),
        where('status', '==', 'pending')
      ));
      setOutgoing(outSnap.docs.map(d => ({
        reqId: d.id,
        ...d.data(),
        toClient: clientMap[d.data().toId]
      })).filter(r => r.toClient));
    } catch (err) {
      console.error('Error fetching buddy data:', err);
      showToast('Failed to load buddies', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientData, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Search logic
  useEffect(() => {
    if (!searchTerm.trim() || !clientData) { setSearchResults([]); return; }
    const q = searchTerm.toLowerCase();
    const myId = clientData.id;
    const buddyIdSet = new Set(buddies.map(b => b.id));
    const outgoingIdSet = new Set(outgoing.map(o => o.toId));
    const incomingIdSet = new Set(incoming.map(i => i.fromId));

    const results = allClients.filter(c => {
      if (c.id === myId) return false;
      if (!c.name) return false;
      if (!c.coreBuddyAccess && c.clientType !== 'core_buddy') return false;
      return c.name.toLowerCase().includes(q);
    }).map(c => ({
      ...c,
      isBuddy: buddyIdSet.has(c.id),
      isPendingOut: outgoingIdSet.has(c.id),
      isPendingIn: incomingIdSet.has(c.id),
    })).slice(0, 20);

    setSearchResults(results);
  }, [searchTerm, allClients, buddies, outgoing, incoming, clientData]);

  // Notification helper
  const createNotification = async (toId, type) => {
    if (!clientData || toId === clientData.id) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        toId,
        fromId: clientData.id,
        fromName: clientData.name || 'Someone',
        fromPhotoURL: clientData.photoURL || null,
        type,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (err) { console.error('Notification error:', err); }
  };

  // Actions
  const sendRequest = async (toId) => {
    setActionLoading(toId);
    try {
      const reqId = `${clientData.id}_${toId}`;
      await setDoc(doc(db, 'buddyRequests', reqId), {
        fromId: clientData.id,
        toId,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      await createNotification(toId, 'buddy_request');
      showToast('Buddy request sent!', 'success');
      await fetchData();
    } catch (err) {
      console.error('Error sending request:', err);
      showToast('Failed to send request', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const acceptRequest = async (req) => {
    setActionLoading(req.reqId);
    try {
      // Create buddy pair
      const pid = pairId(req.fromId, clientData.id);
      await setDoc(doc(db, 'buddies', pid), {
        user1: [req.fromId, clientData.id].sort()[0],
        user2: [req.fromId, clientData.id].sort()[1],
        connectedAt: serverTimestamp()
      });
      // Delete the request
      await deleteDoc(doc(db, 'buddyRequests', req.reqId));
      await createNotification(req.fromId, 'buddy_accept');
      showToast('Buddy added!', 'success');
      await fetchData();
    } catch (err) {
      console.error('Error accepting request:', err);
      showToast('Failed to accept', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const declineRequest = async (req) => {
    setActionLoading(req.reqId);
    try {
      await deleteDoc(doc(db, 'buddyRequests', req.reqId));
      showToast('Request declined', 'info');
      await fetchData();
    } catch (err) {
      console.error('Error declining:', err);
      showToast('Failed to decline', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const cancelRequest = async (req) => {
    setActionLoading(req.reqId);
    try {
      await deleteDoc(doc(db, 'buddyRequests', req.reqId));
      showToast('Request cancelled', 'info');
      await fetchData();
    } catch (err) {
      console.error('Error cancelling:', err);
      showToast('Failed to cancel', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const removeBuddy = async (buddyId) => {
    setActionLoading(buddyId);
    try {
      const pid = pairId(clientData.id, buddyId);
      await deleteDoc(doc(db, 'buddies', pid));
      showToast('Buddy removed', 'info');
      await fetchData();
    } catch (err) {
      console.error('Error removing buddy:', err);
      showToast('Failed to remove buddy', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = incoming.length;

  if (authLoading) {
    return <div className="bdy-loading"><div className="bdy-spinner" /></div>;
  }
  if (!currentUser || !isClient || !clientData) return null;

  return (
    <div className="bdy-page" data-theme={isDark ? 'dark' : 'light'}>
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
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
          </div>
        </div>
      </header>

      <main className="bdy-main">
        <h1 className="bdy-title">Buddies</h1>

        {/* Tabs */}
        <div className="bdy-tabs">
          <button className={`bdy-tab${tab === 'buddies' ? ' active' : ''}`} onClick={() => setTab('buddies')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>My Buddies</span>
          </button>
          <button className={`bdy-tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            <span>Requests</span>
            {pendingCount > 0 && <span className="bdy-tab-badge">{pendingCount}</span>}
          </button>
          <button className={`bdy-tab${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Find</span>
          </button>
        </div>

        {loading ? (
          <div className="bdy-content-loading"><div className="bdy-spinner" /></div>
        ) : (
          <>
            {/* ── My Buddies ── */}
            {tab === 'buddies' && (
              <div className="bdy-section">
                {buddies.length === 0 ? (
                  <div className="bdy-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <h3>No buddies yet</h3>
                    <p>Find members and send buddy requests to connect!</p>
                    <button className="bdy-empty-btn" onClick={() => setTab('search')}>Find Buddies</button>
                  </div>
                ) : (
                  <div className="bdy-list">
                    {buddies.map(b => (
                      <div key={b.id} className="bdy-card" onClick={() => navigate(`/client/core-buddy/profile/${b.id}`)}>
                        <div className="bdy-avatar">
                          {b.photoURL ? (
                            <img src={b.photoURL} alt={b.name} />
                          ) : (
                            <span>{getInitials(b.name)}</span>
                          )}
                        </div>
                        <div className="bdy-card-info">
                          <span className="bdy-card-name">{b.name}</span>
                        </div>
                        <button
                          className="bdy-remove-btn"
                          onClick={(e) => { e.stopPropagation(); removeBuddy(b.id); }}
                          disabled={actionLoading === b.id}
                          aria-label="Remove buddy"
                        >
                          {actionLoading === b.id ? (
                            <div className="bdy-btn-spinner" />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Requests ── */}
            {tab === 'requests' && (
              <div className="bdy-section">
                {incoming.length > 0 && (
                  <>
                    <h3 className="bdy-section-title">Incoming</h3>
                    <div className="bdy-list">
                      {incoming.map(req => (
                        <div key={req.reqId} className="bdy-card">
                          <div className="bdy-avatar">
                            {req.fromClient.photoURL ? (
                              <img src={req.fromClient.photoURL} alt={req.fromClient.name} />
                            ) : (
                              <span>{getInitials(req.fromClient.name)}</span>
                            )}
                          </div>
                          <div className="bdy-card-info">
                            <span className="bdy-card-name">{req.fromClient.name}</span>
                            <span className="bdy-card-sub">wants to be your buddy</span>
                          </div>
                          <div className="bdy-action-pair">
                            <button
                              className="bdy-accept-btn"
                              onClick={() => acceptRequest(req)}
                              disabled={actionLoading === req.reqId}
                            >
                              {actionLoading === req.reqId ? <div className="bdy-btn-spinner" /> : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                              )}
                            </button>
                            <button
                              className="bdy-decline-btn"
                              onClick={() => declineRequest(req)}
                              disabled={actionLoading === req.reqId}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {outgoing.length > 0 && (
                  <>
                    <h3 className="bdy-section-title">Sent</h3>
                    <div className="bdy-list">
                      {outgoing.map(req => (
                        <div key={req.reqId} className="bdy-card">
                          <div className="bdy-avatar">
                            {req.toClient?.photoURL ? (
                              <img src={req.toClient.photoURL} alt={req.toClient.name} />
                            ) : (
                              <span>{getInitials(req.toClient?.name)}</span>
                            )}
                          </div>
                          <div className="bdy-card-info">
                            <span className="bdy-card-name">{req.toClient?.name}</span>
                            <span className="bdy-card-sub">pending</span>
                          </div>
                          <button
                            className="bdy-cancel-btn"
                            onClick={() => cancelRequest(req)}
                            disabled={actionLoading === req.reqId}
                          >
                            {actionLoading === req.reqId ? <div className="bdy-btn-spinner" /> : 'Cancel'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {incoming.length === 0 && outgoing.length === 0 && (
                  <div className="bdy-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                    <h3>No pending requests</h3>
                    <p>All caught up!</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Search ── */}
            {tab === 'search' && (
              <div className="bdy-section">
                <div className="bdy-search-bar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                  {searchTerm && (
                    <button className="bdy-search-clear" onClick={() => setSearchTerm('')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>

                {searchTerm.trim() && searchResults.length === 0 && (
                  <div className="bdy-empty bdy-empty-sm">
                    <p>No members found for "{searchTerm}"</p>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="bdy-list">
                    {searchResults.map(c => (
                      <div key={c.id} className="bdy-card" onClick={() => navigate(`/client/core-buddy/profile/${c.id}`)}>
                        <div className="bdy-avatar">
                          {c.photoURL ? (
                            <img src={c.photoURL} alt={c.name} />
                          ) : (
                            <span>{getInitials(c.name)}</span>
                          )}
                        </div>
                        <div className="bdy-card-info">
                          <span className="bdy-card-name">{c.name}</span>
                          {c.isBuddy && <span className="bdy-card-badge">Buddy</span>}
                        </div>
                        {c.isBuddy ? (
                          <span className="bdy-status-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
                          </span>
                        ) : c.isPendingOut ? (
                          <span className="bdy-pending-label">Pending</span>
                        ) : c.isPendingIn ? (
                          <button
                            className="bdy-accept-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const req = incoming.find(r => r.fromId === c.id);
                              if (req) acceptRequest(req);
                            }}
                            disabled={!!actionLoading}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                          </button>
                        ) : (
                          <button
                            className="bdy-add-btn"
                            onClick={(e) => { e.stopPropagation(); sendRequest(c.id); }}
                            disabled={actionLoading === c.id}
                          >
                            {actionLoading === c.id ? <div className="bdy-btn-spinner" /> : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <CoreBuddyNav />

      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13 L9 17 L19 7" /></svg>
            ) : toast.type === 'error' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="1" fill="currentColor" /></svg>
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
