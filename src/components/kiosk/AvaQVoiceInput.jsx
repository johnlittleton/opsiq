import React, { useState } from 'react';

export default function AvaQVoiceInput({ listening, supported, onStart, onStop, onSubmit, busy }) {
  const [text, setText] = useState('');

  return (
    <section className="avaq-voice-input">
      <h3>Driver Input</h3>
      <div className="avaq-actions">
        <button type="button" onClick={onStart} disabled={!supported || listening || busy}>Start Mic</button>
        <button type="button" onClick={onStop} disabled={!listening || busy}>Stop Mic</button>
      </div>
      {!supported ? <div className="avaq-error">Speech recognition not supported on this device.</div> : null}
      <div className="avaq-text-fallback">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type appointment number, driver name, carrier..."
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => {
            onSubmit(text.trim());
            setText('');
          }}
        >
          Send
        </button>
      </div>
    </section>
  );
}
