import { useState, useEffect } from 'react';
import { collection, getDocs, doc, deleteDoc, updateDoc, addDoc, Timestamp, query, orderBy, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../config/firebase';
import './ClientList.css';

export default function ClientList() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [expandedClient, setExpandedClient] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Session Notes state
  const [notesModal, setNotesModal] = useState(null); // { clientId, clientName }
  const [notesForm, setNotesForm] = useState({ sessionNotes: '', whatWentWell: '', whatWentWrong: '', whatsNext: '' });
  const [clientNotes, setClientNotes] = useState([]); // notes for current modal client
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesView, setNotesView] = useState('list'); // 'list' or 'add'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [clientsSnapshot, sessionsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'clients'), orderBy('name', 'asc'))),
        getDocs(collection(db, 'sessions'))
      ]);

      const clientsData = clientsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      const sessionsData = sessionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setClients(clientsData);
      setSessions(sessionsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  // Calculate completed sessions (sessions that have passed)
  const getCompletedSessionsCount = (clientId) => {
    const now = new Date();
    // Use local date to avoid timezone issues
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    return sessions.filter(s => {
      if (s.clientId !== clientId) return false;
      if (s.date < today) return true;
      if (s.date === today && s.time < currentTime) return true;
      return false;
    }).length;
  };

  // Calculate remaining sessions for a client
  const getSessionsRemaining = (client) => {
    const completed = getCompletedSessionsCount(client.id);
    return (client.totalSessions || 0) - completed;
  };

  // Get booked sessions count (upcoming only, not completed)
  const getBookedCount = (clientId) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    return sessions.filter(s => {
      if (s.clientId !== clientId) return false;
      // Only count future sessions
      if (s.date > today) return true;
      if (s.date === today && s.time >= currentTime) return true;
      return false;
    }).length;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleDelete = async (clientId, clientName) => {
    if (window.confirm(`Are you sure you want to delete ${clientName}? This will also delete all their booked sessions.`)) {
      try {
        // First, delete all sessions for this client
        const clientSessions = sessions.filter(s => s.clientId === clientId);
        const deletePromises = clientSessions.map(session =>
          deleteDoc(doc(db, 'sessions', session.id))
        );
        await Promise.all(deletePromises);

        // Then delete the client
        await deleteDoc(doc(db, 'clients', clientId));

        // Update local state for both
        setClients(clients.filter(c => c.id !== clientId));
        setSessions(sessions.filter(s => s.clientId !== clientId));
      } catch (error) {
        console.error('Error deleting client:', error);
        alert('Failed to delete client');
      }
    }
  };

  // Helper to format date for input fields
  const formatDateForInput = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleEdit = (client) => {
    setEditingClient(client.id);
    setEditForm({
      name: client.name,
      email: client.email,
      password: '',
      clientType: client.clientType || 'block',
      weeksInBlock: client.weeksInBlock || '',
      totalSessions: client.totalSessions || '',
      sessionsRemaining: client.sessionsRemaining,
      sessionDuration: client.sessionDuration || 45,
      startDate: formatDateForInput(client.startDate),
      endDate: formatDateForInput(client.endDate),
      status: client.status,
      hasPortalAccess: !!client.uid,
      circuitAccess: !!client.circuitAccess,
      coreBuddyAccess: !!client.coreBuddyAccess,
      coreBuddyPlan: client.coreBuddyPlan || 'free',
      isJunior: !!client.isJunior
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));

    // Auto-calculate end date
    if (name === 'startDate' || name === 'weeksInBlock') {
      const startDate = name === 'startDate' ? value : editForm.startDate;
      const weeks = name === 'weeksInBlock' ? parseInt(value) : parseInt(editForm.weeksInBlock);

      if (startDate && weeks > 0) {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + (weeks * 7));
        // Use local date format
        const year = end.getFullYear();
        const month = (end.getMonth() + 1).toString().padStart(2, '0');
        const day = end.getDate().toString().padStart(2, '0');
        setEditForm(prev => ({
          ...prev,
          [name]: value,
          endDate: `${year}-${month}-${day}`
        }));
      }
    }
  };

  const handleSaveEdit = async (clientId) => {
    try {
      const client = clients.find(c => c.id === clientId);
      let newUid = client?.uid;

      // If password provided and client doesn't have portal access, create Firebase Auth account
      if (editForm.password && editForm.password.length >= 6 && !client?.uid) {
        try {
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth,
            editForm.email.trim().toLowerCase(),
            editForm.password
          );
          await signOut(secondaryAuth);
          newUid = userCredential.user.uid;
        } catch (authError) {
          console.error('Error creating auth account:', authError);
          if (authError.code === 'auth/email-already-in-use') {
            alert('This email already has a portal account. Password not changed.');
          } else if (authError.code === 'auth/weak-password') {
            alert('Password must be at least 6 characters.');
            return;
          } else {
            alert('Failed to create portal account: ' + authError.message);
            return;
          }
        }
      }

      const isBlock = editForm.clientType === 'block';

      const updateData = {
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
        clientType: editForm.clientType,
        status: editForm.status,
        coreBuddyAccess: editForm.coreBuddyAccess,
        isJunior: editForm.isJunior,
      };

      if (isBlock) {
        updateData.weeksInBlock = parseInt(editForm.weeksInBlock) || 0;
        updateData.totalSessions = parseInt(editForm.totalSessions) || 0;
        updateData.sessionDuration = parseInt(editForm.sessionDuration);
        updateData.circuitAccess = editForm.circuitAccess;
        if (editForm.startDate) updateData.startDate = Timestamp.fromDate(new Date(editForm.startDate));
        if (editForm.endDate) updateData.endDate = Timestamp.fromDate(new Date(editForm.endDate));
      } else if (editForm.clientType === 'core_buddy') {
        updateData.coreBuddyPlan = editForm.coreBuddyPlan || 'free';
        updateData.coreBuddyAccess = true;
      } else {
        // Switching to circuit — ensure circuit fields exist
        const client = clients.find(c => c.id === clientId);
        if (client?.circuitStrikes === undefined) updateData.circuitStrikes = 0;
        if (client?.circuitBanUntil === undefined) updateData.circuitBanUntil = null;
      }

      // Add UID if we created a new account
      if (newUid && !client?.uid) {
        updateData.uid = newUid;
      }

      await updateDoc(doc(db, 'clients', clientId), updateData);

      setClients(clients.map(c =>
        c.id === clientId
          ? {
              ...c,
              ...editForm,
              uid: newUid || c.uid,
              weeksInBlock: parseInt(editForm.weeksInBlock),
              totalSessions: parseInt(editForm.totalSessions),
              sessionDuration: parseInt(editForm.sessionDuration),
              startDate: Timestamp.fromDate(new Date(editForm.startDate)),
              endDate: Timestamp.fromDate(new Date(editForm.endDate))
            }
          : c
      ));
      setEditingClient(null);

      if (newUid && !client?.uid) {
        alert('Portal access created! Client can now log in.');
      }
    } catch (error) {
      console.error('Error updating client:', error);
      alert('Failed to update client');
    }
  };

  const handleArchive = async (clientId) => {
    try {
      const newStatus = clients.find(c => c.id === clientId)?.status === 'archived'
        ? 'active'
        : 'archived';

      await updateDoc(doc(db, 'clients', clientId), { status: newStatus });
      setClients(clients.map(c =>
        c.id === clientId ? { ...c, status: newStatus } : c
      ));
    } catch (error) {
      console.error('Error archiving client:', error);
      alert('Failed to update client status');
    }
  };

  // Session Notes functions
  const openNotesModal = async (client) => {
    setNotesModal({ clientId: client.id, clientName: client.name });
    setNotesView('list');
    setNotesForm({ sessionNotes: '', whatWentWell: '', whatWentWrong: '', whatsNext: '' });
    setNotesLoading(true);
    try {
      const q = query(
        collection(db, 'sessionNotes'),
        where('clientId', '==', client.id)
      );
      const snapshot = await getDocs(q);
      const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      notes.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setClientNotes(notes);
    } catch (error) {
      console.error('Error fetching notes:', error);
      setClientNotes([]);
    }
    setNotesLoading(false);
  };

  const closeNotesModal = () => {
    setNotesModal(null);
    setClientNotes([]);
    setNotesView('list');
  };

  const handleSaveNote = async () => {
    if (!notesModal) return;
    const { sessionNotes, whatWentWell, whatWentWrong, whatsNext } = notesForm;
    if (!sessionNotes.trim() && !whatWentWell.trim() && !whatWentWrong.trim() && !whatsNext.trim()) return;

    setNotesSaving(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      await addDoc(collection(db, 'sessionNotes'), {
        clientId: notesModal.clientId,
        date: dateStr,
        sessionNotes: sessionNotes.trim(),
        whatWentWell: whatWentWell.trim(),
        whatWentWrong: whatWentWrong.trim(),
        whatsNext: whatsNext.trim(),
        createdAt: Timestamp.now()
      });
      setNotesForm({ sessionNotes: '', whatWentWell: '', whatWentWrong: '', whatsNext: '' });
      // Refresh notes list
      const q = query(
        collection(db, 'sessionNotes'),
        where('clientId', '==', notesModal.clientId)
      );
      const snapshot = await getDocs(q);
      const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      notes.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setClientNotes(notes);
      setNotesView('list');
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note. Check Firestore rules for sessionNotes collection.');
    }
    setNotesSaving(false);
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this session note?')) return;
    try {
      await deleteDoc(doc(db, 'sessionNotes', noteId));
      setClientNotes(clientNotes.filter(n => n.id !== noteId));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  if (loading) {
    return <div className="client-list-loading">Loading clients...</div>;
  }

  if (clients.length === 0) {
    return (
      <div className="client-list-empty">
        <p>No clients yet</p>
        <span>Add your first client to get started</span>
      </div>
    );
  }

  const getTypeLabel = (client) => {
    if (client.clientType === 'circuit_vip') return 'VIP';
    if (client.clientType === 'circuit_dropin') return 'Drop-in';
    if (client.clientType === 'core_buddy') return 'Core Buddy';
    return 'Block';
  };

  const searched = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const isCircuit = (c) => c.clientType === 'circuit_vip' || c.clientType === 'circuit_dropin';
  const isCoreBuddy = (c) => c.clientType === 'core_buddy';
  const isArchived = (c) => c.status === 'archived';

  // For non-archived filters, exclude archived clients
  const activeSearched = searched.filter(c => !isArchived(c));
  const blockClients = activeSearched.filter(c => !isCircuit(c) && !isCoreBuddy(c));
  const circuitClients = activeSearched.filter(c => isCircuit(c));
  const coreBuddyClients = activeSearched.filter(c => isCoreBuddy(c));
  const archivedClients = searched.filter(c => isArchived(c));

  const filtered = typeFilter === 'block' ? blockClients
    : typeFilter === 'circuit' ? circuitClients
    : typeFilter === 'core_buddy' ? coreBuddyClients
    : typeFilter === 'archived' ? archivedClients
    : activeSearched;

  const toggleExpand = (clientId) => {
    if (editingClient) return;
    setExpandedClient(prev => prev === clientId ? null : clientId);
  };

  const renderClientRow = (client) => {
        const isExpanded = expandedClient === client.id;
        const isEditing = editingClient === client.id;
        const isBlock = !client.clientType || client.clientType === 'block';

        // Warning badges for block clients (not archived)
        let sessionBadge = null;
        let expiryBadge = null;
        if (isBlock && client.status !== 'archived') {
          const remaining = getSessionsRemaining(client);
          if (remaining <= 2) {
            sessionBadge = { text: remaining <= 0 ? 'No sessions' : `${remaining} left`, urgent: remaining <= 0 };
          }
          if (client.endDate) {
            const end = client.endDate.toDate ? client.endDate.toDate() : new Date(client.endDate);
            const daysLeft = Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 7) {
              expiryBadge = {
                text: daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? 'Ends today' : `${daysLeft}d left`,
                urgent: daysLeft <= 1
              };
            }
          }
        }

        return (
          <div key={client.id} className={`client-card ${client.status === 'archived' ? 'archived' : ''} ${isExpanded || isEditing ? 'expanded' : 'collapsed'}`}>
            {/* Compact Name Row — always visible */}
            <div className="client-name-row" onClick={() => toggleExpand(client.id)}>
              <div className="client-name-row-left">
                <span className="client-name-initial">{client.name?.charAt(0)?.toUpperCase()}</span>
                <div className="client-name-text">
                  <h3>{client.name}</h3>
                  <span className="client-name-sub">
                    {isBlock ? `${getSessionsRemaining(client)}/${client.totalSessions || 0} sessions` : getTypeLabel(client)}
                  </span>
                </div>
              </div>
              <div className="client-name-row-right">
                {sessionBadge && (
                  <span className={`client-warn-badge ${sessionBadge.urgent ? 'urgent' : 'warning'}`}>
                    {sessionBadge.text}
                  </span>
                )}
                {expiryBadge && (
                  <span className={`client-warn-badge ${expiryBadge.urgent ? 'urgent' : 'expiry'}`}>
                    {expiryBadge.text}
                  </span>
                )}
                {(client.clientType === 'circuit_vip' || client.clientType === 'circuit_dropin' || client.clientType === 'core_buddy') && (
                  <span className={`client-type-badge ${client.clientType === 'circuit_vip' ? 'vip' : client.clientType === 'core_buddy' ? 'core-buddy' : 'dropin'}`}>
                    {getTypeLabel(client)}
                  </span>
                )}
                <span className={`status-dot ${client.status}`} />
                <svg className={`client-chevron ${isExpanded || isEditing ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>

            {/* Expanded Detail Panel */}
            {(isExpanded || isEditing) && (
              <div className="client-expand-panel">
                {isEditing ? (
                  <div className="edit-form">
                    {/* Client Type Toggle */}
                    <div className="edit-type-toggle">
                      {[
                        { value: 'block', label: 'Block' },
                        { value: 'circuit_vip', label: 'VIP' },
                        { value: 'circuit_dropin', label: 'Drop-in' },
                        { value: 'core_buddy', label: 'Core Buddy' },
                      ].map(t => (
                        <button
                          key={t.value}
                          type="button"
                          className={`edit-type-btn ${editForm.clientType === t.value ? 'active' : ''}`}
                          onClick={() => setEditForm(prev => ({ ...prev, clientType: t.value }))}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="edit-row">
                      <input type="text" name="name" value={editForm.name} onChange={handleEditChange} placeholder="Name" />
                      <input type="email" name="email" value={editForm.email} onChange={handleEditChange} placeholder="Email" />
                    </div>

                    {editForm.clientType === 'block' && (
                      <>
                        <div className="edit-row">
                          <input type="number" name="weeksInBlock" value={editForm.weeksInBlock} onChange={handleEditChange} placeholder="Weeks" min="1" />
                          <input type="number" name="totalSessions" value={editForm.totalSessions} onChange={handleEditChange} placeholder="Total Sessions" min="1" />
                          <select name="sessionDuration" value={editForm.sessionDuration} onChange={handleEditChange}>
                            <option value="30">30 min</option>
                            <option value="45">45 min</option>
                          </select>
                        </div>
                        <div className="edit-row">
                          <input type="date" name="startDate" value={editForm.startDate} onChange={handleEditChange} />
                          <input type="date" name="endDate" value={editForm.endDate} onChange={handleEditChange} />
                        </div>
                      </>
                    )}

                    {editForm.clientType === 'core_buddy' && (
                      <div className="edit-row">
                        <select name="coreBuddyPlan" value={editForm.coreBuddyPlan} onChange={handleEditChange}>
                          <option value="free">Free</option>
                          <option value="premium">Premium</option>
                        </select>
                      </div>
                    )}

                    <div className="edit-row password-row">
                      {editForm.hasPortalAccess ? (
                        <div className="portal-status has-access">Has portal access</div>
                      ) : (
                        <>
                          <input type="text" name="password" value={editForm.password} onChange={handleEditChange} placeholder="Set portal password (min 6 chars)" />
                          <span className="password-hint">Set password to enable client portal</span>
                        </>
                      )}
                    </div>

                    {editForm.clientType === 'block' && (
                      <div className="edit-row circuit-row">
                        <label className="circuit-access-toggle">
                          <input type="checkbox" checked={editForm.circuitAccess} onChange={(e) => setEditForm(prev => ({ ...prev, circuitAccess: e.target.checked }))} />
                          <span>Circuit Class Access</span>
                        </label>
                      </div>
                    )}

                    {editForm.clientType !== 'core_buddy' && (
                      <div className="edit-row circuit-row">
                        <label className="circuit-access-toggle">
                          <input type="checkbox" checked={editForm.coreBuddyAccess} onChange={(e) => setEditForm(prev => ({ ...prev, coreBuddyAccess: e.target.checked }))} />
                          <span>Core Buddy Access</span>
                        </label>
                      </div>
                    )}

                    {editForm.clientType === 'block' && (
                      <div className="edit-row circuit-row">
                        <label className="circuit-access-toggle">
                          <input type="checkbox" checked={editForm.isJunior} onChange={(e) => setEditForm(prev => ({ ...prev, isJunior: e.target.checked }))} />
                          <span>Junior Client (Kids)</span>
                        </label>
                      </div>
                    )}

                    <div className="edit-actions">
                      <button className="save-edit-btn" onClick={() => handleSaveEdit(client.id)}>Save</button>
                      <button className="cancel-edit-btn" onClick={() => { setEditingClient(null); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="client-expand-info">
                      <span className="client-email">{client.email}</span>
                      <span className={`status-badge ${client.status}`}>{client.status}</span>
                    </div>

                    {isBlock ? (
                      <div className="client-details">
                        <div className="detail-item">
                          <span className="detail-label">Block</span>
                          <span className="detail-value">{client.weeksInBlock} weeks</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Sessions</span>
                          <span className="detail-value">{getSessionsRemaining(client)} / {client.totalSessions} remaining</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Booked</span>
                          <span className="detail-value">{getBookedCount(client.id)} sessions</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Duration</span>
                          <span className="detail-value">{client.sessionDuration || 45} min</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Start</span>
                          <span className="detail-value">{formatDate(client.startDate)}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">End</span>
                          <span className="detail-value">{formatDate(client.endDate)}</span>
                        </div>
                      </div>
                    ) : client.clientType === 'core_buddy' ? (
                      <div className="client-details circuit-details">
                        <div className="detail-item">
                          <span className="detail-label">Plan</span>
                          <span className="detail-value">{client.coreBuddyPlan === 'premium' ? 'Premium' : 'Free'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Joined</span>
                          <span className="detail-value">{formatDate(client.createdAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="client-details circuit-details">
                        <div className="detail-item">
                          <span className="detail-label">Type</span>
                          <span className="detail-value">{client.clientType === 'circuit_vip' ? 'Monthly VIP' : 'Drop-in'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Strikes</span>
                          <span className="detail-value">{client.circuitStrikes || 0}/3</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Joined</span>
                          <span className="detail-value">{formatDate(client.createdAt)}</span>
                        </div>
                      </div>
                    )}

                    <div className="client-actions">
                      {isBlock && (
                        <button className="action-btn notes" onClick={(e) => { e.stopPropagation(); openNotesModal(client); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                          Notes
                        </button>
                      )}
                      <button className="action-btn edit" onClick={(e) => { e.stopPropagation(); handleEdit(client); }}>Edit</button>
                      <button className="action-btn archive" onClick={(e) => { e.stopPropagation(); handleArchive(client.id); }}>
                        {client.status === 'archived' ? 'Reactivate' : 'Archive'}
                      </button>
                      <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(client.id, client.name); }}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
  };

  return (
    <div className="client-list">
      {/* Search Bar */}
      <div className="client-search">
        <svg className="client-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="client-search-input"
        />
        {search && (
          <button className="client-search-clear" onClick={() => setSearch('')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Type Filter Dropdown */}
      <select
        className="client-type-select"
        value={typeFilter}
        onChange={e => setTypeFilter(e.target.value)}
      >
        <option value="all">All Clients ({activeSearched.length})</option>
        <option value="block">Block Members ({blockClients.length})</option>
        <option value="circuit">Circuit Members ({circuitClients.length})</option>
        <option value="core_buddy">Core Buddy ({coreBuddyClients.length})</option>
        <option value="archived">Archived ({archivedClients.length})</option>
      </select>

      {/* Grouped or flat list */}
      {typeFilter === 'all' ? (
        <>
          {blockClients.length > 0 && (
            <>
              <div className="client-section-header">Block Members <span>{blockClients.length}</span></div>
              {blockClients.map(renderClientRow)}
            </>
          )}
          {circuitClients.length > 0 && (
            <>
              <div className="client-section-header">Circuit Members <span>{circuitClients.length}</span></div>
              {circuitClients.map(renderClientRow)}
            </>
          )}
          {coreBuddyClients.length > 0 && (
            <>
              <div className="client-section-header">Core Buddy Members <span>{coreBuddyClients.length}</span></div>
              {coreBuddyClients.map(renderClientRow)}
            </>
          )}
        </>
      ) : typeFilter === 'archived' ? (
        <>
          {archivedClients.length === 0 ? (
            <div className="client-section-empty">No archived clients</div>
          ) : (
            <>
              <div className="client-section-header">Archived Clients <span>{archivedClients.length}</span></div>
              {archivedClients.map(renderClientRow)}
            </>
          )}
        </>
      ) : (
        <>
          {filtered.length === 0 && (
            <div className="client-section-empty">No {typeFilter} clients found</div>
          )}
          {filtered.map(renderClientRow)}
        </>
      )}

      {/* Session Notes Modal */}
      {notesModal && (
        <div className="notes-modal-overlay" onClick={closeNotesModal}>
          <div className="notes-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                {notesModal.clientName}
              </h3>
              <button className="notes-modal-close" onClick={closeNotesModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {notesView === 'list' ? (
              <>
                <div className="notes-modal-body">
                  {notesLoading ? (
                    <div className="notes-loading">Loading notes...</div>
                  ) : clientNotes.length === 0 ? (
                    <div className="notes-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <p>No session notes yet</p>
                      <span>Add notes after each session</span>
                    </div>
                  ) : (
                    <div className="notes-list">
                      {clientNotes.map(note => (
                        <div key={note.id} className="note-card">
                          <div className="note-card-header">
                            <span className="note-date">{note.date}</span>
                            <button className="note-delete-btn" onClick={() => handleDeleteNote(note.id)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                              </svg>
                            </button>
                          </div>
                          {note.sessionNotes && (
                            <div className="note-section">
                              <span className="note-section-label">Session Notes</span>
                              <p>{note.sessionNotes}</p>
                            </div>
                          )}
                          {note.whatWentWell && (
                            <div className="note-section went-well">
                              <span className="note-section-label">What Went Well</span>
                              <p>{note.whatWentWell}</p>
                            </div>
                          )}
                          {note.whatWentWrong && (
                            <div className="note-section went-wrong">
                              <span className="note-section-label">What Went Wrong</span>
                              <p>{note.whatWentWrong}</p>
                            </div>
                          )}
                          {note.whatsNext && (
                            <div className="note-section whats-next">
                              <span className="note-section-label">What's Next</span>
                              <p>{note.whatsNext}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="notes-modal-footer">
                  <button className="notes-add-btn" onClick={() => setNotesView('add')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Session Notes
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="notes-modal-body">
                  <div className="notes-form">
                    <div className="notes-form-group">
                      <label>Session Notes</label>
                      <textarea
                        value={notesForm.sessionNotes}
                        onChange={(e) => setNotesForm(p => ({ ...p, sessionNotes: e.target.value }))}
                        placeholder="Overview of the session..."
                        rows="3"
                      />
                    </div>
                    <div className="notes-form-group went-well">
                      <label>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        What Went Well
                      </label>
                      <textarea
                        value={notesForm.whatWentWell}
                        onChange={(e) => setNotesForm(p => ({ ...p, whatWentWell: e.target.value }))}
                        placeholder="Positives from the session..."
                        rows="2"
                      />
                    </div>
                    <div className="notes-form-group went-wrong">
                      <label>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        What Went Wrong
                      </label>
                      <textarea
                        value={notesForm.whatWentWrong}
                        onChange={(e) => setNotesForm(p => ({ ...p, whatWentWrong: e.target.value }))}
                        placeholder="Areas to improve..."
                        rows="2"
                      />
                    </div>
                    <div className="notes-form-group whats-next">
                      <label>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
                        What's Next
                      </label>
                      <textarea
                        value={notesForm.whatsNext}
                        onChange={(e) => setNotesForm(p => ({ ...p, whatsNext: e.target.value }))}
                        placeholder="Goals for next session..."
                        rows="2"
                      />
                    </div>
                  </div>
                </div>
                <div className="notes-modal-footer">
                  <button className="notes-cancel-btn" onClick={() => setNotesView('list')}>Back</button>
                  <button className="notes-save-btn" onClick={handleSaveNote} disabled={notesSaving}>
                    {notesSaving ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
