import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { DockEvent, DoorStatus } from '../../shared/types';
import { format } from 'date-fns';

const DockHistory: React.FC = () => {
  const [events, setEvents] = useState<DockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    doorId: '',
    status: '' as DoorStatus | '',
  });

  useEffect(() => {
    loadEvents();
  }, [filters]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const filterParams: any = {
        startDate: filters.startDate,
        endDate: `${filters.endDate}T23:59:59`,
      };
      if (filters.doorId) filterParams.doorId = parseInt(filters.doorId);
      if (filters.status) filterParams.status = filters.status;

      const data = await apiClient.getDockEvents(filterParams);
      setEvents(data);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const formatElapsed = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  return (
    <div>
      <h1 className="page-title">Dock History</h1>

      <div className="card">
        <h3 className="card-title">Filters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Door #</label>
            <input
              type="number"
              name="doorId"
              value={filters.doorId}
              onChange={handleFilterChange}
              className="form-input"
              placeholder="Filter by door"
              min="1"
              max="39"
            />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="form-select"
            >
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Offload">Offload</option>
              <option value="Loading">Loading</option>
              <option value="Blocked">Blocked</option>
              <option value="Waiting">Waiting</option>
              <option value="Parked">Parked</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Event Log ({events.length} events)</h3>
        
        {loading ? (
          <div className="loading">Loading events...</div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            No events found for the selected filters
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Time</th>
                  <th>Door</th>
                  <th>Old Status</th>
                  <th>New Status</th>
                  <th>Elapsed Time</th>
                  <th>Updated By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id}>
                    <td>{format(new Date(event.eventTime), 'MMM dd, yyyy HH:mm:ss')}</td>
                    <td><strong>Door {event.doorId}</strong></td>
                    <td>
                      {event.oldStatus ? (
                        <span className={`door-status ${event.oldStatus ? `status-${event.oldStatus}` : ''}`}>
                          {event.oldStatus}
                        </span>
                      ) : (
                        <span style={{ color: '#666' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`door-status status-${event.newStatus}`}>
                        {event.newStatus}
                      </span>
                    </td>
                    <td>{formatElapsed(event.elapsedSeconds)}</td>
                    <td>{event.updatedBy}</td>
                    <td style={{ color: '#888' }}>{event.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DockHistory;
