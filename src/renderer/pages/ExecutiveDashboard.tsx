import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { ProductionKPI, ShippingReceivingKPI } from '../../shared/types';
import { useAppStore } from '../store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ExecutiveDashboard: React.FC = () => {
  const { selectedDate } = useAppStore();
  const [productionKPI, setProductionKPI] = useState<ProductionKPI | null>(null);
  const [shippingKPI, setShippingKPI] = useState<ShippingReceivingKPI | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodData, shipData] = await Promise.all([
        apiClient.getProductionKPI(selectedDate, selectedDate),
        apiClient.getShippingReceivingKPI(selectedDate),
      ]);
      setProductionKPI(prodData);
      setShippingKPI(shipData);
    } catch (error) {
      console.error('Failed to load executive data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading executive dashboard...</div>;
  }

  const lineChartData = productionKPI?.lineBreakdown.map(line => ({
    name: `Line ${line.lineNumber}`,
    pallets: line.pallets,
    cases: line.cases,
    laborCost: line.laborCost,
  })) || [];

  const statusChartData = shippingKPI ? Object.entries(shippingKPI.statusCounts).map(([status, count]) => ({
    status,
    count,
  })) : [];

  return (
    <div>
      <h1 className="page-title">Executive Dashboard</h1>
      <p style={{ color: '#b0b0b0', marginBottom: '24px' }}>
        Comprehensive operational overview for {selectedDate}
      </p>

      {/* Top-Level Metrics */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <div className="kpi-label">Total Pallets</div>
          <div className="kpi-value">{productionKPI?.totalPallets.toLocaleString() || 0}</div>
        </div>
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
          <div className="kpi-label">Total Cases</div>
          <div className="kpi-value">{productionKPI?.totalCases.toLocaleString() || 0}</div>
        </div>
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
          <div className="kpi-label">Labor Cost</div>
          <div className="kpi-value">${productionKPI?.totalLaborCost.toLocaleString() || 0}</div>
        </div>
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
          <div className="kpi-label">Dock Utilization</div>
          <div className="kpi-value">{shippingKPI?.dockUtilizationPercent.toFixed(1) || 0}%</div>
        </div>
      </div>

      {/* Production Overview */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="card-title">Production Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <h4 style={{ color: '#b0b0b0', fontSize: '14px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Key Metrics
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#2a2a2a', borderRadius: '4px' }}>
                <span>Total Labor Hours</span>
                <strong>{productionKPI?.totalLaborHours.toFixed(1) || 0} hrs</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#2a2a2a', borderRadius: '4px' }}>
                <span>Scrap Rate</span>
                <strong style={{ color: (productionKPI?.scrapRate || 0) > 5 ? '#e74c3c' : '#27ae60' }}>
                  {productionKPI?.scrapRate.toFixed(2) || 0}%
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#2a2a2a', borderRadius: '4px' }}>
                <span>Active Lines</span>
                <strong>{productionKPI?.lineBreakdown.length || 0}</strong>
              </div>
            </div>
          </div>
          <div>
            <h4 style={{ color: '#b0b0b0', fontSize: '14px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Output by Line
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#b0b0b0" />
                <YAxis stroke="#b0b0b0" />
                <Tooltip contentStyle={{ background: '#252525', border: '1px solid #444' }} />
                <Bar dataKey="pallets" fill="#4a9eff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Shipping & Receiving Overview */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="card-title">Shipping & Receiving Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <h4 style={{ color: '#b0b0b0', fontSize: '14px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Movement Summary
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#2a2a2a', borderRadius: '4px' }}>
                <span>Total Inbound</span>
                <strong style={{ color: '#3498db' }}>{shippingKPI?.totalInbound || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#2a2a2a', borderRadius: '4px' }}>
                <span>Total Outbound</span>
                <strong style={{ color: '#f39c12' }}>{shippingKPI?.totalOutbound || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#2a2a2a', borderRadius: '4px' }}>
                <span>Avg Turnaround</span>
                <strong>{((shippingKPI?.avgInboundTimeMinutes || 0) + (shippingKPI?.avgOutboundTimeMinutes || 0)) / 2 | 0} min</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#2a2a2a', borderRadius: '4px' }}>
                <span>Waiting Queue</span>
                <strong style={{ color: shippingKPI && shippingKPI.statusCounts.Waiting > 5 ? '#e74c3c' : '#27ae60' }}>
                  {shippingKPI?.statusCounts.Waiting || 0}
                </strong>
              </div>
            </div>
          </div>
          <div>
            <h4 style={{ color: '#b0b0b0', fontSize: '14px', marginBottom: '16px', textTransform: 'uppercase' }}>
              Door Status Distribution
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#b0b0b0" />
                <YAxis dataKey="status" type="category" stroke="#b0b0b0" />
                <Tooltip contentStyle={{ background: '#252525', border: '1px solid #444' }} />
                <Bar dataKey="count" fill="#4a9eff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Health Score (calculated) */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 className="card-title">Overall Operational Health</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#27ae60', marginBottom: '8px' }}>
              {(100 - (shippingKPI?.dockUtilizationPercent || 0)).toFixed(0)}
            </div>
            <div style={{ color: '#b0b0b0', fontSize: '14px' }}>Capacity Available %</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: productionKPI && productionKPI.scrapRate < 3 ? '#27ae60' : '#e74c3c', marginBottom: '8px' }}>
              {productionKPI ? (100 - productionKPI.scrapRate).toFixed(0) : 100}
            </div>
            <div style={{ color: '#b0b0b0', fontSize: '14px' }}>Quality Score</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#4a9eff', marginBottom: '8px' }}>
              {shippingKPI ? (shippingKPI.totalInbound + shippingKPI.totalOutbound) : 0}
            </div>
            <div style={{ color: '#b0b0b0', fontSize: '14px' }}>Total Movements</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#f39c12', marginBottom: '8px' }}>
              {productionKPI?.totalPallets || 0}
            </div>
            <div style={{ color: '#b0b0b0', fontSize: '14px' }}>Pallets Produced</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
