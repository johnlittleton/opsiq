import React, { useState, useEffect } from 'react';
import { API_BASE } from '../services/config';
import './ChatTicker.css';

interface ChatTickerProps {
  onTickerClick?: () => void;
}

export function ChatTicker({ onTickerClick }: ChatTickerProps) {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const checkForActiveMessages = async () => {
      try {
        // Check production channel
        const prodResponse = await fetch(`${API_BASE}/api/messages/production`);
        const prodMessages = prodResponse.ok ? await prodResponse.json() : [];
        
        // Check shipping-receiving channel
        const shipResponse = await fetch(`${API_BASE}/api/messages/shipping-receiving`);
        const shipMessages = shipResponse.ok ? await shipResponse.json() : [];

        // Show ticker only if there are unanswered messages (no back-and-forth yet)
        let needsResponse = 0;

        // Check production - show if only 1 message OR last 2 messages from same sender
        if (prodMessages.length > 0) {
          if (prodMessages.length === 1) {
            needsResponse++;
          } else {
            const lastMsg = prodMessages[prodMessages.length - 1];
            const secondLastMsg = prodMessages[prodMessages.length - 2];
            // If last 2 messages from same sender, still waiting for response
            if (lastMsg.senderName === secondLastMsg.senderName) {
              needsResponse++;
            }
          }
        }

        // Check shipping-receiving - same logic
        if (shipMessages.length > 0) {
          if (shipMessages.length === 1) {
            needsResponse++;
          } else {
            const lastMsg = shipMessages[shipMessages.length - 1];
            const secondLastMsg = shipMessages[shipMessages.length - 2];
            if (lastMsg.senderName === secondLastMsg.senderName) {
              needsResponse++;
            }
          }
        }

        setUnreadCount(needsResponse);
        setHasUnreadMessages(needsResponse > 0);
      } catch (error) {
        console.error('Error checking for active messages:', error);
      }
    };

    checkForActiveMessages();
    const interval = setInterval(checkForActiveMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!hasUnreadMessages) return null;

  const tickerMessage = (
    <>
      <span className="chat-ticker__icon">💬</span>
      <span className="chat-ticker__text">
        {unreadCount} chat message{unreadCount !== 1 ? 's' : ''} awaiting response • Click to view
      </span>
    </>
  );

  return (
    <div className="chat-ticker" onClick={onTickerClick}>
      <div className="chat-ticker__content">
        {tickerMessage}
        {tickerMessage}
        {tickerMessage}
        {tickerMessage}
        {tickerMessage}
        {tickerMessage}
      </div>
    </div>
  );
}
