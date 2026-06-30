import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvatarAgent from '../../components/AvatarAgent';
import AvatarStudio from '../../components/AvatarStudio';
import { AvaqFbxAvatar } from '../components/AvaqFbxAvatar';
import { avatarStorageService } from '../../services/avatarStorageService';
import { useAvatarSpeech } from '../../hooks/useAvatarSpeech';
import { API_BASE } from '../services/config';
import './AvatarBuilderPage.css';

type RiggedAvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'confused' | 'happy' | 'concerned';

const TEST_PHRASES = [
  'Welcome to OPSIQ. Are you here for driver check-in?',
  'Please say or enter your appointment number.',
  'Thank you. I found your appointment.',
  'Please proceed to Door 12.',
  'I could not find that appointment. Please see shipping.',
  'Your check-in is complete. Have a great day.',
];

const AvatarBuilderPage: React.FC = () => {
  const navigate = useNavigate();

  const [avatar, setAvatar] = useState(() => avatarStorageService.getActiveAvatar());
  const [previewMode, setPreviewMode] = useState<'rigged' | 'photo'>('rigged');
  const [customPhrase, setCustomPhrase] = useState('');
  const [status, setStatus] = useState('idle');

  const { say, stop, isSpeaking, speechLevel, mode } = useAvatarSpeech({
    provider: 'browser',
    onStateChange: setStatus,
  });

  const agentMode = useMemo(() => {
    if (isSpeaking) return 'talking';
    return status || mode || 'idle';
  }, [isSpeaking, mode, status]);

  const riggedState = useMemo<RiggedAvatarState>(() => {
    if (agentMode === 'talking') return 'speaking';
    if (agentMode === 'thinking') return 'thinking';
    if (agentMode === 'happy') return 'happy';
    if (agentMode === 'alert') return 'listening';
    return 'idle';
  }, [agentMode]);

  const handleAvatarChange = useCallback((next: any) => {
    setAvatar(next || avatarStorageService.getActiveAvatar());
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stop();
    // Try ElevenLabs/server TTS first, fall back to browser voice
    try {
      const response = await fetch(`${API_BASE}/api/kiosk/assistant/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          await audio.play();
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
          });
          URL.revokeObjectURL(url);
          return;
        }
      }
    } catch {
      // fall through to browser TTS
    }
    await say(text);
  }, [say, stop]);

  // Restore active avatar on mount
  useEffect(() => {
    const active = avatarStorageService.getActiveAvatar();
    if (active) setAvatar(active);
  }, []);

  return (
    <div className="ab-page">
      <header className="ab-header">
        <div className="ab-header__left">
          <h1>Avatar Builder</h1>
          <p>Upload a face photo, preview real-time lip sync, and test AvaQ's voice.</p>
        </div>
        <button type="button" className="ab-btn ab-btn--ghost" onClick={() => navigate('/home')}>
          ← Home
        </button>
      </header>

      <div className="ab-layout">
        {/* LEFT — live canvas preview */}
        <div className="ab-preview">
          <div className="ab-preview__label">Live Preview</div>
          <div className="ab-preview-mode">
            <button
              type="button"
              className={`ab-preview-mode__btn ${previewMode === 'rigged' ? 'is-active' : ''}`}
              onClick={() => setPreviewMode('rigged')}
            >
              Rigged (Bones)
            </button>
            <button
              type="button"
              className={`ab-preview-mode__btn ${previewMode === 'photo' ? 'is-active' : ''}`}
              onClick={() => setPreviewMode('photo')}
            >
              Photo (2D)
            </button>
          </div>

          {previewMode === 'rigged' ? (
            <div className="ab-rigged-wrap">
              <AvaqFbxAvatar state={riggedState} speechLevel={speechLevel} />
            </div>
          ) : (
            <AvatarAgent
              avatar={avatar}
              isSpeaking={isSpeaking}
              speechLevel={speechLevel}
              mode={agentMode}
            />
          )}
          <div className="ab-preview__state">{agentMode}</div>
        </div>

        {/* RIGHT — controls */}
        <div className="ab-controls">
          {/* Avatar Studio */}
          <section className="ab-card">
            <h2>Avatar Image</h2>
            <p className="ab-hint">
              Upload a front-facing PNG or JPG. MediaPipe will detect face landmarks automatically
              and drive the lip sync without any external service.
            </p>
            <AvatarStudio onAvatarChange={handleAvatarChange} />
            <p className="ab-hint ab-hint--note">
              Note: PNG/JPG photo mode is 2D and cannot have true bones. For real jaw/eye/head bone
              motion, use Rigged mode (avatar.glb/avatar.fbx).
            </p>
          </section>

          {/* Voice test */}
          <section className="ab-card">
            <h2>Voice Test</h2>
            <p className="ab-hint">
              Click any phrase to hear AvaQ speak it. Uses ElevenLabs when configured, otherwise
              falls back to your device voice.
            </p>
            <div className="ab-phrase-list">
              {TEST_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  className="ab-phrase-btn"
                  disabled={isSpeaking}
                  onClick={() => speak(phrase)}
                >
                  {phrase}
                </button>
              ))}
            </div>

            <div className="ab-custom-row">
              <input
                value={customPhrase}
                onChange={(e) => setCustomPhrase(e.target.value)}
                placeholder="Type a custom phrase…"
                disabled={isSpeaking}
              />
              <button
                type="button"
                className="ab-btn"
                disabled={isSpeaking || !customPhrase.trim()}
                onClick={() => speak(customPhrase)}
              >
                Speak
              </button>
              <button
                type="button"
                className="ab-btn ab-btn--ghost"
                onClick={stop}
              >
                Stop
              </button>
            </div>
          </section>

          {/* Status strip */}
          <section className="ab-card ab-status-strip">
            <span>Avatar: <strong>{avatar?.name || 'none uploaded'}</strong></span>
            <span>State: <strong>{agentMode}</strong></span>
            <span>Speaking: <strong>{isSpeaking ? 'yes' : 'no'}</strong></span>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AvatarBuilderPage;
