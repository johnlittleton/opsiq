import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import './ProductionScheduler.css';

interface PlannerHistoryItem {
  id: number;
  scheduleType: '5-8' | '4-10';
  startDate: string;
  endDate: string;
  lineFilter?: number;
  createdBy?: string;
  createdAt: string;
  planPayload: {
    summary?: {
      totalWorkOrders?: number;
      totalRequiredHours?: number;
      totalAvailableHours?: number;
      totalOvertimeHours?: number;
      saturdayRequired?: boolean;
    };
  };
}

const ProductionLaborPlannerHistory: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PlannerHistoryItem[]>([]);
  const [scheduleType, setScheduleType] = useState<'all' | '5-8' | '4-10'>('all');

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getProductionLaborPlannerHistory({
        limit: 200,
        scheduleType: scheduleType === 'all' ? undefined : scheduleType,
      });
      setItems(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load planner history');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [scheduleType]);

  return (
    <div className="production-scheduler">
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/production-labor-planner')}>
          ← Labor Planner
        </button>
        <h1>Labor Planner History</h1>
        <div className="header-controls">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ color: '#f3f6fa', fontSize: '0.75rem' }}>Schedule</label>
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as 'all' | '5-8' | '4-10')}
              className="form-select"
            >
              <option value="all">All</option>
              <option value="5-8">5-8</option>
              <option value="4-10">4-10</option>
            </select>
          </div>
          <button className="btn btn-secondary" onClick={loadHistory}>Refresh</button>
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {error && <div className="error">{error}</div>}

        {loading ? (
          <div className="loading">Loading labor planner history...</div>
        ) : (
          <div className="card">
            <h3 className="card-title">Saved Labor Planner Snapshots</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Saved</th>
                  <th>Schedule</th>
                  <th>Date Range</th>
                  <th>Line Filter</th>
                  <th>WO</th>
                  <th>Req Hrs</th>
                  <th>Avail Hrs</th>
                  <th>OT Hrs</th>
                  <th>Saturday</th>
                  <th>Saved By</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="no-data">No planner history found.</td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const summary = item.planPayload?.summary || {};
                    return (
                      <tr key={item.id}>
                        <td>{new Date(item.createdAt).toLocaleString()}</td>
                        <td>{item.scheduleType}</td>
                        <td>{item.startDate} → {item.endDate}</td>
                        <td>{item.lineFilter ? `Line ${item.lineFilter}` : 'All'}</td>
                        <td>{summary.totalWorkOrders ?? 0}</td>
                        <td>{(summary.totalRequiredHours ?? 0).toFixed(1)}</td>
                        <td>{(summary.totalAvailableHours ?? 0).toFixed(1)}</td>
                        <td>{(summary.totalOvertimeHours ?? 0).toFixed(1)}</td>
                        <td>{summary.saturdayRequired ? 'Yes' : 'No'}</td>
                        <td>{item.createdBy || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductionLaborPlannerHistory;
