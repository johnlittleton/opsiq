import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { avaqApiClient } from '../../services/avaqApiClient';

const AvaQDidClonePage: React.FC = () => {
  const navigate = useNavigate();
  const [phrase, setPhrase] = useState('Welcome to OPSIQ. Are you here for driver check-in?');
  const [avatarImagePath, setAvatarImagePath] = useState('assets/opsiq-logo.png');
  const [voiceId, setVoiceId] = useState('avaq-default');
  const [videoPath, setVideoPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await avaqApiClient.generateAvatarVideo({ phrase, avatarImagePath, voiceId });
      setVideoPath(result.videoPath || '');
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const clipUrl = videoPath ? `/api/avaq/avatar/clip?path=${encodeURIComponent(videoPath)}` : '';

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ marginTop: 0 }}>AvaQ D-ID Clone Control</h1>
        <button type="button" onClick={() => navigate('/home')}>Back Home</button>
      </div>

      <p>This page is restricted to John PIN sessions and drives LivePortrait/SadTalker avatar generation.</p>

      <div style={{ display: 'grid', gap: 8, maxWidth: 780 }}>
        <input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="Phrase" />
        <input value={avatarImagePath} onChange={(event) => setAvatarImagePath(event.target.value)} placeholder="Avatar image path" />
        <input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} placeholder="Voice id" />
        <button type="button" disabled={busy} onClick={generate}>{busy ? 'Generating...' : 'Generate Talking Avatar Video'}</button>
        {error ? <div style={{ color: '#b42318' }}>{error}</div> : null}
      </div>

      {clipUrl ? (
        <div style={{ marginTop: 12 }}>
          <video src={clipUrl} controls autoPlay style={{ width: '100%', maxWidth: 840 }} />
        </div>
      ) : null}
    </div>
  );
};

export default AvaQDidClonePage;
