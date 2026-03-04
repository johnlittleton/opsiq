import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { GlassPanel } from '../components';
import { useAuth } from '../context/AuthContext';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import './ExecutiveAnalytics.css';

interface AnalyticsData {
  lineOutput: Array<{ line: number; totalCases: number; totalBags: number }>;
  deliveries: Array<{ date: string; inboundOutbound: string; count: number; totalPallets: number }>;
  driverPerformance: Array<{ name: string; loads: number; pallets: number; avgMinutes: number }>;
  laborCosts: Array<{ date: string; warehouseCost: number; productionCost: number; totalCost: number }>;
  palletsFlow: Array<{ date: string; received: number; shipped: number }>;
  appointmentStats: { total: number; withAppointment: number; walkIn: number };
}

const ExecutiveAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, userRole, logout } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Load analytics data
  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/api/executive/analytics?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`
      );
      if (!response.ok) throw new Error('Failed to load analytics');
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load executive analytics:', error);
      setAnalytics({
        lineOutput: [],
        deliveries: [],
        driverPerformance: [],
        laborCosts: [],
        palletsFlow: [],
        appointmentStats: { total: 0, withAppointment: 0, walkIn: 0 }
      });
    } finally {
      setLoading(false);
    }
  };

  const setToday = () => {
    const today = getLocalDateString(new Date());
    setDateRange({ startDate: today, endDate: today });
  };

  // Check if user is executive
  if (userRole !== 'executive') {
    return (
      <div className="executive-analytics" style={{ backgroundColor: '#1a1a2e' }}>
        <TitleBar showLegend={false} />
        <div className="analytics-container">
          <div className="loading" style={{ color: 'white', fontSize: '24px', textAlign: 'center', marginTop: '100px' }}>
            ⛔ Access Denied<br/>
            <span style={{ fontSize: '16px', color: '#94a3b8' }}>This analytics view is restricted to executive users.</span>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="executive-analytics" style={{ backgroundColor: '#1a1a2e' }}>
        <TitleBar showLegend={false} />
        <div className="analytics-container">
          <div className="loading">Loading analytics...</div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="executive-analytics" style={{ backgroundColor: '#1a1a2e' }}>
        <TitleBar showLegend={false} />
        <div className="analytics-container">
          <div className="error">Failed to load analytics</div>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const lineOutputData = analytics.lineOutput.map(item => ({
    name: `Line ${item.line}`,
    cases: item.totalCases,
    bags: item.totalBags
  }));

  // Combine deliveries by date
  const deliveriesMap: Record<string, { date: string; inbound: number; outbound: number }> = {};
  analytics.deliveries.forEach(d => {
    const dateKey = d.date;
    if (!deliveriesMap[dateKey]) {
      deliveriesMap[dateKey] = { date: dateKey, inbound: 0, outbound: 0 };
    }
    if (d.inboundOutbound === 'Inbound') {
      deliveriesMap[dateKey].inbound = d.count;
    } else {
      deliveriesMap[dateKey].outbound = d.count;
    }
  });
  const deliveriesData = Object.values(deliveriesMap).sort((a, b) => a.date.localeCompare(b.date));

  // Top 14 drivers for chart
  const driverData = analytics.driverPerformance.slice(0, 14).map((d, i) => ({
    name: d.name.split(' ')[0], // First name only for space
    loads: d.loads,
    pallets: d.pallets,
    rank: i + 1
  }));

  // Pie chart data for appointments
  const appointmentData = [
    { name: 'With Appointment', value: analytics.appointmentStats.withAppointment, color: '#10b981' },
    { name: 'Walk-In', value: analytics.appointmentStats.walkIn, color: '#f59e0b' }
  ];

  // Pallets flow chart data
  const palletsFlowData = analytics.palletsFlow.map(p => ({
    date: p.date,
    received: p.received,
    shipped: p.shipped
  }));

  // Labor cost chart data
  const laborCostData = analytics.laborCosts.map(l => ({
    date: l.date,
    Warehouse: Math.round(l.warehouseCost * 100) / 100,
    Production: Math.round(l.productionCost * 100) / 100,
    Total: Math.round(l.totalCost * 100) / 100
  }));

  return (
    <div className="executive-analytics" style={{ backgroundColor: '#1a1a2e', minHeight: '100vh' }}>
      <TitleBar showLegend={false} />
      
      <div className="analytics-container">
        <div className="analytics-header">
          <div>
            <h1>📊 Executive Analytics</h1>
            <p className="subtitle">Data Visualization & Trends • {executiveName}</p>
          </div>
          
          <div className="header-actions">
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
            <button className="back-btn" onClick={() => navigate('/executive')}>← Back</button>
            <button className="logout-btn" onClick={logout}>🔒 Logout</button>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="charts-grid">
          
          {/* Production Line Output */}
          <GlassPanel className="chart-panel line-output">
            <h3 className="chart-title">🏭 Production Line Output</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={lineOutputData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    fontSize: '11px'
                  }} 
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="cases" fill="#3b82f6" name="Cases" />
                <Bar dataKey="bags" fill="#10b981" name="Bags" />
              </BarChart>
            </ResponsiveContainer>
          </GlassPanel>

          {/* Inbound/Outbound Deliveries */}
          <GlassPanel className="chart-panel deliveries">
            <h3 className="chart-title">🚚 Inbound vs Outbound Deliveries</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={deliveriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    fontSize: '11px'
                  }} 
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="inbound" stroke="#10b981" strokeWidth={2} name="Inbound" />
                <Line type="monotone" dataKey="outbound" stroke="#3b82f6" strokeWidth={2} name="Outbound" />
              </LineChart>
            </ResponsiveContainer>
          </GlassPanel>

          {/* Forklift Driver Performance */}
          <GlassPanel className="chart-panel driver-performance">
            <h3 className="chart-title">🥇 Forklift Driver Performance</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={driverData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" stroke="#94a3b8" style={{ fontSize: '10px' }} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" style={{ fontSize: '9px' }} width={70} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    fontSize: '11px'
                  }} 
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="loads" fill="#fbbf24" name="Loads" />
                <Bar dataKey="pallets" fill="#3b82f6" name="Pallets" />
              </BarChart>
            </ResponsiveContainer>
          </GlassPanel>

          {/* Labor Costs Over Time */}
          <GlassPanel className="chart-panel labor-costs">
            <h3 className="chart-title">💰 Labor Costs by Department</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={laborCostData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    fontSize: '11px'
                  }}
                  formatter={(value: any) => `$${value.toFixed(2)}`}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="Warehouse" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="Production" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="Total" stroke="#8b5cf6" strokeWidth={3} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </GlassPanel>

          {/* Pallets Flow */}
          <GlassPanel className="chart-panel pallets-flow">
            <h3 className="chart-title">📦 Pallets Received vs Shipped</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={palletsFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    fontSize: '11px'
                  }} 
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="received" fill="#10b981" name="Received" />
                <Bar dataKey="shipped" fill="#3b82f6" name="Shipped" />
              </BarChart>
            </ResponsiveContainer>
          </GlassPanel>

          {/* Appointments vs Walk-ins */}
          <GlassPanel className="chart-panel appointments">
            <h3 className="chart-title">📋 Appointments vs Walk-Ins</h3>
            <div className="appointment-summary">
              <div className="summary-stat">
                <div className="stat-label">Total Trucks</div>
                <div className="stat-value">{analytics.appointmentStats.total}</div>
              </div>
              <div className="summary-stat">
                <div className="stat-label">With Appointment</div>
                <div className="stat-value green">{analytics.appointmentStats.withAppointment}</div>
              </div>
              <div className="summary-stat">
                <div className="stat-label">Walk-In</div>
                <div className="stat-value orange">{analytics.appointmentStats.walkIn}</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={appointmentData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {appointmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    fontSize: '11px'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </GlassPanel>

        </div>
      </div>
    </div>
  );
};

export default ExecutiveAnalytics;
