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
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [actualPalletsInput, setActualPalletsInput] = useState('');
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [filters, setFilters] = useState({
    startDate: '2020-01-01',
    endDate: getLocalDateString(new Date()),
    doorId: '',
    status: '' as DoorStatus | '',
  });

  // Handle checkout modal on mount if checkoutDoor is provided
  useEffect(() => {
    console.log('DockHistory mounted with:', { checkoutDoor, checkin });
    if (checkoutDoor && checkin) {
      console.log('Setting showCheckoutModal to true');
      setShowCheckoutModal(true);
      setActualPalletsInput(checkin.pallets.toString());
    } else {
      console.log('Loading events instead');
      loadEvents();
    }
  }, [checkoutDoor, checkin]);

  useEffect(() => {
    if (!checkoutDoor) {
      loadEvents();
    }
  }, [filters]);

  const handleConfirmCheckout = async () => {
    if (!checkoutDoor || !checkin) return;
    
    const parsed = parseInt(actualPalletsInput, 10);
    const actualPallets = !isNaN(parsed) && parsed >= 0 ? parsed : checkin.pallets;

    setCheckingOut(true);
    setShowCheckoutModal(false);
    
    try {
      await apiClient.clearDoor({
        doorId: checkoutDoor,
        updatedBy: 'System',
        actualPallets,
      });
      
      navigate('/dockboard');
    } catch (err: any) {
      console.error('Checkout failed:', err);
      navigate('/active-drivers');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleCancelCheckout = () => {
    setShowCheckoutModal(false);
    navigate('/dockboard');
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const filterParams: any = {
        startDate: `${filters.startDate}T00:00:00`,
        endDate: `${filters.endDate}T23:59:59`,
      };
      if (filters.doorId) filterParams.doorId = parseInt(filters.doorId);
      if (filters.status) filterParams.status = filters.status;

      console.log('🔍 Loading dock events with filters:', filterParams);
      const data = await apiClient.getDockEvents(filterParams);
      console.log('📊 Loaded dock events:', data.length);
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

  const eventsArray = Array.isArray(events) ? events : [];
  const filteredEvents = eventsArray.filter(event => {
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
      {showCheckoutModal && checkin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            padding: '32px',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <h2 style={{ color: 'white', marginBottom: '16px', fontSize: '24px' }}>Check Out Driver</h2>
            <div style={{ color: '#94a3b8', marginBottom: '24px', lineHeight: '1.6' }}>
              <p><strong>Driver:</strong> {checkin.driverName}</p>
              <p><strong>Company:</strong> {checkin.company}</p>
              <p><strong>{checkin.inboundOutbound === 'Inbound' ? 'P/U #:' : 'S/O #:'}</strong> {checkin.pickupNumber}</p>
              <p><strong>Door:</strong> {checkoutDoor}</p>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ color: 'white', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                Actual Pallets {checkin.inboundOutbound === 'Inbound' ? 'Offloaded' : 'Loaded'}:
              </label>
              <input
                type="number"
                value={actualPalletsInput}
                onChange={(e) => setActualPalletsInput(e.target.value)}
                placeholder={`Expected: ${checkin.pallets}`}
                min="0"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: '#0f172a',
                  color: 'white'
                }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleConfirmCheckout}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: 600,
                  backgroundColor: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                ✓ Confirm Checkout
              </button>
              <button
                onClick={handleCancelCheckout}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: 600,
                  backgroundColor: '#64748b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
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
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Time</th>
                  <th>Door</th>
                  <th>Company</th>
                  <th>Driver</th>
                  <th>Forklift Driver</th>
                  <th>Checker</th>
                  <th>P/U # / S/O #</th>
                  <th>Type</th>
                  <th>Pallets</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Old Status</th>
                  <th>New Status</th>
                  <th>Elapsed Time</th>
                  <th>Updated By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map(event => {
                  const eventDate = new Date(event.eventTime);
                  const isValidDate = !isNaN(eventDate.getTime());
                  return (
                    <tr key={event.id}>
                      <td>{isValidDate ? format(eventDate, 'MMM dd, yyyy HH:mm:ss') : 'Invalid Date'}</td>
                      <td><strong>Door {event.doorId}</strong></td>
                      <td>{event.company || '—'}</td>
                      <td>{event.driverName || '—'}</td>
                      <td>{event.forkliftDriver || '—'}</td>
                      <td>{event.checker || '—'}</td>
                      <td>{event.pickupNumber || '—'}</td>
                      <td>{event.type || '—'}</td>
                      <td>
                        {event.actualPallets 
                          ? `${event.actualPallets} (${event.pallets || '0'} expected)` 
                          : event.pallets || '—'}
                      </td>
                      <td>
                        {event.loadStartTime 
                          ? format(new Date(event.loadStartTime), 'MMM dd, HH:mm') 
                          : '—'}
                      </td>
                      <td>
                        {event.loadEndTime 
                          ? format(new Date(event.loadEndTime), 'MMM dd, HH:mm') 
                          : '—'}
                      </td>
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
                  );
                })}
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
