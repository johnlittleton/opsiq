import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { apiClient } from '../services/api';
import { DockDoorWithCheckin, DoorStatus } from '../../shared/types';
import { formatDistanceToNow } from 'date-fns';
import { MessageBanner } from '../components/MessageBanner';

const STATUS_COLORS: Record<DoorStatus, string> = {
  Open: 'status-Open',
  Offload: 'status-Offload',
  Loading: 'status-Loading',
  Blocked: 'status-Blocked',
  Waiting: 'status-Waiting',
  Parked: 'status-Parked',
  Dropped: 'status-Dropped',
  Offline: 'status-Offline',
};

const FLASH_THRESHOLD_MINUTES = 15;

const DoorTile: React.FC<{ door: DockDoorWithCheckin }> = ({ door }) => {
  const [elapsed, setElapsed] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const calculateElapsed = () => {
      const start = new Date(door.statusStartTime);
      const now = new Date();
      return Math.floor((now.getTime() - start.getTime()) / 1000);
    };

    setElapsed(calculateElapsed());
    const interval = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [door.statusStartTime]);

  const formatElapsed = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const shouldFlash = (): boolean => {
    const minutes = elapsed / 60;
    return (door.status === 'Waiting' || door.status === 'Parked') && minutes > FLASH_THRESHOLD_MINUTES;
  };

  const handleStatusChange = async (newStatus: DoorStatus) => {
    if (updating) return;
    setUpdating(true);
    try {
      await apiClient.updateDoorStatus({
        doorId: door.doorId,
        newStatus,
        updatedBy: 'User',
      });
      setShowActions(false);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleClearDoor = async () => {
    if (updating) return;
    if (!confirm(`Clear Door ${door.doorId}?`)) return;
    
    // Prompt for actual pallets if there's a checkin
    let actualPallets: number | undefined;
    if (door.currentCheckin) {
      const input = prompt(
        `How many pallets were ${door.currentCheckin.inboundOutbound === 'Inbound' ? 'offloaded' : 'loaded'}?\n\n(Expected: ${door.currentCheckin.pallets})`,
        door.currentCheckin.pallets.toString()
      );
      
      if (input === null) return; // User cancelled
      
      const parsed = parseInt(input, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        actualPallets = parsed;
      } else {
        alert('Invalid number. Using expected pallets.');
        actualPallets = door.currentCheckin.pallets;
      }
    }
    
    setUpdating(true);
    try {
      await apiClient.clearDoor({
        doorId: door.doorId,
        updatedBy: 'User',
        actualPallets,
      });
      setShowActions(false);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const statuses: DoorStatus[] = ['Open', 'Offload', 'Loading', 'Blocked', 'Waiting', 'Parked'];

  return (
    <div
      className={`dock-tile ${shouldFlash() ? 'flashing' : ''}`}
      onClick={() => setShowActions(!showActions)}
    >
      <div className="dock-tile-header">
        <span className="door-number">Door {door.doorId}</span>
        <span className={`door-status ${STATUS_COLORS[door.status]}`}>
          {door.status}
        </span>
      </div>

      <div className="door-timer">{formatElapsed(elapsed)}</div>

      {door.checkin ? (
        <div className="door-info">
          <div className="door-info-row">
            <span className="door-info-label">Type:</span>
            <span className="door-info-value">{door.checkin.inboundOutbound}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Company:</span>
            <span className="door-info-value">{door.checkin.company}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Driver:</span>
            <span className="door-info-value">{door.checkin.driverName}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">{door.checkin.inboundOutbound === 'Inbound' ? 'P/U #:' : 'S/O #:'}</span>
            <span className="door-info-value">{door.checkin.pickupNumber}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Pallets:</span>
            <span className="door-info-value">{door.checkin.pallets}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Commodity:</span>
            <span className="door-info-value">{door.checkin.commodity}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Forklift:</span>
            <span className="door-info-value">{door.checkin.forkliftDriver}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Checker:</span>
            <span className="door-info-value">{door.checkin.checker}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Plate:</span>
            <span className="door-info-value">{door.checkin.plateNumber}</span>
          </div>
          <div className="door-info-row">
            <span className="door-info-label">Phone:</span>
            <span className="door-info-value">{door.checkin.phoneNumber}</span>
          </div>
        </div>
      ) : (
        <div className="door-info">
          <div className="door-info-value" style={{ color: '#666' }}>No active check-in</div>
        </div>
      )}

      {showActions && (
        <div className="door-actions" onClick={(e) => e.stopPropagation()}>
          {statuses
            .filter(s => s !== door.status)
            .map(status => (
              <button
                key={status}
                className={`btn btn-sm ${STATUS_COLORS[status]}`}
                onClick={() => handleStatusChange(status)}
                disabled={updating}
              >
                {status}
              </button>
            ))}
          {door.checkin && (
            <button
              className="btn btn-sm btn-danger"
              onClick={handleClearDoor}
              disabled={updating}
            >
              Clear Door
            </button>
          )}
        </div>
      )}

      <div className="door-last-updated">
        Updated {formatDistanceToNow(new Date(door.updatedAt))} ago
      </div>
    </div>
  );
};

const LiveDockBoard: React.FC = () => {
  const { doors, loading } = useAppStore();

  if (loading) {
    return <div className="loading">Loading dock board...</div>;
  }

  return (
    <div>
      <MessageBanner channel="shipping-receiving" />
      <h1 className="page-title">Live Dock Board - 39 Doors</h1>
      <div className="dock-grid">
        {doors.map(door => (
          <DoorTile key={door.doorId} door={door} />
        ))}
      </div>
    </div>
  );
};

export default LiveDockBoard;
