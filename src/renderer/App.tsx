import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAppStore } from './store';
import { 
  LayoutGrid, 
  UserCheck, 
  History, 
  Factory, 
  Package, 
  BarChart3, 
  Settings as SettingsIcon,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import LiveDockBoard from './pages/LiveDockBoard';
import DriverCheckIn from './pages/DriverCheckIn';
import DockHistory from './pages/DockHistory';
import ProductionKPI from './pages/ProductionKPI';
import ShippingReceivingKPI from './pages/ShippingReceivingKPI';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import Settings from './pages/Settings';
import { clsx } from 'clsx';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { selectedDate, selectedShift, setSelectedDate, setSelectedShift } = useAppStore();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const navItems = [
    { path: '/dockboard', icon: LayoutGrid, label: 'Live Dock Board' },
    { path: '/checkin', icon: UserCheck, label: 'Driver Check-In' },
    { path: '/history', icon: History, label: 'Dock History' },
    { path: '/production', icon: Factory, label: 'Production KPI' },
    { path: '/shipping', icon: Package, label: 'Shipping/Receiving' },
    { path: '/executive', icon: BarChart3, label: 'Executive Dashboard' },
    { path: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Glass Sidebar */}
      <aside
        className={clsx(
          'glass-strong flex flex-col border-r border-panel-border transition-all duration-300',
          sidebarExpanded ? 'w-60' : 'w-16'
        )}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        {/* Logo/Header */}
        <div className="flex items-center h-14 px-4 border-b border-panel-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-accent-blue to-accent-blue-hover flex items-center justify-center text-white font-bold text-sm">
              OQ
            </div>
            {sidebarExpanded && (
              <span className="text-lg font-bold tracking-tight whitespace-nowrap">OpsIQ</span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 mx-2 rounded-sm transition-all duration-150',
                  'hover:bg-panel-hover',
                  isActive && 'bg-accent-blue/10 border-l-2 border-accent-blue shadow-glow-blue'
                )}
              >
                <Icon
                  size={18}
                  className={clsx(
                    'flex-shrink-0',
                    isActive ? 'text-accent-blue' : 'text-text-muted'
                  )}
                />
                {sidebarExpanded && (
                  <span
                    className={clsx(
                      'text-sm font-medium whitespace-nowrap',
                      isActive ? 'text-accent-blue' : 'text-text-DEFAULT'
                    )}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header with Filters */}
        <header className="glass flex items-center justify-between h-14 px-6 border-b border-panel-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-text-muted" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-background-tertiary border border-panel-border rounded-sm px-3 py-1.5 text-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-text-muted font-medium">Shift:</span>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as any)}
                className="bg-background-tertiary border border-panel-border rounded-sm px-3 py-1.5 text-sm text-text-DEFAULT focus:outline-none focus:border-accent-blue focus:shadow-glow-blue transition-all"
              >
                <option value="All">All Shifts</option>
                <option value="A">Shift A</option>
                <option value="B">Shift B</option>
              </select>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
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
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
