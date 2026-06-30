import { useCallback, useEffect, useState } from 'react';
import { checkInService } from '../services/checkInService';
import { avaqApiClient } from '../services/avaqApiClient';
import { sessionService } from '../services/sessionService';

export function useAvaQConversation({ onAssistantReply }) {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const existing = sessionService.getSessionId();
    if (existing) {
      setSessionId(existing);
      return;
    }

    const start = async () => {
      const created = await avaqApiClient.createSession();
      setSessionId(created.id);
      sessionService.setSessionId(created.id);
      setMessages([{ speaker: 'avaq', text: 'Welcome to OPSIQ. Are you here for driver check-in?' }]);
      onAssistantReply('Welcome to OPSIQ. Are you here for driver check-in?');
    };

    void start();
  }, [onAssistantReply]);

  const sendMessage = useCallback(async (text) => {
    if (!sessionId || !text.trim()) return;

    setBusy(true);
    const userLine = { speaker: 'driver', text };
    setMessages((prev) => [...prev, userLine]);

    try {
      const result = await checkInService.submitDriverMessage(sessionId, text);
      const assistantLine = { speaker: 'avaq', text: result.assistantText };
      setMessages((prev) => [...prev, assistantLine]);
      setStatus(result.status || 'active');
      onAssistantReply(result.assistantText);
    } finally {
      setBusy(false);
    }
  }, [onAssistantReply, sessionId]);

  const overrideByStaff = useCallback(async (note) => {
    if (!sessionId) return;
    await avaqApiClient.addOverride(sessionId, 'staff', note || 'Manual override');
    setStatus('escalated');
  }, [sessionId]);

  return {
    sessionId,
    messages,
    busy,
    status,
    sendMessage,
    overrideByStaff,
  };
}
