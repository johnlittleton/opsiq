import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { ProductionEntry, ProductionKPI, Shift } from '../../shared/types';
import { format, subDays } from 'date-fns';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ProductionKPIPage: React.FC = () => {
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [kpi, setKpi] = useState<ProductionKPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'A' as Shift,
    lineNumber: 1,
    laborHours: '',
    laborRate: '',
    pallets: '',
    cases: '',
    scrapCases: '',
  });

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [entriesData, kpiData] = await Promise.all([
        apiClient.getProductionEntries({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
        apiClient.getProductionKPI(dateRange.startDate, dateRange.endDate),
      ]);
      setEntries(entriesData);
      setKpi(kpiData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.laborHours || !formData.laborRate || !formData.pallets || !formData.cases) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.createProductionEntry({
        date: formData.date,
        shift: formData.shift,
        lineNumber: formData.lineNumber,
        laborHours: parseFloat(formData.laborHours),
        laborRate: parseFloat(formData.laborRate),
        pallets: parseInt(formData.pallets),
        cases: parseInt(formData.cases),
        scrapCases: parseInt(formData.scrapCases || '0'),
      });

      // Reset form
      setFormData({
        ...formData,
        laborHours: '',
        laborRate: '',
        pallets: '',
        cases: '',
        scrapCases: '',
      });
      setShowForm(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const prepareChartData = () => {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      const dayEntries = entries.filter(e => e.date === date);
      const totalPallets = dayEntries.reduce((sum, e) => sum + e.pallets, 0);
      const totalCases = dayEntries.reduce((sum, e) => sum + e.cases, 0);
      const totalScrap = dayEntries.reduce((sum, e) => sum + e.scrapCases, 0);
      const scrapRate = totalCases > 0 ? (totalScrap / totalCases) * 100 : 0;

      last7Days.push({
        date: format(subDays(new Date(), i), 'MMM dd'),
        pallets: totalPallets,
        cases: totalCases,
        scrapRate: parseFloat(scrapRate.toFixed(2)),
      });
    }
    return last7Days;
  };

  if (loading) {
    return <div className="loading">Loading production data...</div>;
  }

  const chartData = prepareChartData();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="page-title">Production KPI Dashboard</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Entry'}
        </button>
      </div>

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
          <button className="btn btn-secondary" onClick={loadData}>
            Refresh
          </button>
        </div>
      </div>

      {/* Entry Form */}
      {showForm && (
        <div className="card">
          <h3 className="card-title">Add Production Entry</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="form-input"
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label>Shift *</label>
                <select
                  value={formData.shift}
                  onChange={(e) => setFormData({ ...formData, shift: e.target.value as Shift })}
                  className="form-select"
                  disabled={submitting}
                >
                  <option value="A">Shift A</option>
                  <option value="B">Shift B</option>
                </select>
              </div>
              <div className="form-group">
                <label>Line (1-6) *</label>
                <select
                  value={formData.lineNumber}
                  onChange={(e) => setFormData({ ...formData, lineNumber: parseInt(e.target.value) })}
                  className="form-select"
                  disabled={submitting}
                >
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>Line {n}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Labor Hours *</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.laborHours}
                  onChange={(e) => setFormData({ ...formData, laborHours: e.target.value })}
                  className="form-input"
                  placeholder="8.0"
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label>Labor Rate ($/hr) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.laborRate}
                  onChange={(e) => setFormData({ ...formData, laborRate: e.target.value })}
                  className="form-input"
                  placeholder="25.00"
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label>Pallets *</label>
                <input
                  type="number"
                  value={formData.pallets}
                  onChange={(e) => setFormData({ ...formData, pallets: e.target.value })}
                  className="form-input"
                  placeholder="100"
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label>Cases *</label>
                <input
                  type="number"
                  value={formData.cases}
                  onChange={(e) => setFormData({ ...formData, cases: e.target.value })}
                  className="form-input"
                  placeholder="1000"
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label>Scrap Cases</label>
                <input
                  type="number"
                  value={formData.scrapCases}
                  onChange={(e) => setFormData({ ...formData, scrapCases: e.target.value })}
                  className="form-input"
                  placeholder="0"
                  disabled={submitting}
                />
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <button type="submit" className="btn btn-success" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Summary Cards */}
      {kpi && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Total Labor Hours</div>
            <div className="kpi-value">{kpi.totalLaborHours.toFixed(1)}<span className="kpi-unit">hrs</span></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Labor Cost</div>
            <div className="kpi-value">${kpi.totalLaborCost.toLocaleString()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Pallets</div>
            <div className="kpi-value">{kpi.totalPallets.toLocaleString()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Cases</div>
            <div className="kpi-value">{kpi.totalCases.toLocaleString()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Scrap</div>
            <div className="kpi-value">{kpi.totalScrap.toLocaleString()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Scrap Rate</div>
            <div className="kpi-value" style={{ color: kpi.scrapRate > 5 ? '#e74c3c' : kpi.scrapRate > 2 ? '#f39c12' : '#27ae60' }}>
              {kpi.scrapRate.toFixed(2)}<span className="kpi-unit">%</span>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="card">
          <h3 className="card-title">7-Day Pallets Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#b0b0b0" />
              <YAxis stroke="#b0b0b0" />
              <Tooltip contentStyle={{ background: '#252525', border: '1px solid #444' }} />
              <Legend />
              <Line type="monotone" dataKey="pallets" stroke="#4a9eff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">7-Day Scrap Rate</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#b0b0b0" />
              <YAxis stroke="#b0b0b0" />
              <Tooltip contentStyle={{ background: '#252525', border: '1px solid #444' }} />
              <Legend />
              <Line type="monotone" dataKey="scrapRate" stroke="#e74c3c" strokeWidth={2} name="Scrap %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Line Breakdown */}
      {kpi && (
        <div className="card">
          <h3 className="card-title">Production by Line</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Labor Hours</th>
                <th>Labor Cost</th>
                <th>Pallets</th>
                <th>Cases</th>
                <th>Scrap</th>
                <th>Scrap Rate</th>
              </tr>
            </thead>
            <tbody>
              {kpi.lineBreakdown.map(line => (
                <tr key={line.lineNumber}>
                  <td><strong>Line {line.lineNumber}</strong></td>
                  <td>{line.laborHours.toFixed(1)} hrs</td>
                  <td>${line.laborCost.toLocaleString()}</td>
                  <td>{line.pallets.toLocaleString()}</td>
                  <td>{line.cases.toLocaleString()}</td>
                  <td>{line.scrap.toLocaleString()}</td>
                  <td style={{ color: line.scrapRate > 5 ? '#e74c3c' : line.scrapRate > 2 ? '#f39c12' : '#27ae60' }}>
                    {line.scrapRate.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProductionKPIPage;
