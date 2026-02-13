import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CircuitBooking.css';
import './CircuitDashboard.css';

const getNextSaturday = () => {
  const now = new Date();
  const day = now.getDay();
  let daysUntil = (6 - day + 7) % 7;
  if (daysUntil === 0) {
    const classEnd = new Date(now);
    classEnd.setHours(9, 45, 0, 0);
    if (now > classEnd) daysUntil = 7;
  }
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next;
};

const getDateString = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatSaturdayDate = (dateStr) => {
  const date = new Date(dateStr + 'T09:00:00');
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};

const getTypeLabel = (type) => {
  if (type === 'circuit_vip') return 'VIP';
  if (type === 'circuit_dropin') return 'Drop-in';
  return 'Block';
};

const getTypeBadgeClass = (type) => {
  if (type === 'circuit_vip') return 'vip';
  if (type === 'circuit_dropin') return 'dropin';
  return 'block';
};

export default function CircuitBooking() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState(null);

  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (clientData) loadSession();
  }, [clientData]);

  const loadSession = async () => {
    try {
      const nextSatDate = getDateString(getNextSaturday());
      const sessionRef = doc(db, 'circuitSessions', nextSatDate);
      const sessionDoc = await getDoc(sessionRef);

      if (sessionDoc.exists()) {
        const existingSession = { id: sessionDoc.id, ...sessionDoc.data() };

        // Try to auto-slot any new VIPs, but don't fail the whole page if this errors
        try {
          const vipQ = query(
            collection(db, 'clients'),
            where('clientType', '==', 'circuit_vip'),
            where('status', '==', 'active')
          );
          const vipSnap = await getDocs(vipQ);
          const vips = vipSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          const slottedMemberIds = existingSession.slots
            .filter(s => s.memberId)
            .map(s => s.memberId);
          const optedOut = existingSession.vipOptOuts || [];
          const missingVips = vips.filter(v => !slottedMemberIds.includes(v.id) && !optedOut.includes(v.id));

          if (missingVips.length > 0) {
            const updatedSlots = [...existingSession.slots];
            let changed = false;

            for (const vip of missingVips) {
              const availIdx = updatedSlots.findIndex(s => s.status === 'available');
              if (availIdx === -1) break;
              updatedSlots[availIdx] = {
                slotNumber: updatedSlots[availIdx].slotNumber,
                memberId: vip.id,
                memberName: vip.name,
                memberType: 'circuit_vip',
                status: 'confirmed',
                bookedAt: Timestamp.now(),
              };
              changed = true;
            }

            if (changed) {
              await updateDoc(sessionRef, { slots: updatedSlots });
              existingSession.slots = updatedSlots;
            }
          }
        } catch (vipError) {
          console.error('VIP auto-slot check failed (non-critical):', vipError);
        }

        setSession(existingSession);
      } else {
        // Auto-create session — try to pre-slot VIPs but fall back to empty slots
        let vips = [];
        try {
          const vipQ = query(
            collection(db, 'clients'),
            where('clientType', '==', 'circuit_vip'),
            where('status', '==', 'active')
          );
          const vipSnap = await getDocs(vipQ);
          vips = vipSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (vipError) {
          console.error('VIP query failed, creating session with empty slots:', vipError);
        }

        const slots = [];
        for (let i = 0; i < 8; i++) {
          if (i < vips.length) {
            slots.push({
              slotNumber: i + 1,
              memberId: vips[i].id,
              memberName: vips[i].name,
              memberType: 'circuit_vip',
              status: 'confirmed',
              bookedAt: Timestamp.now(),
            });
          } else {
            slots.push({
              slotNumber: i + 1,
              memberId: null,
              memberName: null,
              memberType: null,
              status: 'available',
            });
          }
        }

        const sessionData = {
          date: nextSatDate,
          time: '09:00',
          endTime: '09:45',
          maxCapacity: 8,
          slots,
          waitlist: [],
          createdAt: Timestamp.now(),
        };
        await setDoc(sessionRef, sessionData);
        setSession({ id: nextSatDate, ...sessionData });
      }
    } catch (error) {
      console.error('Error loading session:', error);
      setLoadError(true);
      showToast('Failed to load session', 'error');
    }
    setLoading(false);
  };

  const handleBookSlot = async (slotNumber) => {
    if (saving) return;
    setSaving(true);
    try {
      // Check ban
      if (clientData.circuitBanUntil) {
        const banDate = clientData.circuitBanUntil.toDate ? clientData.circuitBanUntil.toDate() : new Date(clientData.circuitBanUntil);
        if (banDate > new Date()) {
          showToast('You are currently suspended from booking', 'error');
          setSaving(false);
          return;
        }
      }

      // Check already booked
      if (session.slots.some(s => s.memberId === clientData.id)) {
        showToast('You already have a slot booked', 'error');
        setSaving(false);
        return;
      }

      const updatedSlots = [...session.slots];
      const slotIdx = updatedSlots.findIndex(s => s.slotNumber === slotNumber && s.status === 'available');
      if (slotIdx === -1) {
        showToast('Slot is no longer available', 'error');
        setSaving(false);
        return;
      }

      updatedSlots[slotIdx] = {
        slotNumber,
        memberId: clientData.id,
        memberName: clientData.name,
        memberType: clientData.clientType || 'block',
        status: 'confirmed',
        bookedAt: Timestamp.now(),
      };

      // Remove from waitlist if they were on it
      const updatedWaitlist = (session.waitlist || []).filter(w => w.memberId !== clientData.id);

      // Remove from vipOptOuts if VIP is manually re-booking
      const updateData = { slots: updatedSlots, waitlist: updatedWaitlist };
      if (clientData.clientType === 'circuit_vip') {
        const currentOptOuts = session.vipOptOuts || [];
        if (currentOptOuts.includes(clientData.id)) {
          updateData.vipOptOuts = currentOptOuts.filter(id => id !== clientData.id);
        }
      }

      await updateDoc(doc(db, 'circuitSessions', session.id), updateData);
      setSession(prev => ({ ...prev, ...updateData }));
      showToast('Slot booked!', 'success');
    } catch (error) {
      console.error('Error booking slot:', error);
      showToast('Failed to book slot', 'error');
    }
    setSaving(false);
  };

  const handleReleaseSlot = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Check 24h cancellation deadline
      const nextSat = getNextSaturday();
      nextSat.setHours(9, 0, 0, 0);
      const cancelDeadline = new Date(nextSat.getTime() - 24 * 60 * 60 * 1000);
      if (new Date() > cancelDeadline) {
        showToast('Cancellation deadline passed (24hrs before class)', 'error');
        setSaving(false);
        return;
      }

      const updatedSlots = [...session.slots];
      const mySlotIdx = updatedSlots.findIndex(s => s.memberId === clientData.id);
      if (mySlotIdx === -1) {
        setSaving(false);
        return;
      }

      const slotNum = updatedSlots[mySlotIdx].slotNumber;
      const isVip = updatedSlots[mySlotIdx].memberType === 'circuit_vip';
      let updatedWaitlist = [...(session.waitlist || [])];

      // If waitlist has someone, auto-book them into the released slot
      if (updatedWaitlist.length > 0) {
        const nextInLine = updatedWaitlist.shift();
        updatedSlots[mySlotIdx] = {
          slotNumber: slotNum,
          memberId: nextInLine.memberId,
          memberName: nextInLine.memberName,
          memberType: nextInLine.memberType,
          status: 'confirmed',
          bookedAt: Timestamp.now(),
        };
      } else {
        updatedSlots[mySlotIdx] = {
          slotNumber: slotNum,
          memberId: null,
          memberName: null,
          memberType: null,
          status: 'available',
        };
      }

      // Track VIP opt-out so auto-booking doesn't re-add them to this session
      const updateData = {
        slots: updatedSlots,
        waitlist: updatedWaitlist,
      };
      if (isVip) {
        const currentOptOuts = session.vipOptOuts || [];
        if (!currentOptOuts.includes(clientData.id)) {
          updateData.vipOptOuts = [...currentOptOuts, clientData.id];
        }
      }

      await updateDoc(doc(db, 'circuitSessions', session.id), updateData);
      setSession(prev => ({ ...prev, ...updateData }));
      showToast('Slot released', 'success');
    } catch (error) {
      console.error('Error releasing slot:', error);
      showToast('Failed to release slot', 'error');
    }
    setSaving(false);
  };

  const handleJoinWaitlist = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (session.waitlist?.some(w => w.memberId === clientData.id)) {
        showToast('Already on the waitlist', 'error');
        setSaving(false);
        return;
      }
      if (session.slots.some(s => s.memberId === clientData.id)) {
        showToast('You already have a slot', 'error');
        setSaving(false);
        return;
      }

      const updatedWaitlist = [...(session.waitlist || []), {
        memberId: clientData.id,
        memberName: clientData.name,
        memberType: clientData.clientType || 'block',
        addedAt: Timestamp.now(),
      }];

      await updateDoc(doc(db, 'circuitSessions', session.id), { waitlist: updatedWaitlist });
      setSession(prev => ({ ...prev, waitlist: updatedWaitlist }));
      showToast('Added to waitlist!', 'success');
    } catch (error) {
      console.error('Error joining waitlist:', error);
      showToast('Failed to join waitlist', 'error');
    }
    setSaving(false);
  };

  const handleLeaveWaitlist = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updatedWaitlist = (session.waitlist || []).filter(w => w.memberId !== clientData.id);
      await updateDoc(doc(db, 'circuitSessions', session.id), { waitlist: updatedWaitlist });
      setSession(prev => ({ ...prev, waitlist: updatedWaitlist }));
      showToast('Removed from waitlist', 'success');
    } catch (error) {
      console.error('Error leaving waitlist:', error);
      showToast('Failed to leave waitlist', 'error');
    }
    setSaving(false);
  };

  if (authLoading || loading) {
    return (
      <div className="cb-page">
        <div className="cb-loading">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="cb-loading-logo" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`cb-page ${isDark ? 'dark' : ''}`}>
        <header className="cb-header">
          <button className="cb-back-btn" onClick={() => navigate('/client/circuit')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h1>Class Booking</h1>
          <div className="cb-header-spacer" />
        </header>
        <main className="cb-main">
          <div className="cb-error-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <circle cx="12" cy="16" r="1" fill="currentColor"/>
            </svg>
            <h3>Couldn't load booking</h3>
            <p>Something went wrong. Please try again.</p>
            <button className="cb-retry-btn" onClick={() => { setLoading(true); setLoadError(false); loadSession(); }}>
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  const memberType = clientData?.clientType || 'block';
  const isCircuitOnly = memberType === 'circuit_vip' || memberType === 'circuit_dropin';
  const myCurrentSlot = session.slots.find(s => s.memberId === clientData.id);
  const onWaitlist = session.waitlist?.some(w => w.memberId === clientData.id);
  const availableSlots = session.slots.filter(s => s.status === 'available').length;
  const isFull = availableSlots === 0;

  // Deadline checks for UI
  const nextSat = getNextSaturday();

  const cancelDeadline = new Date(nextSat);
  cancelDeadline.setHours(9, 0, 0, 0);
  cancelDeadline.setTime(cancelDeadline.getTime() - 24 * 60 * 60 * 1000);
  const pastCancelDeadline = new Date() > cancelDeadline;

  return (
    <div className={`cb-page ${isDark ? 'dark' : ''}`}>
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/circuit')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
        </div>
      </header>

      <main className="cb-main">
        {/* Class Info */}
        <div className="cb-class-info">
          <h2>{formatSaturdayDate(session.date)}</h2>
          <p>{session.time} - {session.endTime} &bull; {availableSlots} slot{availableSlots !== 1 ? 's' : ''} available</p>
        </div>

        {/* 8 Slot Cards */}
        <div className="cb-slots-grid">
          {session.slots.map(slot => {
            const isMySlot = slot.memberId === clientData.id;
            const isAvailable = slot.status === 'available';
            const isVip = slot.memberType === 'circuit_vip';

            return (
              <div key={slot.slotNumber} className={`cb-slot ${isMySlot ? 'mine' : ''} ${isAvailable ? 'available' : 'filled'}`}>
                <div className="cb-slot-number">{slot.slotNumber}</div>
                <div className="cb-slot-body">
                  {isAvailable ? (
                    <>
                      <span className="cb-slot-available">Available</span>
                      {!myCurrentSlot && (
                        <button className="cb-slot-book-btn" onClick={() => handleBookSlot(slot.slotNumber)} disabled={saving}>
                          Book
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="cb-slot-name">{slot.memberName}</span>
                      <span className={`cb-slot-badge ${getTypeBadgeClass(slot.memberType)}`}>
                        {getTypeLabel(slot.memberType)}
                      </span>
                    </>
                  )}
                </div>
                {isMySlot && (
                  <button
                    className="cb-slot-release-btn"
                    onClick={handleReleaseSlot}
                    disabled={saving || pastCancelDeadline}
                    title={pastCancelDeadline ? 'Cancellation deadline passed' : 'Cancel this slot'}
                  >
                    {pastCancelDeadline ? 'Locked' : 'Cancel'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Waitlist Section */}
        {!myCurrentSlot && isFull && (
          <div className="cb-waitlist-section">
            {onWaitlist ? (
              <div className="cb-waitlist-status">
                <p>You're on the waitlist (position #{(session.waitlist?.findIndex(w => w.memberId === clientData.id) || 0) + 1})</p>
                <button className="cb-waitlist-leave-btn" onClick={handleLeaveWaitlist} disabled={saving}>
                  Leave Waitlist
                </button>
              </div>
            ) : (
              <button className="cb-waitlist-join-btn" onClick={handleJoinWaitlist} disabled={saving}>
                Class Full - Join Waitlist
              </button>
            )}
          </div>
        )}

        {/* Waitlist Preview */}
        {session.waitlist?.length > 0 && (
          <div className="cb-waitlist-preview">
            <h4>Waitlist ({session.waitlist.length})</h4>
            {session.waitlist.map((w, i) => (
              <div key={w.memberId} className="cb-waitlist-item">
                <span className="cb-waitlist-pos">#{i + 1}</span>
                <span className="cb-waitlist-name">{w.memberName}</span>
                <span className={`cb-slot-badge ${getTypeBadgeClass(w.memberType)}`}>{getTypeLabel(w.memberType)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Rules */}
        <div className="cb-rules">
          <p><strong>Book anytime before class</strong> &bull; <strong>Cancel 24hrs before</strong> &bull; <strong>3 no-shows = 1 month ban</strong></p>
        </div>
      </main>

      {/* Bottom Tab Nav */}
      <nav className="circuit-bottom-nav">
        {!isCircuitOnly && (
          <button className="circuit-nav-tab" onClick={() => navigate('/client')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            <span>Dashboard</span>
          </button>
        )}
        <button className="circuit-nav-tab" onClick={() => navigate('/client/circuit')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </button>
        <button className="circuit-nav-tab active" onClick={() => navigate('/client/circuit/booking')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Class</span>
        </button>
      </nav>

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
