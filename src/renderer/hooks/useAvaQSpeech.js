/**
 * useAvaQSpeech
 * Drives browser SpeechSynthesis and exposes a live amplitude value
 * (0-1) that the avatar uses for simulated lip movement.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const VOICE_PREF_NAMES = ['Google UK English Female', 'Samantha', 'Victoria', 'Moira', 'Google US English'];

function pickVoice(synth) {
  const voices = synth.getVoices();
  for (const pref of VOICE_PREF_NAMES) {
    const match = voices.find((v) => v.name.includes(pref));
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith('en')) || null;
}

export function useAvaQSpeech() {
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const frameRef = useRef(null);
  const utteranceRef = useRef(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [amplitude, setAmplitude] = useState(0);

  const stopSpeechAnim = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setAmplitude(0);
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.cancel();
    stopSpeechAnim();
    setIsSpeaking(false);
  }, [stopSpeechAnim]);

  // Simulate amplitude envelope while speaking (no AudioContext needed).
  const runEnvelope = useCallback(() => {
    const tick = () => {
      if (!synthRef.current?.speaking) {
        stopSpeechAnim();
        setIsSpeaking(false);
        return;
      }
      const t = performance.now() * 0.001;
      // Layered sine waves produce a realistic mouth-movement feel.
      const raw =
        0.35 +
        Math.max(0, Math.sin(t * 11.3)) * 0.45 +
        Math.max(0, Math.sin(t * 7.1 + 0.9)) * 0.2;
      setAmplitude(Math.min(1, raw));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [stopSpeechAnim]);

  const say = useCallback(
    (text, { rate = 1.0, pitch = 1.05 } = {}) => {
      if (!synthRef.current || !text?.trim()) return Promise.resolve();

      return new Promise((resolve) => {
        stop();

        const utterance = new SpeechSynthesisUtterance(text.trim());
        utterance.rate = rate;
        utterance.pitch = pitch;

        const assignVoice = () => {
          const voice = pickVoice(synthRef.current);
          if (voice) utterance.voice = voice;
        };

        if (synthRef.current.getVoices().length) {
          assignVoice();
        } else {
          speechSynthesis.addEventListener('voiceschanged', assignVoice, { once: true });
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
          runEnvelope();
        };

        utterance.onend = () => {
          stopSpeechAnim();
          setIsSpeaking(false);
          resolve();
        };

        utterance.onerror = () => {
          stopSpeechAnim();
          setIsSpeaking(false);
          resolve();
        };

        utteranceRef.current = utterance;
        synthRef.current.speak(utterance);
      });
    },
    [stop, runEnvelope, stopSpeechAnim]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { say, stop, isSpeaking, amplitude };
}
