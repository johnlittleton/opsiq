import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RiggedAvatar } from '../components/RiggedAvatar';
import { AvatarBrainState, AvatarStateMachine, AvatarTurn } from '../avatar/AvatarStateMachine';
import { API_BASE } from '../services/config';
import './DriverAvatarPage.css';

const DriverAvatarPage: React.FC = () => {
  const navigate = useNavigate();
  const machineRef = useRef<AvatarStateMachine | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechAnimationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const [brainState, setBrainState] = useState<AvatarBrainState>('idle');
  const [speechLevel, setSpeechLevel] = useState(0);
  const [assistantLine, setAssistantLine] = useState('Ava is ready. Ask about dock status, check-in steps, or alerts.');
  const [turns, setTurns] = useState<AvatarTurn[]>([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [preferredShort, setPreferredShort] = useState(true);
  const [driverName, setDriverName] = useState('');
  const [company, setCompany] = useState('');
  const [lastIntents, setLastIntents] = useState<string[]>([]);
  const [unresolvedTasks, setUnresolvedTasks] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(true);

  const handleMinimize = () => {
    window.electron?.minimize?.();
  };

  const handleMaximize = () => {
    window.electron?.maximize?.();
  };

  const stopSpeechTracking = () => {
    if (speechAnimationFrameRef.current !== null) {
      cancelAnimationFrame(speechAnimationFrameRef.current);
      speechAnimationFrameRef.current = null;
    }
    setSpeechLevel(0);
  };

  const stopSpeaking = () => {
    stopSpeechTracking();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    speechSynthesisRef.current?.cancel();
  };

  const trackSpeechFromAudio = async (audio: HTMLAudioElement) => {
    stopSpeechTracking();

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextCtor();
    }

    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => undefined);
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;

    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const sample = () => {
      analyser.getByteFrequencyData(data);
      const energy = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length * 255);
      const eased = Math.max(0, Math.min(1, energy * 2.8));
      setSpeechLevel((current) => Math.max(eased, current * 0.68));

      if (!audio.paused && !audio.ended) {
        speechAnimationFrameRef.current = requestAnimationFrame(sample);
      } else {
        stopSpeechTracking();
      }
    };

    const cleanup = () => {
      source.disconnect();
      analyser.disconnect();
      audio.removeEventListener('ended', cleanup);
      audio.removeEventListener('pause', cleanup);
    };

    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('pause', cleanup, { once: true });
    speechAnimationFrameRef.current = requestAnimationFrame(sample);
  };

  const trackSpeechFallback = () => {
    stopSpeechTracking();

    const sample = () => {
      const t = performance.now() * 0.001;
      const envelope = 0.18 + Math.max(0, Math.sin(t * 11)) * 0.72 + Math.max(0, Math.sin(t * 6.5 + 0.8)) * 0.18;
      setSpeechLevel(Math.min(1, envelope));
      speechAnimationFrameRef.current = requestAnimationFrame(sample);
    };

    speechAnimationFrameRef.current = requestAnimationFrame(sample);
  };

  const playServerSpeech = async (text: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/kiosk/assistant/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error('Voice service unavailable');
    }

    const audioBlob = await response.blob();
    if (!audioBlob.size) {
      throw new Error('Voice audio was empty');
    }

    stopSpeaking();

    const audioUrl = URL.createObjectURL(audioBlob);
    audioUrlRef.current = audioUrl;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    await trackSpeechFromAudio(audio).catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed'));
      void audio.play().catch(reject);
    }).finally(() => {
      if (audioRef.current === audio) {
        audioRef.current = null;
      }

      if (audioUrlRef.current === audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrlRef.current = null;
      }
    });
  };

  const speakWithBrowserVoiceFallback = async (text: string): Promise<void> => {
    const synth = speechSynthesisRef.current;
    if (!synth || !text.trim()) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = preferredShort ? 1.04 : 0.98;
    utterance.pitch = 1.1;

    const voices = synth.getVoices();
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

    await new Promise<void>((resolve) => {
      utterance.onstart = () => {
        trackSpeechFallback();
      };
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    }).finally(() => {
      stopSpeechTracking();
    });
  };

  const speakWithPauses = async (text: string, onStart: () => void, onEnd: () => void): Promise<void> => {
    if (!text.trim()) {
      onEnd();
      return;
    }

    const chunks = text
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .flatMap((sentence) => {
        const words = sentence.split(/\s+/).filter(Boolean);
        if (words.length <= 14) return [sentence];
        const output: string[] = [];
        for (let i = 0; i < words.length; i += 10) {
          output.push(words.slice(i, i + 10 + Math.floor(Math.random() * 4)).join(' '));
        }
        return output;
      });

    onStart();

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];

      try {
        await playServerSpeech(chunk);
      } catch {
        await speakWithBrowserVoiceFallback(chunk);
      }

      if (i < chunks.length - 1) {
        const pauseMs = 170 + Math.floor(Math.random() * 260);
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
    }

    onEnd();
  };

  const inferIntent = (message: string): string => {
    const lower = message.toLowerCase();
    if (/(dock|door|trailer|yard)/.test(lower)) return 'dock-status';
    if (/(check|check-in|checkin|driver)/.test(lower)) return 'check-in';
    if (/(alert|issue|problem|error)/.test(lower)) return 'alert';
    if (/(task|todo|follow up|remind)/.test(lower)) return 'task';
    return 'general';
  };

  const updateDerivedMemory = (allTurns: AvatarTurn[]) => {
    const recentUserTurns = allTurns.filter((turn) => turn.role === 'user').slice(-3);
    const inferredTasks = recentUserTurns
      .map((turn) => turn.content)
      .filter((msg) => /(need|follow up|remind|todo|pending|issue)/i.test(msg))
      .slice(-3);
    setUnresolvedTasks(inferredTasks);
    machineRef.current?.setUnresolvedTasks(inferredTasks);
  };

  const testVoice = async (): Promise<void> => {
    if (isSending) return;
    stopSpeaking();
    machineRef.current?.onInterrupt();
    const sample = 'Hello, I am Ava. This is a live voice test in the driver avatar page.';
    setAssistantLine(sample);
    try {
      machineRef.current?.forceState('speaking');
      await speakWithPauses(
        sample,
        () => { machineRef.current?.onSpeechStarted(); },
        () => { machineRef.current?.onSpeechFinished(); }
      );
    } catch {
      machineRef.current?.forceState('concerned');
      setAssistantLine('Voice test failed. Check the speech service or fallback voice availability.');
    }
  };

  const sendTurn = async (rawMessage: string, source: 'typed' | 'voice'): Promise<void> => {
    const message = rawMessage.trim();
    if (!message || isSending) return;

    stopSpeaking();
    machineRef.current?.onInterrupt();

    const intent = inferIntent(message);
    machineRef.current?.onUserInput(message, intent);
    setIsSending(true);

    const localContext = turns.map((turn) => ({ role: turn.role, content: turn.content }));

    const acknowledgements = ['Got it.', 'One sec.', 'Thanks, checking now.'];
    const ack = acknowledgements[Math.floor(Math.random() * acknowledgements.length)];
    setAssistantLine(ack);

    try {
      machineRef.current?.onAiRequestStarted();
      const thinkingDelay = 200 + Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, thinkingDelay));

      const response = await fetch(`${API_BASE}/api/kiosk/assistant/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: localContext,
          employeeName: driverName || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || `Assistant request failed (${response.status})`));
      }

      const reply = String(payload?.reply || '').trim() || 'I am here. Please try that one more time.';
      const nextState = machineRef.current?.onAiReply(reply, source === 'voice' ? 'voice-reply' : 'typed-reply') || 'speaking';
      setAssistantLine(reply);

      const nextTurns: AvatarTurn[] = [
        ...turns,
        { role: 'user', content: message, at: Date.now() },
        { role: 'assistant', content: reply, at: Date.now() },
      ].slice(-16);
      setTurns(nextTurns);
      updateDerivedMemory(nextTurns);

      await speakWithPauses(
        reply,
        () => {
          machineRef.current?.onSpeechStarted();
        },
        () => {
          if (nextState === 'happy' || nextState === 'concerned' || nextState === 'confused') {
            setTimeout(() => machineRef.current?.onSpeechFinished(), 900);
          } else {
            machineRef.current?.onSpeechFinished();
          }
        }
      );
    } catch (error: any) {
      const fallback = String(error?.message || 'Assistant request failed.');
      setAssistantLine(fallback);
      machineRef.current?.forceState('concerned');
    } finally {
      setIsSending(false);
    }
  };

  const startVoiceCapture = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAssistantLine('Voice recognition is not available in this build. Use text input below.');
      return;
    }

    stopSpeaking();
    machineRef.current?.onInterrupt();
    setIsListening(true);
    machineRef.current?.forceState('listening');

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript) {
        setInputText(transcript);
        void sendTurn(transcript, 'voice');
      }
    };

    recognition.onerror = () => {
      setAssistantLine('I could not hear that clearly. Please try again.');
      machineRef.current?.forceState('confused');
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (!isSending) {
        machineRef.current?.onSpeechFinished();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  useEffect(() => {
    speechSynthesisRef.current = window.speechSynthesis || null;
    const machine = new AvatarStateMachine(20000);
    machineRef.current = machine;

    const unsubscribe = machine.subscribe((snapshot) => {
      setBrainState(snapshot.state);
      setLastIntents(snapshot.memory.lastIntents);
      setUnresolvedTasks(snapshot.memory.unresolvedTasks);
      if (snapshot.lastMessage) {
        setAssistantLine(snapshot.lastMessage);
      }
    });

    return () => {
      unsubscribe();
      machine.dispose();
      machineRef.current = null;
      stopSpeaking();
      stopVoiceCapture();
    };
  }, []);

  useEffect(() => {
    machineRef.current?.setIdentity(driverName, company);
    machineRef.current?.setPreferredShortPhrasing(preferredShort);
  }, [driverName, company, preferredShort]);

  const debugSummary = useMemo(() => {
    return {
      state: brainState,
      turns: turns.length,
      intents: lastIntents,
      unresolved: unresolvedTasks,
      listening: isListening,
      sending: isSending,
    };
  }, [brainState, turns.length, lastIntents, unresolvedTasks, isListening, isSending]);

  const rigState: 'idle' | 'listening' | 'speaking' = brainState === 'speaking'
    ? 'speaking'
    : brainState === 'listening'
      ? 'listening'
      : 'idle';

  return (
    <div className="driver-avatar-page">
      <div className="driver-avatar-page__construction">Under Construction</div>
      <div className="driver-avatar-page__nav">
        <div className="driver-avatar-page__nav-left">
          <button className="driver-avatar-page__control-button" onClick={() => navigate('/')}>Home</button>
          <button className="driver-avatar-page__control-button" onClick={() => navigate('/checkin')}>Check-In</button>
          <button className="driver-avatar-page__control-button" onClick={() => navigate('/dockboard')}>Dock Board</button>
          <button
            className="driver-avatar-page__control-button driver-avatar-page__control-button--primary"
            onClick={() => void testVoice()}
            disabled={isSending}
          >
            Test Voice
          </button>
        </div>

        <div className="driver-avatar-page__nav-right">
          <button className="driver-avatar-page__window-button" onClick={handleMinimize} aria-label="Minimize window">
            −
          </button>
          <button className="driver-avatar-page__window-button" onClick={handleMaximize} aria-label="Maximize window">
            □
          </button>
        </div>
      </div>

      <div className="driver-avatar-page__stage">
        <div className="driver-avatar-page__dashboard">
          <div className="driver-avatar-page__dashboard-panel driver-avatar-page__dashboard-panel--left">
            <div className="driver-avatar-page__brand-card">
              <div className="driver-avatar-page__brand-mark">Q</div>
              <div>
                <div className="driver-avatar-page__brand-name">OpsIQ</div>
                <div className="driver-avatar-page__brand-subtitle">Operations Assistant</div>
              </div>
            </div>

            <div className="driver-avatar-page__metric-card">
              <div className="driver-avatar-page__metric-title">Dock Status</div>
              <div className="driver-avatar-page__metric-value">24</div>
              <div className="driver-avatar-page__metric-subtitle">Total Docks</div>
            </div>

            <div className="driver-avatar-page__metric-card">
              <div className="driver-avatar-page__metric-title">Trailer Check-Ins</div>
              <div className="driver-avatar-page__metric-row">
                <span className="driver-avatar-page__metric-value driver-avatar-page__metric-value--small">36</span>
                <span className="driver-avatar-page__metric-label">Checked In</span>
              </div>
              <div className="driver-avatar-page__metric-row">
                <span className="driver-avatar-page__metric-value driver-avatar-page__metric-value--small">5</span>
                <span className="driver-avatar-page__metric-label">Pending</span>
              </div>
            </div>
          </div>

          <div className="driver-avatar-page__avatar-shell">
            <RiggedAvatar state={rigState} />
          </div>

          <div className="driver-avatar-page__dashboard-panel driver-avatar-page__dashboard-panel--right">
            <div className="driver-avatar-page__metric-card driver-avatar-page__metric-card--chart">
              <div className="driver-avatar-page__metric-title">Warehouse Activity</div>
              <div className="driver-avatar-page__chart">▁▂▃▄▅▆▇█</div>
            </div>

            <div className="driver-avatar-page__metric-card">
              <div className="driver-avatar-page__metric-title">KPI Overview</div>
              <div className="driver-avatar-page__metric-row">
                <span className="driver-avatar-page__metric-label">On Time Loads</span>
                <span className="driver-avatar-page__metric-value driver-avatar-page__metric-value--small">92%</span>
              </div>
              <div className="driver-avatar-page__metric-row">
                <span className="driver-avatar-page__metric-label">Dock Utilization</span>
                <span className="driver-avatar-page__metric-value driver-avatar-page__metric-value--small">78%</span>
              </div>
            </div>

            <div className="driver-avatar-page__metric-card">
              <div className="driver-avatar-page__metric-title">Announcements</div>
              <div className="driver-avatar-page__announcement">Safety meeting today at 2:00 PM in Bay 3.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverAvatarPage;