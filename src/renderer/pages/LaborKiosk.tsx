import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import {
  type KioskDepartmentKey,
} from '../data/departmentEmployees';
import { useKioskEmployees } from '../hooks/useKioskEmployees';
import './LaborKiosk.css';

interface ParsedBadgeScan {
  rawCode: string;
  employeeId: string;
  employeeName: string;
}

interface DepartmentShiftSession {
  id: number;
  department: string;
  status: 'active' | 'completed';
  startHeadcount: number;
}

interface DepartmentEmployeeShift {
  id: number;
  date: string;
  department: KioskDepartmentKey;
  employeeId: string;
  employeeName: string;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string | null;
  totalLaborCost: number;
}

interface ScanResult {
  action: 'clock-in' | 'clock-out';
  shift: DepartmentEmployeeShift;
}

interface LastScanSummary {
  action: 'clock-in' | 'clock-out';
  employeeId: string;
  employeeName: string;
  department: KioskDepartmentKey;
  startTime?: string;
  endTime?: string | null;
}

interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const toDisplayName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const parseBadgeScan = (rawValue: string): ParsedBadgeScan | null => {
  const rawCode = rawValue.trim();
  if (!rawCode) {
    return null;
  }

  const compact = rawCode.replace(/\s+/g, ' ').trim();
  const withoutPrefix = compact.replace(/^badge\s+/i, '').trim();
  const separatorIndex = withoutPrefix.lastIndexOf('-');

  if (separatorIndex <= 0 || separatorIndex >= withoutPrefix.length - 1) {
    return null;
  }

  const employeeName = withoutPrefix.slice(0, separatorIndex).trim();
  const employeeId = withoutPrefix.slice(separatorIndex + 1).trim().toUpperCase();

  if (!employeeName || !employeeId) {
    return null;
  }

  return {
    rawCode,
    employeeId,
    employeeName: toDisplayName(employeeName),
  };
};

