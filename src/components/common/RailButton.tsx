import React from 'react';
import './RailButton.css';

interface RailButtonProps {
  icon: string;
  label: string;
  onClick?: () => void;
}

export const RailButton: React.FC<RailButtonProps> = ({ icon, label, onClick }) => {
  return (
    <button className="rail-button" onClick={onClick}>
      <span className="rail-button__icon">{icon}</span>
      <span className="rail-button__label">{label}</span>
    </button>
  );
};
