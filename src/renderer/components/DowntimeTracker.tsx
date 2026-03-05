import { useState, useEffect } from 'react';
import { API_BASE } from '../services/config';
import './DowntimeTracker.css';

const DOWNTIME_REASONS = [
  'No fruit',
  'Waiting for film',
  'Work order change over',
  'Quality issues',
  'Breaks',
  'Equipment issues',
  'Staffing shortages'
];

const LINE_NAMES: Record<number, string> = {
  1: 'Giro Line 1',
  2: 'Giro Line 2',
  3: 'Giro Line 3',
  4: 'Giro Line 4',
  5: 'Hand Pack',
  6: 'Regrade'
};

interface Downtime {
  id: number;
  line: number;
  reason: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  notes?: string;
}

export default function DowntimeTracker() {
  const [showModal, setShowModal] = useState(false);
  const [activeDowntimes, setActiveDowntimes] = useState<Downtime[]>([]);
  const [line, setLine] = useState(1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchActiveDowntimes();
    const interval = setInterval(fetchActiveDowntimes, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchActiveDowntimes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/downtime`);
      if (response.ok) {
        const data = await response.json();
        // Filter for active downtimes (no end time)
        const active = data.filter((d: Downtime) => !d.endTime);
        setActiveDowntimes(active);
      }
    } catch (error) {
      console.error('Failed to fetch downtimes:', error);
    }
  };

  const startDowntime = async () => {
    if (!reason) {
      alert('Please select a reason');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/production/downtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line,
          reason,
          notes
        })
      });

      if (response.ok) {
        setShowModal(false);
        setReason('');
        setNotes('');
        fetchActiveDowntimes();
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to start downtime' }));
        alert(error.error || 'Failed to start downtime');
      }
    } catch (error) {
      console.error('Failed to start downtime:', error);
      alert('Failed to start downtime');
    }
  };

  const endDowntime = async (id: number) => {
    try {
      console.log('Ending downtime:', id);
      const response = await fetch(`${API_BASE}/api/production/downtime/${id}/end`, {
        method: 'PUT'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Downtime ended successfully:', result);
        fetchActiveDowntimes();
      } else {
        const error = await response.json().catch(() => ({ error: 'Failed to end downtime' }));
        console.error('Failed to end downtime:', error);
        alert(error.error || 'Failed to end downtime');
      }
    } catch (error) {
      console.error('Failed to end downtime:', error);
      alert('Failed to end downtime');
    }
  };

  const getElapsedTime = (startTime: string) => {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const minutes = Math.floor((now - start) / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="downtime-tracker">
      <button className="btn-downtime" onClick={() => setShowModal(true)}>
        ⏱️ Log Downtime
      </button>

      {activeDowntimes.length > 0 && (
        <div className="active-downtimes">
          <h3>Active Downtime</h3>
          {activeDowntimes.map(dt => (
            <div key={dt.id} className="downtime-card">
              <div className="downtime-info">
                <strong>{LINE_NAMES[dt.line]}</strong>
                <span className="downtime-reason">{dt.reason}</span>
                <span className="downtime-duration">{getElapsedTime(dt.startTime)}</span>
              </div>
              <button className="btn-end-downtime" onClick={() => endDowntime(dt.id)}>
                ✓ End
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content downtime-modal" onClick={e => e.stopPropagation()}>
            <h2>Log Downtime</h2>
            
            <div className="form-group">
              <label>Line</label>
              <select value={line} onChange={e => setLine(parseInt(e.target.value))}>
                {Object.entries(LINE_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Reason *</label>
              <select value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">Select reason...</option>
                {DOWNTIME_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Additional details..."
              />
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={startDowntime}>Start Downtime</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
