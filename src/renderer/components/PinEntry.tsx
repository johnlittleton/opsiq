import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../services/config';
import './PinEntry.css';

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
      <div className="pin-entry-modal">
        <div className="pin-entry-header">
          <h2>OpsIQ Login</h2>
          <p>Enter your 5-digit PIN</p>
        </div>

        <div className="pin-entry-body">
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

        <div className="pin-entry-footer">
          <p className="pin-hint">Please contact IT if you need assistance</p>
        </div>
      </div>
    </div>
  );
}
