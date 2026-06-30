import { useEffect, useRef, useState } from 'react';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function useLipSync({ isSpeaking, speechLevel = 0, thinking = false, lookDirection = 'center' }) {
  const frameRef = useRef(null);
  const [pose, setPose] = useState({
    mouthOpen: 0,
    blink: 0,
    headX: 0,
    headY: 0,
    breath: 0,
    lookX: 0,
  });

  useEffect(() => {
    const animate = () => {
      const t = performance.now() * 0.001;
      const speakingEnvelope = isSpeaking ? clamp(0.15 + speechLevel * 0.95 + Math.max(0, Math.sin(t * 12)) * 0.28) : 0;
      const blinkPulse = Math.max(0, Math.sin(t * 0.9 + 0.3)) > 0.985 ? 1 : 0;
      const headX = Math.sin(t * 0.55) * 0.018 + (thinking ? Math.sin(t * 1.6) * 0.01 : 0);
      const headY = Math.sin(t * 0.8) * 0.012 + (isSpeaking ? Math.sin(t * 1.8) * 0.008 : 0);
      const breath = 1 + Math.sin(t * 0.65) * 0.012;
      const lookX =
        lookDirection === 'left' ? -0.22 : lookDirection === 'right' ? 0.22 : Math.sin(t * 0.35) * 0.08;

      setPose({
        mouthOpen: speakingEnvelope,
        blink: blinkPulse,
        headX,
        headY,
        breath,
        lookX,
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isSpeaking, speechLevel, thinking, lookDirection]);

  return pose;
}
