import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { DockCheckin } from '../../shared/types';
import { format } from 'date-fns';

const ActiveDrivers: React.FC = () => {
  const navigate = useNavigate();
  const [checkins, setCheckins] = useState<DockCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadActiveCheckins();
    
    if (autoRefresh) {
      const interval = setInterval(loadActiveCheckins, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadActiveCheckins = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getActiveCheckins();
      setCheckins(data);
      setError(null);
    } catch (error) {
      console.error('Failed to load active checkins:', error);
      setError('Failed to load active drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (checkin: DockCheckin) => {
    if (!confirm(`Check out ${checkin.driverName} from Door ${checkin.doorId}?`)) {
      return;
    }

    setCheckingOut(checkin.id);
    setError(null);

    try {
      await apiClient.clearDoor({
        doorId: checkin.doorId,
        updatedBy: 'System',
      });
      
      await loadActiveCheckins();
    } catch (err: any) {
      setError(err.message || 'Failed to check out driver');
    } finally {
      setCheckingOut(null);
    }
  };

  const getElapsedTime = (startTime: string): string => {
    const now = new Date().getTime();
    const start = new Date(startTime).getTime();
    const seconds = Math.floor((now - start) / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div style={{ padding: '24px', maxHeight: '100vh', overflow: 'auto' }}>
      {/* Navigation Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border)'
      }}>
        <h1 style={{ fontSize: '32px', fontWeight: 600, color: 'var(--text-bright)', margin: 0 }}>Active Drivers</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={() => navigate('/dockboard')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--glass)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              fontSize: '13px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            🚢 Dock Board
          </button>
          <button 
            onClick={() => navigate('/checkin')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--glass)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              fontSize: '13px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            ✅ Check In Driver
          </button>
          <button 
            onClick={() => navigate('/')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--glass)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              fontSize: '13px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            🏠 Home
          </button>
        </div>
      </div>

      {/* Controls Row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '20px', gap: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Auto-refresh
        </label>
        <button 
          onClick={loadActiveCheckins} 
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--glass)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'all var(--transition-fast)',
          }}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ 
          padding: '12px 16px', 
          marginBottom: '20px', 
          backgroundColor: 'rgba(220, 53, 69, 0.1)', 
          border: '1px solid rgba(220, 53, 69, 0.3)',
          borderRadius: '8px',
          color: '#dc3545'
        }}>
          ⚠ {error}
        </div>
      )}

      <div style={{
        background: 'var(--glass)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-bright)', margin: 0 }}>
            Currently Checked In <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({checkins.length} drivers)</span>
          </h3>
        </div>
        
        {loading && checkins.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Loading active drivers...
          </div>
        ) : checkins.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No active drivers checked in
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: '13px',
            }}>
              <thead style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Door</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Driver Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Company</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pickup #</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pallets</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commodity</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Plate</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Check-In Time</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Elapsed</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-bright)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map(checkin => (
                  <tr key={checkin.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background var(--transition-fast)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-bright)', fontWeight: 600 }}>Door {checkin.doorId}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        backgroundColor: checkin.inboundOutbound === 'Inbound' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                        color: checkin.inboundOutbound === 'Inbound' ? '#3b82f6' : '#eab308',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        border: `1px solid ${checkin.inboundOutbound === 'Inbound' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`
                      }}>
                        {checkin.inboundOutbound}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontWeight: 600 }}>{checkin.driverName}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{checkin.company}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{checkin.pickupNumber}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        backgroundColor: checkin.status === 'Waiting' ? 'rgba(184, 119, 217, 0.2)' :
                                       checkin.status === 'Loading' ? 'rgba(250, 222, 42, 0.2)' :
                                       checkin.status === 'Offload' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                        color: checkin.status === 'Waiting' ? '#b877d9' :
                               checkin.status === 'Loading' ? '#fade2a' :
                               checkin.status === 'Offload' ? '#ef4444' : '#22c55e',
                        border: `1px solid ${checkin.status === 'Waiting' ? 'rgba(184, 119, 217, 0.3)' :
                                              checkin.status === 'Loading' ? 'rgba(250, 222, 42, 0.3)' :
                                              checkin.status === 'Offload' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                      }}>
                        {checkin.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{checkin.pallets}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{checkin.commodity}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{checkin.plateNumber || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{checkin.phoneNumber || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{format(new Date(checkin.createdAt), 'MMM dd, HH:mm')}</td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{getElapsedTime(checkin.statusStartTime)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleCheckout(checkin)}
                        disabled={checkingOut === checkin.id}
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: checkingOut === checkin.id ? 'rgba(107, 114, 128, 0.3)' : 'rgba(220, 53, 69, 0.2)',
                          color: checkingOut === checkin.id ? 'var(--text-muted)' : '#dc3545',
                          border: `1px solid ${checkingOut === checkin.id ? 'rgba(107, 114, 128, 0.3)' : 'rgba(220, 53, 69, 0.3)'}`,
                          borderRadius: '6px',
                          cursor: checkingOut === checkin.id ? 'not-allowed' : 'pointer',
                          transition: 'all var(--transition-fast)',
                        }}
                        onMouseEnter={(e) => {
                          if (checkingOut !== checkin.id) {
                            e.currentTarget.style.backgroundColor = 'rgba(220, 53, 69, 0.3)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (checkingOut !== checkin.id) {
                            e.currentTarget.style.backgroundColor = 'rgba(220, 53, 69, 0.2)';
                          }
                        }}
                      >
                        {checkingOut === checkin.id ? 'Checking Out...' : 'Check Out'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveDrivers;