export default function LaborKiosk() {
  const navigate = useNavigate();
  const isDesktopShell = typeof window !== 'undefined' && Boolean((window as any).electron);
  const [scanValue, setScanValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [date, setDate] = useState(getLocalDateString(new Date()));
  const [sessions, setSessions] = useState<DepartmentShiftSession[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAssistantBusy, setIsAssistantBusy] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState('');
  const [lastScannedEmployee, setLastScannedEmployee] = useState<string>('');
  const [lastScan, setLastScan] = useState<LastScanSummary | null>(null);
  const [assistantTurns, setAssistantTurns] = useState<AssistantTurn[]>([
    {
      role: 'assistant',
      text: 'Hello. I can help with kiosk questions, badge scan issues, and clock-in or clock-out guidance.',
    },
  ]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const assistantInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const lastHandledScanRef = useRef<{ code: string; at: number } | null>(null);
  const lastScanTimeoutRef = useRef<any>(null);

  const speechRecognitionSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const w = window as any;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  const { employees: departmentEmployees } = useKioskEmployees();

  const employeeRecordsById = useMemo(() => {
    const map = new Map<string, typeof departmentEmployees>();
    for (const employee of departmentEmployees) {
      const idKey = employee.employeeId.toUpperCase();

      const existing = map.get(idKey);
      if (existing) {
        existing.push(employee);
      } else {
        map.set(idKey, [employee]);
      }
    }
    return map;
  }, [departmentEmployees]);

  const employeeById = useMemo(() => {
    const map = new Map<string, (typeof departmentEmployees)[number]>();
    for (const employee of departmentEmployees) {
      const key = employee.employeeId.toUpperCase();
      if (!map.has(key)) {
        map.set(key, employee);
      }
    }
    return map;
  }, [departmentEmployees]);

  const resolveEmployeeName = (shift: Pick<DepartmentEmployeeShift, 'employeeId' | 'employeeName'>) => {
    const explicitName = String(shift.employeeName || '').trim();
    if (explicitName) {
      return explicitName;
    }

    const employee = employeeById.get(String(shift.employeeId || '').toUpperCase());
    return employee?.employeeName || shift.employeeId;
  };

  const resolveRosterMatch = (parsedScan: ParsedBadgeScan) => {
    const candidates = employeeRecordsById.get(parsedScan.employeeId.toUpperCase()) || [];
    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const normalizedScanName = normalizeText(parsedScan.employeeName);
    const exactNameMatch = candidates.find((employee) => normalizeText(employee.employeeName) === normalizedScanName);
    if (exactNameMatch) {
      return exactNameMatch;
    }

    const partialNameMatch = candidates.find((employee) => {
      const rosterName = normalizeText(employee.employeeName);
      return rosterName.includes(normalizedScanName) || normalizedScanName.includes(rosterName);
    });

    return partialNameMatch || candidates[0];
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '--';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const refreshData = async (dateOverride?: string) => {
    const targetDate = dateOverride || date;
    const sessionRes = await fetch(`${API_BASE}/api/labor/departments/sessions?date=${targetDate}`);

    if (sessionRes.ok) {
      setSessions(await sessionRes.json());
    }
  };

  const performScan = async (rawCode: string) => {
    const parsedScan = parseBadgeScan(rawCode);
    if (!parsedScan || isSpeaking) {
      return;
    }

    const now = Date.now();
    const lastHandled = lastHandledScanRef.current;
    if (lastHandled && lastHandled.code === parsedScan.rawCode && now - lastHandled.at < 800) {
      return;
    }

    lastHandledScanRef.current = { code: parsedScan.rawCode, at: now };
    setError(null);

    const employee = resolveRosterMatch(parsedScan);
    if (!employee) {
      setError(`Employee not found for badge scan: ${parsedScan.employeeName} (${parsedScan.employeeId})`);
      setScanValue('');
      inputRef.current?.focus();
      return;
    }

    try {
      setIsSpeaking(true);
      await ensureDepartmentSession(employee.department);

      const response = await fetch(`${API_BASE}/api/labor/employees/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: employee.department,
          employeeId: parsedScan.employeeId,
          employeeName: parsedScan.employeeName,
          scannedBy: 'Kiosk',
          scanCode: parsedScan.rawCode,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Scan failed' }));
        throw new Error(payload.error || 'Scan failed');
      }

      const payload: ScanResult = await response.json();
      const resolvedName = resolveEmployeeName({
        employeeId: payload.shift.employeeId,
        employeeName: payload.shift.employeeName,
      });

      setLastScannedEmployee(resolvedName);
      
      // Clear any existing timeout
      if (lastScanTimeoutRef.current) {
        clearTimeout(lastScanTimeoutRef.current);
      }
      
      setLastScan({
        action: payload.action,
        employeeId: payload.shift.employeeId,
        employeeName: resolvedName,
        department: payload.shift.department,
        startTime: payload.shift.startTime,
        endTime: payload.shift.endTime,
      });

      // Auto-clear the employee display after 4 seconds
      lastScanTimeoutRef.current = setTimeout(() => {
        setLastScan(null);
        lastScanTimeoutRef.current = null;
      }, 4000);

      await speakScanMessage(resolvedName, payload.action);
      setIsSpeaking(false);

      setScanValue('');
      inputRef.current?.focus();
      await refreshData(date);
    } catch (scanError: any) {
      setError(scanError.message || 'Scan failed');
      setIsSpeaking(false);
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
    void refreshData(date);

    const interval = setInterval(() => {
      const today = getLocalDateString(new Date());
      if (today !== date) {
        setDate(today);
      }
      void refreshData(today);
    }, 30000);

    return () => clearInterval(interval);
  }, [date]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const getPreferredNaturalVoice = async (synth: SpeechSynthesis) => {
    let voices = synth.getVoices();

    if (!voices.length) {
      voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
        const timeout = window.setTimeout(() => {
          synth.onvoiceschanged = null;
          resolve(synth.getVoices());
        }, 1200);

        synth.onvoiceschanged = () => {
          window.clearTimeout(timeout);
          synth.onvoiceschanged = null;
          resolve(synth.getVoices());
        };
      });
    }

    if (!voices.length) {
      return null;
    }

    const preferredNamePatterns = [
      /samantha/i,
      /karen/i,
      /moira/i,
      /daniel/i,
      /siri/i,
      /enhanced/i,
      /google us english/i,
    ];

    for (const pattern of preferredNamePatterns) {
      const matched = voices.find((voice) => pattern.test(voice.name));
      if (matched) {
        return matched;
      }
    }

    const enUsVoice = voices.find((voice) => /en-US/i.test(voice.lang));
    if (enUsVoice) {
      return enUsVoice;
    }

    return voices[0] || null;
  };

  const speakScanMessage = async (employeeName: string, actionType: 'clock-in' | 'clock-out') => {
    if (!window.speechSynthesis) {
      return;
    }

    const message =
      actionType === 'clock-in'
        ? `Hello ${employeeName}. You have scanned in. Have a great shift.`
        : `Great job today ${employeeName}. You have scanned out.`;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.98;
    utterance.pitch = 1.0;

    const synth = window.speechSynthesis;
    const preferredVoice = await getPreferredNaturalVoice(synth);
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      synth.cancel();
      synth.speak(utterance);
    });
  };

  const ensureDepartmentSession = async (department: KioskDepartmentKey) => {
    const hasActiveSession = sessions.some((session) => session.department === department && session.status === 'active');
    if (hasActiveSession) {
      return true;
    }

    const headcount = departmentEmployees.filter((employee) => employee.department === department).length || 1;
    const response = await fetch(`${API_BASE}/api/labor/departments/${department}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startedBy: 'Kiosk',
        headcount,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Failed to start department shift' }));
      throw new Error(payload.error || 'Failed to start department shift');
    }

    return true;
  };

  const handleScan = async (event: React.FormEvent) => {
    event.preventDefault();
    await performScan(scanValue);
  };

  useEffect(() => {
    const code = scanValue.trim();
    if (!code || isSpeaking) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void performScan(code);
    }, 180);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [scanValue, isSpeaking]);

  const speakAssistantReply = async (text: string) => {
    if (!window.speechSynthesis) {
      return;
    }

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1.0;

    const preferredVoice = await getPreferredNaturalVoice(synth);
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      synth.cancel();
      synth.speak(utterance);
    });
  };

  const askAssistant = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isAssistantBusy) {
      return;
    }

    setAssistantError(null);
    setIsAssistantBusy(true);
    setAssistantTurns((prev) => [...prev, { role: 'user', text: question }]);
    setAssistantQuery('');

    try {
      const contextTurns = assistantTurns.slice(-6);
      const response = await fetch(`${API_BASE}/api/kiosk/assistant/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          employeeName: lastScannedEmployee || undefined,
          context: contextTurns,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Assistant unavailable' }));
        throw new Error(payload.error || 'Assistant unavailable');
      }

      const payload = (await response.json()) as { reply?: string };
      const reply = (payload.reply || 'I did not catch that. Please try again.').trim();

      setAssistantTurns((prev) => [...prev, { role: 'assistant', text: reply }]);
      setIsSpeaking(true);
      await speakAssistantReply(reply);
      setIsSpeaking(false);
      assistantInputRef.current?.focus();
    } catch (assistantErr: any) {
      setAssistantError(assistantErr.message || 'Assistant request failed');
    } finally {
      setIsAssistantBusy(false);
      setIsListening(false);
    }
  };

  const handleAssistantSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await askAssistant(assistantQuery);
  };

  const startVoiceConversation = () => {
    if (!speechRecognitionSupported || isAssistantBusy || isListening) {
      return;
    }

    const w = window as any;
    const RecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setAssistantError('Voice input is not supported on this device.');
      return;
    }

    setAssistantError(null);
    setIsListening(true);

    const recognition = new RecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || '').trim();
      if (!transcript) {
        setAssistantError('I did not hear anything. Try again.');
        return;
      }

      setAssistantQuery(transcript);
      void askAssistant(transcript);
    };

    recognition.onerror = () => {
      setAssistantError('Voice recognition failed. Please try again or type your question.');
      setIsListening(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="labor-kiosk">
      {isDesktopShell && <TitleBar showLegend={false} />}
      <div className="labor-kiosk__container">
        <div className="labor-kiosk__layout">
          <section className="labor-kiosk__controls-pane">
            <div className="labor-kiosk__hero">
              <h1>Welcome to OpsIQ Timeclock</h1>
              <p>Scan your badge to clock in or out</p>
              <button
                type="button"
                className="labor-kiosk__admin-access"
                onClick={() => navigate('/labor-kiosk-admin')}
              >
                Employee Admin
              </button>
            </div>

            <form className="labor-kiosk__scan-form" onSubmit={handleScan}>
              <label htmlFor="kiosk-scan">Scan Your Badge</label>
              <input
                id="kiosk-scan"
                ref={inputRef}
                type="text"
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void performScan(scanValue);
                  }
                }}
                placeholder="Place badge over scanner..."
                autoComplete="off"
              />
              <div className="labor-kiosk__scan-hint">Scan happens automatically when the badge reader sends the code.</div>
            </form>

            {lastScan && (
              <section className={`labor-kiosk__last-scan labor-kiosk__last-scan--${lastScan.action}`}>
                <div className="labor-kiosk__last-scan-label">
                  {lastScan.action === 'clock-in' ? 'Scanned In' : 'Scanned Out'}
                </div>
                <div className="labor-kiosk__last-scan-name">{lastScan.employeeName}</div>
                <div className="labor-kiosk__last-scan-meta">
                  <span>{lastScan.employeeId}</span>
                  <span>{lastScan.department}</span>
                  <span>
                    {lastScan.action === 'clock-in'
                      ? formatDateTime(lastScan.startTime)
                      : formatDateTime(lastScan.endTime || lastScan.startTime)}
                  </span>
                </div>
              </section>
            )}

            <section className="labor-kiosk__assistant">
              <div className="labor-kiosk__assistant-header">
                <h2>Talk to OpsIQ Assistant</h2>
                <span>{isListening ? 'Listening...' : isAssistantBusy ? 'Thinking...' : 'Ready'}</span>
              </div>

              <div className="labor-kiosk__assistant-log" aria-live="polite">
                {assistantTurns.slice(-6).map((turn, index) => (
                  <div
                    key={`${turn.role}-${index}-${turn.text.slice(0, 14)}`}
                    className={`labor-kiosk__assistant-turn labor-kiosk__assistant-turn--${turn.role}`}
                  >
                    <strong>{turn.role === 'assistant' ? 'OpsIQ' : 'You'}:</strong> {turn.text}
                  </div>
                ))}
              </div>

              <form className="labor-kiosk__assistant-form" onSubmit={handleAssistantSubmit}>
                <input
                  ref={assistantInputRef}
                  type="text"
                  value={assistantQuery}
                  onChange={(event) => setAssistantQuery(event.target.value)}
                  placeholder="Ask a question about clock-in, scan errors, or your shift..."
                  autoComplete="off"
                  disabled={isAssistantBusy || isListening}
                />
                <button type="submit" disabled={isAssistantBusy || isListening || !assistantQuery.trim()}>
                  Ask
                </button>
                <button
                  type="button"
                  onClick={startVoiceConversation}
                  disabled={!speechRecognitionSupported || isAssistantBusy || isListening}
                  title={speechRecognitionSupported ? 'Speak your question' : 'Speech recognition not supported'}
                >
                  Talk
                </button>
              </form>
            </section>

            {error && <div className="labor-kiosk__error">{error}</div>}
            {assistantError && <div className="labor-kiosk__error">{assistantError}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
