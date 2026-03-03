import { useState, useEffect, useRef } from 'react';
import { Message, MessageChannel, MessagePriority } from '../../shared/types';
import { API_BASE } from '../services/config';
import { useAuth } from '../context/AuthContext';
import './MessageBanner.css';

interface MessageBannerProps {
  channel: MessageChannel;
  isOpen?: boolean;
  onToggle?: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export function MessageBanner({ channel, isOpen = false, onToggle, onUnreadCountChange }: MessageBannerProps) {
  const { executiveName } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [senderName, setSenderName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [priority, setPriority] = useState<MessagePriority>('normal');
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeenMessageId, setLastSeenMessageId] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Draggable window state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const bannerRef = useRef<HTMLDivElement>(null);
  
  // Dismissed messages tracking (prevents auto-reopen)
  const [dismissedMessageId, setDismissedMessageId] = useState<number>(() => {
    const stored = localStorage.getItem(`dismissed-${channel}`);
    return stored ? parseInt(stored) : 0;
  });

  // Auto-fill sender name from authenticated user
  useEffect(() => {
    if (executiveName && !senderName) {
      setSenderName(executiveName);
    }
  }, [executiveName]);

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
            const newMessagesCount = data.filter((m: Message) => m.id > lastSeenMessageId && m.id > dismissedMessageId).length;
            
            // Auto-reopen banner if new message arrives and banner was closed (but not if dismissed)
            if (!isOpen && newMessagesCount > 0 && latestId > dismissedMessageId) {
              onToggle?.();
              playNotificationSound();
            }
            
            // Update unread count (only count non-dismissed messages)
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

  // Notify parent of unread count changes
  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

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

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (bannerRef.current) {
      const rect = bannerRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Attach global mouse handlers for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  // Dismiss all messages
  const handleDismissAll = () => {
    if (messages.length > 0) {
      const latestId = messages[messages.length - 1].id;
      setDismissedMessageId(latestId);
      localStorage.setItem(`dismissed-${channel}`, latestId.toString());
      setUnreadCount(0);
      onToggle?.();
    }
  };

  // Complete/archive chat
  const handleCompleteChat = async () => {
    if (messages.length === 0) {
      alert('No messages to complete');
      return;
    }

    const confirm = window.confirm(`Complete this chat? ${messages.length} messages will be archived.`);
    if (!confirm) return;

    try {
      const response = await fetch(`${API_BASE}/api/messages/${channel}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedBy: executiveName })
      });

      if (response.ok) {
        const result = await response.json();
        setMessages([]);
        setLastSeenMessageId(0);
        alert(`✅ Chat completed! ${result.messageCount} messages archived.`);
      }
    } catch (error) {
      console.error('Error completing chat:', error);
      alert('Failed to complete chat');
    }
  };

  return (
    <>
      {/* Notification Sound */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSt+ze7bfzIIIGi+7eeUSQ0OUqvk8K9gGgU7k9nyzn0vBSiBzvLZiTYIGGS56+mjUhELP6Hg88d0JwU" />

      {/* Message Banner Window */}
      {isOpen && (
        <div 
          ref={bannerRef}
          className={`message-banner ${priority}`}
          style={{
            left: position.x ? `${position.x}px` : undefined,
            top: position.y ? `${position.y}px` : undefined,
            right: position.x ? 'auto' : undefined
          }}
        >
          <div 
            className="message-banner__header"
            onMouseDown={handleMouseDown}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <h3 className="message-banner__title">
              💬 {channel === 'shipping-receiving' ? 'Shipping & Receiving' : 'Production'} Team Chat
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="message-banner__complete" 
                onClick={handleCompleteChat} 
                title="Complete and archive this chat"
                disabled={messages.length === 0}
              >
                ✅
              </button>
              <button className="message-banner__dismiss" onClick={handleDismissAll} title="Dismiss all messages">
                🔕
              </button>
              <button className="message-banner__close" onClick={onToggle}>
                ✕
              </button>
            </div>
          </div>

          <div className="message-banner__messages">
            {messages.length === 0 ? (
              <div className="message-banner__empty">No messages yet. Start the conversation!</div>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.senderName === executiveName;
                return (
                  <div key={msg.id} className={`message-item priority-${msg.priority} ${isOwnMessage ? 'message-item--own' : ''}`}>
                    <div className="message-header">
                      <span className="message-priority">{getPriorityIcon(msg.priority)}</span>
                      <span className="message-sender">{isOwnMessage ? 'You' : msg.senderName}</span>
                      <span className="message-time">{formatTime(msg.createdAt)}</span>
                    </div>
                    <div className="message-text">{msg.messageText}</div>
                  </div>
                );
              })
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
              readOnly
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                cursor: 'not-allowed',
                opacity: 0.9
              }}
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
