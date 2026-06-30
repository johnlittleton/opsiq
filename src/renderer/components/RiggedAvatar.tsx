import React from 'react';
import avaqAvatar from '../assets/avatars/avaq.png';
import './RiggedAvatar.css';

type RigState = 'idle' | 'listening' | 'speaking';

interface RiggedAvatarProps {
  state: RigState;
  speechLevel?: number;
}

export const RiggedAvatar: React.FC<RiggedAvatarProps> = ({ state, speechLevel = 0 }) => {
  const talkAmount = Math.max(0, Math.min(1, speechLevel));
  const headTilt = state === 'speaking' ? Math.min(1, 0.35 + talkAmount * 0.9) : state === 'listening' ? 0.18 : 0.06;
  const mouthOpen = state === 'speaking' ? Math.min(1, 0.2 + talkAmount * 1.05) : 0;
  const eyeGlow = state === 'speaking' ? 1 : state === 'listening' ? 0.85 : 0.7;

  return (
    <div
      className={`rigged-avatar rigged-avatar--${state}`}
      aria-label="Rigged AvaQ avatar"
      style={{
        ['--talk-amount' as any]: talkAmount,
        ['--head-tilt' as any]: `${headTilt}deg`,
        ['--mouth-open' as any]: mouthOpen,
        ['--eye-glow' as any]: eyeGlow,
      }}
    >
      <div className="rigged-avatar__ring" aria-hidden="true" />

      <div className="rigged-avatar__halo" aria-hidden="true" />

      <div className="rigged-avatar__layer rigged-avatar__layer--torso">
        <img src={avaqAvatar} alt="" aria-hidden="true" />
      </div>

      <div className="rigged-avatar__layer rigged-avatar__layer--head">
        <img src={avaqAvatar} alt="OpsIQ AvaQ driver assistant avatar" />
      </div>

      <div className="rigged-avatar__neck" aria-hidden="true" />
      <div className="rigged-avatar__shoulder rigged-avatar__shoulder--left" aria-hidden="true" />
      <div className="rigged-avatar__shoulder rigged-avatar__shoulder--right" aria-hidden="true" />

      <span className="rigged-avatar__eye rigged-avatar__eye--left" aria-hidden="true" />
      <span className="rigged-avatar__eye rigged-avatar__eye--right" aria-hidden="true" />
      <span className="rigged-avatar__mouth" aria-hidden="true" />
    </div>
  );
};
