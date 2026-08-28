import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Legend } from '../common/Legend';
import './TitleBar.css';

interface TitleBarProps {
  showLegend?: boolean;
  children?: React.ReactNode;
}

export const TitleBar: React.FC<TitleBarProps> = ({ showLegend = false, children }) => {
  const navigate = useNavigate();
  const [showViewMenu, setShowViewMenu] = useState(false);

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

  const handleClose = () => {
    if (window.electron) {
      window.electron.close();
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
    <div className={`title-bar ${showLegend ? 'title-bar--with-legend' : 'title-bar--compact'}`}>
      <div className="title-bar__drag-region">
        <div className="title-bar__title">
          <img src="../../assets/OpsIQ.ico" alt="OpsIQ" className="title-bar__logo" />
          OpsIQ
        </div>
        
        <div className="title-bar__menu">
          <button 
            className="title-bar__menu-button"
            onClick={() => setShowViewMenu(!showViewMenu)}
          >
            View
          </button>
          {showViewMenu && (
            <div className="title-bar__dropdown">
              <button className="title-bar__dropdown-item" onClick={handleFullscreen}>
                Toggle Fullscreen
              </button>
              <button className="title-bar__dropdown-item" onClick={handleAlwaysOnTop}>
                Always on Top
              </button>
            </div>
          )}
        </div>

        {showLegend && <Legend />}
        {children && <div className="title-bar__content">{children}</div>}
      </div>
      <div className="title-bar__actions">
        <button className="title-bar__home-btn" onClick={() => navigate('/')}>← Home</button>
        <div className="title-bar__controls">
          <button className="title-bar__button" onClick={handleMinimize}>
            −
          </button>
          <button className="title-bar__button" onClick={handleMaximize}>
            □
          </button>
          <button className="title-bar__button title-bar__button--close" onClick={handleClose}>
            ×
          </button>
        </div>
      </div>
    </div>
  );
};