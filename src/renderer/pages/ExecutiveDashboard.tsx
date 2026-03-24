import React, { useState, useEffect, useRef } from 'react';
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
  currentWarehouseLaborCost?: number;
  currentProductionLaborCost?: number;
  runningLaborCost: number;
}

interface DepartmentLaborRow {
  department: string;
  status: 'active' | 'ended' | 'not-started';
  activeHeadcount: number;
  runningLaborCost: number;
  completedLaborCost: number;
  totalLaborCost: number;
}

interface DepartmentLaborSummary {
  date: string;
  departments: DepartmentLaborRow[];
  totals: {
    activeHeadcount: number;
    runningLaborCost: number;
    totalLaborCost: number;
  };
}

interface DepartmentShiftSession {
  id: number;
  department: string;
  teamName?: string | null;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string | null;
}

const ExecutiveDashboard: React.FC = () => {
  console.log('ExecutiveDashboard component rendering...');
  const navigate = useNavigate();
  const { executiveName, userRole, logout } = useAuth();
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [departmentLaborSummary, setDepartmentLaborSummary] = useState<DepartmentLaborSummary | null>(null);
  const [departmentSessions, setDepartmentSessions] = useState<DepartmentShiftSession[]>([]);
  const [departmentLaborWarning, setDepartmentLaborWarning] = useState<string | null>(null);
  
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

  const [viewMode, setViewMode] = useState<'selected' | 'alltime'>('selected');

  // Refs so the 60s interval always reads the latest state without stale closures
  const viewModeRef = useRef<'selected' | 'alltime'>('selected');
  const dateRangeRef = useRef(dateRange);
  viewModeRef.current = viewMode;
  dateRangeRef.current = dateRange;

  // Load metrics
  useEffect(() => {
    console.log('ExecutiveDashboard useEffect triggered, loading metrics...');
    loadMetrics();
  }, [dateRange, viewMode]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      console.log('📅 Date Range Query:', { startDate: dateRange.startDate, endDate: dateRange.endDate });
      console.log('Fetching executive metrics from:', `${API_BASE}/api/executive/metrics`);
      const url = viewMode === 'alltime'
        ? `${API_BASE}/api/executive/metrics?allTime=true`
        : `${API_BASE}/api/executive/metrics?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
      const response = await fetch(url);
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
        topLineLeads: [],
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
        totalBagsCompleted: 0,
        casesCompletedYTD: 0,
        bagsCompletedYTD: 0,
        bestPerformingLine: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const setToday = () => {
    const today = getLocalDateString(new Date());
    setViewMode('selected');
    setDateRange({ startDate: today, endDate: today });
  };

  const setAllTime = () => {
    setViewMode('alltime');
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

  const fetchDepartmentLaborLive = async () => {
    try {
      const todayLocal = getLocalDateString(new Date());
      const response = await fetch(`${API_BASE}/api/labor/departments/live?date=${todayLocal}`);
      if (!response.ok) {
        setDepartmentLaborWarning('Combined labor tracker feed is not available on the current server deployment.');
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setDepartmentLaborWarning('Combined labor tracker feed is not deployed on the current server yet.');
        return;
      }

      const data = await response.json();
      setDepartmentLaborSummary(data);
      setDepartmentLaborWarning(null);
    } catch (error) {
      console.error('❌ Failed to fetch department labor summary:', error);
      setDepartmentLaborWarning('Failed to load the combined labor tracker feed.');
    }
  };

  const fetchDepartmentSessions = async () => {
    try {
      const todayLocal = getLocalDateString(new Date());
      const response = await fetch(`${API_BASE}/api/labor/departments/sessions?date=${todayLocal}`);
      if (!response.ok) {
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return;
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setDepartmentSessions(data);
      }
    } catch (error) {
      console.error('❌ Failed to fetch department sessions:', error);
    }
  };

  // Auto-update shift and refresh active labor metrics frequently for near real-time status.
  useEffect(() => {
    fetchCurrentShift();
    fetchDepartmentLaborLive();
    fetchDepartmentSessions();

    const interval = setInterval(() => {
      fetchCurrentShift();
      fetchDepartmentLaborLive();
      fetchDepartmentSessions();

      // Silently refresh activeNow — always live regardless of mode
      // Uses refs to read current viewMode/dateRange without stale closures
      (async () => {
        try {
          const vMode = viewModeRef.current;
          const dRange = dateRangeRef.current;
          const url = vMode === 'alltime'
            ? `${API_BASE}/api/executive/metrics?allTime=true`
            : `${API_BASE}/api/executive/metrics?startDate=${dRange.startDate}&endDate=${dRange.endDate}`;
          const resp = await fetch(url);
          if (!resp.ok) return;
          const data = await resp.json();
          setMetrics(prev => prev ? { ...prev, activeNow: data.activeNow } : prev);
        } catch {}
      })();
    }, 10000);

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

  const combinedRunningLaborCost = departmentLaborSummary?.totals?.runningLaborCost ?? currentShift?.runningLaborCost ?? 0;
  const combinedActiveHeadcount = departmentLaborSummary?.totals?.activeHeadcount
    ?? (currentShift ? currentShift.currentWarehouseHeadcount + currentShift.currentProductionHeadcount : 0);
  const activeDepartmentSessions = departmentSessions.filter((session) => session.status === 'active');
  const hasLiveDepartmentLabor = combinedActiveHeadcount > 0 || combinedRunningLaborCost > 0;
  const derivedTrackerStartTime = activeDepartmentSessions.length > 0
    ? activeDepartmentSessions
        .map((session) => new Date(session.startTime).getTime())
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)[0]
    : null;
  const derivedElapsedMinutes = (derivedTrackerStartTime
      ? Math.max(0, Math.floor((Date.now() - derivedTrackerStartTime) / 60000))
      : (currentShift?.elapsedMinutes ?? 0));
  const showShiftTrackerPanel = hasLiveDepartmentLabor;
  const trackerTitle = activeDepartmentSessions.length > 0 ? 'Department Tracker' : (currentShift?.shiftName || 'Department Tracker');
  const selectedRangeLaborTotal = Number(metrics.totalShiftLaborCost || 0);
  const laborCostYTD = Number(metrics.laborCostYTD || 0);
  const laborCostPreviousDay = Number(metrics.laborCostPreviousDay || 0);

  return (
    <div className="executive-dashboard" style={{ backgroundColor: '#1a1a2e', minHeight: '100vh' }}>
      <TitleBar showLegend={false} />
      
      <div className="executive-dashboard__container">
        <div className="executive-dashboard__header">
          <div>
            <h1 style={{ color: 'white' }}>Executive Dashboard</h1>
            <p className="subtitle">Site Performance Overview • Logged in as: {executiveName}</p>
            {departmentLaborWarning && (
              <p className="subtitle" style={{ color: '#f59e0b', marginTop: '6px' }}>
                {departmentLaborWarning}
              </p>
            )}
          </div>
          
          <div className="header-actions">
              <div className="date-selector">
              <div className="date-field">
                <label>Start Date</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => { setViewMode('selected'); setDateRange({ ...dateRange, startDate: e.target.value }); }}
                />
              </div>
              <div className="date-field">
                <label>End Date</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => { setViewMode('selected'); setDateRange({ ...dateRange, endDate: e.target.value }); }}
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
            <button
              className={`alltime-btn${viewMode === 'alltime' ? ' alltime-btn--active' : ''}`}
              onClick={setAllTime}
            >🌐 All Time</button>
            <button className="analytics-btn" onClick={() => navigate('/executive-analytics')}>📊 Analytics</button>
            <button className="costing-btn" onClick={() => navigate('/production-costing')}>💰 Production Costing</button>
            <button className="logout-btn" onClick={logout}>🔒 Logout</button>
          </div>
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
          <div className="performance-cards-row">
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
            <div className="top-operator-card top-line-leads-card">
              <div className="top-operator-header">
                <div className="top-operator-title">🏭 Line Lead Performance</div>
              </div>
              <div className="top-operator-list top-line-leads-list">
                {metrics.topLineLeads && metrics.topLineLeads.length > 0 ? (
                  metrics.topLineLeads.map((lead, index) => {
                    let medal = '';
                    if (index === 0) medal = '🥇';
                    else if (index === 1) medal = '🥈';
                    else if (index === 2) medal = '🥉';
                    else if (index === 3 || index === 4) medal = '👍';

                    return (
                      <div key={lead.leadName} className="operator-row">
                        <span className="operator-rank">#{index + 1}</span>
                        {medal && <span className="operator-medal">{medal}</span>}
                        <span className="operator-name-stats">
                          {lead.leadName} - {lead.totalCases.toLocaleString()} Cases • {lead.totalBags.toLocaleString()} Bags
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
        </div>

        {/* Active Shift Tracker - Live Updates Every Minute */}
        {showShiftTrackerPanel && (
          <GlassPanel className="shift-tracker-panel">
            <div className="shift-tracker-header">
              <div className="shift-tracker-title">
                <div className="shift-badge">
                  <div className="pulse-dot"></div>
                  <span className="shift-name">{trackerTitle}</span>
                  <span className="shift-status">ACTIVE</span>
                </div>
                <span className="shift-start">
                  Started {new Date(currentShift?.startTime || derivedTrackerStartTime || Date.now()).toLocaleTimeString()}
                </span>
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
                    {Math.floor(derivedElapsedMinutes / 60)}h {derivedElapsedMinutes % 60}m
                  </div>
                </div>
              </div>
              
              <div className="shift-metric labor-cost">
                <div className="metric-icon">💰</div>
                <div className="metric-content">
                  <div className="metric-label">Elapsed Labor Cost</div>
                  <div className="metric-value cost-value">
                    ${combinedRunningLaborCost.toFixed(2)}
                  </div>
                  <div className="metric-rate">
                    ${(combinedRunningLaborCost / (derivedElapsedMinutes || 1)).toFixed(2)}/min
                  </div>
                </div>
              </div>
              
              <div className="shift-metric workers">
                <div className="metric-icon">👥</div>
                <div className="metric-content">
                  <div className="metric-label">Active Workers</div>
                  <div className="metric-value">
                    {combinedActiveHeadcount}
                  </div>
                  <div className="metric-breakdown">
                    All tracked departments combined
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

        {/* Labor Cost Summary (restored bottom tiles) */}
        <GlassPanel className="labor-summary">
          <h2>Labor Cost Summary</h2>
          <div className="labor-grid">
            <div className="labor-card sr-card">
              <div className="labor-header">
                <h3>S&R Hourly</h3>
                <span className="icon">🏭</span>
              </div>
              <div className="labor-value">${Number(metrics.shippingReceivingLaborCostPerHour || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="labor-subtitle">Current hourly cost</div>
            </div>

            <div className="labor-card prod-card">
              <div className="labor-header">
                <h3>Production Hourly</h3>
                <span className="icon">⚙️</span>
              </div>
              <div className="labor-value">${Number(metrics.productionLaborCostPerHour || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="labor-subtitle">Current hourly cost</div>
            </div>

            <div className="labor-card total-card">
              <div className="labor-header">
                <h3>{viewMode === 'alltime' ? 'All-Time Labor Cost' : 'Selected Period'}</h3>
                <span className="icon">💵</span>
              </div>
              <div className="labor-value">${selectedRangeLaborTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="labor-subtitle">{viewMode === 'alltime' ? 'Cumulative labor total' : `${dateRange.startDate} to ${dateRange.endDate}`}</div>
            </div>

            <div className="labor-card previous-card">
              <div className="labor-header">
                <h3>Previous Day</h3>
                <span className="icon">📆</span>
              </div>
              <div className="labor-value">${laborCostPreviousDay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="labor-subtitle">Yesterday total labor</div>
            </div>

            <div className="labor-card ytd-card">
              <div className="labor-header">
                <h3>YTD Labor Cost</h3>
                <span className="icon">📈</span>
              </div>
              <div className="labor-value">${laborCostYTD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="labor-subtitle">Jan 1 to today</div>
            </div>
          </div>
        </GlassPanel>

      </div>
    </div>
  );
};

export default ExecutiveDashboard;
