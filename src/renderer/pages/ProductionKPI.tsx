import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { format } from 'date-fns';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './ProductionScheduler.css';
import './ProductionKPI.css';

interface SchedulerHistoryPoint {
  date: string;
  totalCases: number;
  totalBags: number;
  laborCost: number;
  casesPerHour: number;
  bagsPerHour: number;
}

interface SchedulerLinePoint {
  lineNumber: number;
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

interface SchedulerKPI {
  averageProductionWage: number;
  totals: {
    totalWorkOrders: number;
    totalCases: number;
    totalBags: number;
    totalMinutes: number;
    totalLaborHours: number;
    totalLaborCost: number;
    casesPerHour: number;
    casesPerMinute: number;
    casesPerPerson: number;
    bagsPerHour: number;
    bagsPerMinute: number;
    bagsPerPerson: number;
  };
  byLine: SchedulerLinePoint[];
  history: SchedulerHistoryPoint[];
}

const ProductionKPIPage: React.FC = () => {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<SchedulerKPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(new Date()),
    endDate: getLocalDateString(new Date()),
  });

  const [selectedLine, setSelectedLine] = useState<number>(0);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const kpiData = await apiClient.getProductionSchedulerKPI(
        dateRange.startDate,
        dateRange.endDate,
        selectedLine > 0 ? selectedLine : undefined
      );
      setKpi(kpiData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const chartData = (kpi?.history || []).map(point => ({
    ...point,
    dateLabel: format(new Date(`${point.date}T00:00:00`), 'MMM dd'),
  }));

  if (loading) {
    return <div className="loading">Loading production data...</div>;
  }

  return (
    <div className="production-scheduler">
      <div className="header-bar">
        <button className="back-btn" onClick={() => navigate('/production-scheduler')}>
          ← Scheduler
        </button>
        <h1>Production KPI Dashboard</h1>
        <div className="header-controls">
          <button className="history-btn" onClick={() => navigate('/production-kpi-history')}>
            📜 KPI History
          </button>
        </div>
      </div>

      <div className="production-kpi-content" style={{ padding: '16px 20px' }}>

      {error && <div className="error">{error}</div>}

      {/* Date Range Filter */}
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Line</label>
            <select
              value={selectedLine}
              onChange={(e) => setSelectedLine(parseInt(e.target.value))}
              className="form-select"
            >
              <option value={0}>All Lines</option>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>Line {n}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={loadData}>
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {kpi && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Avg Production Wage</div>
            <div className="kpi-value">${kpi.averageProductionWage.toFixed(2)}<span className="kpi-unit">/hr</span></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Labor Hours</div>
            <div className="kpi-value">{kpi.totals.totalLaborHours.toFixed(1)}<span className="kpi-unit">hrs</span></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Labor Cost</div>
            <div className="kpi-value">${kpi.totals.totalLaborCost.toLocaleString()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Cases</div>
            <div className="kpi-value">{kpi.totals.totalCases.toLocaleString()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Bags</div>
            <div className="kpi-value">{kpi.totals.totalBags.toLocaleString()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Cases / Hour</div>
            <div className="kpi-value">{kpi.totals.casesPerHour.toFixed(2)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Cases / Minute</div>
            <div className="kpi-value">{kpi.totals.casesPerMinute.toFixed(2)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Cases / Person</div>
            <div className="kpi-value">{kpi.totals.casesPerPerson.toFixed(2)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Bags / Hour</div>
            <div className="kpi-value">{kpi.totals.bagsPerHour.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="card">
          <h3 className="card-title">Cases and Bags Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="dateLabel" stroke="#b0b0b0" />
              <YAxis stroke="#b0b0b0" />
              <Tooltip contentStyle={{ background: '#252525', border: '1px solid #444' }} />
              <Legend />
              <Line type="monotone" dataKey="totalCases" stroke="#4a9eff" strokeWidth={2} name="Cases" />
              <Line type="monotone" dataKey="totalBags" stroke="#27ae60" strokeWidth={2} name="Bags" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Output Efficiency Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="dateLabel" stroke="#b0b0b0" />
              <YAxis stroke="#b0b0b0" />
              <Tooltip contentStyle={{ background: '#252525', border: '1px solid #444' }} />
              <Legend />
              <Bar dataKey="casesPerHour" fill="#4a9eff" name="Cases/Hour" />
              <Bar dataKey="bagsPerHour" fill="#27ae60" name="Bags/Hour" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Line Breakdown */}
      {kpi && (
        <div className="card">
          <h3 className="card-title">Production by Line</h3>
          <div className="production-kpi-table-scroll">
          <table className="data-table production-kpi-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Cases</th>
                <th>Bags</th>
                <th>Labor Mins</th>
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
              {kpi.byLine.map(line => (
                <tr key={line.lineNumber}>
                  <td><strong>Line {line.lineNumber}</strong></td>
                  <td>{line.totalCases.toLocaleString()}</td>
                  <td>{line.totalBags.toLocaleString()}</td>
                  <td>{Math.round(line.totalLaborHours * 60).toLocaleString()}</td>
                  <td>{line.totalLaborHours.toFixed(1)} hrs</td>
                  <td>${line.laborCost.toLocaleString()}</td>
                  <td>{line.casesPerHour.toFixed(2)}</td>
                  <td>{line.casesPerMinute.toFixed(2)}</td>
                  <td>{line.casesPerPerson.toFixed(2)}</td>
                  <td>{line.bagsPerHour.toFixed(2)}</td>
                  <td>{line.bagsPerMinute.toFixed(2)}</td>
                  <td>{line.bagsPerPerson.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default ProductionKPIPage;
