import React, { useState } from 'react';

export default function AvaQAdminSettings({
  enabled,
  onToggle,
  avatarImagePath,
  setAvatarImagePath,
  voiceId,
  setVoiceId,
  onPrewarm,
  onOverride,
}) {
  const [overrideNote, setOverrideNote] = useState('');

  return (
    <section className="avaq-admin-settings">
      <h3>Admin Settings</h3>
      <label className="avaq-admin-row">
        <span>Enable AvaQ</span>
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
      </label>
      <label className="avaq-admin-row">
        <span>Avatar Image Path</span>
        <input value={avatarImagePath} onChange={(event) => setAvatarImagePath(event.target.value)} />
      </label>
      <label className="avaq-admin-row">
        <span>Voice Id</span>
        <input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} />
      </label>
      <div className="avaq-actions">
        <button type="button" onClick={onPrewarm}>Prewarm Common Clips</button>
      </div>
      <label className="avaq-admin-row">
        <span>Staff Override Note</span>
        <input value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} />
      </label>
      <div className="avaq-actions">
        <button
          type="button"
          onClick={() => {
            onOverride(overrideNote || 'Staff override requested');
            setOverrideNote('');
          }}
        >
          Trigger Override
        </button>
      </div>
    </section>
  );
}
