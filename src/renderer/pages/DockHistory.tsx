import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { DockEvent, DoorStatus } from '../../shared/types';
import { format } from 'date-fns';
import './DockHistory.css';

const DockHistory: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { checkoutDoor, checkin } = location.state || {};
  
  const [events, setEvents] = useState<DockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    doorId: '',
    status: '' as DoorStatus | '',
  });

  // Handle checkout modal on mount if checkoutDoor is provided
  useEffect(() => {
    if (checkoutDoor && checkin) {
      handleCheckOut();
    } else {
      loadEvents();
    }
  }, [checkoutDoor, checkin]);

  useEffect(() => {
    if (!checkoutDoor) {
      loadEvents();
    }
  }, [filters]);

  const handleCheckOut = async () => {
    if (!checkoutDoor || !checkin) return;

    const confirmed = window.confirm(
      `Check out ${checkin.driverName} from Door ${checkoutDoor}?\n\nDriver: ${checkin.driverName}\nCompany: ${checkin.company}\nPickup #: ${checkin.pickupNumber}`
    );

    if (!confirmed) {
      navigate('/active-drivers');
      return;
    }

    setCheckingOut(true);
    try {
      await apiClient.clearDoor({
        doorId: checkoutDoor,
        updatedBy: 'System',
      });
      
      alert(`Driver ${checkin.driverName} checked out successfully from Door ${checkoutDoor}`);
      navigate('/dockboard');
    } catch (err: any) {
      alert(`Failed to check out driver: ${err.message || 'Unknown error'}`);
      navigate('/active-drivers');
    } finally {
      setCheckingOut(false);
    }
  };

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
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const filteredEvents = events.filter(event => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      event.doorId.toString().includes(search) ||
      event.newStatus.toLowerCase().includes(search) ||
      (event.oldStatus && event.oldStatus.toLowerCase().includes(search)) ||
      (event.note && event.note.toLowerCase().includes(search)) ||
      event.updatedBy.toLowerCase().includes(search)
    );
  });

  return (
    <div className="dock-history-container">
      {checkingOut ? (
        <div className="checkout-modal">
          <div className="checkout-spinner"></div>
          <p>Checking out driver...</p>
        </div>
      ) : (
        <>
          <div className="history-header">
            <h1 className="history-title">Dock History</h1>
            <button className="back-button" onClick={() => navigate('/home')}>
              ← Back to Home
            </button>
          </div>

          <div className="card">
            <h3 className="card-title">Filters</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>Search</label>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="form-input"
                  placeholder="Search door, status, notes, user..."
                />
              </div>
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
        <h3 className="card-title">Event Log ({filteredEvents.length} of {events.length} events)</h3>
        
        {loading ? (
          <div className="loading">Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            {searchText ? 'No events match your search' : 'No events found for the selected filters'}
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
                {filteredEvents.map(event => (
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
    </>
  )}
</div>
  );
};

export default DockHistory;
