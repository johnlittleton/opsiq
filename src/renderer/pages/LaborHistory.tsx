import { useState, useEffect } from 'react';
import { API_BASE } from '../services/config';
import { GlassPanel } from '../components';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import './LaborHistory.css';

const SR_HOURLY_WAGE = 27; // Warehouse
const PROD_HOURLY_WAGE = 24.50; // Production

interface LaborSnapshot {
  id: number;
  timestamp: string;
  shippingReceivingHeadcount: number;
  productionHeadcount: number;
  shippingReceivingLaborCost: number;
  productionLaborCost: number;
  totalHeadcount: number;
  totalLaborCost: number;
  recordedBy: string;
  shift: 'A' | 'B';
  notes: string | null;
  warehouseOvertimeHours?: number;
  productionOvertimeHours?: number;
}

interface DepartmentShiftSession {
  id: number;
  date: string;
  department: string;
  teamName?: string | null;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string | null;
  startHeadcount: number;
  endHeadcount?: number | null;
  overtimeHours: number;
  totalLaborCost: number;
  startedBy?: string;
  endedBy?: string;
  notes?: string | null;
}

interface WarehouseEmployeeShift {
  id: number;
  date: string;
  employeeName: string;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string | null;
  overtimeHours: number;
  totalLaborCost: number;
  startedBy?: string;
  endedBy?: string;
  notes?: string | null;
}

interface TrackerHistoryItem {
  id: string;
  type: 'department' | 'warehouse-employee';
  label: string;
  startTime: string;
  endTime?: string | null;
  startHeadcount?: number;
  endHeadcount?: number | null;
  overtimeHours: number;
  totalLaborCost: number;
  startedBy?: string;
  endedBy?: string;
  notes?: string | null;
}

