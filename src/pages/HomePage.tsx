import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../renderer/context/AuthContext';
import { hasRestrictedFeatureAccess } from '../renderer/utils/restrictedAccess';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, userRole, logout } = useAuth();
  const hasRestrictedAccess = hasRestrictedFeatureAccess(executiveName);
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('compact');
  const [showViewMenu, setShowViewMenu] = useState(false);
  
  const dockOperationsCards = [
    {
      icon: '🚢',
      title: 'Dock Dashboard',
      description: 'Monitor all 39 docks in real-time',
      onClick: () => navigate('/dockboard'),
    },
    {
      icon: '✅',
      title: 'Driver Check In',
      description: 'Check in drivers and assign dock doors',
      onClick: () => navigate('/checkin'),
    },
    ...(hasRestrictedAccess ? [{
      icon: '🤖',
      title: 'Driver Avatar',
      description: 'Open the dedicated avatar stage view',
      badge: 'Under Construction',
      onClick: () => navigate('/driver-avatar'),
    }] : []),
    {
      icon: '👥',
      title: 'Active Drivers',
      description: 'View and manage currently checked-in drivers',
      onClick: () => navigate('/active-drivers'),
    },
    {
      icon: '🗄️',
      title: 'Dock History',
      description: 'View dock status changes and events',
      onClick: () => navigate('/history'),
    },
    {
      icon: '🚛',
      title: 'Check-In History',
      description: 'Comprehensive driver check-in records',
      onClick: () => navigate('/checkin-history'),
    },
    {
      icon: '🧾',
      title: 'Extra Services',
      description: 'Capture restacking, case pick, and other service activity',
      badge: 'Under Construction',
      onClick: () => navigate('/extra-services'),
    },
    {
      icon: '📤',
      title: 'Outbound Checker Form',
      description: 'Submit outbound dock verification and pallet checks',
      onClick: () => navigate('/dock-checker/outbound'),
    },
    {
      icon: '📥',
      title: 'Inbound Checker Form',
      description: 'Submit inbound manifest, labels, QC, and damage checks',
      onClick: () => navigate('/dock-checker/inbound'),
    },
    {
      icon: '📚',
      title: 'Dock Checker History',
      description: 'Search all inbound and outbound checker forms by date',
      onClick: () => navigate('/dock-checker/history'),
    },
    {
      icon: '📦',
      title: 'Inventory Auditor',
      description: 'Upload Famous inventory report, scan locations, and run discrepancy audits',
      onClick: () => navigate('/inventory-auditor'),
    },
  ];

  const appointmentCards = [
    {
      icon: '📅',
      title: 'Appointment Scheduler',
      description: 'Schedule inbound and outbound appointments',
      onClick: () => navigate('/scheduler'),
    },
    {
      icon: '📆',
      title: 'Appointment History',
      description: 'View all past and upcoming appointments',
      onClick: () => navigate('/appointment-history'),
    },
  ];

  const productionCards = [
    {
      icon: '📋',
      title: 'Production Scheduler',
      description: 'Schedule work orders for 5 Giro lines',
      onClick: () => navigate('/production-scheduler'),
    },
    {
      icon: '📈',
      title: 'Production Dashboard',
      description: 'Monitor all lines in real-time',
      onClick: () => navigate('/production-dashboard'),
    },
    {
      icon: '🧮',
      title: 'Production Capacity',
      description: 'Calculate room capacity, lines, people, and production time',
      onClick: () => navigate('/production-capacity'),
    },
    {
      icon: '📑',
      title: 'Work Order History',
      description: 'View completed work orders',
      onClick: () => navigate('/work-order-history'),
    },
    {
      icon: '🏷️',
      title: 'Pallet Tracker',
      description: 'Scan build-in and finished-out pallets by order',
      onClick: () => navigate('/pallet-tracker'),
    },
  ];

  const managementCards = [
    ...((userRole === 'executive' || userRole === 'manager') && hasRestrictedAccess ? [{
      icon: '🤖',
      title: 'AI Dual Entry',
      description: 'Mirror Famous WMS entries with runner status and exception review',
      badge: 'Under Construction',
      onClick: () => navigate('/ai-dual-entry'),
    }] : []),
    ...(userRole === 'executive' ? [{
      icon: '📊',
      title: 'Executive Dashboard',
      description: 'Site performance metrics and top operators',
      onClick: () => navigate('/executive'),
    }, ...(hasRestrictedAccess ? [{
      icon: '🖥️',
      title: 'Combined Live Dashboard',
      description: 'All departments on one live internal screen',
      onClick: () => navigate('/combined-live-operations'),
    }] : [])] : []),
    ...((userRole === 'executive' || userRole === 'manager') ? [{
      icon: '💼',
      title: 'Manager Dashboard',
      description: 'Track department headcount and live performance',
      onClick: () => navigate('/labor-tracker'),
    }] : []),
    ...((userRole === 'executive' || userRole === 'manager') ? [{
      icon: '📱',
      title: 'Labor Kiosk',
      description: 'Open the employee punch kiosk and admin access',
      onClick: () => navigate('/labor-kiosk'),
    }] : []),
  ];

  const handleMinimize = () => {
    if (window.electron) {
      window.electron.minimize();
    }
  };

  const handleMaximize = () => {
    if (window.electron) {
      window.electron.maximize();
    }
  };

  const handleFullscreen = () => {
    if (window.electron) {
      window.electron.toggleFullscreen?.();
    }
    setShowViewMenu(false);
  };

  const handleAlwaysOnTop = () => {
    if (window.electron) {
      window.electron.toggleAlwaysOnTop?.();
    }
    setShowViewMenu(false);
  };

  return (
    <div className="home-page">
      {/* Window Controls */}
      <div className="home-page__controls">
        <div className="home-page__controls-left">
          <button 
            className="home-page__control-button"
            onClick={() => setShowViewMenu(!showViewMenu)}
          >
            View
          </button>
          {showViewMenu && (
            <div className="home-page__dropdown">
              <button className="home-page__dropdown-item" onClick={handleFullscreen}>
                Toggle Fullscreen
              </button>
              <button className="home-page__dropdown-item" onClick={handleAlwaysOnTop}>
                Always on Top
              </button>
              <div className="home-page__dropdown-divider" />
              <button 
                className="home-page__dropdown-item"
                onClick={() => { setViewMode('compact'); setShowViewMenu(false); }}
              >
                ✓ Compact View
              </button>
              <button 
                className="home-page__dropdown-item"
                onClick={() => { setViewMode('grid'); setShowViewMenu(false); }}
              >
                {viewMode === 'grid' ? '✓ ' : ''}Grid View
              </button>
            </div>
          )}
        </div>
        <div className="home-page__controls-right">
          <span className="home-page__user-name">{executiveName}</span>
          <button className="home-page__logout-button" onClick={logout}>
            🚪 Logout
          </button>
          <button className="home-page__window-button" onClick={handleMinimize}>
            −
          </button>
          <button className="home-page__window-button" onClick={handleMaximize}>
            □
          </button>
        </div>
      </div>

      <div className="home-page__header">
        <h1 className="home-page__title">OPSIQ Desktop</h1>
        <p className="home-page__subtitle">Operations Intelligence Platform</p>
      </div>

      <div className="home-page__section">
        <h2 className="home-page__section-title">Dock Operations</h2>
        <div className={`home-page__quick-access home-page__quick-access--${viewMode}`}>
          {dockOperationsCards.map((card, index) => (
            <div 
              key={index} 
              className="home-page__card"
              onClick={card.onClick}
            >
              <div className="home-page__card-icon">{card.icon}</div>
              <div className="home-page__card-content">
                <div className="home-page__card-title-row">
                  <h3 className="home-page__card-title">{card.title}</h3>
                  {card.badge && <span className="home-page__card-badge">{card.badge}</span>}
                </div>
                <p className="home-page__card-desc">{card.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-page__section">
        <h2 className="home-page__section-title">Appointments</h2>
        <div className={`home-page__quick-access home-page__quick-access--${viewMode}`}>
          {appointmentCards.map((card, index) => (
            <div 
              key={index} 
              className="home-page__card"
              onClick={card.onClick}
            >
              <div className="home-page__card-icon">{card.icon}</div>
              <div className="home-page__card-content">
                <div className="home-page__card-title-row">
                  <h3 className="home-page__card-title">{card.title}</h3>
                  {card.badge && <span className="home-page__card-badge">{card.badge}</span>}
                </div>
                <p className="home-page__card-desc">{card.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-page__section">
        <h2 className="home-page__section-title">Production</h2>
        <div className={`home-page__quick-access home-page__quick-access--${viewMode}`}>
          {productionCards.map((card, index) => (
            <div 
              key={index} 
              className="home-page__card"
              onClick={card.onClick}
            >
              <div className="home-page__card-icon">{card.icon}</div>
              <div className="home-page__card-content">
                <div className="home-page__card-title-row">
                  <h3 className="home-page__card-title">{card.title}</h3>
                  {card.badge && <span className="home-page__card-badge">{card.badge}</span>}
                </div>
                <p className="home-page__card-desc">{card.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-page__section">
        <h2 className="home-page__section-title">Management</h2>
        <div className={`home-page__quick-access home-page__quick-access--${viewMode}`}>
          {managementCards.map((card, index) => (
            <div 
              key={index} 
              className="home-page__card"
              onClick={card.onClick}
            >
              <div className="home-page__card-icon">{card.icon}</div>
              <div className="home-page__card-content">
                <div className="home-page__card-title-row">
                  <h3 className="home-page__card-title">{card.title}</h3>
                  {card.badge && <span className="home-page__card-badge">{card.badge}</span>}
                </div>
                <p className="home-page__card-desc">{card.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-page__section">
        <h2 className="home-page__section-title">System Status</h2>
        <div className="home-page__status">
          <div className="home-page__status-card">
            <div className="home-page__status-indicator" />
            <div className="home-page__status-content">
              <div className="home-page__status-label">MAUI Blazor Runtime</div>
              <div className="home-page__status-value">Active</div>
            </div>
          </div>
          <div className="home-page__status-card">
            <div className="home-page__status-indicator" />
            <div className="home-page__status-content">
              <div className="home-page__status-label">Navigation System</div>
              <div className="home-page__status-value">Interactive</div>
            </div>
          </div>
          <div className="home-page__status-card">
            <div className="home-page__status-indicator" />
            <div className="home-page__status-content">
              <div className="home-page__status-label">Services</div>
              <div className="home-page__status-value">Ready</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
