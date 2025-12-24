import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { useAppStore } from './store';
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
import ShippingReceivingKPI from './pages/ShippingReceivingKPI';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import Settings from './pages/Settings';
import LaborTracker from './pages/LaborTracker';

const App: React.FC = () => {
  const initializeSync = useAppStore(state => state.initializeSync);

  useEffect(() => {
    initializeSync();
  }, [initializeSync]);

  return (
    <Router>
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
        <Route path="/shipping" element={<ShippingReceivingKPI />} />
        <Route path="/executive" element={<ExecutiveDashboard />} />
        <Route path="/labor-tracker" element={<LaborTracker />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
};

export default App;