export default function LaborHistory() {
  const { userRole } = useAuth();
  const [snapshots, setSnapshots] = useState<LaborSnapshot[]>([]);
  const [filteredSnapshots, setFilteredSnapshots] = useState<LaborSnapshot[]>([]);
  const [trackerHistory, setTrackerHistory] = useState<TrackerHistoryItem[]>([]);
  const [filteredTrackerHistory, setFilteredTrackerHistory] = useState<TrackerHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [startDate, setStartDate] = useState(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()));
  const [selectedShift, setSelectedShift] = useState<'all' | 'A' | 'B'>('all');

  useEffect(() => {
    fetchSnapshots();
    fetchTrackerHistory();
  }, []);

  useEffect(() => {
    filterSnapshots();
    filterTrackerHistory();
  }, [snapshots, trackerHistory, searchTerm, startDate, endDate, selectedShift]);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/labor/snapshots?limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch snapshots');
      const data = await response.json();
      setSnapshots(data);
    } catch (err: any) {
      console.error('Error fetching snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrackerHistory = async () => {
    try {
      const end = endDate || getLocalDateString(new Date());
      const start = startDate || getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

      const dateCursor = new Date(start);
      const endDateObj = new Date(end);
      const dateList: string[] = [];

      while (dateCursor <= endDateObj) {
        dateList.push(getLocalDateString(dateCursor));
        dateCursor.setDate(dateCursor.getDate() + 1);
      }

      const historyData = await Promise.all(
        dateList.map(async (dateKey) => {
          const [departmentResponse, warehouseResponse] = await Promise.all([
            fetch(`${API_BASE}/api/labor/departments/sessions?date=${dateKey}`),
            fetch(`${API_BASE}/api/labor/warehouse/employees?date=${dateKey}`),
          ]);

          const departmentContentType = departmentResponse.headers.get('content-type') || '';
          const warehouseContentType = warehouseResponse.headers.get('content-type') || '';

          const departmentSessions: DepartmentShiftSession[] =
            departmentResponse.ok && departmentContentType.includes('application/json')
              ? await departmentResponse.json()
              : [];

          const warehouseShifts: WarehouseEmployeeShift[] =
            warehouseResponse.ok && warehouseContentType.includes('application/json')
              ? await warehouseResponse.json()
              : [];

          const completedDepartmentSessions = departmentSessions
            .filter((session) => session.status === 'completed')
            .map<TrackerHistoryItem>((session) => ({
              id: `dept-${session.id}`,
              type: 'department',
              label: `${session.department}${session.teamName ? ` (${session.teamName})` : ''}`,
              startTime: session.startTime,
              endTime: session.endTime,
              startHeadcount: session.startHeadcount,
              endHeadcount: session.endHeadcount,
              overtimeHours: Number(session.overtimeHours || 0),
              totalLaborCost: Number(session.totalLaborCost || 0),
              startedBy: session.startedBy,
              endedBy: session.endedBy,
              notes: session.notes,
            }));

          const completedWarehouseSessions = warehouseShifts
            .filter((shift) => shift.status === 'completed')
            .map<TrackerHistoryItem>((shift) => ({
              id: `wh-${shift.id}`,
              type: 'warehouse-employee',
              label: `Warehouse Employee: ${shift.employeeName}`,
              startTime: shift.startTime,
              endTime: shift.endTime,
              overtimeHours: Number(shift.overtimeHours || 0),
              totalLaborCost: Number(shift.totalLaborCost || 0),
              startedBy: shift.startedBy,
              endedBy: shift.endedBy,
              notes: shift.notes,
            }));

          return [...completedDepartmentSessions, ...completedWarehouseSessions];
        })
      );

      const mergedHistory = historyData
        .flat()
        .sort((a, b) => new Date(b.endTime || b.startTime).getTime() - new Date(a.endTime || a.startTime).getTime());

      setTrackerHistory(mergedHistory);
    } catch (err) {
      console.error('Error fetching tracker history:', err);
      setTrackerHistory([]);
    }
  };

  const filterSnapshots = () => {
    let filtered = [...snapshots];

    // Search filter (searches by recorded by name or notes)
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.recordedBy.toLowerCase().includes(search) ||
          (s.notes && s.notes.toLowerCase().includes(search))
      );
    }

    // Date range filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((s) => new Date(s.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((s) => new Date(s.timestamp) <= end);
    }

    // Shift filter
    if (selectedShift !== 'all') {
      filtered = filtered.filter((s) => s.shift === selectedShift);
    }

    setFilteredSnapshots(filtered);
  };

  const filterTrackerHistory = () => {
    let filtered = [...trackerHistory];

    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((item) =>
        item.label.toLowerCase().includes(search) ||
        (item.startedBy || '').toLowerCase().includes(search) ||
        (item.endedBy || '').toLowerCase().includes(search) ||
        (item.notes || '').toLowerCase().includes(search)
      );
    }

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((item) => new Date(item.startTime) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((item) => new Date(item.startTime) <= end);
    }

    setFilteredTrackerHistory(filtered);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStartDate(getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    setEndDate(getLocalDateString(new Date()));
    setSelectedShift('all');
  };

  useEffect(() => {
    fetchTrackerHistory();
  }, [startDate, endDate]);

  const calculateTotals = () => {
    if (filteredSnapshots.length === 0) {
      return {
        totalSnapshots: 0,
        avgSRHeadcount: 0,
        avgProdHeadcount: 0,
        avgTotalHeadcount: 0,
        totalLaborCost: 0,
      };
    }

    const totals = filteredSnapshots.reduce(
      (acc, s) => ({
        srHeadcount: acc.srHeadcount + s.shippingReceivingHeadcount,
        prodHeadcount: acc.prodHeadcount + s.productionHeadcount,
        totalHeadcount: acc.totalHeadcount + s.totalHeadcount,
        totalCost: acc.totalCost + s.totalLaborCost,
      }),
      { srHeadcount: 0, prodHeadcount: 0, totalHeadcount: 0, totalCost: 0 }
    );

    return {
      totalSnapshots: filteredSnapshots.length,
      avgSRHeadcount: (totals.srHeadcount / filteredSnapshots.length).toFixed(1),
      avgProdHeadcount: (totals.prodHeadcount / filteredSnapshots.length).toFixed(1),
      avgTotalHeadcount: (totals.totalHeadcount / filteredSnapshots.length).toFixed(1),
      totalLaborCost: totals.totalCost.toFixed(2),
    };
  };

  const totals = calculateTotals();
  const trackerTotalCost = filteredTrackerHistory
    .reduce((sum, item) => sum + Number(item.totalLaborCost || 0), 0)
    .toFixed(2);

  if (userRole !== 'executive' && userRole !== 'manager') {
    return (
      <div className="labor-history">
        <TitleBar showLegend={false} />
        <div className="labor-history__container">
          <div style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            ⛔ Access Denied
            <br />
            <span style={{ fontSize: '16px', color: '#94a3b8' }}>
              Labor History is restricted to authorized users.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="labor-history">
      <TitleBar showLegend={false} />
      
      <div className="labor-history__container">
        <div className="labor-history__header">
          <h1>Labor History</h1>
          <p className="labor-history__subtitle">View and search historical labor snapshots</p>
        </div>

        {/* Filters */}
        <GlassPanel className="labor-history__filters">
          <div className="labor-history__filters-row">
            <div className="filter-group">
              <label>Search</label>
              <input
                type="text"
                placeholder="Search by manager name or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="filter-group">
              <label>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Shift</label>
              <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value as 'all' | 'A' | 'B')}>
                <option value="all">All Shifts</option>
                <option value="A">Shift A</option>
                <option value="B">Shift B</option>
              </select>
            </div>

            <button className="clear-filters-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>

          {/* Summary Stats */}
          <div className="labor-history__stats">
            <div className="stat-item">
              <span className="label">Total Snapshots:</span>
              <span className="value">{totals.totalSnapshots}</span>
            </div>
            <div className="stat-item">
              <span className="label">Avg S&R:</span>
              <span className="value">{totals.avgSRHeadcount}</span>
            </div>
            <div className="stat-item">
              <span className="label">Avg Production:</span>
              <span className="value">{totals.avgProdHeadcount}</span>
            </div>
            <div className="stat-item">
              <span className="label">Avg Total:</span>
              <span className="value">{totals.avgTotalHeadcount}</span>
            </div>
            <div className="stat-item highlight">
              <span className="label">Total Cost:</span>
              <span className="value">${totals.totalLaborCost}</span>
            </div>
          </div>
        </GlassPanel>

        {/* Snapshots List */}
        <GlassPanel className="labor-history__list">
          {loading ? (
            <div className="labor-history__loading">Loading snapshots...</div>
          ) : filteredSnapshots.length === 0 ? (
            <div className="labor-history__empty">
              <p>No snapshots found matching your filters.</p>
              {(searchTerm || startDate || endDate || selectedShift !== 'all') && (
                <button className="clear-filters-link" onClick={clearFilters}>
                  Clear filters to see all snapshots
                </button>
              )}
            </div>
          ) : (
            <div className="labor-history__snapshots">
              {filteredSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="labor-history__snapshot">
                  <div className="snapshot-header">
                    <span className="time">
                      {new Date(snapshot.timestamp).toLocaleString()}
                    </span>
                    <span className={`shift shift-${snapshot.shift}`}>Shift {snapshot.shift}</span>
                  </div>
                  
                  <div className="snapshot-data">
                    <div className="data-section sr-section">
                      <h4>Warehouse</h4>
                      <div className="data-row">
                        <span className="label">Headcount:</span>
                        <span className="value">{snapshot.shippingReceivingHeadcount}</span>
                      </div>
                      {(snapshot.warehouseOvertimeHours || 0) > 0 && (
                        <div className="data-row">
                          <span className="label">Overtime:</span>
                          <span className="value">{snapshot.warehouseOvertimeHours?.toFixed(1)} hrs</span>
                        </div>
                      )}
                      <div className="data-row">
                        <span className="label">Hourly Cost:</span>
                        <span className="value">${snapshot.shippingReceivingLaborCost.toFixed(2)}/hr</span>
                      </div>
                    </div>
                    
                    <div className="data-section prod-section">
                      <h4>Production</h4>
                      <div className="data-row">
                        <span className="label">Headcount:</span>
                        <span className="value">{snapshot.productionHeadcount}</span>
                      </div>
                      {(snapshot.productionOvertimeHours || 0) > 0 && (
                        <div className="data-row">
                          <span className="label">Overtime:</span>
                          <span className="value">{snapshot.productionOvertimeHours?.toFixed(1)} hrs</span>
                        </div>
                      )}
                      <div className="data-row">
                        <span className="label">Hourly Cost:</span>
                        <span className="value">${snapshot.productionLaborCost.toFixed(2)}/hr</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="snapshot-totals">
                    <div className="total-item">
                      <span className="label">Total Headcount:</span>
                      <span className="value">{snapshot.totalHeadcount}</span>
                    </div>
                    <div className="total-item highlight">
                      <span className="label">Total Hourly Cost:</span>
                      <span className="value">${snapshot.totalLaborCost.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="snapshot-footer">
                    <span className="recorded-by">Recorded by: {snapshot.recordedBy}</span>
                    {snapshot.notes && <span className="notes">Notes: {snapshot.notes}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="labor-history__list tracker-history-panel">
          <div className="tracker-history-header">
            <h2>Department Shift History</h2>
            <div className="tracker-history-meta">
              <span>{filteredTrackerHistory.length} completed shifts</span>
              <span>Total cost: ${trackerTotalCost}</span>
            </div>
          </div>

          {loading ? (
            <div className="labor-history__loading">Loading department shift history...</div>
          ) : filteredTrackerHistory.length === 0 ? (
            <div className="labor-history__empty">
              <p>No completed department shifts found in the selected range.</p>
            </div>
          ) : (
            <div className="labor-history__snapshots tracker-history-list">
              {filteredTrackerHistory.map((item) => (
                <div key={item.id} className="labor-history__snapshot tracker-history-item">
                  <div className="snapshot-header">
                    <span className="time">{new Date(item.endTime || item.startTime).toLocaleString()}</span>
                    <span className={`tracker-type-badge ${item.type}`}>{item.type === 'department' ? 'Department' : 'Warehouse Employee'}</span>
                  </div>

                  <div className="tracker-history-body">
                    <div className="tracker-history-label">{item.label}</div>
                    <div className="tracker-history-row">
                      <span>Start: {new Date(item.startTime).toLocaleTimeString()}</span>
                      <span>End: {item.endTime ? new Date(item.endTime).toLocaleTimeString() : 'N/A'}</span>
                    </div>
                    {item.type === 'department' && (
                      <div className="tracker-history-row">
                        <span>Start Headcount: {item.startHeadcount ?? 0}</span>
                        <span>End Headcount: {item.endHeadcount ?? item.startHeadcount ?? 0}</span>
                      </div>
                    )}
                    <div className="tracker-history-row">
                      <span>Overtime: {Number(item.overtimeHours || 0).toFixed(1)} hrs</span>
                      <span className="tracker-cost">Cost: ${Number(item.totalLaborCost || 0).toFixed(2)}</span>
                    </div>
                    <div className="tracker-history-row tracker-history-byline">
                      <span>Started by: {item.startedBy || 'N/A'}</span>
                      <span>Ended by: {item.endedBy || 'N/A'}</span>
                    </div>
                    {item.notes && <div className="tracker-history-notes">Notes: {item.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
