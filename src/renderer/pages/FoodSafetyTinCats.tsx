import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import { FOOD_SAFETY_CYCLE_DAYS, FOOD_SAFETY_TIN_CAT_TARGET, getTinCatProgress, getTinCatStatus, normalizeTinCatCode } from '../../shared/foodSafetyTinCats';
import './FoodSafetyTinCats.css';

interface TinCatScan {
  id: number;
  cycleId: number;
  assetCode: string;
  scannedBy: string;
  scannedAt: string;
}

interface TinCatCycle {
  id: number;
  status: 'open' | 'completed' | 'overdue';
  targetCount: number;
  scannedCount: number;
  startedBy: string;
  startedAt: string;
  dueAt: string;
  completedAt?: string | null;
  scans?: TinCatScan[];
}

const sessionHeaders = (sessionToken: string | null) => ({
  Authorization: `Bearer ${sessionToken || localStorage.getItem('opsiq-session-token') || ''}`,
});

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export default function FoodSafetyTinCats() {
  const navigate = useNavigate();
  const { executiveName, sessionToken, logout } = useAuth();
  const [cycles, setCycles] = useState<TinCatCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<TinCatCycle | null>(null);
  const [assetCode, setAssetCode] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'warning' | 'error'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const selectedCycleIdRef = useRef<number | null>(null);

  const tokenHeaders = useMemo(() => sessionHeaders(sessionToken), [sessionToken]);

  const loadCycles = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/food-safety/tin-cats/cycles`, { headers: tokenHeaders });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Unable to load inspection cycles.');
    const records = Array.isArray(payload) ? payload as TinCatCycle[] : [];
    setCycles(records);
    const selectedStillExists = selectedCycleIdRef.current != null && records.some((cycle) => cycle.id === selectedCycleIdRef.current);
    if (!selectedStillExists) {
      const current = records.find((cycle) => cycle.status === 'open' && getTinCatStatus(cycle.scannedCount, cycle.dueAt) === 'open');
      const nextId = current?.id ?? records[0]?.id ?? null;
      selectedCycleIdRef.current = nextId;
      setSelectedCycleId(nextId);
    }
    setLoading(false);
  }, [tokenHeaders]);

  const loadCycle = useCallback(async (cycleId: number) => {
    const response = await fetch(`${API_BASE}/api/food-safety/tin-cats/cycles/${cycleId}`, { headers: tokenHeaders });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Unable to load cycle scans.');
    setSelectedCycle(payload as TinCatCycle);
  }, [tokenHeaders]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        await loadCycles();
      } catch (error) {
        if (!disposed) {
          setMessage(error instanceof Error ? error.message : 'Unable to load Food Safety cycles.');
          setMessageKind('error');
          setLoading(false);
        }
      }
    };
    void load();
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [loadCycles]);

  useEffect(() => {
    selectedCycleIdRef.current = selectedCycleId;
    if (selectedCycleId == null) {
      setSelectedCycle(null);
      return;
    }
    let disposed = false;
    void loadCycle(selectedCycleId).catch((error) => {
      if (!disposed) {
        setMessage(error instanceof Error ? error.message : 'Unable to load cycle scans.');
        setMessageKind('error');
      }
    });
    return () => { disposed = true; };
  }, [selectedCycleId, loadCycle]);

  const startCycle = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/food-safety/tin-cats/cycles`, {
        method: 'POST',
        headers: { ...tokenHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to start cycle.');
      selectedCycleIdRef.current = payload.id;
      setSelectedCycleId(payload.id);
      setSelectedCycle(payload);
      await loadCycles();
      setMessage(`Inspection cycle started. Scan ${FOOD_SAFETY_TIN_CAT_TARGET} tin cats by ${formatDateTime(payload.dueAt)}.`);
      setMessageKind('success');
      requestAnimationFrame(() => scanInputRef.current?.focus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start cycle.');
      setMessageKind('error');
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCycle || !isActiveCycle || busy) return;
    const normalized = normalizeTinCatCode(assetCode);
    if (!normalized) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/food-safety/tin-cats/cycles/${selectedCycle.id}/scans`, {
        method: 'POST',
        headers: { ...tokenHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetCode: normalized }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to record scan.');
      setSelectedCycle(payload.cycle);
      await loadCycles();
      setAssetCode('');
      setMessage(payload.duplicate ? `${normalized} was already scanned in this cycle.` : `${normalized} scanned successfully.`);
      setMessageKind(payload.duplicate ? 'warning' : 'success');
      if (payload.cycle?.status === 'completed') setMessage('All 147 tin cats scanned. This inspection cycle is complete.');
      requestAnimationFrame(() => scanInputRef.current?.focus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record scan.');
      setMessageKind('error');
      setAssetCode('');
      requestAnimationFrame(() => scanInputRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  const activeCycle = cycles.find((cycle) => cycle.status === 'open' && getTinCatStatus(cycle.scannedCount, cycle.dueAt) === 'open') || null;
  const isActiveCycle = Boolean(selectedCycle && selectedCycle.id === activeCycle?.id && selectedCycle.status === 'open');
  const progress = selectedCycle ? getTinCatProgress(selectedCycle.scannedCount, selectedCycle.targetCount || FOOD_SAFETY_TIN_CAT_TARGET) : getTinCatProgress(0);
  const cycleStatus = selectedCycle ? getTinCatStatus(selectedCycle.scannedCount, selectedCycle.dueAt) : 'open';

  return (
    <main className="food-safety-page">
      <header className="food-safety-header">
        <div className="food-safety-title">
          <p>FOOD SAFETY / BIWEEKLY INSPECTION</p>
          <h1>Tin Cat Scan</h1>
        </div>
        <div className="food-safety-header-actions">
          <span>{executiveName}</span>
          <button type="button" onClick={() => void loadCycles()}>Refresh</button>
          <button type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      {message && <div className={`food-safety-message is-${messageKind}`} role="status" aria-live="polite">{message}</div>}

      {loading ? <div className="food-safety-empty">Loading inspection history...</div> : (
        <>
          {!activeCycle && (
            <section className="food-safety-start-panel">
              <div>
                <span className="food-safety-eyebrow">NEXT INSPECTION</span>
                <h2>{cycles.length ? 'Ready for the next 14-day cycle' : 'Start the first 14-day cycle'}</h2>
                <p>Scan each tin-cat barcode once. The cycle completes automatically at {FOOD_SAFETY_TIN_CAT_TARGET} unique scans.</p>
              </div>
              <button type="button" className="food-safety-start-button" disabled={busy} onClick={() => void startCycle()}>
                {busy ? 'Starting...' : 'Start Inspection Cycle'}
              </button>
            </section>
          )}

          {selectedCycle && (
            <>
              <section className="food-safety-cycle-summary">
                <div className="food-safety-cycle-heading">
                  <div>
                    <span className="food-safety-eyebrow">INSPECTION CYCLE #{selectedCycle.id}</span>
                    <h2>{cycleStatus === 'completed' ? 'Cycle Complete' : cycleStatus === 'overdue' ? 'Cycle Overdue' : 'Current Inspection'}</h2>
                  </div>
                  <span className={`food-safety-status is-${cycleStatus}`}>{cycleStatus}</span>
                </div>
                <div className="food-safety-progress-copy">
                  <strong>{progress.scanned} <small>/ {progress.target} scanned</small></strong>
                  <span>{progress.remaining} remaining</span>
                </div>
                <div className="food-safety-progress-track" role="progressbar" aria-valuenow={progress.scanned} aria-valuemin={0} aria-valuemax={progress.target}>
                  <div style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="food-safety-cycle-meta">
                  <span>Started {formatDateTime(selectedCycle.startedAt)} by {selectedCycle.startedBy}</span>
                  <span>Due {formatDateTime(selectedCycle.dueAt)}</span>
                </div>
              </section>

              {isActiveCycle && (
                <section className="food-safety-scan-panel">
                  <form onSubmit={(event) => void handleScan(event)}>
                    <label htmlFor="tin-cat-scan-input">Scan tin-cat barcode</label>
                    <div className="food-safety-scan-row">
                      <input
                        id="tin-cat-scan-input"
                        ref={scanInputRef}
                        autoFocus
                        autoComplete="off"
                        placeholder="Click here, then scan"
                        value={assetCode}
                        onChange={(event) => setAssetCode(event.target.value)}
                        disabled={busy}
                      />
                      <button type="submit" disabled={busy || !assetCode.trim()}>{busy ? 'Saving...' : 'Record Scan'}</button>
                    </div>
                  </form>
                </section>
              )}

              <section className="food-safety-scans-section">
                <div className="food-safety-section-heading">
                  <h2>Scanned Tin Cats</h2>
                  <span>{selectedCycle.scans?.length || 0} recorded</span>
                </div>
                {!selectedCycle.scans?.length ? <p className="food-safety-empty">No tin cats scanned in this cycle yet.</p> : (
                  <div className="food-safety-scan-list">
                    {selectedCycle.scans.map((scan) => (
                      <div className="food-safety-scan-row-item" key={scan.id}>
                        <strong>{scan.assetCode}</strong><span>{scan.scannedBy}</span><time>{formatDateTime(scan.scannedAt)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          <section className="food-safety-history-section">
            <div className="food-safety-section-heading"><h2>Inspection History</h2><span>{cycles.length} cycles</span></div>
            {!cycles.length ? <p className="food-safety-empty">No previous cycles yet.</p> : (
              <div className="food-safety-cycle-list">
                {cycles.map((cycle) => (
                  <button type="button" key={cycle.id} className={selectedCycleId === cycle.id ? 'is-selected' : ''} onClick={() => {
                    selectedCycleIdRef.current = cycle.id;
                    setSelectedCycleId(cycle.id);
                    setMessage('');
                  }}>
                    <strong>Cycle #{cycle.id}</strong><span>{Number(cycle.scannedCount) || 0}/{cycle.targetCount} scans</span><span>{formatDateTime(cycle.startedAt)}</span><span className={`food-safety-status is-${getTinCatStatus(cycle.scannedCount, cycle.dueAt)}`}>{getTinCatStatus(cycle.scannedCount, cycle.dueAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
