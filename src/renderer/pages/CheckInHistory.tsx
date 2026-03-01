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
  const [expandedCheckin, setExpandedCheckin] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<number, any[]>>({});
  const [loadingAudit, setLoadingAudit] = useState<number | null>(null);
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [filters, setFilters] = useState({
    startDate: getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: getLocalDateString(new Date()),
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

  const handleToggleExpand = async (checkinId: number) => {
    if (expandedCheckin === checkinId) {
      setExpandedCheckin(null);
      return;
    }

    setExpandedCheckin(checkinId);
    
    // Fetch audit log if not already loaded
    if (!auditLogs[checkinId]) {
      setLoadingAudit(checkinId);
      try {
        const logs = await apiClient.getCheckinAuditLog(checkinId);
        setAuditLogs(prev => ({ ...prev, [checkinId]: logs }));
      } catch (error) {
        console.error('Failed to load audit log:', error);
      } finally {
        setLoadingAudit(null);
      }
    }
  };

  const filteredCheckins = checkins.filter(checkin => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      checkin.company.toLowerCase().includes(search) ||
      checkin.driverName.toLowerCase().includes(search) ||
      checkin.pickupNumber.toLowerCase().includes(search) ||
      checkin.commodity.toLowerCase().includes(search) ||
      (checkin.forkliftDriver && checkin.forkliftDriver.toLowerCase().includes(search)) ||
      (checkin.plateNumber && checkin.plateNumber.toLowerCase().includes(search)) ||
      (checkin.forkliftDriver && checkin.forkliftDriver.toLowerCase().includes(search)) ||
      (checkin.checker && checkin.checker.toLowerCase().includes(search))
    );
  });

  return (
    <div className="checkin-history">
      <TitleBar showLegend={false} />
      
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
                placeholder="Company, driver, P/U #, S/O #, commodity..."
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
                    <th></th>
                    <th>Door</th>
                    <th>Type</th>
                    <th>Company</th>
                    <th>Driver</th>
                    <th>P/U # / S/O #</th>
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
                    <React.Fragment key={checkin.id}>
                      <tr className={!checkin.closedAt ? 'checkin-history__row--active' : ''}>
                        <td>
                          <button
                            className="checkin-history__expand-btn"
                            onClick={() => handleToggleExpand(checkin.id)}
                            title="View edit history"
                          >
                            {expandedCheckin === checkin.id ? '▼' : '▶'}
                          </button>
                        </td>
                        <td><strong>{checkin.doorId ? `D${checkin.doorId}` : 'Parked'}</strong></td>
                        <td>
                          <span className={`checkin-history__badge checkin-history__badge--${(checkin.inboundOutbound || 'inbound').toLowerCase()}`}>
                            {checkin.inboundOutbound || 'N/A'}
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
                          <span className={`checkin-history__badge checkin-history__badge--${(checkin.status || 'pending').toLowerCase()}`}>
                            {checkin.status || 'Pending'}
                          </span>
                        </td>
                        <td>
                          {checkin.createdAt && !isNaN(new Date(checkin.createdAt).getTime())
                            ? format(new Date(checkin.createdAt), 'MMM dd, yyyy HH:mm')
                            : '—'}
                        </td>
                        <td>
                          {checkin.closedAt ? (
                            !isNaN(new Date(checkin.closedAt).getTime())
                              ? format(new Date(checkin.closedAt), 'MMM dd, yyyy HH:mm')
                              : '—'
                          ) : (
                            <span className="checkin-history__active">Active</span>
                          )}
                        </td>
                        <td>
                          {checkin.closedAt ? formatElapsed(checkin.createdAt, checkin.closedAt) : (
                            <span className="checkin-history__active">{formatElapsed(checkin.createdAt)}</span>
                          )}
                        </td>
                      </tr>
                      {expandedCheckin === checkin.id && (
                        <tr className="checkin-history__audit-row">
                          <td colSpan={15}>
                            <div className="checkin-history__audit-content">
                              <h4 className="checkin-history__audit-title">Edit History</h4>
                              {loadingAudit === checkin.id ? (
                                <div className="checkin-history__audit-loading">Loading edit history...</div>
                              ) : auditLogs[checkin.id]?.length > 0 ? (
                                <div className="checkin-history__audit-list">
                                  {auditLogs[checkin.id].map((log, idx) => (
                                    <div key={idx} className="checkin-history__audit-item">
                                      <div className="checkin-history__audit-meta">
                                        <span className="checkin-history__audit-time">
                                          {format(new Date(log.changedAt), 'MMM dd, yyyy HH:mm:ss')}
                                        </span>
                                        <span className="checkin-history__audit-user">{log.changedBy}</span>
                                      </div>
                                      <div className="checkin-history__audit-change">
                                        <span className="checkin-history__audit-field">{log.fieldName}:</span>
                                        <span className="checkin-history__audit-old">{log.oldValue || '(empty)'}</span>
                                        <span className="checkin-history__audit-arrow">→</span>
                                        <span className="checkin-history__audit-new">{log.newValue || '(empty)'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="checkin-history__audit-empty">No edits recorded</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
