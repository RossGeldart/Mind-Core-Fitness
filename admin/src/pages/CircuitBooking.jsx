import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CircuitBooking.css';

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

        // Check for VIPs added after session was created and auto-slot them
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
        const missingVips = vips.filter(v => !slottedMemberIds.includes(v.id));

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

        setSession(existingSession);
      } else {
        // Auto-create session with VIPs pre-slotted
        const vipQ = query(
          collection(db, 'clients'),
          where('clientType', '==', 'circuit_vip'),
          where('status', '==', 'active')
        );
        const vipSnap = await getDocs(vipQ);
        const vips = vipSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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

      // Check Wednesday deadline
      const nextSat = getNextSaturday();
      const deadline = new Date(nextSat);
      deadline.setDate(deadline.getDate() - 3);
      deadline.setHours(23, 59, 59, 999);
      if (new Date() > deadline) {
        showToast('Booking deadline has passed (Wednesday)', 'error');
        setSaving(false);
        return;
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

      await updateDoc(doc(db, 'circuitSessions', session.id), {
        slots: updatedSlots,
        waitlist: updatedWaitlist,
      });
      setSession(prev => ({ ...prev, slots: updatedSlots, waitlist: updatedWaitlist }));
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

      await updateDoc(doc(db, 'circuitSessions', session.id), {
        slots: updatedSlots,
        waitlist: updatedWaitlist,
      });
      setSession(prev => ({ ...prev, slots: updatedSlots, waitlist: updatedWaitlist }));
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
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-loading-logo" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  const myCurrentSlot = session.slots.find(s => s.memberId === clientData.id);
  const onWaitlist = session.waitlist?.some(w => w.memberId === clientData.id);
  const availableSlots = session.slots.filter(s => s.status === 'available').length;
  const isFull = availableSlots === 0;

  // Deadline checks for UI
  const nextSat = getNextSaturday();
  const bookDeadline = new Date(nextSat);
  bookDeadline.setDate(bookDeadline.getDate() - 3);
  bookDeadline.setHours(23, 59, 59, 999);
  const pastBookDeadline = new Date() > bookDeadline;

  const cancelDeadline = new Date(nextSat);
  cancelDeadline.setHours(9, 0, 0, 0);
  cancelDeadline.setTime(cancelDeadline.getTime() - 24 * 60 * 60 * 1000);
  const pastCancelDeadline = new Date() > cancelDeadline;

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
        {/* Class Info */}
        <div className="cb-class-info">
          <h2>{formatSaturdayDate(session.date)}</h2>
          <p>{session.time} - {session.endTime} &bull; {availableSlots} slot{availableSlots !== 1 ? 's' : ''} available</p>
        </div>

        {/* Deadline Notice */}
        {pastBookDeadline && !myCurrentSlot && (
          <div className="cb-deadline-notice">
            Booking deadline has passed for this week
          </div>
        )}

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
                      {!myCurrentSlot && !pastBookDeadline && (
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
          <p><strong>Book by Wednesday</strong> &bull; <strong>Cancel 24hrs before</strong> &bull; <strong>3 no-shows = 1 month ban</strong></p>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
