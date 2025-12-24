import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('compact');
  const [showViewMenu, setShowViewMenu] = useState(false);
  
  const quickAccessCards = [
    {
      icon: '🚢',
      title: 'Dock Dashboard',
      description: 'Monitor all 39 docks in real-time',
      tags: ['Real-time monitoring', 'Interactive dock grid'],
      onClick: () => navigate('/dockboard'),
    },
    {
      icon: '✅',
      title: 'Driver Check In',
      description: 'Check in drivers and assign dock doors',
      tags: ['Driver management', 'Dock assignment'],
      onClick: () => navigate('/checkin'),
    },
    {
      icon: '👥',
      title: 'Active Drivers',
      description: 'View and manage currently checked-in drivers',
      tags: ['Driver checkout', 'Active sessions'],
      onClick: () => navigate('/active-drivers'),
    },
    {
      icon: '📅',
      title: 'Appointment Scheduler',
      description: 'Schedule inbound and outbound appointments',
      tags: ['Calendar', 'Appointments', 'Planning'],
      onClick: () => navigate('/scheduler'),
    },
    {
      icon: '�',
      title: 'Labor Tracker',
      description: 'Track department headcount and labor costs',
      tags: ['Manager', 'Labor', 'Cost'],
      onClick: () => navigate('/labor-tracker'),
    },
    {      icon: '📊',
      title: 'Executive Dashboard',
      description: 'Site performance metrics and top operators',
      tags: ['Executive', 'Performance', 'Analytics'],
      onClick: () => navigate('/executive'),
    },
    {      icon: '�📋',
      title: 'Dock History',
      description: 'View dock status changes and events',
      tags: ['History', 'Search', 'Reports'],
      onClick: () => navigate('/history'),
    },
    {
      icon: '🚛',
      title: 'Check-In History',
      description: 'Comprehensive driver check-in records',
      tags: ['History', 'Search', 'Reports'],
      onClick: () => navigate('/checkin-history'),
    },
    {
      icon: '📆',
      title: 'Appointment History',
      description: 'View all past and upcoming appointments',
      tags: ['History', 'Search', 'Reports'],
      onClick: () => navigate('/appointment-history'),
    },
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
        <h2 className="home-page__section-title">Quick Access</h2>
        <div className={`home-page__quick-access home-page__quick-access--${viewMode}`}>
          {quickAccessCards.map((card, index) => (
            <div 
              key={index} 
              className="home-page__card"
              onClick={card.onClick}
              style={{ cursor: 'pointer' }}
            >
              <div className="home-page__card-icon">{card.icon}</div>
              <div className="home-page__card-content">
                <h3 className="home-page__card-title">{card.title}</h3>
                <p className="home-page__card-desc">{card.description}</p>
                <div className="home-page__card-tags">
                  {card.tags.map((tag, tagIndex) => (
                    <span key={tagIndex} className="home-page__card-tag">
                      {tag}
                    </span>
                  ))}
                </div>
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
