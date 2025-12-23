import React from 'react';
import { RailButton } from '../common/RailButton';
import './RightRail.css';

interface RightRailProps {
  onHomeClick?: () => void;
  onSchedulerClick?: () => void;
  onPrintClick?: () => void;
}

export const RightRail: React.FC<RightRailProps> = ({
  onHomeClick,
  onSchedulerClick,
  onPrintClick,
}) => {
  return (
    <div className="right-rail">
      <button className="right-rail__home-btn" onClick={onHomeClick}>
        <span className="right-rail__home-icon">←</span>
        <span>Home</span>
      </button>

      <div className="right-rail__actions">
        <RailButton
          icon="📅"
          label="Scheduler"
          onClick={onSchedulerClick}
        />
        <RailButton
          icon="🖨"
          label="Print"
          onClick={onPrintClick}
        />
      </div>
    </div>
  );
};
