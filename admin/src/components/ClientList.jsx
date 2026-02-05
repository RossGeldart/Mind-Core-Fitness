import { useState, useEffect } from 'react';
import { collection, getDocs, doc, deleteDoc, updateDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import './ClientList.css';

export default function ClientList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
    setLoading(false);
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
    if (window.confirm(`Are you sure you want to delete ${clientName}?`)) {
      try {
        await deleteDoc(doc(db, 'clients', clientId));
        setClients(clients.filter(c => c.id !== clientId));
      } catch (error) {
        console.error('Error deleting client:', error);
        alert('Failed to delete client');
      }
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client.id);
    setEditForm({
      name: client.name,
      email: client.email,
      weeksInBlock: client.weeksInBlock,
      totalSessions: client.totalSessions,
      sessionsRemaining: client.sessionsRemaining,
      sessionDuration: client.sessionDuration || 45,
      startDate: client.startDate?.toDate?.().toISOString().split('T')[0] || '',
      endDate: client.endDate?.toDate?.().toISOString().split('T')[0] || '',
      status: client.status
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
        setEditForm(prev => ({
          ...prev,
          [name]: value,
          endDate: end.toISOString().split('T')[0]
        }));
      }
    }
  };

  const handleSaveEdit = async (clientId) => {
    try {
      await updateDoc(doc(db, 'clients', clientId), {
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
        weeksInBlock: parseInt(editForm.weeksInBlock),
        totalSessions: parseInt(editForm.totalSessions),
        sessionsRemaining: parseInt(editForm.sessionsRemaining),
        sessionDuration: parseInt(editForm.sessionDuration),
        startDate: Timestamp.fromDate(new Date(editForm.startDate)),
        endDate: Timestamp.fromDate(new Date(editForm.endDate)),
        status: editForm.status
      });

      setClients(clients.map(c =>
        c.id === clientId
          ? {
              ...c,
              ...editForm,
              weeksInBlock: parseInt(editForm.weeksInBlock),
              totalSessions: parseInt(editForm.totalSessions),
              sessionsRemaining: parseInt(editForm.sessionsRemaining),
              sessionDuration: parseInt(editForm.sessionDuration),
              startDate: Timestamp.fromDate(new Date(editForm.startDate)),
              endDate: Timestamp.fromDate(new Date(editForm.endDate))
            }
          : c
      ));
      setEditingClient(null);
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
                <input
                  type="number"
                  name="sessionsRemaining"
                  value={editForm.sessionsRemaining}
                  onChange={handleEditChange}
                  placeholder="Remaining"
                  min="0"
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
                  <h3>{client.name}</h3>
                  <span className="client-email">{client.email}</span>
                </div>
                <div className="client-status">
                  <span className={`status-badge ${client.status}`}>
                    {client.status}
                  </span>
                </div>
              </div>

              <div className="client-details">
                <div className="detail-item">
                  <span className="detail-label">Block</span>
                  <span className="detail-value">{client.weeksInBlock} weeks</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Sessions</span>
                  <span className="detail-value">
                    {client.sessionsRemaining} / {client.totalSessions} remaining
                  </span>
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
