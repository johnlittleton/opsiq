import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from './store';
import { AuthProvider, useAuth } from './context/AuthContext';
import PinEntry from './components/PinEntry';
import { HomePage } from '../pages/HomePage';
import { DockBoardPage } from '../pages/DockBoardPage';
import LiveDockBoard from './pages/LiveDockBoard';
import DriverCheckIn from './pages/DriverCheckIn';
import DockHistory from './pages/DockHistory';
import CheckInHistory from './pages/CheckInHistory';
import AppointmentHistory from './pages/AppointmentHistory';
import ActiveDrivers from './pages/ActiveDrivers';
import Scheduler from './pages/Scheduler';
import ProductionKPI from './pages/ProductionKPI';
import ProductionKPIHistory from './pages/ProductionKPIHistory';
import ShippingReceivingKPI from './pages/ShippingReceivingKPI';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import ExecutiveAnalytics from './pages/ExecutiveAnalytics';
import ProductionCosting from './pages/ProductionCosting';
import Settings from './pages/Settings';
import LaborTracker from './pages/LaborTracker';
import LaborHistory from './pages/LaborHistory';
import LaborKiosk from './pages/LaborKiosk';
import LaborKioskAdmin from './pages/LaborKioskAdmin';
import LaborKioskHistory from './pages/LaborKioskHistory';
import ProductionLaborPlanner from './pages/ProductionLaborPlanner';
import ProductionLaborPlannerHistory from './pages/ProductionLaborPlannerHistory';
import ProductionScheduler from './pages/ProductionScheduler';
import ProductionDashboard from './pages/ProductionDashboard';
import WorkOrderHistory from './pages/WorkOrderHistory';
import DowntimeHistory from './pages/DowntimeHistory';
import PalletTracker from './pages/PalletTracker';
import StorageBilling from './pages/StorageBilling';
import { isNativeIOSRuntime } from './utils/runtime';

type UpdaterStatus = {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
};

// Public routes that don't require authentication (display dashboards for TVs/monitors)
const PUBLIC_ROUTES = [
  '/production-dashboard',
  '/dashboard',
  '/dockboard-old',
  '/production',
  '/shipping',
  '/labor-kiosk',
  '/labor-kiosk-admin'
];

const MOBILE_ALLOWED_ROUTES = [
  '/',
  '/home',
  '/dockboard',
  '/scheduler',
  '/production-dashboard',
  '/dashboard',
  '/executive',
  '/labor-kiosk',
  '/labor-kiosk-admin',
  '/labor-kiosk-history'
];

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const isNativeShell = isNativeIOSRuntime();

  const handlePinSuccess = (name: string, role: string, sessionToken: string) => {
    login(name, role, sessionToken);
  };

  // Show PIN entry only for protected routes when not authenticated
  if (!isAuthenticated && !isPublicRoute) {
    return <PinEntry onSuccess={handlePinSuccess} />;
  }

  if (isAuthenticated && isNativeShell && !MOBILE_ALLOWED_ROUTES.includes(location.pathname)) {
    return <Navigate to="/home" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/dockboard" element={<DockBoardPage />} />
      <Route path="/dockboard-old" element={<LiveDockBoard />} />
      <Route path="/checkin" element={<DriverCheckIn />} />
      <Route path="/active-drivers" element={<ActiveDrivers />} />
      <Route path="/scheduler" element={<Scheduler />} />
      <Route path="/history" element={<DockHistory />} />
      <Route path="/checkin-history" element={<CheckInHistory />} />
      <Route path="/appointment-history" element={<AppointmentHistory />} />
      <Route path="/production" element={<ProductionKPI />} />
      <Route path="/production-kpi-history" element={<ProductionKPIHistory />} />
      <Route path="/shipping" element={<ShippingReceivingKPI />} />
      <Route path="/executive" element={<ExecutiveDashboard />} />
      <Route path="/executive-analytics" element={<ExecutiveAnalytics />} />
      <Route path="/production-costing" element={<ProductionCosting />} />
      <Route path="/labor-tracker" element={<LaborTracker />} />
      <Route path="/labor-history" element={<LaborHistory />} />
      <Route path="/labor-kiosk" element={<LaborKiosk />} />
      <Route path="/labor-kiosk-admin" element={<LaborKioskAdmin />} />
      <Route path="/labor-kiosk-history" element={<LaborKioskHistory />} />
      <Route path="/production-labor-planner" element={<ProductionLaborPlanner />} />
      <Route path="/production-labor-planner-history" element={<ProductionLaborPlannerHistory />} />
      <Route path="/production-scheduler" element={<ProductionScheduler />} />
      <Route path="/production-dashboard" element={<ProductionDashboard />} />
      <Route path="/dashboard" element={<ProductionDashboard />} />
      <Route path="/pallet-tracker" element={<PalletTracker />} />
      <Route path="/work-order-history" element={<WorkOrderHistory />} />
      <Route path="/downtime-history" element={<DowntimeHistory />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/storage-billing" element={<StorageBilling />} />
    </Routes>
  );
};

