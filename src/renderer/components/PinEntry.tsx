import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../services/config';
import './PinEntry.css';

// Import logos - Vite will bundle these
import opsiqLogo from '../../../assets/opsiq-logo.png';
import atlasLogo from '../../../assets/atlas-logo.png';

interface PinEntryProps {
  onSuccess: (executiveName: string, userRole: string) => void;
}

export default function PinEntry({ onSuccess }: PinEntryProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the input when component mounts
    inputRef.current?.focus();
  }, []);

  const handlePinChange = (value: string) => {
    // Only allow digits, max 5 characters
    const digitsOnly = value.replace(/\D/g, '').slice(0, 5);
    setPin(digitsOnly);
    setError('');

    // Auto-submit when 5 digits are entered
    if (digitsOnly.length === 5) {
      verifyPin(digitsOnly);
    }
  };

  const verifyPin = async (pinToVerify: string) => {
    setIsVerifying(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinToVerify })
      });

      const data = await response.json();

      if (data.success) {
        onSuccess(data.name, data.role);
      } else {
        setError('Invalid PIN');
        setPin('');
        inputRef.current?.focus();
      }
    } catch (error) {
      setError('Connection error. Please try again.');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length === 5) {
      verifyPin(pin);
    }
  };

  return (
    <div className="pin-entry-overlay">
      <div className="pin-entry-splash">
        {/* OpsIQ Logo at Top */}
        <div className="splash-logo-container">
          <div className="splash-logo">
            <img 
              src={opsiqLogo} 
              alt="OpsIQ" 
              className="opsiq-logo-image"
            />
          </div>
        </div>

        {/* PIN Entry Section - Directly underneath logo */}
        <div className="splash-pin-section">
          <p className="splash-subtitle">Enter your 5-digit PIN</p>
          
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={5}
            value={pin}
            onChange={(e) => handlePinChange(e.target.value)}
            onKeyPress={handleKeyPress}
            className={`pin-input ${error ? 'error' : ''}`}
            placeholder="• • • • •"
            disabled={isVerifying}
          />

          <div className="pin-dots">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
            ))}
          </div>

          {error && <div className="pin-error">{error}</div>}
          {isVerifying && <div className="pin-verifying">Verifying...</div>}
        </div>

        {/* Powered By - Bottom Right */}
        <div className="splash-powered-by">
          <p className="powered-by-text">Powered by</p>
          <img 
            src={atlasLogo} 
            alt="ATLAS ARCHITECTURE" 
            className="atlas-logo"
          />
        </div>
      </div>
    </div>
  );
}