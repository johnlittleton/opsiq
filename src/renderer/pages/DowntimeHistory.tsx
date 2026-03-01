import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './DowntimeHistory.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

export default function DowntimeHistory() {
  const navigate = useNavigate();
  const [downtimes, setDowntimes] = useState<Downtime[]>([]);
  const [filteredDowntimes, setFilteredDowntimes] = useState<Downtime[]>([]);
  const [selectedLine, setSelectedLine] = useState<number | 'all'>('all');
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [startDate, setStartDate] = useState(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()));

  useEffect(() => {
    fetchDowntimes();
    // Auto-refresh every 5 seconds to catch ended downtimes
    const interval = setInterval(fetchDowntimes, 5000);
    return () => clearInterval(interval);
  }, [startDate, endDate]);

  useEffect(() => {
    filterDowntimes();
  }, [downtimes, selectedLine]);

  const fetchDowntimes = async () => {
    try {
      const startDateTime = `${startDate}T00:00:00`;
      const endDateTime = `${endDate}T23:59:59`;
      console.log('🔍 Loading downtimes with date range:', startDateTime, 'to', endDateTime);
      const response = await fetch(
        `${API_BASE}/api/production/downtime?startDate=${startDateTime}&endDate=${endDateTime}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Fetched downtimes:', data.length, 'records');
        console.log('Sample downtime:', data[0]);
        setDowntimes(data);
      }
    } catch (error) {
      console.error('Failed to fetch downtimes:', error);
    }
  };

  const filterDowntimes = () => {
    if (selectedLine === 'all') {
      setFilteredDowntimes(downtimes);
    } else {
      setFilteredDowntimes(downtimes.filter(d => d.line === selectedLine));
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return 'Active';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getTotalDowntime = () => {
    return filteredDowntimes.reduce((sum, d) => sum + (d.durationMinutes || 0), 0);
  };

  const getDowntimeByReason = () => {
    const reasonMap: Record<string, number> = {};
    filteredDowntimes.forEach(d => {
      if (d.durationMinutes) {
        reasonMap[d.reason] = (reasonMap[d.reason] || 0) + d.durationMinutes;
      }
    });
    return Object.entries(reasonMap).sort((a, b) => b[1] - a[1]);
  };

  const totalMinutes = getTotalDowntime();
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;
  const reasonBreakdown = getDowntimeByReason();

  return (
    <div className="downtime-history">
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/production-scheduler')}>
          ← Back
        </button>
        <h1>Downtime History</h1>
        <button onClick={fetchDowntimes}>🔄 Refresh</button>
      </div>

      <div className="filters-section">
        <div className="filter-group">
          <label>Line</label>
          <select value={selectedLine} onChange={e => setSelectedLine(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
            <option value="all">All Lines</option>
            {Object.entries(LINE_NAMES).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>

        <div className="filter-group">
          <label>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="stats-section">
        <div className="stat-card">
          <div className="stat-label">Total Downtime</div>
          <div className="stat-value">{totalHours}h {totalMins}m</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{filteredDowntimes.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Duration</div>
          <div className="stat-value">
            {filteredDowntimes.length > 0 
              ? formatDuration(Math.round(totalMinutes / filteredDowntimes.length))
              : '0m'}
          </div>
        </div>
      </div>

      {reasonBreakdown.length > 0 && (
        <div className="reason-breakdown">
          <h3>Downtime by Reason</h3>
          <div className="reason-bars">
            {reasonBreakdown.map(([reason, minutes]) => (
              <div key={reason} className="reason-bar-item">
                <div className="reason-info">
                  <span className="reason-name">{reason}</span>
                  <span className="reason-time">{formatDuration(minutes)}</span>
                </div>
                <div className="reason-bar-track">
                  <div 
                    className="reason-bar-fill" 
                    style={{ width: `${(minutes / totalMinutes) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="downtime-table-container">
        <table className="downtime-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Reason</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Duration</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredDowntimes.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data">No downtime records found</td>
              </tr>
            ) : (
              filteredDowntimes.map(dt => (
                <tr key={dt.id} className={dt.endTime ? '' : 'active-row'}>
                  <td><strong>{LINE_NAMES[dt.line]}</strong></td>
                  <td>
                    <span className="reason-badge">{dt.reason}</span>
                  </td>
                  <td>{formatDateTime(dt.startTime)}</td>
                  <td>{dt.endTime ? formatDateTime(dt.endTime) : <span className="active-badge">Active</span>}</td>
                  <td><strong>{formatDuration(dt.durationMinutes)}</strong></td>
                  <td className="notes-cell">{dt.notes || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
