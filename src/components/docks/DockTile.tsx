import React from 'react';
import { DockCheckin } from '../../shared/types';
import './DockTile.css';

export type DockStatus = 'open' | 'waiting' | 'loading' | 'offload' | 'parked' | 'offline';

interface DockTileProps {
  doorNumber: number;
  status: DockStatus;
  timer?: string;
  compact?: boolean;
  pulsing?: boolean;
  checkin?: DockCheckin | null;
  onClick?: () => void;
  onEdit?: () => void;
}

export const DockTile: React.FC<DockTileProps> = ({
  doorNumber,
  status,
  timer,
  compact = false,
  pulsing = false,
  checkin,
  onClick,
  onEdit,
}) => {
  const statusLabels: Record<DockStatus, string> = {
    open: 'OPEN',
    waiting: 'WAITING',
    loading: 'LOADING',
    offload: 'OFFLOAD',
    parked: 'PARKED',
    offline: 'OFFLINE',
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit();
    }
  };

  return (
    <div
      className={`dock-tile ${compact ? 'compact' : ''} ${pulsing ? 'pulsing' : ''}`}
      data-status={status}
      onClick={onClick}
    >
      <div className="dock-tile__label">D{doorNumber}</div>
      {checkin && onEdit && (
        <button className="dock-tile__edit-btn" onClick={handleEditClick} title="Edit check-in">
          ✏️
        </button>
      )}
      <div className="dock-tile__footer">
        {checkin ? (
          <>
            <div className="dock-tile__company">{checkin.company}</div>
            <div className="dock-tile__pickup">#{checkin.pickupNumber}</div>
            <div className="dock-tile__pallets">📦 {checkin.pallets} pallets</div>
            <div className="dock-tile__staff">
              <div>FL: {checkin.forkliftDriver}</div>
              <div>CK: {checkin.checker}</div>
            </div>
            {timer && <div className="dock-tile__timer">{timer}</div>}
          </>
        ) : (
          <>
            <div className="dock-tile__status">{statusLabels[status]}</div>
            {timer && <div className="dock-tile__timer">{timer}</div>}
          </>
        )}
      </div>
    </div>
  );
};
