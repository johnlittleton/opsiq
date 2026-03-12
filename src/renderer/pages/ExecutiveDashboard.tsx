import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { GlassPanel, StatPanel } from '../components';
import { ExecutiveMetrics } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import './ExecutiveDashboard.css';

interface CurrentShift {
  id: number;
  date: string;
  shiftNumber: number;
  shiftName: string;
  startTime: string;
  status: string;
  elapsedMinutes: number;
  currentWarehouseHeadcount: number;
  currentProductionHeadcount: number;
  runningLaborCost: number;
}

const ExecutiveDashboard: React.FC = () => {
  console.log('ExecutiveDashboard component rendering...');
  const navigate = useNavigate();
  const isMobileRuntime =
    typeof window !== 'undefined' &&
    (
      window.location.protocol === 'capacitor:' ||
      (window as any).Capacitor?.isNativePlatform?.() === true ||
      (window as any).Capacitor?.getPlatform?.() === 'ios' ||
      window.matchMedia('(max-width: 900px)').matches
    );
  const { executiveName, userRole, logout } = useAuth();
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  
  // Helper function to get local date string without timezone issues
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Default to past 30 days to show historical analytics data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(thirtyDaysAgo),
    endDate: getLocalDateString(new Date()),
  });

  // Load metrics
  useEffect(() => {
    console.log('ExecutiveDashboard useEffect triggered, loading metrics...');
    loadMetrics();
  }, [dateRange]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      console.log('📅 Date Range Query:', { startDate: dateRange.startDate, endDate: dateRange.endDate });
      console.log('Fetching executive metrics from:', `${API_BASE}/api/executive/metrics`);
      const response = await fetch(
        `${API_BASE}/api/executive/metrics?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error('Failed to load metrics');
      const data = await response.json();
      console.log('Executive metrics data:', data);
      console.log('🥇 Top Operators received:', data.topOperators);
      if (data.topOperators && data.topOperators.length > 0) {
        console.log('🥇 #1 Top Operator:', data.topOperators[0]);
      } else {
        console.log('⚠️ No top operators in response');
      }
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
        laborCostYTD: 0,
        laborCostPreviousDay: 0,
        currentHeadcount: 0,
        warehouseHeadcount: 0,
        productionHeadcount: 0,
        totalCasesCompleted: 0,
        casesCompletedYTD: 0,
        bestPerformingLine: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const setToday = () => {
    const today = getLocalDateString(new Date());
    setDateRange({ startDate: today, endDate: today });
  };

  // Load current active shift
  const fetchCurrentShift = async () => {
    try {
      console.log('🔄 Fetching current shift from:', `${API_BASE}/api/labor/shift/current`);
      const response = await fetch(`${API_BASE}/api/labor/shift/current`);
      console.log('Shift response status:', response.status);
      if (!response.ok) {
        console.log('⚠️ No active shift found (status not ok)');
        setCurrentShift(null);
        return;
      }
      const data = await response.json();
      console.log('✅ Active shift data:', data);
      
      // Only update state if data actually changed (prevents unnecessary re-renders)
      setCurrentShift(prevShift => {
        if (!prevShift || 
            prevShift.id !== data.id || 
            prevShift.elapsedMinutes !== data.elapsedMinutes ||
            prevShift.runningLaborCost !== data.runningLaborCost) {
          return data;
        }
        return prevShift;
      });
    } catch (error) {
      console.error('❌ Failed to fetch current shift:', error);
      setCurrentShift(null);
    }
  };

  // Auto-update shift every minute (without reloading all metrics)
  useEffect(() => {
    // Initial fetch for shift only (metrics already loaded by dateRange useEffect)
    fetchCurrentShift();
    
    // Set up interval to update shift only every 60 seconds
    const interval = setInterval(() => {
      fetchCurrentShift(); // Only update shift, not metrics
    }, 60000);
    
    // Cleanup
    return () => clearInterval(interval);
  }, []);

  // Check if user is executive
  if (userRole !== 'executive') {
    return (
      <div className="executive-dashboard" style={{ backgroundColor: '#1a1a2e' }}>
        <TitleBar showLegend={false} />
        <div className="executive-dashboard__container">
          <div style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            ⛔ Access Denied<br/>
            <span style={{ fontSize: '16px', color: '#94a3b8' }}>This dashboard is restricted to executive users.</span>
          </div>
        </div>
      </div>
    );
  }

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
            <p className="subtitle">Site Performance Overview • Logged in as: {executiveName}</p>
          </div>
          
          <div className="header-actions header-actions--desktop">
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
            <button className="print-page-btn" onClick={() => {
              if (window.electron?.printPage) {
                window.electron.printPage();
              } else {
                window.print();
              }
            }}>🖨️ Print</button>
            <button className="today-btn" onClick={setToday}>📅 Today</button>
            <button className="analytics-btn" onClick={() => navigate('/executive-analytics')}>📊 Analytics</button>
            <button className="costing-btn" onClick={() => navigate('/production-costing')}>💰 Production Costing</button>
            <button className="costing-btn" onClick={() => navigate('/shipping')}>📦 Shipping KPI</button>
            <button className="logout-btn" onClick={logout}>🔒 Logout</button>
          </div>

          {isMobileRuntime && (
            <div className="header-actions-mobile">
              <div className="date-selector date-selector-mobile">
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
              <div className="mobile-action-row">
                <button className="today-btn" onClick={setToday}>📅 Today</button>
                <button className="analytics-btn" onClick={() => navigate('/executive-analytics')}>📊 Analytics</button>
              </div>
              <div className="mobile-action-row">
                <button className="costing-btn" onClick={() => navigate('/production-costing')}>💰 Costing</button>
                <button className="costing-btn" onClick={() => navigate('/shipping')}>📦 Shipping</button>
                <button className="logout-btn" onClick={logout}>🔒 Logout</button>
              </div>
            </div>
          )}
        </div>

        {/* Top-Level KPIs */}
        <div className="kpi-grid">
          <StatPanel
            title="Trucks Loaded"
            value={metrics.totalTrucksLoaded}
            subtitle={`${(metrics.totalPalletsLoaded || 0).toLocaleString()} pallets`}
            icon="truck"
            compact
          />
          <StatPanel
            title="Trucks Offloaded"
            value={metrics.totalTrucksOffloaded}
            subtitle={`${(metrics.totalPalletsOffloaded || 0).toLocaleString()} pallets`}
            icon="package"
            compact
          />
          <StatPanel
            title="Avg Load Time"
            value={`${metrics.avgLoadTimeMinutes} min`}
            subtitle="Per truck"
            icon="clock"
            compact
          />
          <StatPanel
            title="Avg Offload Time"
            value={`${metrics.avgOffloadTimeMinutes} min`}
            subtitle="Per truck"
            icon="clock"
            compact
          />
          <StatPanel
            title="Cases Completed"
            value={(metrics.totalCasesCompleted || 0).toLocaleString()}
            subtitle={`${(metrics.totalBagsCompleted || 0).toLocaleString()} bags • Selected period`}
            icon="📦"
            variant="green"
            compact
          />
          <StatPanel
            title="Cases YTD"
            value={(metrics.casesCompletedYTD || 0).toLocaleString()}
            subtitle={`${(metrics.bagsCompletedYTD || 0).toLocaleString()} bags • Jan 1 - Today`}
            icon="📈"
            variant="blue"
            compact
          />
          <StatPanel
            title="Best Line"
            value={metrics.bestPerformingLine ? `Line ${metrics.bestPerformingLine.lineNumber}` : 'N/A'}
            subtitle={metrics.bestPerformingLine ? `${metrics.bestPerformingLine.totalCases.toLocaleString()} cases YTD` : 'No data'}
            icon="🏆"
            variant="yellow"
            compact
          />
          <StatPanel
            title="Pallets Loaded"
            value={(metrics.totalPalletsLoaded || 0).toLocaleString()}
            subtitle={`${metrics.totalTrucksLoaded || 0} trucks • Avg ${((metrics.totalPalletsLoaded || 0) / (metrics.totalTrucksLoaded || 1)).toFixed(1)} per truck`}
            icon="📦"
            compact
          />
          <StatPanel
            title="Pallets Offloaded"
            value={(metrics.totalPalletsOffloaded || 0).toLocaleString()}
            subtitle={`${metrics.totalTrucksOffloaded || 0} trucks • Avg ${((metrics.totalPalletsOffloaded || 0) / (metrics.totalTrucksOffloaded || 1)).toFixed(1)} per truck`}
            icon="📥"
            compact
          />
          {/* Top Operators Card - Wide */}
          <div className="top-operator-card">
            <div className="top-operator-header">
              <div className="top-operator-title">🏆 Top Operators</div>
            </div>
            <div className="top-operator-list">
              {metrics.topOperators && metrics.topOperators.length > 0 ? (
                metrics.topOperators.map((operator, index) => {
                  let medal = '';
                  if (index === 0) medal = '🥇';
                  else if (index === 1) medal = '🥈';
                  else if (index === 2) medal = '🥉';
                  else if (index === 3 || index === 4) medal = '👍';
                  
                  return (
                    <div key={operator.operatorName} className="operator-row">
                      <span className="operator-rank">#{index + 1}</span>
                      {medal && <span className="operator-medal">{medal}</span>}
                      <span className="operator-name-stats">
                        {operator.operatorName} - {operator.totalLoads} Load{operator.totalLoads !== 1 ? 's' : ''} • {operator.totalPallets} Pallet{operator.totalPallets !== 1 ? 's' : ''}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="no-data-small">No data</div>
              )}
            </div>
          </div>
        </div>

        {/* Active Shift Tracker - Live Updates Every Minute */}
        {currentShift && (
          <GlassPanel className="shift-tracker-panel">
            <div className="shift-tracker-header">
              <div className="shift-tracker-title">
                <div className="shift-badge">
                  <div className="pulse-dot"></div>
                  <span className="shift-name">{currentShift.shiftName}</span>
                  <span className="shift-status">ACTIVE</span>
                </div>
                <span className="shift-start">Started {new Date(currentShift.startTime).toLocaleTimeString()}</span>
              </div>
              <div className="auto-update-indicator">
                <span className="update-icon">🔄</span>
                <span className="update-text">Live updates</span>
              </div>
            </div>
            
            <div className="shift-tracker-metrics">
              <div className="shift-metric elapsed-time">
                <div className="metric-icon">⏱️</div>
                <div className="metric-content">
                  <div className="metric-label">Elapsed Time</div>
                  <div className="metric-value">
                    {Math.floor(currentShift.elapsedMinutes / 60)}h {currentShift.elapsedMinutes % 60}m
                  </div>
                </div>
              </div>
              
              <div className="shift-metric labor-cost">
                <div className="metric-icon">💰</div>
                <div className="metric-content">
                  <div className="metric-label">Running Labor Cost</div>
                  <div className="metric-value cost-value">
                    ${currentShift.runningLaborCost.toFixed(2)}
                  </div>
                  <div className="metric-rate">
                    ${(currentShift.runningLaborCost / (currentShift.elapsedMinutes || 1)).toFixed(2)}/min
                  </div>
                </div>
              </div>
              
              <div className="shift-metric workers">
                <div className="metric-icon">👥</div>
                <div className="metric-content">
                  <div className="metric-label">Active Workers</div>
                  <div className="metric-value">
                    {currentShift.currentWarehouseHeadcount + currentShift.currentProductionHeadcount}
                  </div>
                  <div className="metric-breakdown">
                    Warehouse: {currentShift.currentWarehouseHeadcount} • Production: {currentShift.currentProductionHeadcount}
                  </div>
                </div>
              </div>
            </div>
          </GlassPanel>
        )}

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
                <h3>Warehouse</h3>
                <div className="icon">📦</div>
              </div>
              <div className="labor-value">${(metrics.shippingReceivingLaborCostPerHour || 0).toFixed(2)}/hr</div>
              <div className="labor-subtitle">{metrics.warehouseHeadcount || 0} employees</div>
            </div>
            
            <div className="labor-card prod-card">
              <div className="labor-header">
                <h3>Production</h3>
                <div className="icon">🏭</div>
              </div>
              <div className="labor-value">${(metrics.productionLaborCostPerHour || 0).toFixed(2)}/hr</div>
              <div className="labor-subtitle">{metrics.productionHeadcount || 0} employees</div>
            </div>
            
            <div className="labor-card total-card">
              <div className="labor-header">
                <h3>Total Shift Labor Cost</h3>
                <div className="icon">💰</div>
              </div>
              <div className="labor-value">${(currentShift?.runningLaborCost ?? metrics.totalShiftLaborCost ?? 0).toFixed(2)}</div>
              <div className="labor-subtitle">{metrics.currentHeadcount || 0} employees</div>
            </div>

            <div className="labor-card ytd-card">
              <div className="labor-header">
                <h3>Labor Cost YTD</h3>
                <div className="icon">📅</div>
              </div>
              <div className="labor-value">${(metrics.laborCostYTD || 0).toFixed(2)}</div>
              <div className="labor-subtitle">Jan 1 - Today</div>
            </div>

            <div className="labor-card previous-card">
              <div className="labor-header">
                <h3>Labor Cost Previous Day</h3>
                <div className="icon">🗓️</div>
              </div>
              <div className="labor-value">${(metrics.laborCostPreviousDay || 0).toFixed(2)}</div>
              <div className="labor-subtitle">Yesterday</div>
            </div>
          </div>
        </GlassPanel>


      </div>
    </div>
  );
};

export default ExecutiveDashboard;
