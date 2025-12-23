import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TitleBar } from '../../components/layout/TitleBar';
import { apiClient } from '../services/api';
import { DockCheckin } from '../../shared/types';
import { format } from 'date-fns';
import './CheckInHistory.css';

const CheckInHistory: React.FC = () => {
  const navigate = useNavigate();
  const [checkins, setCheckins] = useState<DockCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    doorId: '',
    type: '',
    includeActive: true,
  });

  useEffect(() => {
    loadCheckins();
  }, [filters]);

  const loadCheckins = async () => {
    setLoading(true);
    try {
      const filterParams: any = {
        startDate: filters.startDate,
        endDate: `${filters.endDate}T23:59:59`,
      };
      
      if (filters.doorId) filterParams.doorId = parseInt(filters.doorId);
      if (filters.type) filterParams.type = filters.type;
      if (!filters.includeActive) filterParams.includeActive = false;

      const data = await apiClient.getAllCheckins(filterParams);
      setCheckins(data);
    } catch (error) {
      console.error('Failed to load checkins:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const formatElapsed = (startTime: string, endTime?: string): string => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const filteredCheckins = checkins.filter(checkin => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      checkin.company.toLowerCase().includes(search) ||
      checkin.driverName.toLowerCase().includes(search) ||
      checkin.pickupNumber.toLowerCase().includes(search) ||
      checkin.commodity.toLowerCase().includes(search) ||
      (checkin.plateNumber && checkin.plateNumber.toLowerCase().includes(search)) ||
      (checkin.forkliftDriver && checkin.forkliftDriver.toLowerCase().includes(search)) ||
      (checkin.checker && checkin.checker.toLowerCase().includes(search))
    );
  });

  return (
    <div className="checkin-history">
      <TitleBar />
      
      <div className="checkin-history__content">
        <div className="checkin-history__header">
          <h1 className="checkin-history__title">Driver Check-In History</h1>
          <button onClick={() => navigate('/')} className="checkin-history__back-btn">
            ← Back to Home
          </button>
        </div>

        <div className="checkin-history__filters">
          <h3 className="checkin-history__filters-title">Filters</h3>
          <div className="checkin-history__filters-grid">
            <div className="checkin-history__field">
              <label>Search</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Company, driver, pickup #, commodity..."
              />
            </div>
            <div className="checkin-history__field">
              <label>Start Date</label>
              <input
                type="date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="checkin-history__field">
              <label>End Date</label>
              <input
                type="date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
              />
            </div>
            <div className="checkin-history__field">
              <label>Door #</label>
              <input
                type="number"
                name="doorId"
                value={filters.doorId}
                onChange={handleFilterChange}
                placeholder="1-39"
                min="1"
                max="39"
              />
            </div>
            <div className="checkin-history__field">
              <label>Type</label>
              <select name="type" value={filters.type} onChange={handleFilterChange}>
                <option value="">All Types</option>
                <option value="Inbound">Inbound</option>
                <option value="Outbound">Outbound</option>
              </select>
            </div>
            <div className="checkin-history__field checkin-history__field--checkbox">
              <label>
                <input
                  type="checkbox"
                  name="includeActive"
                  checked={filters.includeActive}
                  onChange={(e) => setFilters(prev => ({ ...prev, includeActive: e.target.checked }))}
                />
                Include Active Check-ins
              </label>
            </div>
          </div>
        </div>

        <div className="checkin-history__results">
          <h3 className="checkin-history__results-title">
            Check-In Records ({filteredCheckins.length} {searchText && `of ${checkins.length}`})
          </h3>
          
          {loading ? (
            <div className="checkin-history__loading">Loading check-ins...</div>
          ) : filteredCheckins.length === 0 ? (
            <div className="checkin-history__empty">
              {searchText ? 'No check-ins match your search' : 'No check-ins found for the selected filters'}
            </div>
          ) : (
            <div className="checkin-history__table-wrapper">
              <table className="checkin-history__table">
                <thead>
                  <tr>
                    <th>Door</th>
                    <th>Type</th>
                    <th>Company</th>
                    <th>Driver</th>
                    <th>Pickup #</th>
                    <th>Pallets</th>
                    <th>Commodity</th>
                    <th>Plate</th>
                    <th>Forklift Driver</th>
                    <th>Checker</th>
                    <th>Status</th>
                    <th>Check-In Time</th>
                    <th>Check-Out Time</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckins.map(checkin => (
                    <tr key={checkin.id} className={!checkin.closedAt ? 'checkin-history__row--active' : ''}>
                      <td><strong>D{checkin.doorId}</strong></td>
                      <td>
                        <span className={`checkin-history__badge checkin-history__badge--${checkin.inboundOutbound.toLowerCase()}`}>
                          {checkin.inboundOutbound}
                        </span>
                      </td>
                      <td>{checkin.company}</td>
                      <td>{checkin.driverName}</td>
                      <td>{checkin.pickupNumber}</td>
                      <td>{checkin.pallets}</td>
                      <td>{checkin.commodity}</td>
                      <td>{checkin.plateNumber || '—'}</td>
                      <td>{checkin.forkliftDriver}</td>
                      <td>{checkin.checker}</td>
                      <td>
                        <span className={`checkin-history__badge checkin-history__badge--${checkin.status.toLowerCase()}`}>
                          {checkin.status}
                        </span>
                      </td>
                      <td>{format(new Date(checkin.createdAt), 'MMM dd, yyyy HH:mm')}</td>
                      <td>
                        {checkin.closedAt ? format(new Date(checkin.closedAt), 'MMM dd, yyyy HH:mm') : (
                          <span className="checkin-history__active">Active</span>
                        )}
                      </td>
                      <td>
                        {checkin.closedAt ? formatElapsed(checkin.createdAt, checkin.closedAt) : (
                          <span className="checkin-history__active">{formatElapsed(checkin.createdAt)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckInHistory;
