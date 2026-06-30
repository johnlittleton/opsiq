import { useCallback, useEffect, useRef, useState } from 'react';

function chooseVoice(voices) {
  return (
    voices.find((voice) => /Google|Samantha|Victoria|Jenny/i.test(voice.name)) ||
    voices.find((voice) => /^en/i.test(voice.lang)) ||
    voices[0] ||
    null
  );
}

export function useAvatarSpeech({ provider = 'browser', onStateChange } = {}) {
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const utteranceRef = useRef(null);
  const frameRef = useRef(null);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mode, setMode] = useState('idle');

  const stopAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setSpeechLevel(0);
  }, []);

  const runSpeechEnvelope = useCallback(() => {
    const tick = () => {
      const t = performance.now() * 0.001;
      const level = 0.2 + Math.max(0, Math.sin(t * 10.7)) * 0.6 + Math.max(0, Math.sin(t * 7.2 + 0.4)) * 0.22;
      setSpeechLevel(Math.min(1, level));
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setMode('idle');
    stopAnimation();
    onStateChange?.('idle');
  }, [onStateChange, stopAnimation]);

  const speakWithBrowser = useCallback(
    async (text) => {
      const value = String(text || '').trim();
      if (!value || !synthRef.current) return;

      stop();
      setMode('talking');
      onStateChange?.('talking');

      await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(value);
        utterance.rate = 1.02;
        utterance.pitch = 1.05;

        const assignVoice = () => {
          const voices = synthRef.current?.getVoices?.() || [];
          const voice = chooseVoice(voices);
          if (voice) {
            utterance.voice = voice;
          }
        };

        assignVoice();
        if (!utterance.voice) {
          window.speechSynthesis.addEventListener('voiceschanged', assignVoice, { once: true });
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
          runSpeechEnvelope();
        };

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();

        utteranceRef.current = utterance;
        synthRef.current?.speak(utterance);
      });

      setIsSpeaking(false);
      setMode('idle');
      stopAnimation();
      onStateChange?.('idle');
    },
    [onStateChange, runSpeechEnvelope, stop, stopAnimation]
  );

  const speakWithElevenLabs = useCallback(
    async (text) => {
      // MVP fallback: keeps the provider interface stable for a drop-in ElevenLabs integration.
      return speakWithBrowser(text);
    },
    [speakWithBrowser]
  );

  const say = useCallback(
    async (text) => {
      if (provider === 'elevenlabs') {
        return speakWithElevenLabs(text);
      }
      return speakWithBrowser(text);
    },
    [provider, speakWithBrowser, speakWithElevenLabs]
  );

  const think = useCallback(() => {
    setMode('thinking');
    setIsSpeaking(false);
    stopAnimation();
    onStateChange?.('thinking');
  }, [onStateChange, stopAnimation]);

  const alert = useCallback(
    async (text) => {
      setMode('alert');
      onStateChange?.('alert');
      await say(text);
    },
    [onStateChange, say]
  );

  const happy = useCallback(
    async (text) => {
      setMode('happy');
      onStateChange?.('happy');
      await say(text);
    },
    [onStateChange, say]
  );

  useEffect(() => {
    window.AvaQ = {
      say,
      stop,
      think,
      alert,
      happy,
      speakWithBrowser,
      speakWithElevenLabs,
      provider,
    };

    return () => {
      delete window.AvaQ;
      stop();
    };
  }, [happy, provider, say, speakWithBrowser, speakWithElevenLabs, stop, think, alert]);

  return {
    isSpeaking,
    speechLevel,
    mode,
    say,
    stop,
    think,
    alert,
    happy,
    speakWithBrowser,
    speakWithElevenLabs,
    provider,
  };
}
