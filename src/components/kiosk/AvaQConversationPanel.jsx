import React from 'react';

export default function AvaQConversationPanel({ messages, status }) {
  return (
    <section className="avaq-conversation-panel">
      <div className="avaq-conversation-header">
        <h3>Conversation</h3>
        <span className="avaq-status">{status}</span>
      </div>
      <div className="avaq-conversation-list">
        {messages.map((message, idx) => (
          <div key={`${message.speaker}-${idx}`} className={`avaq-line avaq-line-${message.speaker}`}>
            <strong>{message.speaker === 'driver' ? 'Driver' : 'AvaQ'}:</strong> {message.text}
          </div>
        ))}
      </div>
    </section>
  );
}
