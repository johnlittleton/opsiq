import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useAppStore } from './store';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiClient } from './services/api';
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
import AllInProductionKPIDashboard from './pages/AllInProductionKPIDashboard';
import JohnDashboard from './pages/JohnDashboard';
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
import ProductionCapacity from './pages/ProductionCapacity';
import CombinedLiveOperationsDashboard from './pages/CombinedLiveOperationsDashboard';
import WorkOrderHistory from './pages/WorkOrderHistory';
import DowntimeHistory from './pages/DowntimeHistory';
import PalletTracker from './pages/PalletTracker';
import StorageBilling from './pages/StorageBilling';
import ExtraServices from './pages/ExtraServices';
import AIDualEntry from './pages/AIDualEntry';
import DriverAvatarPage from './pages/DriverAvatarPage';
import OutboundDockCheckerForm from './pages/OutboundDockCheckerForm';
import InboundDockCheckerForm from './pages/InboundDockCheckerForm';
import DockCheckerHistory from './pages/DockCheckerHistory';
import InventoryAuditor from './pages/InventoryAuditor';
import { hasRestrictedFeatureAccess } from './utils/restrictedAccess';

type UpdaterStatus = {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
};

type FormToast = {
  id: string;
  text: string;
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

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, login, executiveName } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const hasRestrictedAccess = hasRestrictedFeatureAccess(executiveName);

  const handlePinSuccess = (name: string, role: string, sessionToken: string) => {
    login(name, role, sessionToken);
  };

  // Show PIN entry only for protected routes when not authenticated
  if (!isAuthenticated && !isPublicRoute) {
    return <PinEntry onSuccess={handlePinSuccess} />;
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
      <Route path="/dock-checker/outbound" element={<OutboundDockCheckerForm />} />
      <Route path="/dock-checker/inbound" element={<InboundDockCheckerForm />} />
      <Route path="/dock-checker/history" element={<DockCheckerHistory />} />
      <Route path="/inventory-auditor" element={<InventoryAuditor />} />
      <Route path="/appointment-history" element={<AppointmentHistory />} />
      <Route path="/production" element={<ProductionKPI />} />
      <Route path="/production-kpi-history" element={<ProductionKPIHistory />} />
      <Route path="/shipping" element={<ShippingReceivingKPI />} />
      <Route path="/executive" element={<ExecutiveDashboard />} />
      <Route path="/executive-analytics" element={<ExecutiveAnalytics />} />
      <Route path="/production-costing" element={<ProductionCosting />} />
      <Route path="/all-in-production-kpi" element={<AllInProductionKPIDashboard />} />
      <Route path="/john-dashboard" element={<JohnDashboard />} />
      <Route path="/labor-tracker" element={<LaborTracker />} />
      <Route path="/labor-history" element={<LaborHistory />} />
      <Route path="/labor-kiosk" element={<LaborKiosk />} />
      <Route path="/labor-kiosk-admin" element={<LaborKioskAdmin />} />
      <Route path="/labor-kiosk-history" element={<LaborKioskHistory />} />
      <Route path="/production-labor-planner" element={<ProductionLaborPlanner />} />
      <Route path="/production-labor-planner-history" element={<ProductionLaborPlannerHistory />} />
      <Route path="/production-scheduler" element={<ProductionScheduler />} />
      <Route path="/production-dashboard" element={<ProductionDashboard />} />
      <Route path="/production-capacity" element={<ProductionCapacity />} />
      <Route path="/dashboard" element={<ProductionDashboard />} />
      <Route path="/pallet-tracker" element={<PalletTracker />} />
      <Route path="/work-order-history" element={<WorkOrderHistory />} />
      <Route path="/downtime-history" element={<DowntimeHistory />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/storage-billing" element={<StorageBilling />} />
      <Route path="/extra-services" element={<ExtraServices />} />
      <Route
        path="/ai-dual-entry"
        element={hasRestrictedAccess ? <AIDualEntry /> : <HomePage />}
      />
      <Route
        path="/driver-avatar"
        element={hasRestrictedAccess ? <DriverAvatarPage /> : <HomePage />}
      />
      <Route
        path="/combined-live-operations"
        element={hasRestrictedAccess ? <CombinedLiveOperationsDashboard /> : <HomePage />}
      />
    </Routes>
  );
};
const AppContent: React.FC = () => {
  const initializeSync = useAppStore(state => state.initializeSync);
  const [updaterStatus, setUpdaterStatus] = React.useState<UpdaterStatus | null>(null);
  const [formToasts, setFormToasts] = React.useState<FormToast[]>([]);
  const [formToastsMinimized, setFormToastsMinimized] = React.useState(false);

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
    apiClient.onFormCompleted((event) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const submittedBy = event.submittedBy ? ` by ${event.submittedBy}` : '';
      const fallbackText = event.formType === 'production'
        ? `Production form completed for order ${event.referenceId}${submittedBy}`
        : `Outbound form completed for check-in ${event.referenceId}${submittedBy}`;

      const toast: FormToast = {
        id,
        text: event.message || fallbackText,
      };

      setFormToasts((current) => [...current.slice(-4), toast]);
      setFormToastsMinimized(false);
      window.setTimeout(() => {
        setFormToasts((current) => current.filter((item) => item.id !== id));
      }, 7000);
    });
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

      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AppRoutes />
      </Router>

      {formToasts.length > 0 && !formToastsMinimized && (
        <div className="form-toast-stack" aria-live="polite">
          <div className="form-toast-stack__header">
            <span>Messages ({formToasts.length})</span>
            <button
              type="button"
              className="form-toast-stack__minimize"
              onClick={() => setFormToastsMinimized(true)}
            >
              Minimize
            </button>
          </div>
          {formToasts.map((toast) => (
            <div key={toast.id} className="form-toast-item">
              {toast.text}
            </div>
          ))}
        </div>
      )}

      {formToasts.length > 0 && formToastsMinimized && (
        <button
          type="button"
          className="form-toast-stack-minimized"
          onClick={() => setFormToastsMinimized(false)}
          aria-live="polite"
        >
          Messages ({formToasts.length})
        </button>
      )}
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
