import { useState, useEffect, useRef } from 'react';
import { Message, MessageChannel, MessagePriority } from '../../shared/types';
import { API_BASE } from '../services/config';
import './MessageBanner.css';

interface MessageBannerProps {
  channel: MessageChannel;
}

export function MessageBanner({ channel }: MessageBannerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [priority, setPriority] = useState<MessagePriority>('normal');
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeenMessageId, setLastSeenMessageId] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch messages
  const fetchMessages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/messages/${channel}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
        
        // Check for new messages
        if (data.length > 0) {
          const latestId = data[data.length - 1].id;
          if (latestId > lastSeenMessageId) {
            const newMessagesCount = data.filter((m: Message) => m.id > lastSeenMessageId).length;
            
            // Auto-reopen banner if new message arrives and banner was closed
            if (!isOpen && newMessagesCount > 0) {
              setIsOpen(true);
              playNotificationSound();
            }
            
            // Update unread count
            setUnreadCount(newMessagesCount);
            
            // Only update lastSeenMessageId when banner is open
            if (isOpen) {
              setLastSeenMessageId(latestId);
              setUnreadCount(0);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  // Play notification sound
  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(err => console.log('Audio play failed:', err));
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!senderName.trim() || !messageText.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          senderName: senderName.trim(),
          messageText: messageText.trim(),
          priority,
        }),
      });

      if (response.ok) {
        setMessageText('');
        setPriority('normal');
        fetchMessages();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Poll for new messages
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [channel, lastSeenMessageId, isOpen]);

  // Update last seen when banner opens
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      const latestId = messages[messages.length - 1].id;
      setLastSeenMessageId(latestId);
      setUnreadCount(0);
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getPriorityIcon = (priority: MessagePriority) => {
    switch (priority) {
      case 'urgent': return '🔴';
      case 'normal': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '💬';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Notification Sound */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSt+ze7bfzIIIGi+7eeUSQ0OUqvk8K9gGgU7k9nyzn0vBSiBzvLZiTYIGGS56+mjUhELP6Hg88d0JwU" />

      {/* Message Icon Button */}
      {!isOpen && (
        <button className="message-icon-btn" onClick={handleToggle}>
          💬
          {unreadCount > 0 && (
            <span className="message-badge">{unreadCount}</span>
          )}
        </button>
      )}

      {/* Message Banner */}
      {isOpen && (
        <div className={`message-banner ${priority}`}>
          <div className="message-banner__header">
            <h3 className="message-banner__title">
              💬 {channel === 'shipping-receiving' ? 'Shipping & Receiving' : 'Production'} Team Chat
            </h3>
            <button className="message-banner__close" onClick={handleToggle}>
              ✕
            </button>
          </div>

          <div className="message-banner__messages">
            {messages.length === 0 ? (
              <div className="message-banner__empty">No messages yet. Start the conversation!</div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message-item priority-${msg.priority}`}>
                  <div className="message-header">
                    <span className="message-priority">{getPriorityIcon(msg.priority)}</span>
                    <span className="message-sender">{msg.senderName}</span>
                    <span className="message-time">{formatTime(msg.createdAt)}</span>
                  </div>
                  <div className="message-text">{msg.messageText}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="message-banner__input">
            <input
              type="text"
              placeholder="Your name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="message-input-name"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as MessagePriority)}
              className="message-input-priority"
            >
              <option value="info">ℹ️ Info</option>
              <option value="normal">⚠️ Normal</option>
              <option value="urgent">🔴 Urgent</option>
            </select>
            <input
              type="text"
              placeholder="Type your message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              className="message-input-text"
            />
            <button 
              onClick={sendMessage}
              disabled={!senderName.trim() || !messageText.trim()}
              className="message-send-btn"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
