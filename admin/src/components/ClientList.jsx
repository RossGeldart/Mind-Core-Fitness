import { useState, useEffect } from 'react';
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../config/firebase';
import './ClientList.css';

export default function ClientList() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [clientsSnapshot, sessionsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'clients'), orderBy('createdAt', 'desc'))),
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
      circuitAccess: !!client.circuitAccess
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
      };

      if (isBlock) {
        updateData.weeksInBlock = parseInt(editForm.weeksInBlock) || 0;
        updateData.totalSessions = parseInt(editForm.totalSessions) || 0;
        updateData.sessionDuration = parseInt(editForm.sessionDuration);
        updateData.circuitAccess = editForm.circuitAccess;
        if (editForm.startDate) updateData.startDate = Timestamp.fromDate(new Date(editForm.startDate));
        if (editForm.endDate) updateData.endDate = Timestamp.fromDate(new Date(editForm.endDate));
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

  return (
    <div className="client-list">
      {clients.map(client => (
        <div key={client.id} className={`client-card ${client.status === 'archived' ? 'archived' : ''}`}>
          {editingClient === client.id ? (
            <div className="edit-form">
              {/* Client Type Toggle */}
              <div className="edit-type-toggle">
                {[
                  { value: 'block', label: 'Block' },
                  { value: 'circuit_vip', label: 'VIP' },
                  { value: 'circuit_dropin', label: 'Drop-in' },
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
                <input
                  type="text"
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                  placeholder="Name"
                />
                <input
                  type="email"
                  name="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                  placeholder="Email"
                />
              </div>

              {/* Block-specific fields */}
              {editForm.clientType === 'block' && (
                <>
                  <div className="edit-row">
                    <input
                      type="number"
                      name="weeksInBlock"
                      value={editForm.weeksInBlock}
                      onChange={handleEditChange}
                      placeholder="Weeks"
                      min="1"
                    />
                    <input
                      type="number"
                      name="totalSessions"
                      value={editForm.totalSessions}
                      onChange={handleEditChange}
                      placeholder="Total Sessions"
                      min="1"
                    />
                    <select
                      name="sessionDuration"
                      value={editForm.sessionDuration}
                      onChange={handleEditChange}
                    >
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                    </select>
                  </div>
                  <div className="edit-row">
                    <input
                      type="date"
                      name="startDate"
                      value={editForm.startDate}
                      onChange={handleEditChange}
                    />
                    <input
                      type="date"
                      name="endDate"
                      value={editForm.endDate}
                      onChange={handleEditChange}
                    />
                  </div>
                </>
              )}

              <div className="edit-row password-row">
                {editForm.hasPortalAccess ? (
                  <div className="portal-status has-access">
                    ✓ Has portal access
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      name="password"
                      value={editForm.password}
                      onChange={handleEditChange}
                      placeholder="Set portal password (min 6 chars)"
                    />
                    <span className="password-hint">Set password to enable client portal</span>
                  </>
                )}
              </div>

              {/* Circuit access toggle - only for block clients */}
              {editForm.clientType === 'block' && (
                <div className="edit-row circuit-row">
                  <label className="circuit-access-toggle">
                    <input
                      type="checkbox"
                      checked={editForm.circuitAccess}
                      onChange={(e) => setEditForm(prev => ({ ...prev, circuitAccess: e.target.checked }))}
                    />
                    <span>Circuit Class Access</span>
                  </label>
                </div>
              )}
              <div className="edit-actions">
                <button className="save-edit-btn" onClick={() => handleSaveEdit(client.id)}>
                  Save
                </button>
                <button className="cancel-edit-btn" onClick={() => setEditingClient(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="client-header">
                <div className="client-info">
                  <h3>
                    {client.name}
                    {(client.clientType === 'circuit_vip' || client.clientType === 'circuit_dropin') && (
                      <span className={`client-type-badge ${client.clientType === 'circuit_vip' ? 'vip' : 'dropin'}`}>
                        {client.clientType === 'circuit_vip' ? 'VIP' : 'Drop-in'}
                      </span>
                    )}
                  </h3>
                  <span className="client-email">{client.email}</span>
                </div>
                <div className="client-status">
                  <span className={`status-badge ${client.status}`}>
                    {client.status}
                  </span>
                </div>
              </div>

              {(!client.clientType || client.clientType === 'block') ? (
                <div className="client-details">
                  <div className="detail-item">
                    <span className="detail-label">Block</span>
                    <span className="detail-value">{client.weeksInBlock} weeks</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Sessions</span>
                    <span className="detail-value">
                      {getSessionsRemaining(client)} / {client.totalSessions} remaining
                    </span>
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
                <button className="action-btn edit" onClick={() => handleEdit(client)}>
                  Edit
                </button>
                <button className="action-btn archive" onClick={() => handleArchive(client.id)}>
                  {client.status === 'archived' ? 'Reactivate' : 'Archive'}
                </button>
                <button className="action-btn delete" onClick={() => handleDelete(client.id, client.name)}>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
