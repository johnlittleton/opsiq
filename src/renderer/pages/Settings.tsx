import React, { useState } from 'react';

const Settings: React.FC = () => {
  const [flashThreshold, setFlashThreshold] = useState(15);
  const [multiInstance, setMultiInstance] = useState(false);

  const handleSave = () => {
    // In a full implementation, this would save to electron settings
    alert('Settings saved! (This would persist to settings.json in production)');
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="card">
        <h3 className="card-title">Dock Board Settings</h3>
        <div className="form-group">
          <label>Flash Threshold (minutes)</label>
          <input
            type="number"
            value={flashThreshold}
            onChange={(e) => setFlashThreshold(parseInt(e.target.value))}
            className="form-input"
            style={{ maxWidth: '200px' }}
          />
          <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
            Doors in Waiting/Parked status will flash after this many minutes
          </small>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Instance Settings</h3>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={multiInstance}
              onChange={(e) => setMultiInstance(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Allow Multiple Instances (Multi-Monitor Mode)
          </label>
          <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
            Enable this to run multiple OpsIQ windows for control room setup
          </small>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Production Targets</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map(line => (
            <div key={line} className="form-group">
              <label>Line {line} Daily Target (pallets)</label>
              <input
                type="number"
                defaultValue={100}
                className="form-input"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">KPI Thresholds</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <h4 style={{ fontSize: '16px', marginBottom: '12px', color: '#b0b0b0' }}>Production</h4>
            <div className="form-group">
              <label>Scrap Rate Warning (%) </label>
              <input type="number" defaultValue={2} step="0.1" className="form-input" />
            </div>
            <div className="form-group">
              <label>Scrap Rate Critical (%)</label>
              <input type="number" defaultValue={5} step="0.1" className="form-input" />
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: '16px', marginBottom: '12px', color: '#b0b0b0' }}>Dock Operations</h4>
            <div className="form-group">
              <label>Utilization Warning (%)</label>
              <input type="number" defaultValue={70} className="form-input" />
            </div>
            <div className="form-group">
              <label>Utilization Critical (%)</label>
              <input type="number" defaultValue={85} className="form-input" />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Labor Budget</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label>Daily Labor Budget ($)</label>
            <input type="number" defaultValue={5000} className="form-input" />
          </div>
          <div className="form-group">
            <label>Default Labor Rate ($/hr)</label>
            <input type="number" defaultValue={25} step="0.01" className="form-input" />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '24px' }}>
        <button className="btn btn-success" onClick={handleSave}>
          Save All Settings
        </button>
        <button className="btn btn-secondary" style={{ marginLeft: '12px' }}>
          Reset to Defaults
        </button>
      </div>

      <div className="card" style={{ marginTop: '24px', background: '#2a2a2a' }}>
        <h3 className="card-title">System Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
          <div>
            <strong style={{ color: '#b0b0b0' }}>App Version:</strong>
            <span style={{ marginLeft: '8px' }}>1.0.0</span>
          </div>
          <div>
            <strong style={{ color: '#b0b0b0' }}>Database:</strong>
            <span style={{ marginLeft: '8px' }}>SQLite (opsiq.db)</span>
          </div>
          <div>
            <strong style={{ color: '#b0b0b0' }}>Server Status:</strong>
            <span style={{ marginLeft: '8px', color: '#27ae60' }}>● Connected</span>
          </div>
          <div>
            <strong style={{ color: '#b0b0b0' }}>Real-time Updates:</strong>
            <span style={{ marginLeft: '8px', color: '#27ae60' }}>● Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
