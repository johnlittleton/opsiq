import React, { useState, useEffect } from 'react';
import { TitleBar } from '../../components/layout/TitleBar';
import { GlassPanel, StatPanel } from '../components';
import { ExecutiveMetrics } from '../../shared/types';
import './ExecutiveDashboard.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ExecutiveDashboard: React.FC = () => {
  console.log('ExecutiveDashboard component rendering...');
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    console.log('ExecutiveDashboard useEffect triggered, loading metrics...');
    loadMetrics();
  }, [dateRange]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      console.log('Fetching executive metrics from:', `${API_BASE}/api/executive/metrics`);
      const response = await fetch(
        `${API_BASE}/api/executive/metrics?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error('Failed to load metrics');
      const data = await response.json();
      console.log('Executive metrics data:', data);
      setMetrics(data);
    } catch (error) {
      console.error('Failed to load executive metrics:', error);
      // Set empty metrics on error
      setMetrics({
        totalTrucksLoaded: 0,
        totalTrucksOffloaded: 0,
        totalPalletsLoaded: 0,
        totalPalletsOffloaded: 0,
        avgLoadTimeMinutes: 0,
        avgOffloadTimeMinutes: 0,
        avgPalletsPerTruck: 0,
        topOperators: [],
        totalDockTimeHours: 0,
        dockUtilization: 0,
        completedToday: 0,
        activeNow: 0,
        shippingReceivingLaborCostPerHour: 0,
        productionLaborCostPerHour: 0,
        totalShiftLaborCost: 0,
        currentHeadcount: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="executive-dashboard" style={{ backgroundColor: '#1a1a2e' }}>
        <TitleBar showLegend={false} />
        <div className="executive-dashboard__container">
          <div className="loading" style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            Loading executive dashboard...
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="executive-dashboard" style={{ backgroundColor: '#1a1a2e' }}>
        <TitleBar showLegend={false} />
        <div className="executive-dashboard__container">
          <div className="error" style={{ color: 'red', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            Failed to load metrics
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="executive-dashboard" style={{ backgroundColor: '#1a1a2e', minHeight: '100vh' }}>
      <TitleBar showLegend={false} />
      
      <div className="executive-dashboard__container">
        <div className="executive-dashboard__header">
          <div>
            <h1 style={{ color: 'white' }}>Executive Dashboard</h1>
            <p className="subtitle">Site Performance Overview</p>
          </div>
          
          <div className="date-selector">
            <div className="date-field">
              <label>Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              />
            </div>
            <div className="date-field">
              <label>End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Top-Level KPIs */}
        <div className="kpi-grid">
          <StatPanel
            title="Trucks Loaded"
            value={metrics.totalTrucksLoaded}
            subtitle={`${(metrics.totalPalletsLoaded || 0).toLocaleString()} pallets`}
            icon="truck"
          />
          <StatPanel
            title="Trucks Offloaded"
            value={metrics.totalTrucksOffloaded}
            subtitle={`${(metrics.totalPalletsOffloaded || 0).toLocaleString()} pallets`}
            icon="package"
          />
          <StatPanel
            title="Avg Load Time"
            value={`${metrics.avgLoadTimeMinutes} min`}
            subtitle="Per truck"
            icon="clock"
          />
          <StatPanel
            title="Avg Offload Time"
            value={`${metrics.avgOffloadTimeMinutes} min`}
            subtitle="Per truck"
            icon="clock"
          />
        </div>

        {/* Performance Summary */}
        <GlassPanel className="performance-summary">
          <h2>Performance Summary</h2>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="label">Total Dock Time</span>
              <span className="value">{metrics.totalDockTimeHours} hours</span>
            </div>
            <div className="summary-item">
              <span className="label">Avg Pallets/Truck</span>
              <span className="value">{metrics.avgPalletsPerTruck}</span>
            </div>
            <div className="summary-item">
              <span className="label">Completed</span>
              <span className="value">{metrics.completedToday}</span>
            </div>
            <div className="summary-item">
              <span className="label">Active Now</span>
              <span className="value highlight">{metrics.activeNow}</span>
            </div>
          </div>
        </GlassPanel>

        {/* Labor Cost Summary */}
        <GlassPanel className="labor-summary">
          <h2>Labor Cost Summary</h2>
          <div className="labor-grid">
            <div className="labor-card sr-card">
              <div className="labor-header">
                <h3>Shipping & Receiving</h3>
                <div className="icon">📦</div>
              </div>
              <div className="labor-value">${(metrics.shippingReceivingLaborCostPerHour || 0).toFixed(2)}/hr</div>
              <div className="labor-subtitle">Current hourly rate</div>
            </div>
            
            <div className="labor-card prod-card">
              <div className="labor-header">
                <h3>Production</h3>
                <div className="icon">🏭</div>
              </div>
              <div className="labor-value">${(metrics.productionLaborCostPerHour || 0).toFixed(2)}/hr</div>
              <div className="labor-subtitle">Current hourly rate</div>
            </div>
            
            <div className="labor-card total-card">
              <div className="labor-header">
                <h3>Total Shift Labor Cost</h3>
                <div className="icon">💰</div>
              </div>
              <div className="labor-value">${(metrics.totalShiftLaborCost || 0).toFixed(2)}</div>
              <div className="labor-subtitle">{metrics.currentHeadcount || 0} employees</div>
            </div>
          </div>
        </GlassPanel>

        {/* Top Performing Operators */}
        <GlassPanel className="operators-panel">
          <h2>Top Performing Forklift Operators</h2>
          
          {(metrics.topOperators?.length || 0) === 0 ? (
            <div className="empty-state">
              <p>No operator data available for selected period</p>
            </div>
          ) : (
            <div className="operators-table">
              <div className="table-header">
                <div className="col-rank">#</div>
                <div className="col-name">Operator</div>
                <div className="col-loads">Total Loads</div>
                <div className="col-pallets">Total Pallets</div>
                <div className="col-avg-time">Avg Time</div>
                <div className="col-avg-pallets">Avg Pallets</div>
              </div>
              
              {metrics.topOperators.map((operator, index) => (
                <div key={operator.operatorName} className={`table-row ${index < 3 ? 'top-three' : ''}`}>
                  <div className="col-rank">
                    {index === 0 && '🥇'}
                    {index === 1 && '🥈'}
                    {index === 2 && '🥉'}
                    {index > 2 && index + 1}
                  </div>
                  <div className="col-name">{operator.operatorName}</div>
                  <div className="col-loads">{operator.totalLoads}</div>
                  <div className="col-pallets">{operator.totalPallets.toLocaleString()}</div>
                  <div className="col-avg-time">{operator.avgTimeMinutes} min</div>
                  <div className="col-avg-pallets">{operator.avgPalletsPerLoad}</div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        {/* Pallets Overview */}
        <div className="pallets-grid">
          <GlassPanel className="pallets-card loaded">
            <div className="card-header">
              <h3>Pallets Loaded</h3>
              <div className="icon">📦</div>
            </div>
            <div className="card-value">{(metrics.totalPalletsLoaded || 0).toLocaleString()}</div>
            <div className="card-subtitle">
              {metrics.totalTrucksLoaded || 0} trucks • Avg {((metrics.totalPalletsLoaded || 0) / (metrics.totalTrucksLoaded || 1)).toFixed(1)} per truck
            </div>
          </GlassPanel>

          <GlassPanel className="pallets-card offloaded">
            <div className="card-header">
              <h3>Pallets Offloaded</h3>
              <div className="icon">📥</div>
            </div>
            <div className="card-value">{(metrics.totalPalletsOffloaded || 0).toLocaleString()}</div>
            <div className="card-subtitle">
              {metrics.totalTrucksOffloaded || 0} trucks • Avg {((metrics.totalPalletsOffloaded || 0) / (metrics.totalTrucksOffloaded || 1)).toFixed(1)} per truck
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