const MobileHamburgerMenu: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const isNativeShell = isNativeIOSRuntime();

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated || !isNativeShell) {
    return null;
  }

  const navLinks = [
    { label: 'Home', path: '/home' },
    { label: 'Dock Dashboard', path: '/dockboard' },
    { label: 'Scheduler', path: '/scheduler' },
    { label: 'Production Dashboard', path: '/production-dashboard' },
    { label: 'Executive Dashboard', path: '/executive' },
    { label: 'Labor Kiosk', path: '/labor-kiosk' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <>
      <button
        className="mobile-hamburger-trigger"
        onClick={() => setIsOpen((current) => !current)}
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <span />
        <span />
        <span />
      </button>

      {isOpen && <button className="mobile-hamburger-backdrop" onClick={() => setIsOpen(false)} aria-label="Close menu" />}

      <aside className={`mobile-hamburger-panel ${isOpen ? 'open' : ''}`}>
        {navLinks.map((link) => (
          <button
            key={link.path}
            className="mobile-hamburger-item"
            onClick={() => {
              navigate(link.path);
              setIsOpen(false);
            }}
          >
            {link.label}
          </button>
        ))}
        <button className="mobile-hamburger-item danger" onClick={handleLogout}>Logout</button>
      </aside>
    </>
  );
};

const AppContent: React.FC = () => {
  const initializeSync = useAppStore(state => state.initializeSync);
  const [updaterStatus, setUpdaterStatus] = React.useState<UpdaterStatus | null>(null);
  const isNativeShell = isNativeIOSRuntime();

  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdaterStatus) return;

    const unsubscribe = window.electronAPI.onUpdaterStatus((status) => {
      setUpdaterStatus(status);

      if (status.state === 'not-available') {
        setTimeout(() => {
          setUpdaterStatus((current) => (current?.state === 'not-available' ? null : current));
        }, 2500);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (isNativeShell) {
      document.body.classList.add('platform-capacitor');
      document.body.classList.add('ios-mobile');
      return () => {
        document.body.classList.remove('platform-capacitor');
        document.body.classList.remove('ios-mobile');
      };
    }

    document.body.classList.remove('platform-capacitor');
    document.body.classList.remove('ios-mobile');
    return undefined;
  }, [isNativeShell]);

  const shouldShowBanner = updaterStatus && updaterStatus.state !== 'not-available';

  const bannerMessage = (() => {
    if (!updaterStatus) return '';
    if (updaterStatus.state === 'checking') return 'Checking for app updates...';
    if (updaterStatus.state === 'available') return `Update ${updaterStatus.version || ''} found. Downloading now...`.trim();
    if (updaterStatus.state === 'downloading') return `Downloading update... ${Math.round(updaterStatus.percent || 0)}%`;
    if (updaterStatus.state === 'downloaded') return `Update ${updaterStatus.version || ''} ready. Restart app to apply.`.trim();
    if (updaterStatus.state === 'error') return updaterStatus.message || 'Update check failed. Please try again later.';
    return '';
  })();

  return (
    <div className={isNativeShell ? 'app-shell app-shell--native' : 'app-shell'}>
      {shouldShowBanner && (
        <div className={`update-banner update-banner-${updaterStatus.state}`}>
          <span>{bannerMessage}</span>
          <div className="update-banner-actions">
            {updaterStatus.state === 'downloaded' && (
              <button
                className="update-banner-btn"
                onClick={() => window.electronAPI?.restartApp?.()}
              >
                Restart Now
              </button>
            )}
            <button className="update-banner-close" onClick={() => setUpdaterStatus(null)}>×</button>
          </div>
        </div>
      )}

      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <MobileHamburgerMenu />
        <AppRoutes />
      </Router>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
