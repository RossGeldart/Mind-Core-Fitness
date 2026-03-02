import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import './AdminClientPBs.css';

const EXERCISES = [
  { key: 'chestPress',    name: 'Chest Press',     unit: 'weight' },
  { key: 'shoulderPress', name: 'Shoulder Press',   unit: 'weight' },
  { key: 'seatedRow',     name: 'Seated Row',       unit: 'weight' },
  { key: 'latPulldown',   name: 'Lat Pulldown',     unit: 'weight' },
  { key: 'squat',         name: 'Squat',            unit: 'weight' },
  { key: 'deadlift',      name: 'Deadlift',         unit: 'weight' },
  { key: 'plank',         name: 'Plank',            unit: 'time'   },
];

const BODY_METRICS = [
  { key: 'weight',     name: 'Weight',      suffix: 'kg' },
  { key: 'chest',      name: 'Chest',       suffix: 'cm' },
  { key: 'waist',      name: 'Waist',       suffix: 'cm' },
  { key: 'hips',       name: 'Hips',        suffix: 'cm' },
  { key: 'leftArm',    name: 'Left Arm',    suffix: 'cm' },
  { key: 'rightArm',   name: 'Right Arm',   suffix: 'cm' },
  { key: 'leftThigh',  name: 'Left Thigh',  suffix: 'cm' },
  { key: 'rightThigh', name: 'Right Thigh', suffix: 'cm' },
];

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  return new Date(parseInt(year), parseInt(month) - 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatBenchmark(ex, bench) {
  if (!bench) return null;
  if (ex.unit === 'time') {
    const s = bench.time || 0;
    if (!s) return null;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${s}s`;
  }
  if (!bench.weight) return null;
  return bench.reps ? `${bench.weight}kg × ${bench.reps}` : `${bench.weight}kg`;
}

function formatMetric(metric, value) {
  if (value == null || value === '') return null;
  return `${value}${metric.suffix}`;
}

// Month-over-month volume change for a given exercise
function calcChange(ex, current, previous) {
  if (!previous) return null;
  let curr, prev;
  if (ex.unit === 'time') {
    curr = current?.time || 0;
    prev = previous?.time || 0;
  } else {
    curr = (current?.weight || 0) * (current?.reps || 0);
    prev = (previous?.weight || 0) * (previous?.reps || 0);
  }
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

function calcMetricChange(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export default function AdminClientPBs() {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Fetch all block clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'clients'), orderBy('name', 'asc'))
        );
        const blockClients = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.status !== 'archived' && (!c.clientType || c.clientType === 'block'));
        setClients(blockClients);
      } catch (err) {
        console.error('Error fetching clients:', err);
      }
      setLoadingClients(false);
    };
    fetchClients();
  }, []);

  // Fetch PB records when selected client changes
  useEffect(() => {
    if (!selectedClientId) { setRecords([]); return; }
    const fetchRecords = async () => {
      setLoadingRecords(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'personalBests'), where('clientId', '==', selectedClientId))
        );
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => b.month.localeCompare(a.month)); // newest first
        setRecords(data);
      } catch (err) {
        console.error('Error fetching PB records:', err);
      }
      setLoadingRecords(false);
    };
    fetchRecords();
  }, [selectedClientId]);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  if (loadingClients) {
    return <div className="apb-loading">Loading clients…</div>;
  }

  if (clients.length === 0) {
    return (
      <div className="apb-empty-state">
        <p>No block clients found</p>
        <span>Block client PB history will appear here once clients have been added</span>
      </div>
    );
  }

  return (
    <div className="apb-container">
      {/* Client picker */}
      <div className="apb-picker">
        <p className="apb-picker-label">Client</p>
        <div className="apb-chips">
          {clients.map(c => (
            <button
              key={c.id}
              className={`apb-chip ${selectedClientId === c.id ? 'active' : ''}`}
              onClick={() => setSelectedClientId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      {!selectedClient ? (
        <div className="apb-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          <p>Select a client to view their PB history</p>
        </div>
      ) : loadingRecords ? (
        <div className="apb-loading">Loading records…</div>
      ) : records.length === 0 ? (
        <div className="apb-empty-state">
          <p>No records yet for {selectedClient.name}</p>
          <span>Records will appear here once the client logs their benchmarks</span>
        </div>
      ) : (
        <div className="apb-history">
          <p className="apb-history-meta">{records.length} month{records.length !== 1 ? 's' : ''} of data</p>
          {records.map((record, idx) => {
            const prevRecord = records[idx + 1]; // older record (array is newest-first)

            // Which exercises have data this month
            const filledExercises = EXERCISES.filter(ex => {
              const b = record.benchmarks?.[ex.key];
              return ex.unit === 'time' ? (b?.time) : (b?.weight);
            });

            // Which metrics have data this month
            const filledMetrics = BODY_METRICS.filter(m => {
              const v = record.bodyMetrics?.[m.key];
              return v != null && v !== '';
            });

            return (
              <div key={record.id} className="apb-month-card">
                <div className="apb-month-header">
                  <span className="apb-month-label">{formatMonthLabel(record.month)}</span>
                  <span className="apb-month-counts">
                    {filledExercises.length > 0 && `${filledExercises.length} exercise${filledExercises.length !== 1 ? 's' : ''}`}
                    {filledExercises.length > 0 && filledMetrics.length > 0 && ' · '}
                    {filledMetrics.length > 0 && `${filledMetrics.length} metric${filledMetrics.length !== 1 ? 's' : ''}`}
                    {filledExercises.length === 0 && filledMetrics.length === 0 && 'No data'}
                  </span>
                </div>

                {filledExercises.length > 0 && (
                  <div className="apb-section">
                    <div className="apb-section-label">Strength</div>
                    <div className="apb-rows">
                      {filledExercises.map(ex => {
                        const bench = record.benchmarks?.[ex.key];
                        const prevBench = prevRecord?.benchmarks?.[ex.key];
                        const val = formatBenchmark(ex, bench);
                        const change = calcChange(ex, bench, prevBench);
                        return (
                          <div key={ex.key} className="apb-row">
                            <span className="apb-row-name">{ex.name}</span>
                            <div className="apb-row-right">
                              <span className="apb-row-val">{val}</span>
                              {change !== null && (
                                <span className={`apb-row-change ${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`}>
                                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filledMetrics.length > 0 && (
                  <div className="apb-section">
                    <div className="apb-section-label">Body Metrics</div>
                    <div className="apb-rows">
                      {filledMetrics.map(m => {
                        const val = record.bodyMetrics?.[m.key];
                        const prevVal = prevRecord?.bodyMetrics?.[m.key];
                        const formatted = formatMetric(m, val);
                        const change = calcMetricChange(val, prevVal);
                        return (
                          <div key={m.key} className="apb-row">
                            <span className="apb-row-name">{m.name}</span>
                            <div className="apb-row-right">
                              <span className="apb-row-val">{formatted}</span>
                              {change !== null && (
                                <span className={`apb-row-change ${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`}>
                                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filledExercises.length === 0 && filledMetrics.length === 0 && (
                  <p className="apb-no-data">No data entered for this month</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
