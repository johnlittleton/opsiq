import React from 'react';
import './Legend.css';

export const Legend: React.FC = () => {
  const items = [
    { key: 'open', label: 'Open' },
    { key: 'loading', label: 'Loading' },
    { key: 'offload', label: 'Offloading' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'offline', label: 'Offline' },
  ];

  return (
    <div className="legend">
      <div className="legend__title">Status Legend</div>
      <div className="legend__items">
        {items.map((item) => (
          <div key={item.key} className="legend__item">
            <div className={`legend__dot legend__dot--${item.key}`} />
            <div className="legend__label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
