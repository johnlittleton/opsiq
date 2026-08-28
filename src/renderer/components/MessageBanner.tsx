import { useState, useEffect, useRef } from 'react';
import { Message, MessageChannel, MessagePriority } from '../../shared/types';
import { API_BASE } from '../services/config';
import { useAuth } from '../context/AuthContext';
import './MessageBanner.css';

type ChannelView = 'production' | 'shipping-receiving' | 'all';

interface MessageBannerProps {
  isOpen?: boolean;
  onToggle?: () => void;
  onUnreadCountChange?: (count: number) => void;
}

interface ChannelState {
  messages: Message[];
  unreadCount: number;
  lastSeenId: number;
  dismissedId: number;
}

export function MessageBanner({ isOpen = false, onToggle, onUnreadCountChange }: MessageBannerProps) {
  const { executiveName } = useAuth();
  const [activeChannel, setActiveChannel] = useState<ChannelView>('all');
  const [senderName, setSenderName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [priority, setPriority] = useState<MessagePriority>('normal');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('opsiq-chat-sound') !== 'false');
  
  // Per-channel state
  const [channelStates, setChannelStates] = useState<Record<MessageChannel, ChannelState>>({
    'production': {
      messages: [],
      unreadCount: 0,
      lastSeenId: parseInt(localStorage.getItem('lastSeen-production') || '0'),
      dismissedId: parseInt(localStorage.getItem('dismissed-production') || '0')
    },
    'shipping-receiving': {
      messages: [],
      unreadCount: 0,
      lastSeenId: parseInt(localStorage.getItem('lastSeen-shipping-receiving') || '0'),
      dismissedId: parseInt(localStorage.getItem('dismissed-shipping-receiving') || '0')
    }
  });

  // Toast notification
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  
  // Draggable window state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const lastCloseAtRef = useRef(0);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Auto-fill sender name from authenticated user
  useEffect(() => {
    if (executiveName && !senderName) {
      setSenderName(executiveName);
    }
  }, [executiveName]);

  // Fetch messages for a specific channel
  const fetchChannelMessages = async (channel: MessageChannel) => {
    try {
      const response = await fetch(`${API_BASE}/api/messages/${channel}`);
      if (response.ok) {
        const data = await response.json();
        return data as Message[];
      }
    } catch (error) {
      console.error(`Error fetching ${channel} messages:`, error);
    }
    return [];
  };

  // Fetch messages from all channels
  const fetchMessages = async () => {
    const [productionMsgs, shippingMsgs] = await Promise.all([
      fetchChannelMessages('production'),
      fetchChannelMessages('shipping-receiving')
    ]);

    setChannelStates(prevStates => {
      const newStates = { ...prevStates };
      let hasNewMessages = false;
      let newMessageChannel: MessageChannel | null = null;

      // Update production channel
      if (productionMsgs.length > 0) {
        const latestId = productionMsgs[productionMsgs.length - 1].id;
        if (latestId > newStates.production.lastSeenId) {
          const newCount = productionMsgs.filter(
            m => m.id > newStates.production.lastSeenId && m.id > newStates.production.dismissedId
          ).length;
          
          if (newCount > 0) {
            hasNewMessages = true;
            newMessageChannel = 'production';
            newStates.production.unreadCount = newCount;
            
            // Show toast if viewing different channel
            if (isOpen && activeChannel !== 'production' && activeChannel !== 'all') {
              showToast('New message in Production');
            }
          }
        }
        newStates.production.messages = productionMsgs;
      }

      // Update shipping-receiving channel
      if (shippingMsgs.length > 0) {
        const latestId = shippingMsgs[shippingMsgs.length - 1].id;
        if (latestId > newStates['shipping-receiving'].lastSeenId) {
          const newCount = shippingMsgs.filter(
            m => m.id > newStates['shipping-receiving'].lastSeenId && m.id > newStates['shipping-receiving'].dismissedId
          ).length;
          
          if (newCount > 0) {
            hasNewMessages = true;
            if (!newMessageChannel) newMessageChannel = 'shipping-receiving';
            newStates['shipping-receiving'].unreadCount = newCount;
            
            // Show toast if viewing different channel
            if (isOpen && activeChannel !== 'shipping-receiving' && activeChannel !== 'all') {
              showToast('New message in Shipping-Receiving');
            }
          }
        }
        newStates['shipping-receiving'].messages = shippingMsgs;
      }

      // Auto-open banner if new message arrives and banner is closed
      if (!isOpen && hasNewMessages) {
        onToggle?.();
        playNotificationSound();
      }

      return newStates;
    });
  };

  // Show toast notification
  const showToast = (message: string) => {
    setToast({ show: true, message });
    playNotificationSound();
    setTimeout(() => setToast({ show: false, message: '' }), 5000);
  };

  // Play notification sound
  const playNotificationSound = () => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(err => console.log('Audio play failed:', err));
    }
  };

  const toggleSound = () => {
    setSoundEnabled(current => {
      const next = !current;
      localStorage.setItem('opsiq-chat-sound', String(next));
      return next;
    });
  };

  const closeChat = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - lastCloseAtRef.current < 500) return;
    lastCloseAtRef.current = now;
    onToggle?.();
  };

  // Send message
  const sendMessage = async () => {
    if (!senderName.trim() || !messageText.trim()) return;
    
    // Determine which channel to send to
    const targetChannel: MessageChannel = activeChannel === 'all' ? 'production' : activeChannel;

    try {
      const response = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: targetChannel,
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

  // Get messages to display based on active channel
  const getDisplayMessages = (): Message[] => {
    if (activeChannel === 'all') {
      // Combine both channels and sort by timestamp
      return [...channelStates.production.messages, ...channelStates['shipping-receiving'].messages]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return channelStates[activeChannel].messages;
  };

  // Switch to a channel and mark as read
  const switchChannel = (channel: ChannelView) => {
    setActiveChannel(channel);
    
    // Mark channel as read when switching to it
    if (channel !== 'all') {
      setChannelStates(prev => {
        const updated = { ...prev };
        const messages = updated[channel].messages;
        if (messages.length > 0) {
          const latestId = messages[messages.length - 1].id;
          updated[channel].lastSeenId = latestId;
          updated[channel].unreadCount = 0;
          localStorage.setItem(`lastSeen-${channel}`, latestId.toString());
        }
        return updated;
      });
    } else {
      // Mark both channels as read when viewing All
      setChannelStates(prev => {
        const updated = { ...prev };
        ['production', 'shipping-receiving'].forEach(ch => {
          const channel = ch as MessageChannel;
          const messages = updated[channel].messages;
          if (messages.length > 0) {
            const latestId = messages[messages.length - 1].id;
            updated[channel].lastSeenId = latestId;
            updated[channel].unreadCount = 0;
            localStorage.setItem(`lastSeen-${channel}`, latestId.toString());
          }
        });
        return updated;
      });
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [getDisplayMessages(), isOpen]);

  // Poll for new messages from both channels
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Mark current channel as read when banner opens
  useEffect(() => {
    if (isOpen) {
      if (activeChannel === 'all') {
        // Mark both channels as read
        switchChannel('all');
      } else {
        switchChannel(activeChannel);
      }
    }
  }, [isOpen]);

  // Notify parent of total unread count changes
  useEffect(() => {
    const totalUnread = channelStates.production.unreadCount + channelStates['shipping-receiving'].unreadCount;
    onUnreadCountChange?.(totalUnread);
  }, [channelStates, onUnreadCountChange]);

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

  // Dismiss all messages in current channel
  const handleDismissAll = () => {
    const displayMessages = getDisplayMessages();
    if (displayMessages.length === 0) return;

    if (activeChannel === 'all') {
      // Dismiss both channels
      const prodLatest = channelStates.production.messages.length > 0 
        ? channelStates.production.messages[channelStates.production.messages.length - 1].id 
        : 0;
      const shipLatest = channelStates['shipping-receiving'].messages.length > 0
        ? channelStates['shipping-receiving'].messages[channelStates['shipping-receiving'].messages.length - 1].id
        : 0;

      setChannelStates(prev => ({
        production: { ...prev.production, dismissedId: prodLatest, unreadCount: 0 },
        'shipping-receiving': { ...prev['shipping-receiving'], dismissedId: shipLatest, unreadCount: 0 }
      }));
      
      localStorage.setItem('dismissed-production', prodLatest.toString());
      localStorage.setItem('dismissed-shipping-receiving', shipLatest.toString());
    } else {
      // Dismiss single channel
      const latestId = displayMessages[displayMessages.length - 1].id;
      setChannelStates(prev => ({
        ...prev,
        [activeChannel]: { ...prev[activeChannel], dismissedId: latestId, unreadCount: 0 }
      }));
      localStorage.setItem(`dismissed-${activeChannel}`, latestId.toString());
    }
    
    onToggle?.();
  };

  // Complete/archive chat for current channel
  const handleCompleteChat = async () => {
    if (activeChannel === 'all') {
      // Complete both channels when on All Departments view
      const totalMessages = channelStates['production'].messages.length + channelStates['shipping-receiving'].messages.length;
      if (totalMessages === 0) {
        alert('No messages to complete');
        return;
      }

      const confirm = window.confirm(`Complete ALL department chats? ${totalMessages} messages will be archived.`);
      if (!confirm) return;

      try {
        // Complete both channels
        await Promise.all([
          fetch(`${API_BASE}/api/messages/production/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completedBy: executiveName })
          }),
          fetch(`${API_BASE}/api/messages/shipping-receiving/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completedBy: executiveName })
          })
        ]);

        // Clear both channels
        setChannelStates(prev => ({
          ...prev,
          'production': {
            ...prev['production'],
            messages: [],
            lastSeenId: 0,
            unreadCount: 0
          },
          'shipping-receiving': {
            ...prev['shipping-receiving'],
            messages: [],
            lastSeenId: 0,
            unreadCount: 0
          }
        }));

        localStorage.setItem('lastSeen-production', '0');
        localStorage.setItem('lastSeen-shipping-receiving', '0');
        alert(`✅ All chats completed! ${totalMessages} messages archived.`);
      } catch (error) {
        console.error('Error completing chats:', error);
        alert('Failed to complete chats');
      }
      return;
    }

    const currentMessages = channelStates[activeChannel].messages;
    if (currentMessages.length === 0) {
      alert('No messages to complete');
      return;
    }

    const channelName = activeChannel === 'production' ? 'Production' : 'Shipping-Receiving';
    const confirm = window.confirm(`Complete ${channelName} chat? ${currentMessages.length} messages will be archived.`);
    if (!confirm) return;

    try {
      const response = await fetch(`${API_BASE}/api/messages/${activeChannel}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedBy: executiveName })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Clear messages and reset state for this channel
        setChannelStates(prev => ({
          ...prev,
          [activeChannel]: {
            ...prev[activeChannel],
            messages: [],
            lastSeenId: 0,
            unreadCount: 0
          }
        }));
        
        localStorage.setItem(`lastSeen-${activeChannel}`, '0');
        alert(`✅ ${channelName} chat completed! ${result.messageCount} messages archived.`);
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

      {/* Toast Notification */}
      {toast.show && (
        <div className="message-toast">
          {toast.message}
        </div>
      )}

      {/* Message Banner Window */}
      {isOpen && (
        <div 
          ref={bannerRef}
          className="message-banner"
          style={{
            left: position.x ? `${position.x}px` : undefined,
            top: position.y ? `${position.y}px` : undefined,
            right: position.x ? 'auto' : undefined
          }}
        >
          <div 
            className="message-banner__header"
          >
            <h3
              className="message-banner__title"
              onMouseDown={handleMouseDown}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >💬 Team Chat</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button"
                className="message-banner__complete" 
                onClick={(event) => { event.stopPropagation(); void handleCompleteChat(); }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="Complete and archive this chat"
              >
                ✅
              </button>
              <button type="button" className="message-banner__dismiss" onClick={(event) => { event.stopPropagation(); toggleSound(); }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} title={soundEnabled ? 'Mute notification sound' : 'Enable notification sound'} aria-label={soundEnabled ? 'Mute notification sound' : 'Enable notification sound'}>
                {soundEnabled ? '🔔' : '🔕'}
              </button>
              <button
                type="button"
                className="message-banner__close"
                onClick={closeChat}
                onTouchEnd={closeChat}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="Close Team Chat"
                title="Close Team Chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Channel Tabs */}
          <div className="message-banner__channels">
            <button 
              className={`channel-tab ${activeChannel === 'shipping-receiving' ? 'active' : ''}`}
              onClick={() => switchChannel('shipping-receiving')}
            >
              🚚 Shipping-Receiving
              {channelStates['shipping-receiving'].unreadCount > 0 && (
                <span className="channel-badge">{channelStates['shipping-receiving'].unreadCount}</span>
              )}
            </button>
            <button 
              className={`channel-tab ${activeChannel === 'production' ? 'active' : ''}`}
              onClick={() => switchChannel('production')}
            >
              🏭 Production
              {channelStates.production.unreadCount > 0 && (
                <span className="channel-badge">{channelStates.production.unreadCount}</span>
              )}
            </button>
            <button 
              className={`channel-tab ${activeChannel === 'all' ? 'active' : ''}`}
              onClick={() => switchChannel('all')}
            >
              📢 All Departments
              {(channelStates.production.unreadCount + channelStates['shipping-receiving'].unreadCount) > 0 && (
                <span className="channel-badge">
                  {channelStates.production.unreadCount + channelStates['shipping-receiving'].unreadCount}
                </span>
              )}
            </button>
          </div>

          <div className="message-banner__messages">
            {getDisplayMessages().length === 0 ? (
              <div className="message-banner__empty">No messages yet. Start the conversation!</div>
            ) : (
              getDisplayMessages().map((msg) => {
                const isOwnMessage = msg.senderName === executiveName;
                const channelIcon = activeChannel === 'all' 
                  ? (msg.channel === 'production' ? '🏭' : '🚚')
                  : '';
                return (
                  <div key={msg.id} className={`message-item priority-${msg.priority} ${isOwnMessage ? 'message-item--own' : ''}`}>
                    <div className="message-header">
                      {channelIcon && <span className="message-channel-icon">{channelIcon}</span>}
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
            {activeChannel === 'all' && (
              <div className="channel-send-notice">
                📤 Sending to: Production
              </div>
            )}
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
