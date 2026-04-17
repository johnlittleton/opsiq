import { useEffect, useRef, useState } from 'react';
import './KioskAvatar.css';

interface KioskAvatarProps {
  employeeName?: string;
  action?: 'clock-in' | 'clock-out';
  isSpeaking?: boolean;
}

const DEFAULT_ROBOT_IMAGE_SRC = '/slingshot-robot.png';

export function KioskAvatar({ employeeName = '', action, isSpeaking = false }: KioskAvatarProps) {
  const synth = useRef<SpeechSynthesis | null>(null);
  const animationRef = useRef<number | null>(null);
  const [lipSyncLevel, setLipSyncLevel] = useState(0);
  const [gestureState, setGestureState] = useState<'idle' | 'wave' | 'salute'>('idle');
  const [imageMissing, setImageMissing] = useState(false);

  useEffect(() => {
    synth.current = window.speechSynthesis;
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!employeeName || !action || !synth.current) return;

    synth.current.cancel();

    const firstName = employeeName.split(' ')[0];
    const checkInMessages = [
      `Good morning ${firstName}. You are clocked in.`,
      `Welcome back ${firstName}. Your shift is now active.`,
      `${firstName}, you are all set. Clock in confirmed.`,
    ];
    const checkOutMessages = [
      `Excellent work today ${firstName}. You are clocked out.`,
      `Great shift ${firstName}. Clock out confirmed.`,
      `${firstName}, your day is complete. You are clocked out.`,
    ];
    const pool = action === 'clock-in' ? checkInMessages : checkOutMessages;
    const message = pool[Math.floor(Math.random() * pool.length)];

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.92;
    utterance.pitch = 1.1;

    const voices = synth.current.getVoices();
    if (voices.length > 0) {
      const aiVoice = voices.find(
        (v) =>
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Victoria') ||
          v.name.includes('Moira')
      );
      if (aiVoice) {
        utterance.voice = aiVoice;
      }
    }

    let target = 0;
    const updateLipSync = () => {
      if (synth.current?.speaking) {
        target = Math.max(target, 0.25 + Math.random() * 0.45);
      }

      setLipSyncLevel((prev) => {
        const next = prev + (target - prev) * 0.35;
        return next < 0.02 ? 0 : next;
      });

      target *= 0.88;
      if (synth.current?.speaking || target > 0.04) {
        animationRef.current = requestAnimationFrame(updateLipSync);
      } else {
        setLipSyncLevel(0);
      }
    };

    utterance.onstart = () => {
      setGestureState(action === 'clock-in' ? 'wave' : 'salute');
      target = 0.4;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = requestAnimationFrame(updateLipSync);
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word' || event.charLength > 0) {
        target = 0.45 + Math.random() * 0.55;
      }
    };

    utterance.onend = () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setLipSyncLevel(0);
      setGestureState('idle');
    };

    utterance.onerror = () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setLipSyncLevel(0);
      setGestureState('idle');
    };

    synth.current.speak(utterance);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [employeeName, action]);

  return (
    <div className="kiosk-avatar">
      <div className={`slingshot ${isSpeaking ? 'slingshot--speaking' : ''} slingshot--${gestureState}`}>
        <img
          className="slingshot__image"
          src={DEFAULT_ROBOT_IMAGE_SRC}
          alt="Slingshot AI assistant robot"
          onError={() => setImageMissing(true)}
          onLoad={() => setImageMissing(false)}
          draggable={false}
        />

        {!imageMissing && (
          <>
            <div className={`slingshot__eye-glow slingshot__eye-glow--left ${isSpeaking ? 'slingshot__eye-glow--active' : ''}`}></div>
            <div className={`slingshot__eye-glow slingshot__eye-glow--right ${isSpeaking ? 'slingshot__eye-glow--active' : ''}`}></div>

            <div className={`slingshot__mouth-sync ${isSpeaking ? 'slingshot__mouth-sync--active' : ''}`}>
              <div className="slingshot__mouth-bar" style={{ transform: `scaleY(${0.35 + lipSyncLevel * 0.9})` }}></div>
              <div className="slingshot__mouth-bar" style={{ transform: `scaleY(${0.45 + lipSyncLevel * 0.65})` }}></div>
              <div className="slingshot__mouth-bar" style={{ transform: `scaleY(${0.4 + lipSyncLevel * 1.05})` }}></div>
              <div className="slingshot__mouth-bar" style={{ transform: `scaleY(${0.3 + lipSyncLevel * 0.8})` }}></div>
            </div>

            <div className={`slingshot__chest-led ${isSpeaking ? 'slingshot__chest-led--active' : ''}`}></div>
            <div className={`slingshot__hand-pulse ${gestureState !== 'idle' ? 'slingshot__hand-pulse--active' : ''}`}></div>
          </>
        )}

        {imageMissing && <div className="slingshot__missing">Missing image: add provided robot image at /public/slingshot-robot.png</div>}
      </div>

      {employeeName && action && (
        <div className={`slingshot__message ${action === 'clock-in' ? 'slingshot__message--in' : 'slingshot__message--out'}`}>
          <div className="slingshot__message-label">{action === 'clock-in' ? 'Clock In Confirmed' : 'Clock Out Confirmed'}</div>
          <div className="slingshot__message-name">{employeeName.split(' ')[0]}</div>
        </div>
      )}
    </div>
  );
}
