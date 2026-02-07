import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import './CircuitManagement.css';

const getDateString = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (dateStr) => {
  const date = new Date(dateStr + 'T09:00:00');
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

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

export default function CircuitManagement() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [memberView, setMemberView] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState(false);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Fetch all circuit sessions
      const sessionsSnap = await getDocs(collection(db, 'circuitSessions'));
      const sessionsData = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      sessionsData.sort((a, b) => b.date.localeCompare(a.date));
      setSessions(sessionsData);

      // Fetch circuit members
      const allClientsSnap = await getDocs(collection(db, 'clients'));
      const circuitMembers = allClientsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c =>
          c.clientType === 'circuit_vip' ||
          c.clientType === 'circuit_dropin' ||
          c.circuitAccess === true
        );
      setMembers(circuitMembers);

      // Auto-select the upcoming session
      const nextSatStr = getDateString(getNextSaturday());
      const upcoming = sessionsData.find(s => s.date === nextSatStr);
      if (upcoming) setSelectedSession(upcoming);
      else if (sessionsData.length > 0) setSelectedSession(sessionsData[0]);
    } catch (error) {
      console.error('Error loading circuit data:', error);
      showToast('Failed to load circuit data', 'error');
    }
    setLoading(false);
  };

  const handleRemoveFromSlot = async (slotNumber) => {
    if (!selectedSession || saving) return;
    if (!window.confirm('Remove this member from the slot?')) return;
    setSaving(true);
    try {
      const updatedSlots = [...selectedSession.slots];
      const idx = updatedSlots.findIndex(s => s.slotNumber === slotNumber);
      if (idx === -1) { setSaving(false); return; }

      let updatedWaitlist = [...(selectedSession.waitlist || [])];

      // Auto-promote from waitlist
      if (updatedWaitlist.length > 0) {
        const nextInLine = updatedWaitlist.shift();
        updatedSlots[idx] = {
          slotNumber,
          memberId: nextInLine.memberId,
          memberName: nextInLine.memberName,
          memberType: nextInLine.memberType,
          status: 'confirmed',
          bookedAt: Timestamp.now(),
        };
        showToast(`Slot given to ${nextInLine.memberName} from waitlist`, 'success');
      } else {
        updatedSlots[idx] = {
          slotNumber,
          memberId: null,
          memberName: null,
          memberType: null,
          status: 'available',
        };
        showToast('Member removed from slot', 'success');
      }

      await updateDoc(doc(db, 'circuitSessions', selectedSession.id), {
        slots: updatedSlots,
        waitlist: updatedWaitlist,
      });

      const updated = { ...selectedSession, slots: updatedSlots, waitlist: updatedWaitlist };
      setSelectedSession(updated);
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    } catch (error) {
      console.error('Error removing from slot:', error);
      showToast('Failed to remove member', 'error');
    }
    setSaving(false);
  };

  const handleAddToSlot = async (slotNumber, member) => {
    if (!selectedSession || saving) return;
    setSaving(true);
    try {
      const updatedSlots = [...selectedSession.slots];
      const idx = updatedSlots.findIndex(s => s.slotNumber === slotNumber && s.status === 'available');
      if (idx === -1) {
        showToast('Slot is not available', 'error');
        setSaving(false);
        return;
      }

      // Check if already booked
      if (updatedSlots.some(s => s.memberId === member.id)) {
        showToast(`${member.name} already has a slot`, 'error');
        setSaving(false);
        return;
      }

      updatedSlots[idx] = {
        slotNumber,
        memberId: member.id,
        memberName: member.name,
        memberType: member.clientType || 'block',
        status: 'confirmed',
        bookedAt: Timestamp.now(),
      };

      // Remove from waitlist if on it
      const updatedWaitlist = (selectedSession.waitlist || []).filter(w => w.memberId !== member.id);

      await updateDoc(doc(db, 'circuitSessions', selectedSession.id), {
        slots: updatedSlots,
        waitlist: updatedWaitlist,
      });

      const updated = { ...selectedSession, slots: updatedSlots, waitlist: updatedWaitlist };
      setSelectedSession(updated);
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
      showToast(`${member.name} added to slot ${slotNumber}`, 'success');
    } catch (error) {
      console.error('Error adding to slot:', error);
      showToast('Failed to add member', 'error');
    }
    setSaving(false);
  };

  const handleRemoveFromWaitlist = async (memberId) => {
    if (!selectedSession || saving) return;
    setSaving(true);
    try {
      const updatedWaitlist = (selectedSession.waitlist || []).filter(w => w.memberId !== memberId);
      await updateDoc(doc(db, 'circuitSessions', selectedSession.id), { waitlist: updatedWaitlist });
      const updated = { ...selectedSession, waitlist: updatedWaitlist };
      setSelectedSession(updated);
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
      showToast('Removed from waitlist', 'success');
    } catch (error) {
      console.error('Error removing from waitlist:', error);
      showToast('Failed to remove from waitlist', 'error');
    }
    setSaving(false);
  };

  const handleMarkAttendance = async (slotNumber, attended) => {
    if (!selectedSession || saving) return;
    setSaving(true);
    try {
      const updatedSlots = [...selectedSession.slots];
      const idx = updatedSlots.findIndex(s => s.slotNumber === slotNumber);
      if (idx === -1) { setSaving(false); return; }

      updatedSlots[idx] = { ...updatedSlots[idx], attended };

      await updateDoc(doc(db, 'circuitSessions', selectedSession.id), { slots: updatedSlots });

      // If marking as no-show, increment strikes on client
      if (attended === false) {
        const memberId = updatedSlots[idx].memberId;
        if (memberId) {
          const clientRef = doc(db, 'clients', memberId);
          const clientSnap = await getDoc(clientRef);
          if (clientSnap.exists()) {
            const clientData = clientSnap.data();
            const newStrikes = (clientData.circuitStrikes || 0) + 1;
            const updates = { circuitStrikes: newStrikes };
            // Auto-ban at 3 strikes
            if (newStrikes >= 3) {
              const banUntil = new Date();
              banUntil.setMonth(banUntil.getMonth() + 1);
              updates.circuitBanUntil = Timestamp.fromDate(banUntil);
              updates.circuitStrikes = 0;
              showToast(`${updatedSlots[idx].memberName} banned for 1 month (3 strikes)`, 'error');
            } else {
              showToast(`No-show recorded - ${updatedSlots[idx].memberName} (${newStrikes}/3 strikes)`, 'error');
            }
            await updateDoc(clientRef, updates);
          }
        }
      } else {
        showToast(`${updatedSlots[idx].memberName} marked as attended`, 'success');
      }

      const updated = { ...selectedSession, slots: updatedSlots };
      setSelectedSession(updated);
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    } catch (error) {
      console.error('Error marking attendance:', error);
      showToast('Failed to update attendance', 'error');
    }
    setSaving(false);
  };

  const handleResetStrikes = async (memberId, memberName) => {
    if (saving) return;
    if (!window.confirm(`Reset strikes for ${memberName}?`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clients', memberId), {
        circuitStrikes: 0,
        circuitBanUntil: null,
      });
      setMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, circuitStrikes: 0, circuitBanUntil: null } : m
      ));
      showToast(`Strikes reset for ${memberName}`, 'success');
    } catch (error) {
      console.error('Error resetting strikes:', error);
      showToast('Failed to reset strikes', 'error');
    }
    setSaving(false);
  };

  const handleLiftBan = async (memberId, memberName) => {
    if (saving) return;
    if (!window.confirm(`Lift ban for ${memberName}?`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clients', memberId), {
        circuitBanUntil: null,
        circuitStrikes: 0,
      });
      setMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, circuitBanUntil: null, circuitStrikes: 0 } : m
      ));
      showToast(`Ban lifted for ${memberName}`, 'success');
    } catch (error) {
      console.error('Error lifting ban:', error);
      showToast('Failed to lift ban', 'error');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="cm-loading">
        <div className="cm-loading-spinner" />
        <span>Loading circuit data...</span>
      </div>
    );
  }

  const today = getDateString(new Date());
  const nextSatStr = getDateString(getNextSaturday());
  const upcomingSessions = sessions.filter(s => s.date >= today);
  const pastSessions = sessions.filter(s => s.date < today);

  const displaySessions = activeTab === 'upcoming' ? upcomingSessions : pastSessions;

  // For the selected session
  const bookedCount = selectedSession ? selectedSession.slots.filter(s => s.status !== 'available').length : 0;
  const availableCount = selectedSession ? selectedSession.slots.filter(s => s.status === 'available').length : 0;
  const isUpcoming = selectedSession ? selectedSession.date >= today : false;

  // Members not in selected session (for add-to-slot picker)
  const bookedIds = selectedSession ? selectedSession.slots.filter(s => s.memberId).map(s => s.memberId) : [];
  const waitlistIds = selectedSession ? (selectedSession.waitlist || []).map(w => w.memberId) : [];
  const availableMembers = members.filter(m => !bookedIds.includes(m.id) && !waitlistIds.includes(m.id));

  // Stats
  const vipCount = members.filter(m => m.clientType === 'circuit_vip').length;
  const dropinCount = members.filter(m => m.clientType === 'circuit_dropin').length;
  const blockCount = members.filter(m => m.circuitAccess && m.clientType !== 'circuit_vip' && m.clientType !== 'circuit_dropin').length;
  const bannedMembers = members.filter(m => {
    if (!m.circuitBanUntil) return false;
    const banDate = m.circuitBanUntil.toDate ? m.circuitBanUntil.toDate() : new Date(m.circuitBanUntil);
    return banDate > new Date();
  });

  return (
    <div className="cm-container">
      {/* Stats Overview */}
      <div className="cm-stats-row">
        <div className="cm-stat-pill">
          <span className="cm-stat-num">{vipCount}</span>
          <span className="cm-stat-label">VIP</span>
        </div>
        <div className="cm-stat-pill">
          <span className="cm-stat-num">{dropinCount}</span>
          <span className="cm-stat-label">Drop-in</span>
        </div>
        <div className="cm-stat-pill">
          <span className="cm-stat-num">{blockCount}</span>
          <span className="cm-stat-label">Block</span>
        </div>
        <div className="cm-stat-pill">
          <span className="cm-stat-num">{sessions.length}</span>
          <span className="cm-stat-label">Sessions</span>
        </div>
      </div>

      {/* View Toggle */}
      <div className="cm-view-toggle">
        <button
          className={`cm-toggle-btn ${!memberView ? 'active' : ''}`}
          onClick={() => setMemberView(false)}
        >
          Sessions
        </button>
        <button
          className={`cm-toggle-btn ${memberView ? 'active' : ''}`}
          onClick={() => setMemberView(true)}
        >
          Members
        </button>
      </div>

      {/* ===== SESSIONS VIEW ===== */}
      {!memberView && (
        <>
          {/* Session Tabs */}
          <div className="cm-tabs">
            <button
              className={`cm-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              Upcoming ({upcomingSessions.length})
            </button>
            <button
              className={`cm-tab ${activeTab === 'past' ? 'active' : ''}`}
              onClick={() => setActiveTab('past')}
            >
              Past ({pastSessions.length})
            </button>
          </div>

          {/* Session List */}
          <div className="cm-sessions-list">
            {displaySessions.length === 0 ? (
              <div className="cm-empty">
                <p>No {activeTab} sessions</p>
              </div>
            ) : (
              displaySessions.map(session => {
                const filled = session.slots.filter(s => s.status !== 'available').length;
                const isSelected = selectedSession?.id === session.id;
                const isNext = session.date === nextSatStr;
                return (
                  <button
                    key={session.id}
                    className={`cm-session-btn ${isSelected ? 'selected' : ''} ${isNext ? 'next' : ''}`}
                    onClick={() => { setSelectedSession(session); setAttendanceMode(false); }}
                  >
                    <div className="cm-session-btn-left">
                      <span className="cm-session-date">{formatDateLabel(session.date)}</span>
                      {isNext && <span className="cm-next-badge">Next</span>}
                    </div>
                    <div className="cm-session-btn-right">
                      <span className="cm-session-fill">{filled}/8</span>
                      {(session.waitlist?.length || 0) > 0 && (
                        <span className="cm-waitlist-count">+{session.waitlist.length} wl</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Selected Session Detail */}
          {selectedSession && (
            <div className="cm-detail">
              <div className="cm-detail-header">
                <div>
                  <h3>{formatDateLabel(selectedSession.date)}</h3>
                  <p>{selectedSession.time} - {selectedSession.endTime} &bull; {bookedCount}/8 booked &bull; {availableCount} available</p>
                </div>
                {!isUpcoming && (
                  <button
                    className={`cm-attendance-btn ${attendanceMode ? 'active' : ''}`}
                    onClick={() => setAttendanceMode(!attendanceMode)}
                  >
                    {attendanceMode ? 'Done' : 'Attendance'}
                  </button>
                )}
              </div>

              {/* Slots */}
              <div className="cm-slots">
                {selectedSession.slots.map(slot => {
                  const isAvailable = slot.status === 'available';
                  return (
                    <div key={slot.slotNumber} className={`cm-slot ${isAvailable ? 'empty' : 'filled'} ${slot.attended === true ? 'attended' : ''} ${slot.attended === false ? 'no-show' : ''}`}>
                      <span className="cm-slot-num">{slot.slotNumber}</span>
                      {isAvailable ? (
                        <div className="cm-slot-empty">
                          <span>Available</span>
                          {isUpcoming && (
                            <AddMemberDropdown
                              members={availableMembers}
                              onSelect={(member) => handleAddToSlot(slot.slotNumber, member)}
                              disabled={saving}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="cm-slot-filled">
                          <div className="cm-slot-info">
                            <span className="cm-slot-name">{slot.memberName}</span>
                            <span className={`cm-type-badge ${getTypeBadgeClass(slot.memberType)}`}>
                              {getTypeLabel(slot.memberType)}
                            </span>
                          </div>
                          <div className="cm-slot-actions">
                            {attendanceMode && slot.attended === undefined && (
                              <>
                                <button
                                  className="cm-attend-yes"
                                  onClick={() => handleMarkAttendance(slot.slotNumber, true)}
                                  disabled={saving}
                                  title="Attended"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                                </button>
                                <button
                                  className="cm-attend-no"
                                  onClick={() => handleMarkAttendance(slot.slotNumber, false)}
                                  disabled={saving}
                                  title="No-show"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </>
                            )}
                            {slot.attended === true && (
                              <span className="cm-attended-label">Attended</span>
                            )}
                            {slot.attended === false && (
                              <span className="cm-noshow-label">No-show</span>
                            )}
                            {isUpcoming && (
                              <button
                                className="cm-remove-btn"
                                onClick={() => handleRemoveFromSlot(slot.slotNumber)}
                                disabled={saving}
                                title="Remove from slot"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Waitlist */}
              {(selectedSession.waitlist?.length || 0) > 0 && (
                <div className="cm-waitlist">
                  <h4>Waitlist ({selectedSession.waitlist.length})</h4>
                  {selectedSession.waitlist.map((w, i) => (
                    <div key={w.memberId} className="cm-waitlist-row">
                      <span className="cm-wl-pos">#{i + 1}</span>
                      <span className="cm-wl-name">{w.memberName}</span>
                      <span className={`cm-type-badge ${getTypeBadgeClass(w.memberType)}`}>
                        {getTypeLabel(w.memberType)}
                      </span>
                      {isUpcoming && (
                        <button
                          className="cm-wl-remove"
                          onClick={() => handleRemoveFromWaitlist(w.memberId)}
                          disabled={saving}
                        >
                          Remove
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

      {/* ===== MEMBERS VIEW ===== */}
      {memberView && (
        <div className="cm-members">
          {/* Banned Members Alert */}
          {bannedMembers.length > 0 && (
            <div className="cm-ban-alert">
              <h4>Currently Banned ({bannedMembers.length})</h4>
              {bannedMembers.map(m => {
                const banDate = m.circuitBanUntil?.toDate ? m.circuitBanUntil.toDate() : new Date(m.circuitBanUntil);
                return (
                  <div key={m.id} className="cm-ban-row">
                    <div className="cm-ban-info">
                      <span className="cm-ban-name">{m.name}</span>
                      <span className="cm-ban-until">Until {banDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <button className="cm-lift-ban-btn" onClick={() => handleLiftBan(m.id, m.name)} disabled={saving}>
                      Lift Ban
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* All Members */}
          <div className="cm-members-list">
            {members.length === 0 ? (
              <div className="cm-empty">
                <p>No circuit members yet</p>
                <span>Add members via the Clients page</span>
              </div>
            ) : (
              members.map(m => {
                const strikes = m.circuitStrikes || 0;
                const isBanned = bannedMembers.some(b => b.id === m.id);
                return (
                  <div key={m.id} className={`cm-member-card ${isBanned ? 'banned' : ''}`}>
                    <div className="cm-member-top">
                      <span className="cm-member-name">{m.name}</span>
                      <span className={`cm-type-badge ${getTypeBadgeClass(m.clientType)}`}>
                        {getTypeLabel(m.clientType)}
                      </span>
                    </div>
                    <div className="cm-member-bottom">
                      <div className="cm-strikes">
                        {[0, 1, 2].map(i => (
                          <span key={i} className={`cm-strike-dot ${i < strikes ? 'active' : ''}`} />
                        ))}
                        <span className="cm-strike-text">{strikes}/3 strikes</span>
                      </div>
                      <div className="cm-member-actions">
                        {isBanned && (
                          <button className="cm-small-btn ban" onClick={() => handleLiftBan(m.id, m.name)} disabled={saving}>
                            Lift Ban
                          </button>
                        )}
                        {strikes > 0 && !isBanned && (
                          <button className="cm-small-btn reset" onClick={() => handleResetStrikes(m.id, m.name)} disabled={saving}>
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`cm-toast ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

/* Small dropdown for adding a member to an available slot */
function AddMemberDropdown({ members, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  if (members.length === 0) return null;

  return (
    <div className="cm-add-dropdown">
      <button
        className="cm-add-trigger"
        onClick={() => setOpen(!open)}
        disabled={disabled}
      >
        + Add
      </button>
      {open && (
        <>
          <div className="cm-dropdown-backdrop" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="cm-dropdown-menu">
            {members.length > 4 && (
              <input
                type="text"
                className="cm-dropdown-search"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            )}
            <div className="cm-dropdown-list">
              {filtered.map(m => (
                <button
                  key={m.id}
                  className="cm-dropdown-item"
                  onClick={() => { onSelect(m); setOpen(false); setSearch(''); }}
                >
                  <span>{m.name}</span>
                  <span className={`cm-type-badge sm ${getTypeBadgeClass(m.clientType)}`}>
                    {getTypeLabel(m.clientType)}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="cm-dropdown-empty">No members found</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
