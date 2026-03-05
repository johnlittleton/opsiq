import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
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
import ProductionLaborPlanner from './pages/ProductionLaborPlanner';
import ProductionLaborPlannerHistory from './pages/ProductionLaborPlannerHistory';
import ProductionScheduler from './pages/ProductionScheduler';
import ProductionDashboard from './pages/ProductionDashboard';
import WorkOrderHistory from './pages/WorkOrderHistory';
import DowntimeHistory from './pages/DowntimeHistory';

// Public routes that don't require authentication (display dashboards for TVs/monitors)
const PUBLIC_ROUTES = [
  '/production-dashboard',
  '/dashboard',
  '/dockboard-old',
  '/production',
  '/shipping'
];

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);

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
      <Route path="/appointment-history" element={<AppointmentHistory />} />
      <Route path="/production" element={<ProductionKPI />} />
      <Route path="/production-kpi-history" element={<ProductionKPIHistory />} />
      <Route path="/shipping" element={<ShippingReceivingKPI />} />
      <Route path="/executive" element={<ExecutiveDashboard />} />
      <Route path="/executive-analytics" element={<ExecutiveAnalytics />} />
      <Route path="/production-costing" element={<ProductionCosting />} />
      <Route path="/labor-tracker" element={<LaborTracker />} />
      <Route path="/labor-history" element={<LaborHistory />} />
      <Route path="/production-labor-planner" element={<ProductionLaborPlanner />} />
      <Route path="/production-labor-planner-history" element={<ProductionLaborPlannerHistory />} />
      <Route path="/production-scheduler" element={<ProductionScheduler />} />
      <Route path="/production-dashboard" element={<ProductionDashboard />} />
      <Route path="/dashboard" element={<ProductionDashboard />} />
      <Route path="/work-order-history" element={<WorkOrderHistory />} />
      <Route path="/downtime-history" element={<DowntimeHistory />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
};

const AppContent: React.FC = () => {
  const initializeSync = useAppStore(state => state.initializeSync);

  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  return (
    <Router>
      <AppRoutes />
    </Router>
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
