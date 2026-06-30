/**
 * AvaQController
 * Mounts AvaQAvatar and wires up window.AvaQ so any part of the app can call:
 *
 *   window.AvaQ.say(text)             — speak text, switch to Talking, return to Idle when done
 *   window.AvaQ.play(animationName)   — immediately switch animation
 *   window.AvaQ.stop()               — stop speaking and return to Idle
 *   window.AvaQ.setEmotion(emotion)  — map emotion string to an animation ('happy', 'thinking', etc.)
 *
 * Usage:
 *   <AvaQController />
 *
 * It also exposes a ref-based API via the `onReady` prop for component-level integration.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AvaQAvatar } from './AvaQAvatar';
import { useAvaQSpeech } from '../hooks/useAvaQSpeech';

const EMOTION_MAP = {
  happy:     'Waving',
  excited:   'Waving',
  sad:       'BreathingIdle',
  thinking:  'Idle',
  confused:  'Idle',
  concerned: 'BreathingIdle',
  listening: 'Idle',
  idle:      'Idle',
  walking:   'Walking',
  waving:    'Waving',
  breathing: 'BreathingIdle',
};

export function AvaQController({ onReady, style }) {
  const [animationName, setAnimationName] = useState('Idle');
  const animRef = useRef('Idle');
  const { say: speechSay, stop: speechStop, isSpeaking, amplitude } = useAvaQSpeech();

  // Mouse tracking for head follow
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e) => {
      setMouse({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const switchAnim = useCallback((name) => {
    animRef.current = name;
    setAnimationName(name);
  }, []);

  const say = useCallback(
    async (text) => {
      if (!text?.trim()) return;
      switchAnim('Talking');
      await speechSay(text);
      // Return to idle only if still in Talking (not overridden by play/setEmotion)
      if (animRef.current === 'Talking') {
        switchAnim('Idle');
      }
    },
    [speechSay, switchAnim]
  );

  const play = useCallback(
    (name) => {
      speechStop();
      switchAnim(name || 'Idle');
    },
    [speechStop, switchAnim]
  );

  const stop = useCallback(() => {
    speechStop();
    switchAnim('Idle');
  }, [speechStop, switchAnim]);

  const setEmotion = useCallback(
    (emotion) => {
      const mapped = EMOTION_MAP[String(emotion).toLowerCase()] || 'Idle';
      switchAnim(mapped);
    },
    [switchAnim]
  );

  // Expose window.AvaQ
  useEffect(() => {
    window.AvaQ = { say, play, stop, setEmotion };
    return () => {
      delete window.AvaQ;
    };
  }, [say, play, stop, setEmotion]);

  // Notify parent with the API ref
  useEffect(() => {
    if (typeof onReady === 'function') {
      onReady({ say, play, stop, setEmotion });
    }
  }, [onReady, say, play, stop, setEmotion]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        ...style,
      }}
    >
      <AvaQAvatar
        animationName={animationName}
        amplitude={isSpeaking ? amplitude : 0}
        mouseX={mouse.x}
        mouseY={mouse.y}
      />
    </div>
  );
}
