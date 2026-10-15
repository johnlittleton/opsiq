import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { useKioskEmployees } from '../hooks/useKioskEmployees';
import './ProductionLineScan.css';
import { PRODUCTION_LINES, productionLineName } from '../data/productionLines';
import { findLineScanEmployee } from '../data/lineScanEmployee';

const LINES = PRODUCTION_LINES;

interface LineAssignment {
  date: string;
  employeeId: string;
  employeeName: string;
  lineId: number;
  assignedAt: string;
}

const localDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const lineName = productionLineName;

export default function ProductionLineScan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { employees } = useKioskEmployees();
  const requestedDate = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : localDateString(new Date()),
  );
  const [selectedLineId, setSelectedLineId] = useState(1);
  const [assignments, setAssignments] = useState<LineAssignment[]>([]);
  const [badgeCode, setBadgeCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ employee: (typeof employees)[number]; fromLineId: number } | null>(null);
  const badgeInputRef = useRef<HTMLInputElement>(null);

  const loadLineData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/line-assignments?date=${selectedDate}`);
      if (!response.ok) throw new Error('Unable to load line assignments');
      setAssignments(await response.json());
    } catch (error) {
      console.error('Failed to load production line assignments:', error);
      setMessage('Could not load line assignments.');
    }
  };

  useEffect(() => {
    void loadLineData();
  }, [selectedDate]);

  const assignEmployee = async (employee: (typeof employees)[number], lineId: number, expectedLineId: number | null, scannedCode: string) => {
    setBusy(true);
    setPendingMove(null);
    try {
      const response = await fetch(`${API_BASE}/api/production/line-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          employeeId: employee.employeeId,
          lineId,
          expectedLineId,
          scanCode: scannedCode,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to assign employee');

      await loadLineData();
      setBadgeCode('');
      setMessage(`${employee.employeeName} assigned to ${lineName(lineId)}.`);
      requestAnimationFrame(() => badgeInputRef.current?.focus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to assign employee');
      await loadLineData();
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || pendingMove) return;

    const scannedCode = badgeCode.trim().toUpperCase();
    if (!scannedCode) return;

    const employee = findLineScanEmployee(employees, scannedCode);
    if (!employee) {
      setMessage(`Badge ${scannedCode} was not found in the active Production labor kiosk roster.`);
      setBadgeCode('');
      requestAnimationFrame(() => badgeInputRef.current?.focus());
      return;
    }

    const currentAssignment = assignments.find((item) => item.employeeId === employee.employeeId);
    if (currentAssignment?.lineId === selectedLineId) {
      setMessage(`${employee.employeeName} is already assigned to ${lineName(selectedLineId)}.`);
      setBadgeCode('');
      requestAnimationFrame(() => badgeInputRef.current?.focus());
      return;
    }
    if (currentAssignment) {
      setPendingMove({ employee, fromLineId: currentAssignment.lineId });
      setMessage('');
      return;
    }

    await assignEmployee(employee, selectedLineId, null, scannedCode);
  };

  return (
    <main className="production-line-scan-page">
      <header className="line-scan-page-header">
        <button type="button" className="line-scan-home-button" onClick={() => navigate('/')}>← Home</button>
        <div>
          <p className="line-scan-eyebrow">PRODUCTION / STAFFING</p>
          <h1>Line Scan</h1>
          <p className="line-scan-total-headcount" role="status" aria-live="polite">
            <span>Total Headcount Scanned</span>
            <strong>{assignments.length}</strong>
          </p>
        </div>
        <label className="line-scan-date">
          <span>Production date</span>
          <input type="date" value={selectedDate} onChange={(event) => {
            setSelectedDate(event.target.value);
            setMessage('');
            setPendingMove(null);
          }} />
        </label>
        <button type="button" className="line-scan-history-button" onClick={() => navigate(`/production-line-scan-history?date=${selectedDate}`)}>Scan History</button>
      </header>

      <section className="line-scan-workspace">
        <div className="line-scan-form-panel">
          <div className="line-scan-form-heading">
            <span className="line-scan-step">01</span>
            <div>
              <h2>Assign employee</h2>
              <p>Select a line, then scan a badge.</p>
            </div>
          </div>
          <label className="line-scan-field-label" htmlFor="line-scan-page-line">Production line</label>
          <select id="line-scan-page-line" value={selectedLineId} disabled={busy || Boolean(pendingMove)} onChange={(event) => {
            setSelectedLineId(Number(event.target.value));
            setMessage('');
          }}>
            {LINES.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
          </select>
          <form className="line-scan-page-form" onSubmit={(event) => void handleScan(event)}>
            <label className="line-scan-field-label" htmlFor="line-scan-page-badge">Employee badge</label>
            <div className="line-scan-input-row">
              <input
                id="line-scan-page-badge"
                ref={badgeInputRef}
                autoFocus
                autoComplete="off"
                placeholder="Scan badge or enter ID"
                value={badgeCode}
                disabled={busy || Boolean(pendingMove)}
                onChange={(event) => setBadgeCode(event.target.value)}
              />
              <button type="submit" disabled={busy || Boolean(pendingMove) || !badgeCode.trim()}>{busy ? 'Saving...' : 'Assign'}</button>
            </div>
          </form>
          {pendingMove && (
            <div className="line-scan-page-confirm" role="alertdialog" aria-live="assertive">
              <p>Move <strong>{pendingMove.employee.employeeName}</strong> from <strong>{lineName(pendingMove.fromLineId)}</strong> to <strong>{lineName(selectedLineId)}</strong>?</p>
              <div>
                <button type="button" disabled={busy} onClick={() => void assignEmployee(pendingMove.employee, selectedLineId, pendingMove.fromLineId, badgeCode.trim().toUpperCase())}>Confirm move</button>
                <button type="button" className="line-scan-page-cancel" onClick={() => {
                  setPendingMove(null);
                  setBadgeCode('');
                  requestAnimationFrame(() => badgeInputRef.current?.focus());
                }}>Cancel</button>
              </div>
            </div>
          )}
          <p className="line-scan-page-message" role="status" aria-live="polite">{message}</p>
        </div>
        <aside className="line-scan-selected-summary">
          <span>SELECTED LINE</span>
          <strong>{lineName(selectedLineId)}</strong>
          <b>{assignments.filter((assignment) => assignment.lineId === selectedLineId).length}</b>
          <small>employees assigned</small>
        </aside>
      </section>

      <section className="line-scan-lines-section">
        <div className="line-scan-section-heading">
          <div><span>02</span><h2>Current line staffing</h2></div>
          <span>{assignments.length} assigned</span>
        </div>
        <div className="line-scan-lines-grid">
          {LINES.map((line) => {
            const lineAssignments = assignments.filter((assignment) => assignment.lineId === line.id);
            return (
              <article className={`line-scan-line-card${selectedLineId === line.id ? ' is-selected' : ''}`} key={line.id}>
                <button type="button" className="line-scan-line-select" onClick={() => {
                  setSelectedLineId(line.id);
                  setPendingMove(null);
                  setMessage('');
                  requestAnimationFrame(() => badgeInputRef.current?.focus());
                }}>
                  <span>{line.name}</span><strong>{lineAssignments.length}</strong>
                </button>
              </article>
            );
          })}
        </div>
      </section>

    </main>
  );
}
