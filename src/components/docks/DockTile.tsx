import React from 'react';
import { DockCheckin } from '../../shared/types';
import './DockTile.css';

export type DockStatus = 'open' | 'waiting' | 'loading' | 'offload' | 'checked-in' | 'parked' | 'offline' | 'dropped';

interface DockTileProps {
  doorNumber: number;
  status: DockStatus;
  timer?: string;
  compact?: boolean;
  pulsing?: boolean;
  checkin?: DockCheckin | null;
  onClick?: () => void;
  onEdit?: () => void;
  onOpenForm?: () => void;
  hasFormOnFile?: boolean;
  overdue?: boolean;
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
  onOpenForm,
  hasFormOnFile = false,
  overdue = false,
}) => {
  const statusLabels: Record<DockStatus, string> = {
    open: 'OPEN',
    waiting: 'WAITING',
    loading: 'LOADING',
    offload: 'OFFLOAD',
    'checked-in': 'CHECKED IN',
    parked: 'PARKED',
    dropped: 'DROPPED',
    offline: 'OFFLINE',
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit();
    }
  };

  const handleFormClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenForm) {
      onOpenForm();
    }
  };

  return (
    <div
      className={`dock-tile ${compact ? 'compact' : ''} ${pulsing ? 'pulsing' : ''} ${overdue ? 'overdue' : ''}`}
      data-status={status}
      onClick={onClick}
    >
      <div className="dock-tile__label">D{doorNumber}</div>
      {overdue && <div className="dock-tile__overdue-alert">OVER 60 MIN</div>}
      {checkin && onOpenForm && (
        <button
          className={`dock-tile__verify-btn ${hasFormOnFile ? 'has-form' : ''}`}
          onClick={handleFormClick}
          title={hasFormOnFile ? 'Verification on file - open form' : 'Open verification form'}
        >
          ✓
        </button>
      )}
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
