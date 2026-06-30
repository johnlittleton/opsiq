import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AvaqFbxAvatar } from '../../renderer/components/AvaqFbxAvatar';
import { useCameraPresence } from '../../hooks/useCameraPresence';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useAvaQConversation } from '../../hooks/useAvaQConversation';
import { useAvatarSpeech } from '../../hooks/useAvatarSpeech';
import { avatarStorageService } from '../../services/avatarStorageService';
import { avaqApiClient } from '../../services/avaqApiClient';
import { API_BASE } from '../../renderer/services/config';
import './AvaQKiosk.css';

const IDLE_TIMEOUT_MS = 45_000;
const GREETING = 'Welcome to OPSIQ. Are you here for driver check-in?';

export default function AvaQKiosk() {
  const [avatarObj, setAvatarObj] = useState(() => avatarStorageService.getActiveAvatar());
  const [kioskEnabled, setKioskEnabled] = useState(true);
  const [voiceId, setVoiceId] = useState('avaq-default');
  const [subtitle, setSubtitle] = useState('Welcome. I\'m AvaQ — tap the mic or type to begin.');
  const [textInput, setTextInput] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPinMode, setAdminPinMode] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const idleTimerRef = useRef(null);
  const textInputRef = useRef(null);

  useCameraPresence(kioskEnabled);
  const { say, stop, isSpeaking, speechLevel } = useAvatarSpeech({ provider: 'browser' });

  const speakText = useCallback(async (text) => {
    if (!kioskEnabled || !text.trim()) return;
    stop();
    setSubtitle(text);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/assistant/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          await audio.play();
          await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; });
          URL.revokeObjectURL(url);
          return;
        }
      }
    } catch { /* fall through */ }
    await say(text);
  }, [kioskEnabled, say, stop]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => void speakText(GREETING), IDLE_TIMEOUT_MS);
  }, [speakText]);

  const conversation = useAvaQConversation({ onAssistantReply: speakText });

  const handleMessage = useCallback((text) => {
    resetIdleTimer();
    void conversation.sendMessage(text);
  }, [conversation, resetIdleTimer]);

  const voice = useVoiceInput({ onTranscript: (text) => handleMessage(text) });

  const agentMode = useMemo(() => {
    if (isSpeaking) return 'talking';
    if (conversation.busy) return 'thinking';
    return 'idle';
  }, [isSpeaking, conversation.busy]);

  const riggedState = useMemo(() => {
    if (agentMode === 'talking') return 'speaking';
    if (agentMode === 'thinking') return 'thinking';
    return 'idle';
  }, [agentMode]);

  const handleTextSend = useCallback(() => {
    const t = textInput.trim();
    if (!t || conversation.busy) return;
    setTextInput('');
    handleMessage(t);
  }, [conversation.busy, handleMessage, textInput]);

  const tryAdminPin = useCallback(async () => {
    setAdminError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin }),
      });
      const data = await res.json();
      if (data?.success) {
        setAdminOpen(true);
        setAdminPinMode(false);
        setAdminPin('');
      } else {
        setAdminError('Invalid PIN');
        setAdminPin('');
      }
    } catch {
      setAdminError('Server unavailable');
    }
  }, [adminPin]);

  useEffect(() => {
    const active = avatarStorageService.getActiveAvatar();
    if (active) setAvatarObj(active);
    resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [resetIdleTimer]);

  return (
    <div className="avaq-fs">
      {/* Full-screen avatar */}
      <div className="avaq-fs__avatar">
        <AvaqFbxAvatar state={riggedState} speechLevel={speechLevel} />
      </div>

      {/* Wordmark — top center */}
      <div className="avaq-fs__wordmark">
        <span className="avaq-fs__wordmark-a">AVAQ</span>
        <span className="avaq-fs__wordmark-sub">AI Driver Check-In</span>
      </div>

      {/* Subtitle / speech */}
      <div className="avaq-fs__subtitle" aria-live="polite">{subtitle}</div>

      {/* Driver controls */}
      <div className="avaq-fs__controls">
        <button
          type="button"
          className={`avaq-fs__mic${voice.listening ? ' avaq-fs__mic--on' : ''}`}
          onPointerDown={voice.startListening}
          onPointerUp={voice.stopListening}
          onPointerLeave={voice.stopListening}
          disabled={conversation.busy || !voice.supported}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
            <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 10a.5.5 0 0 1 .5.5A7 7 0 0 1 12.5 18.93V21h2a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1h2v-2.07A7 7 0 0 1 5 11.5a.5.5 0 0 1 1 0 6 6 0 0 0 12 0 .5.5 0 0 1 .5-.5z"/>
          </svg>
          <span>{voice.listening ? 'Listening…' : 'Hold to Speak'}</span>
        </button>

        <div className="avaq-fs__text-row">
          <input
            ref={textInputRef}
            className="avaq-fs__text-input"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTextSend()}
            placeholder="Type appointment number or message…"
            disabled={conversation.busy}
            autoComplete="off"
          />
          <button
            type="button"
            className="avaq-fs__send"
            onClick={handleTextSend}
            disabled={conversation.busy || !textInput.trim()}
          >Send</button>
        </div>
      </div>

      {/* Tiny gear — bottom right corner, always visible */}
      <button
        type="button"
        className="avaq-fs__gear"
        onClick={() => { setAdminPinMode(true); setAdminOpen(false); setAdminPin(''); setAdminError(''); }}
        title="Admin"
      >⚙</button>

      {/* PIN prompt overlay */}
      {adminPinMode && (
        <div className="avaq-fs__overlay">
          <div className="avaq-fs__box">
            <h3>Admin PIN</h3>
            <input
              type="password"
              inputMode="numeric"
              maxLength={5}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onKeyDown={(e) => e.key === 'Enter' && void tryAdminPin()}
              placeholder="• • • • •"
              className="avaq-fs__pin-input"
              autoFocus
            />
            {adminError && <div className="avaq-fs__pin-error">{adminError}</div>}
            <div className="avaq-fs__box-actions">
              <button type="button" className="avaq-fs__box-btn" onClick={() => void tryAdminPin()}>Unlock</button>
              <button type="button" className="avaq-fs__box-btn avaq-fs__box-btn--ghost" onClick={() => setAdminPinMode(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin panel — slides up from bottom after PIN */}
      {adminOpen && (
        <div className="avaq-fs__admin">
          <div className="avaq-fs__admin-bar">
            <span>Admin Panel</span>
            <button type="button" onClick={() => setAdminOpen(false)}>✕ Close</button>
          </div>
          <div className="avaq-fs__admin-body">
            <label className="avaq-fs__admin-row">
              <span>Voice ID</span>
              <input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} />
            </label>
            <label className="avaq-fs__admin-row">
              <span>Kiosk enabled</span>
              <input type="checkbox" checked={kioskEnabled} onChange={(e) => setKioskEnabled(e.target.checked)} />
            </label>
            <div className="avaq-fs__admin-actions">
              <button type="button" className="avaq-fs__box-btn" onClick={() => setAvatarObj(avatarStorageService.getActiveAvatar())}>Reload Avatar</button>
              <button type="button" className="avaq-fs__box-btn" onClick={() => avaqApiClient.prewarmCache({ avatarImagePath: avatarObj?.dataUrl || '', voiceId })}>Prewarm Clips</button>
              <button type="button" className="avaq-fs__box-btn" onClick={() => conversation.overrideByStaff('Staff override')}>Staff Override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
