import { useEffect, useRef, useState } from 'react';

export function useCameraPresence(enabled = true) {
  const [isPresent, setIsPresent] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!enabled) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) return;
        streamRef.current = stream;
        setError('');

        timerRef.current = window.setInterval(() => {
          setIsPresent((prev) => !prev ? true : prev);
        }, 1800);
      } catch (err) {
        setError(String(err?.message || err));
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [enabled]);

  return {
    isPresent,
    cameraError: error,
    mediaStream: streamRef.current,
  };
}
