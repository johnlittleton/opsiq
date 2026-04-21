import React, { useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
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

type UpdaterStatus = {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
};

const isNativeIOSRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;

  return (
    window.location.protocol === 'capacitor:' ||
    (window as any).Capacitor?.isNativePlatform?.() === true ||
    (window as any).Capacitor?.getPlatform?.() === 'ios'
  );
};

// Public routes that don't require authentication (display dashboards for TVs/monitors)
const PUBLIC_ROUTES = [
  '/production-dashboard',
  '/dashboard',
  '/dockboard-old',
  '/production',
  '/shipping'
];

const MOBILE_ALLOWED_ROUTES = [
  '/',
  '/home',
  '/dockboard',
  '/dockboard-old',
  '/checkin',
  '/active-drivers',
  '/scheduler',
  '/history',
  '/checkin-history',
  '/appointment-history',
  '/production',
  '/production-kpi-history',
  '/shipping',
  '/executive-analytics',
  '/production-costing',
  '/labor-tracker',
  '/labor-history',
  '/labor-kiosk',
  '/labor-kiosk-admin',
  '/labor-kiosk-history',
  '/production-labor-planner',
  '/production-labor-planner-history',
  '/production-scheduler',
  '/production-dashboard',
  '/dashboard',
  '/executive',
  '/pallet-tracker',
  '/work-order-history',
  '/downtime-history',
  '/settings',
  '/storage-billing',
];

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const isMobileRuntime =
    isNativeIOSRuntime() ||
    (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);

  const handlePinSuccess = (name: string, role: string, sessionToken: string) => {
    login(name, role, sessionToken);
  };

  // Show PIN entry only for protected routes when not authenticated
  if (!isAuthenticated && !isPublicRoute) {
    return <PinEntry onSuccess={handlePinSuccess} />;
  }

  if (isAuthenticated && isMobileRuntime && !MOBILE_ALLOWED_ROUTES.includes(location.pathname)) {
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
  const [showViewOptions, setShowViewOptions] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const lastMenuToggleAtRef = useRef(0);

  useEffect(() => {
    setIsOpen(false);
    setShowViewOptions(false);
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  const hasDesktopWindowControls = typeof window !== 'undefined' && !!window.electron;
  const isMobileRuntime =
    isNativeIOSRuntime() ||
    (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);
  const isHomeRoute = location.pathname === '/' || location.pathname === '/home';

  const getPageNavLinks = (pathname: string) => {
    if (isMobileRuntime) {
      return [
        { label: 'Dock Dashboard', path: '/dockboard' },
        { label: 'Driver Check-In', path: '/checkin' },
        { label: 'Active Drivers', path: '/active-drivers' },
        { label: 'Dock History', path: '/history' },
        { label: 'Check-In History', path: '/checkin-history' },
        { label: 'Appointment Scheduler', path: '/scheduler' },
        { label: 'Appointment History', path: '/appointment-history' },
        { label: 'Production Scheduler', path: '/production-scheduler' },
        { label: 'Production Dashboard', path: '/production-dashboard' },
        { label: 'Work Order History', path: '/work-order-history' },
        { label: 'Pallet Tracker', path: '/pallet-tracker' },
        { label: 'Executive Dashboard', path: '/executive' },
        { label: 'Executive Analytics', path: '/executive-analytics' },
        { label: 'Production Costing', path: '/production-costing' },
        { label: 'Labor Tracker', path: '/labor-tracker' },
        { label: 'Labor History', path: '/labor-history' },
        { label: 'Labor Kiosk', path: '/labor-kiosk' },
        { label: 'Labor Kiosk Admin', path: '/labor-kiosk-admin' },
        { label: 'Labor Kiosk History', path: '/labor-kiosk-history' },
        { label: 'Storage Billing', path: '/storage-billing' },
        { label: 'Settings', path: '/settings' }
      ];
    }

    if (pathname.startsWith('/dockboard') || pathname === '/checkin' || pathname === '/active-drivers' || pathname === '/history' || pathname === '/checkin-history' || pathname === '/appointment-history' || pathname === '/scheduler') {
      return [
        { label: 'Dock Board', path: '/dockboard' },
        { label: 'Driver Check-In', path: '/checkin' },
        { label: 'Active Drivers', path: '/active-drivers' },
        { label: 'Scheduler', path: '/scheduler' },
        { label: 'Dock History', path: '/history' },
        { label: 'Check-In History', path: '/checkin-history' },
        { label: 'Appointment History', path: '/appointment-history' }
      ];
    }

    if (pathname.startsWith('/production') || pathname === '/work-order-history' || pathname === '/downtime-history' || pathname === '/labor-tracker' || pathname === '/labor-history') {
      return [
        { label: 'Production Scheduler', path: '/production-scheduler' },
        { label: 'Production Dashboard', path: '/production-dashboard' },
        { label: 'Production KPI', path: '/production' },
        { label: 'KPI History', path: '/production-kpi-history' },
        { label: 'Labor Planner', path: '/production-labor-planner' },
        { label: 'Labor Planner History', path: '/production-labor-planner-history' },
        { label: 'Labor Tracker', path: '/labor-tracker' },
        { label: 'Labor History', path: '/labor-history' },
        { label: 'WO History', path: '/work-order-history' },
        { label: 'Downtime History', path: '/downtime-history' }
      ];
    }

    if (pathname === '/executive' || pathname === '/executive-analytics' || pathname === '/production-costing' || pathname === '/shipping') {
      return [
        { label: 'Executive Dashboard', path: '/executive' },
        { label: 'Executive Analytics', path: '/executive-analytics' },
        { label: 'Shipping & Receiving KPI', path: '/shipping' },
        { label: 'Production Costing', path: '/production-costing' }
      ];
    }

    return [
      { label: 'Settings', path: '/settings' }
    ];
  };

  const pageNavLinks = isHomeRoute ? [] : getPageNavLinks(location.pathname);

  const beginTouch = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    setTouchStartX(touch.clientX);
    setTouchStartY(touch.clientY);
  };

  const handleEdgeSwipe = (event: React.TouchEvent) => {
    if (isOpen) return;
    if (touchStartX === null || touchStartY === null) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = Math.abs(touch.clientY - touchStartY);

    // Left-edge horizontal swipe opens menu.
    if (touchStartX <= 24 && deltaX > 52 && deltaY < 36) {
      setIsOpen(true);
      setTouchStartX(null);
      setTouchStartY(null);
    }
  };

  const handlePanelSwipe = (event: React.TouchEvent) => {
    if (!isOpen) return;
    if (touchStartX === null || touchStartY === null) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = Math.abs(touch.clientY - touchStartY);

    // Swipe left to close open menu.
    if (deltaX < -48 && deltaY < 36) {
      setIsOpen(false);
      setTouchStartX(null);
      setTouchStartY(null);
    }
  };

  const endTouch = () => {
    setTouchStartX(null);
    setTouchStartY(null);
  };

  const handleHome = () => {
    navigate('/home');
    setIsOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setIsOpen(false);
  };

  const handleToggleFullscreen = () => {
    window.electron?.toggleFullscreen?.();
    setIsOpen(false);
  };

  const handleToggleAlwaysOnTop = () => {
    window.electron?.toggleAlwaysOnTop?.();
    setIsOpen(false);
  };

  const toggleMenu = () => {
    const now = Date.now();
    // iOS can emit touch + click for one tap; gate rapid duplicate toggles.
    if (now - lastMenuToggleAtRef.current < 250) return;
    lastMenuToggleAtRef.current = now;
    setIsOpen((current) => !current);
  };

  const handleMenuPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu();
  };

  const handleMenuTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu();
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu();
  };

  const navigateAndClose = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <>
      <div
        className="mobile-edge-swipe-zone"
        onTouchStart={beginTouch}
        onTouchMove={handleEdgeSwipe}
        onTouchEnd={endTouch}
      />

      <button
        className="mobile-hamburger-trigger"
        onPointerDown={handleMenuPointerDown}
        onTouchStart={handleMenuTouchStart}
        onClick={handleMenuClick}
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <span />
        <span />
        <span />
      </button>

      {isOpen && <button className="mobile-hamburger-backdrop" onClick={() => setIsOpen(false)} aria-label="Close menu" />}

      <aside
        className={`mobile-hamburger-panel ${isOpen ? 'open' : ''}`}
        onTouchStart={beginTouch}
        onTouchMove={handlePanelSwipe}
        onTouchEnd={endTouch}
      >
        <button className="mobile-hamburger-item" onClick={handleHome}>Home</button>

        {!isHomeRoute && isMobileRuntime && pageNavLinks.length > 0 && (
          <div className="mobile-hamburger-submenu">
            {pageNavLinks.map((link) => (
              <button
                key={link.path}
                className="mobile-hamburger-item"
                onClick={() => navigateAndClose(link.path)}
              >
                {link.label}
              </button>
            ))}
          </div>
        )}

        {!isMobileRuntime && (
          <button
            className="mobile-hamburger-item"
            onClick={() => setShowViewOptions((current) => !current)}
          >
            View
          </button>
        )}

        {!isMobileRuntime && showViewOptions && (
          <div className="mobile-hamburger-submenu">
            <button
              className="mobile-hamburger-item"
              onClick={handleToggleFullscreen}
              disabled={!hasDesktopWindowControls}
            >
              Toggle Fullscreen
            </button>
            <button
              className="mobile-hamburger-item"
              onClick={handleToggleAlwaysOnTop}
              disabled={!hasDesktopWindowControls}
            >
              Always On Top
            </button>
          </div>
        )}

        <button className="mobile-hamburger-item danger" onClick={handleLogout}>Logout</button>
      </aside>
    </>
  );
};

const AppContent: React.FC = () => {
  const initializeSync = useAppStore(state => state.initializeSync);
  const [updaterStatus, setUpdaterStatus] = React.useState<UpdaterStatus | null>(null);

  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.getElementById('root');
    const nativeIOS = isNativeIOSRuntime();
    document.body.classList.toggle('ios-mobile', nativeIOS);
    root?.classList.toggle('ios-mobile', nativeIOS);

    return () => {
      document.body.classList.remove('ios-mobile');
      root?.classList.remove('ios-mobile');
    };
  }, []);

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
    <>
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

      <Router>
        <MobileHamburgerMenu />
        <AppRoutes />
      </Router>
    </>
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
