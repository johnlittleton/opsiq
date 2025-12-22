import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { ShippingReceivingKPI } from '../../shared/types';
import { useAppStore } from '../store';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const STATUS_COLORS_CHART = {
  Open: '#27ae60',
  Offload: '#3498db',
  Loading: '#f39c12',
  Blocked: '#1a1a1a',
  Waiting: '#9b59b6',
  Parked: '#e74c3c',
};

const ShippingReceivingKPIPage: React.FC = () => {
  const { selectedDate } = useAppStore();
  const [kpi, setKpi] = useState<ShippingReceivingKPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getShippingReceivingKPI(selectedDate);
      setKpi(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading shipping/receiving data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!kpi) {
    return <div className="error">No data available</div>;
  }

  const statusData = Object.entries(kpi.statusCounts).map(([status, count]) => ({
    name: status,
    value: count,
  }));

  return (
    <div>
      <h1 className="page-title">Shipping & Receiving KPI</h1>

      {/* Main KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total Inbound</div>
          <div className="kpi-value">{kpi.totalInbound}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Outbound</div>
          <div className="kpi-value">{kpi.totalOutbound}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg Inbound Time</div>
          <div className="kpi-value">
            {kpi.avgInboundTimeMinutes.toFixed(0)}
            <span className="kpi-unit">min</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg Outbound Time</div>
          <div className="kpi-value">
            {kpi.avgOutboundTimeMinutes.toFixed(0)}
            <span className="kpi-unit">min</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Dock Utilization</div>
          <div className="kpi-value" style={{ 
            color: kpi.dockUtilizationPercent > 85 ? '#e74c3c' : kpi.dockUtilizationPercent > 70 ? '#f39c12' : '#27ae60' 
          }}>
            {kpi.dockUtilizationPercent.toFixed(1)}
            <span className="kpi-unit">%</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Doors Available</div>
          <div className="kpi-value" style={{ color: '#27ae60' }}>
            {kpi.statusCounts.Open}
          </div>
        </div>
      </div>

      {/* Status Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div className="card">
          <h3 className="card-title">Door Status Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STATUS_COLORS_CHART[entry.name as keyof typeof STATUS_COLORS_CHART]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#252525', border: '1px solid #444' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Status Summary</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(kpi.statusCounts).map(([status, count]) => (
                <tr key={status}>
                  <td>
                    <span className={`door-status status-${status}`}>
                      {status}
                    </span>
                  </td>
                  <td><strong>{count}</strong></td>
                  <td>{((count / 39) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3 className="card-title">Daily Summary for {selectedDate}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', padding: '20px 0' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#b0b0b0', marginBottom: '8px' }}>Total Movements</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4a9eff' }}>
              {kpi.totalInbound + kpi.totalOutbound}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#b0b0b0', marginBottom: '8px' }}>Waiting Queue</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#9b59b6' }}>
              {kpi.statusCounts.Waiting}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#b0b0b0', marginBottom: '8px' }}>Active Operations</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#3498db' }}>
              {kpi.statusCounts.Offload + kpi.statusCounts.Loading}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShippingReceivingKPIPage;
