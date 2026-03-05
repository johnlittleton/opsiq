import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { format, subDays } from 'date-fns';
import './ProductionScheduler.css';

interface SchedulerHistoryPoint {
  date: string;
  totalCases: number;
  totalBags: number;
  totalLaborHours: number;
  laborCost: number;
  casesPerHour: number;
  casesPerMinute: number;
  casesPerPerson: number;
  bagsPerHour: number;
  bagsPerMinute: number;
  bagsPerPerson: number;
}

interface SchedulerHistoryResponse {
  history: SchedulerHistoryPoint[];
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ProductionKPIHistory: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SchedulerHistoryPoint[]>([]);
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(subDays(new Date(), 30)),
    endDate: getLocalDateString(new Date()),
  });

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: SchedulerHistoryResponse = await apiClient.getProductionSchedulerKPI(
        dateRange.startDate,
        dateRange.endDate
      );
      setHistory(data.history || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load KPI history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [dateRange]);

  return (
    <div className="production-scheduler">
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/production')}>
          ← KPI Dashboard
        </button>
        <h1>Production KPI History</h1>
        <div className="header-controls">
          <button className="dashboard-btn" onClick={() => navigate('/production-scheduler')}>
            📋 Scheduler
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {error && <div className="error">{error}</div>}

        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="form-input"
              />
            </div>
            <button className="btn btn-secondary" onClick={loadHistory}>Refresh</button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading KPI history...</div>
        ) : (
          <div className="card">
            <h3 className="card-title">Daily Production KPI History</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cases</th>
                  <th>Bags</th>
                  <th>Labor Hours</th>
                  <th>Labor Cost</th>
                  <th>Cases/Hr</th>
                  <th>Cases/Min</th>
                  <th>Cases/Person</th>
                  <th>Bags/Hr</th>
                  <th>Bags/Min</th>
                  <th>Bags/Person</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.date}>
                    <td>{format(new Date(`${item.date}T00:00:00`), 'MMM dd, yyyy')}</td>
                    <td>{item.totalCases.toLocaleString()}</td>
                    <td>{item.totalBags.toLocaleString()}</td>
                    <td>{item.totalLaborHours.toFixed(2)}</td>
                    <td>${item.laborCost.toLocaleString()}</td>
                    <td>{item.casesPerHour.toFixed(2)}</td>
                    <td>{item.casesPerMinute.toFixed(2)}</td>
                    <td>{item.casesPerPerson.toFixed(2)}</td>
                    <td>{item.bagsPerHour.toFixed(2)}</td>
                    <td>{item.bagsPerMinute.toFixed(2)}</td>
                    <td>{item.bagsPerPerson.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && (
              <div className="no-results">No KPI history found for this date range.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductionKPIHistory;
