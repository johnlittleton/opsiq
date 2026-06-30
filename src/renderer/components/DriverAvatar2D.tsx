import React from 'react';
import './DriverAvatar2D.css';

type AvatarState = 'idle' | 'listening' | 'speaking';

interface DriverAvatar2DProps {
  state: AvatarState;
  message: string;
  driverName?: string;
}

export const DriverAvatar2D: React.FC<DriverAvatar2DProps> = ({ state, message, driverName }) => {
  const subtitle = driverName ? `Talking with ${driverName}` : 'Ready for next driver';

  return (
    <section className="driver-avatar-panel" aria-label="AI Driver Assistant">
      <div className={`driver-avatar driver-avatar--${state}`}>
        <div className="driver-avatar__ambient-ring" />
        <div className="driver-avatar__core-ring" />

        <div className="driver-avatar__helmet">
          <div className="driver-avatar__visor">
            <div className="driver-avatar__eyes">
              <span className="driver-avatar__eye" />
              <span className="driver-avatar__eye" />
            </div>

            <div className="driver-avatar__mouth-wrap">
              <span className="driver-avatar__mouth" />
            </div>

            <div className="driver-avatar__voice-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="driver-avatar__neck" />
          <div className="driver-avatar__chassis">
            <span className="driver-avatar__status-dot" />
            <span className="driver-avatar__mic-dot" />
          </div>
        </div>

        <div className="driver-avatar__rings">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="driver-avatar-panel__copy">
        <h3>Dock AI Assistant</h3>
        <p className="driver-avatar-panel__message">{message}</p>
        <small>{subtitle}</small>
      </div>
    </section>
  );
};
