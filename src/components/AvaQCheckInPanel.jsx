import React, { useEffect, useMemo, useState } from 'react';
import AvatarStudio from './AvatarStudio';
import AvatarAgent from './AvatarAgent';
import { avatarStorageService } from '../services/avatarStorageService';
import { avaqBrainService } from '../services/avaqBrainService';
import { driverCheckInAvatarService } from '../services/driverCheckInAvatarService';
import { useAvatarSpeech } from '../hooks/useAvatarSpeech';
import defaultAvaQAvatar from '../renderer/assets/avatars/avaq.png';

const DEFAULT_AVATAR = {
  id: 'avaq_default',
  name: 'OpsIQ AvaQ Default',
  dataUrl: defaultAvaQAvatar,
};

export default function AvaQCheckInPanel() {
  const [avatar, setAvatar] = useState(() => avatarStorageService.getActiveAvatar() || DEFAULT_AVATAR);
  const [appointmentNumber, setAppointmentNumber] = useState('');
  const [message, setMessage] = useState('AvaQ ready for driver check-in.');
  const [status, setStatus] = useState('idle');
  const [isBusy, setIsBusy] = useState(false);
  const [showStudio, setShowStudio] = useState(false);

  const { say, think, alert, happy, isSpeaking, speechLevel, mode } = useAvatarSpeech({
    provider: avatarStorageService.getConfig().provider || 'browser',
    onStateChange: setStatus,
  });

  useEffect(() => {
    const start = async () => {
      const welcome = 'Welcome to OpsIQ check-in. Please enter your appointment number.';
      setMessage(welcome);
      await say(welcome);
    };
    void start();
  }, [say]);

  const assistantState = useMemo(() => {
    if (isBusy) return 'thinking';
    if (isSpeaking) return 'talking';
    return status || mode;
  }, [isBusy, isSpeaking, mode, status]);

  const handleAskBrain = async () => {
    const response = await avaqBrainService.respond(message, [{ message }]);
    setMessage(response);
    await say(response);
  };

  const handleCheckIn = async () => {
    const value = appointmentNumber.trim();
    if (!value) {
      const text = 'Please enter an appointment number first.';
      setMessage(text);
      await alert(text);
      return;
    }

    setIsBusy(true);
    think();

    try {
      const { speech } = await driverCheckInAvatarService.runCheckIn(value);
      const line = speech.lines.join(' ');
      setMessage(line);

      if (speech.status === 'found') {
        await happy(line);
      } else {
        await alert(line);
      }
    } catch (error) {
      const text = error?.message || 'Check-in validation failed.';
      setMessage(text);
      await alert(text);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="avaq-checkin-panel" aria-label="AvaQ Driver Check-In Agent">
      <div className="avaq-checkin-panel__header">
        <h2>AvaQ Driver Agent</h2>
        <button type="button" className="avaq-button" onClick={() => setShowStudio((prev) => !prev)}>
          {showStudio ? 'Hide Studio' : 'Avatar Studio'}
        </button>
      </div>

      <div className="avaq-checkin-panel__content">
        <AvatarAgent avatar={avatar} isSpeaking={isSpeaking} speechLevel={speechLevel} mode={assistantState} />

        <div className="avaq-checkin-panel__controls">
          <div className="avaq-checkin-panel__state">State: {assistantState}</div>
          <p className="avaq-checkin-panel__message">{message}</p>

          <div className="avaq-checkin-panel__row">
            <input
              type="text"
              value={appointmentNumber}
              onChange={(event) => setAppointmentNumber(event.target.value)}
              placeholder="Enter appointment number"
              className="avaq-input"
              disabled={isBusy}
            />
            <button type="button" className="avaq-button" onClick={handleCheckIn} disabled={isBusy}>
              {isBusy ? 'Checking...' : 'Validate'}
            </button>
          </div>

          <div className="avaq-checkin-panel__row">
            <button type="button" className="avaq-button" onClick={handleAskBrain} disabled={isBusy}>
              Ask AvaQ
            </button>
            <button type="button" className="avaq-button avaq-button--ghost" onClick={() => window.AvaQ?.stop?.()}>
              Stop Voice
            </button>
          </div>
        </div>
      </div>

      {showStudio && <AvatarStudio onAvatarChange={(nextAvatar) => setAvatar(nextAvatar || DEFAULT_AVATAR)} />}
    </section>
  );
}
