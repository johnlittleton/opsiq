import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../renderer/context/AuthContext';
import { API_BASE } from '../renderer/services/config';
import { hasRestrictedFeatureAccess } from '../renderer/utils/restrictedAccess';
import { getNavigationSections } from './navigationSections';
import opsiqLogo from '../../assets/opsiq-logo.png';
import atlasLogo from '../../assets/atlas-logo.png';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, userRole, logout, sessionToken } = useAuth();
  const hasRestrictedAccess = hasRestrictedFeatureAccess(executiveName);
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('compact');
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const normalizedExecutiveName = String(executiveName || '').trim().toLowerCase();
  const isJohnView = normalizedExecutiveName === 'john littleton' || normalizedExecutiveName === 'john';
  const navigationSections = getNavigationSections(userRole, hasRestrictedAccess);

  useEffect(() => {
    if (!isJohnView) {
      setActiveUsers([]);
      return;
    }

    const loadActiveUsers = async () => {
      const token = sessionToken || localStorage.getItem('opsiq-session-token');
      if (!token) return;

      try {
        const response = await fetch(`${API_BASE}/api/auth/active-sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          setActiveUsers([]);
          return;
        }

        const data = await response.json();
        const names = Array.isArray(data?.users)
          ? data.users
              .map((user: any) => user?.name)
              .filter((name: string | undefined) => Boolean(name && String(name).trim()))
          : [];

        setActiveUsers(names);
      } catch (error) {
        console.error('Failed to load active users:', error);
        setActiveUsers([]);
      }
    };

    loadActiveUsers();
    const intervalId = window.setInterval(loadActiveUsers, 15000);
    return () => window.clearInterval(intervalId);
  }, [isJohnView, sessionToken]);
  
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

      {isJohnView && activeUsers.length > 0 && (
        <div className="home-page__active-users-banner" aria-live="polite">
          <div className="home-page__active-users-label">Active users</div>
          <div className="home-page__active-users-ticker">
            {[0, 1].map((repeatIndex) => (
              <div className="home-page__active-users-track" key={repeatIndex}>
                {activeUsers.map((name, index) => (
                  <span key={`${repeatIndex}-${index}`} className="home-page__active-user-pill">
                    <span className="home-page__active-user-dot" />
                    {name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="home-page__header">
        <h1 className="home-page__title">OPSIQ Desktop</h1>
        <p className="home-page__subtitle">Operations Intelligence Platform</p>
      </div>

      <section className={`home-page__category-grid home-page__category-grid--${viewMode}`} aria-label="OpsIQ navigation sections">
        {navigationSections.map((section) => (
          <button type="button" className="home-page__category-card" key={section.id} onClick={() => navigate(`/navigation/${section.id}`)}>
            <span className="home-page__category-icon" aria-hidden="true">{section.icon}</span>
            <span className="home-page__category-copy">
              <strong>{section.title}</strong>
              <small>{section.description}</small>
              <em>{section.tools.length} {section.tools.length === 1 ? 'tool' : 'tools'}</em>
            </span>
            <span className="home-page__category-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </section>

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

      <footer className="home-page__brand-footer" aria-label="OpsIQ and ATLAS branding">
        <img className="home-page__opsiq-logo" src={opsiqLogo} alt="OpsIQ" />
        <div className="home-page__powered-by">
          <span>Powered by</span>
          <img src={atlasLogo} alt="ATLAS Architecture" />
        </div>
      </footer>
    </div>
  );
};
