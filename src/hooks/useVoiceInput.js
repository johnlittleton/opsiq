import { useCallback, useMemo, useRef, useState } from 'react';

export function useVoiceInput({ onTranscript }) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [supported] = useState(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));

  const createRecognition = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;

    const instance = new Ctor();
    instance.continuous = false;
    instance.interimResults = false;
    instance.lang = 'en-US';

    instance.onstart = () => setListening(true);
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    instance.onresult = (event) => {
      const text = event?.results?.[0]?.[0]?.transcript || '';
      if (text.trim()) onTranscript(text.trim());
    };

    recognitionRef.current = instance;
    return instance;
  }, [onTranscript]);

  const startListening = useCallback(() => {
    const rec = recognitionRef.current || createRecognition();
    rec?.start();
  }, [createRecognition]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return useMemo(() => ({ listening, supported, startListening, stopListening }), [listening, supported, startListening, stopListening]);
}
