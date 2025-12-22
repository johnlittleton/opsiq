import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAppStore } from './store';
import LiveDockBoard from './pages/LiveDockBoard';
import DriverCheckIn from './pages/DriverCheckIn';
import DockHistory from './pages/DockHistory';
import ProductionKPI from './pages/ProductionKPI';
import ShippingReceivingKPI from './pages/ShippingReceivingKPI';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import Settings from './pages/Settings';
import './App.css';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { selectedDate, selectedShift, setSelectedDate, setSelectedShift } = useAppStore();

  const navItems = [
    { path: '/dockboard', icon: '📋', label: 'Live Dock Board' },
    { path: '/checkin', icon: '✅', label: 'Driver Check-In' },
    { path: '/history', icon: '📜', label: 'Dock History' },
    { path: '/production', icon: '🏭', label: 'Production KPI' },
    { path: '/shipping', icon: '📦', label: 'Shipping/Receiving' },
    { path: '/executive', icon: '📊', label: 'Executive Dashboard' },
    { path: '/settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>OpsIQ</h1>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div className="header-filters">
            <div className="filter-group">
              <label>Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="date-input"
              />
            </div>
            <div className="filter-group">
              <label>Shift:</label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as any)}
                className="shift-select"
              >
                <option value="All">All Shifts</option>
                <option value="A">Shift A</option>
                <option value="B">Shift B</option>
              </select>
            </div>
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const initializeSync = useAppStore(state => state.initializeSync);

  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<LiveDockBoard />} />
          <Route path="/dockboard" element={<LiveDockBoard />} />
          <Route path="/checkin" element={<DriverCheckIn />} />
          <Route path="/history" element={<DockHistory />} />
          <Route path="/production" element={<ProductionKPI />} />
          <Route path="/shipping" element={<ShippingReceivingKPI />} />
          <Route path="/executive" element={<ExecutiveDashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
