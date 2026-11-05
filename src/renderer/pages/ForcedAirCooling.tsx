import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Download, Fan, History, Pencil, Play, Plus, Printer, RefreshCw, Save, ScanBarcode, Square, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import { exportInventoryWorkbook } from '../data/inventoryExports';
import { buildFacReportHtml, coolingElapsed, FAC_COOLERS, FAC_CUSTOMERS, FAC_TARGET_MS, facReportSheets, filterFacHistory, localDate, localDateTime, type FacLoad } from '../data/facReports';
import './ForcedAirCooling.css';

type Mode = 'dashboard' | 'tracker' | 'schedule' | 'history';
type Metadata = Pick<FacLoad, 'cooler' | 'customer' | 'arrivalDate' | 'workOrder' | 'runNumber' | 'receivedNumber' | 'containerNumber' | 'famous' | 'billed' | 'notes'> & { scheduledStart: string };
type Scan = { loadId: number; palletId: string };
class FacApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}
const pending = (load: FacLoad) => load.status === 'ready' || load.status === 'scheduled';
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString() : '-';
const duration = (milliseconds: number) => {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const defaults = (date: string, scheduled: boolean, cooler = 2): Metadata => ({
  cooler, customer: FAC_CUSTOMERS[0], arrivalDate: date, scheduledStart: scheduled ? `${date}T08:00` : '',
  workOrder: '', runNumber: '', receivedNumber: '', containerNumber: '', famous: false, billed: false, notes: '',
});
const tabs = [
  { mode: 'dashboard', label: 'Dashboard', Icon: Fan }, { mode: 'tracker', label: 'Tracker', Icon: ScanBarcode },
  { mode: 'schedule', label: 'Schedule', Icon: CalendarDays }, { mode: 'history', label: 'History', Icon: History },
] as const;

export default function ForcedAirCooling({ mode = 'dashboard' }: { mode?: Mode }) {
  const { sessionToken } = useAuth();
  const [loads, setLoads] = useState<FacLoad[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [date, setDate] = useState(localDate());
  const [from, setFrom] = useState(() => `${localDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(localDate());
  const [query, setQuery] = useState('');
  const [coolerFilter, setCoolerFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [editor, setEditor] = useState<{ id: number | null; status: FacLoad['status']; data: Metadata } | null>(null);
  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [conflict, setConflict] = useState<{ id: number; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef('');
  const scanTimer = useRef<ReturnType<typeof setTimeout>>();
  const scanQueue = useRef<Scan[]>([]);
  const processingScans = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const alive = useRef(true);
  const mutationVersion = useRef(0);
  const actionLock = useRef(false);
  const selected = loads.find(load => load.id === selectedId);

  async function request<Result>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<Result> {
    if (!sessionToken) throw new FacApiError('Authentication required. Sign in again.');
    const response = await fetch(`${API_BASE}/api/fac/loads${path}`, {
      method, signal, headers: { Authorization: `Bearer ${sessionToken}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new FacApiError(data?.error || `FAC request failed (${response.status}).`, data?.code);
    if (data === null) throw new FacApiError('FAC returned an invalid response.');
    return data as Result;
  }

  async function refresh() {
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const version = mutationVersion.current;
    setRefreshing(true);
    try {
      const result = await request<FacLoad[]>('', 'GET', undefined, controller.signal);
      if (alive.current && !controller.signal.aborted && version === mutationVersion.current) {
        setLoads(result); setLoaded(true); setUpdatedAt(new Date().toISOString());
      }
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to refresh FAC loads.');
    } finally {
      if (alive.current && readController.current === controller) setRefreshing(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    void refresh();
    const poll = window.setInterval(() => { void refresh(); }, 30000);
    return () => {
      alive.current = false; window.clearInterval(poll); readController.current?.abort();
      controllers.current.forEach(controller => controller.abort());
      clearTimeout(scanTimer.current); scanQueue.current = [];
    };
  }, [sessionToken]);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    clearTimeout(scanTimer.current); barcodeRef.current = ''; setBarcode('');
    if (mode === 'tracker' && selected && pending(selected)) inputRef.current?.focus();
  }, [selectedId, mode]);

  async function write<Result>(path: string, method: string, body: unknown): Promise<Result> {
    mutationVersion.current += 1;
    readController.current?.abort();
    const controller = new AbortController();
    controllers.current.add(controller);
    try { return await request<Result>(path, method, body, controller.signal); }
    finally { controllers.current.delete(controller); mutationVersion.current += 1; }
  }
  function merge(load: FacLoad) {
    if (!alive.current) return;
    setLoads(current => [...current.filter(item => item.id !== load.id), load].sort((first, second) => first.id - second.id));
  }
  async function action(operation: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'FAC operation failed.'); }
    finally { actionLock.current = false; if (alive.current) { setBusy(false); void refresh(); } }
  }

  function openEditor(load?: FacLoad, cooler = 2) {
    setEditor(load ? { id: load.id, status: load.status, data: { ...load, scheduledStart: localDateTime(load.scheduledStart) } }
      : { id: null, status: mode === 'schedule' ? 'scheduled' : 'ready', data: defaults(date, mode === 'schedule', cooler) });
  }
  async function saveMetadata(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const current = editor;
    const data = current.data;
    const body = current.id !== null && current.status !== 'ready' && current.status !== 'scheduled'
      ? { famous: data.famous, billed: data.billed }
      : { cooler: data.cooler, customer: data.customer, arrivalDate: data.arrivalDate, workOrder: data.workOrder,
        runNumber: data.runNumber, receivedNumber: data.receivedNumber, containerNumber: data.containerNumber,
        famous: data.famous, billed: data.billed, notes: data.notes,
        scheduledStart: data.scheduledStart ? new Date(data.scheduledStart).toISOString() : null };
    await action(async () => {
      const load = await write<FacLoad>(current.id === null ? '' : `/${current.id}`, current.id === null ? 'POST' : 'PUT', body);
      merge(load); setSelectedId(load.id); setEditor(null); setNotice(`Load #${load.id} saved.`);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    });
  }

  async function drainScans() {
    if (processingScans.current) return;
    processingScans.current = true; setScanning(true);
    while (scanQueue.current.length && alive.current) {
      const scan = scanQueue.current.shift()!;
      try {
        const result = await write<{ duplicate: boolean; load: FacLoad }>(`/${scan.loadId}/pallets`, 'POST', { palletId: scan.palletId });
        if (alive.current) {
          merge(result.load); setNotice(`${result.duplicate ? 'Duplicate, already saved' : 'Saved'}: ${scan.palletId} (load #${scan.loadId})`);
        }
      } catch (failure) {
        if (alive.current) setError(`Pallet ${scan.palletId} was not saved: ${failure instanceof Error ? failure.message : 'Request failed.'} Rescan this pallet.`);
      }
    }
    processingScans.current = false;
    if (alive.current) { setScanning(false); inputRef.current?.focus(); void refresh(); }
  }
  function captureBarcode() {
    clearTimeout(scanTimer.current);
    const palletId = barcodeRef.current.trim();
    if (!palletId || !selected || !pending(selected) || actionLock.current) return;
    barcodeRef.current = ''; setBarcode('');
    scanQueue.current.push({ loadId: selected.id, palletId });
    void drainScans(); inputRef.current?.focus();
  }
  function changeBarcode(value: string) {
    barcodeRef.current = value; setBarcode(value); clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(captureBarcode, 350);
  }
  async function startLoad(load: FacLoad, acknowledgeConflict = false) {
    await action(async () => {
      try {
        const result = await write<FacLoad>(`/${load.id}/start`, 'POST', { acknowledgeConflict });
        merge(result); setConflict(null); setNotice(`Cooler ${load.cooler} started. Release is manual.`);
      } catch (failure) {
        if (failure instanceof FacApiError && failure.code === 'SCHEDULE_CONFLICT' && !acknowledgeConflict) {
          setConflict({ id: load.id, message: failure.message });
        } else throw failure;
      }
    });
  }
  function releaseLoad(load: FacLoad) {
    if (!window.confirm(`Release load #${load.id} from Cooler ${load.cooler}? Elapsed: ${duration(coolingElapsed(load, Date.now()))}.`)) return;
    void action(async () => { merge(await write<FacLoad>(`/${load.id}/release`, 'POST', {})); setNotice(`Load #${load.id} released.`); });
  }
  function cancelLoad(load: FacLoad) {
    if (!window.confirm(`Cancel load #${load.id} for ${load.customer}?`)) return;
    void action(async () => { merge(await write<FacLoad>(`/${load.id}/cancel`, 'POST', {})); setNotice(`Load #${load.id} cancelled.`); });
  }
  async function printReport(reportLoads: FacLoad[]) {
    await action(async () => {
      const html = buildFacReportHtml(`Forced Air Cooling - ${reportLoads.length === 1 ? `Load #${reportLoads[0].id}` : `${from || 'All dates'} to ${to || 'All dates'}`}`, reportLoads);
      const desktop = (window as Window & { electron?: { printHTML?: (html: string) => Promise<{ success: boolean; error?: string }> } }).electron;
      if (desktop?.printHTML) {
        try {
          const result = await desktop.printHTML(html);
          if (result.success) return;
          setError(`Desktop printing failed: ${result.error || 'Unknown error'}. Opening browser fallback.`);
        } catch (failure) { setError(`Desktop printing failed: ${failure instanceof Error ? failure.message : 'Unknown error'}. Opening browser fallback.`); }
      }
      const popup = window.open('', '_blank');
      if (!popup) throw new Error('Print window blocked. Allow pop-ups and try again.');
      popup.document.open(); popup.document.write(html); popup.document.close(); popup.focus();
      popup.setTimeout(() => popup.print(), 250);
    });
  }
  const historyLoads = filterFacHistory(loads, from, to, query);
  const matchesFilters = (load: FacLoad) => (!coolerFilter || load.cooler === Number(coolerFilter)) && (!customerFilter || load.customer === customerFilter);
  const visible = (mode === 'history' ? historyLoads : mode === 'schedule'
    ? loads.filter(load => pending(load) && load.scheduledStart && localDate(new Date(load.scheduledStart)) === date)
    : loads.filter(load => pending(load) || load.status === 'cooling')).filter(matchesFilters)
    .sort((first, second) => mode === 'schedule' ? (first.scheduledStart || '').localeCompare(second.scheduledStart || '') : second.id - first.id);
  const disabled = busy || scanning;
  const uncommitted = barcode.trim().length > 0;
  function moveDate(days: number) {
    const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); setDate(localDate(next));
  }
  function loadActions(load: FacLoad) {
    return <div className="fac-actions">
      <button title={`View load #${load.id}`} aria-label={`View load #${load.id}`} disabled={disabled || uncommitted} onClick={() => setSelectedId(load.id)}><ClipboardList size={16} /></button>
      {load.status !== 'cancelled' && <button title="Edit metadata" aria-label={`Edit load #${load.id}`} disabled={disabled || uncommitted} onClick={() => openEditor(load)}><Pencil size={16} /></button>}
      {pending(load) && <>
        <button title="Start cooling" aria-label={`Start load #${load.id}`} disabled={disabled || uncommitted || !load.pallets.length} onClick={() => { void startLoad(load); }}><Play size={16} /></button>
        <button title="Cancel load" aria-label={`Cancel load #${load.id}`} disabled={disabled || uncommitted} onClick={() => cancelLoad(load)}><X size={16} /></button>
      </>}
      {load.status === 'cooling' && <button title="Release load" aria-label={`Release load #${load.id}`} disabled={disabled} onClick={() => releaseLoad(load)}><Square size={16} /></button>}
      {(load.status === 'completed' || load.status === 'cancelled') && <button title="Print full load report" aria-label={`Print load #${load.id}`} disabled={disabled} onClick={() => { void printReport([load]); }}><Printer size={16} /></button>}
    </div>;
  }

  return <main className="fac-page">
    <header className="fac-header"><div><h1><Fan size={24} /> Forced Air Cooling</h1><span>45-minute cooling cycle</span></div>
      <nav aria-label="Forced air cooling views">{tabs.map(({ mode: tabMode, label, Icon }) => <Link key={tabMode} to={`/fac-${tabMode}`} aria-current={mode === tabMode ? 'page' : undefined}><Icon size={16} />{label}</Link>)}</nav>
      <div className="fac-actions"><span className="fac-muted">{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : 'Connecting...'}</span><button title="Refresh loads" aria-label="Refresh loads" disabled={refreshing || disabled} onClick={() => { setError(''); void refresh(); }}><RefreshCw size={16} className={refreshing ? 'fac-spin' : ''} /></button></div>
    </header>
    {error && <div className="fac-message fac-error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button title="Dismiss error" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    {notice && <div className="fac-message" role="status">{notice}</div>}
    {!loaded && <p className="fac-muted">{error ? 'FAC data unavailable. Retry refresh.' : 'Loading FAC loads...'}</p>}

    {mode === 'dashboard' && <section className="fac-coolers" aria-label="Cooler dashboard">{FAC_COOLERS.map(cooler => {
      const active = loads.find(load => load.cooler === cooler && load.status === 'cooling');
      const elapsed = active ? coolingElapsed(active, now) : 0;
      const due = !!active && elapsed >= FAC_TARGET_MS;
      return <article className={`fac-cooler ${due ? 'fac-due' : ''}`} key={cooler}>
        <div className="fac-cooler-heading"><h2><Fan size={20} /> Cooler {cooler}</h2><span className={`fac-status ${active ? 'cooling' : ''}`}>{!loaded ? 'Unknown' : active ? 'Cooling' : 'Idle'}</span></div>
        {active ? <><h3>{active.customer}</h3><dl><dt>Load / WO / Run</dt><dd>#{active.id} / {active.workOrder || '-'} / {active.runNumber || '-'}</dd><dt>Container</dt><dd>{active.containerNumber || '-'}</dd><dt>Pallets</dt><dd>{active.pallets.length}</dd><dt>Started</dt><dd>{timestamp(active.startedAt)}</dd></dl>
          <div className="fac-timers"><div><span>Elapsed</span><strong>{duration(elapsed)}</strong></div><div><span>{due ? 'Over target' : 'Remaining'}</span><strong>{duration(due ? elapsed - FAC_TARGET_MS : FAC_TARGET_MS - elapsed)}</strong></div></div>
          <progress max={FAC_TARGET_MS} value={Math.min(FAC_TARGET_MS, elapsed)} aria-label={`Cooler ${cooler} cooling progress`} />
          {due && <p className="fac-due-label" role="status"><AlertTriangle size={16} /> Due for manual release</p>}
          <div className="fac-actions"><button disabled={disabled} onClick={() => releaseLoad(active)}><Square size={15} />Release</button><button title="View load" aria-label={`View cooler ${cooler} load`} onClick={() => setSelectedId(active.id)}><ClipboardList size={16} /></button><button title="Edit Famous / Billed" aria-label={`Edit cooler ${cooler} flags`} disabled={disabled} onClick={() => openEditor(active)}><Pencil size={16} /></button></div>
        </> : <><div className="fac-idle"><Fan size={44} /><strong>{loaded ? 'Available' : 'Awaiting data'}</strong><span>{loads.filter(load => load.cooler === cooler && pending(load)).length} pending loads</span></div><Link className="fac-link-button" to="/fac-tracker"><ScanBarcode size={16} />Open tracker</Link></>}
      </article>;
    })}</section>}

    {mode !== 'dashboard' && <>
      <section className="fac-toolbar" aria-label="Load filters">
        {mode === 'schedule' && <div className="fac-date-nav"><button title="Previous day" aria-label="Previous day" onClick={() => moveDate(-1)}><ChevronLeft size={16} /></button><label>Date<input type="date" required value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label><button title="Next day" aria-label="Next day" onClick={() => moveDate(1)}><ChevronRight size={16} /></button><button onClick={() => setDate(localDate())}>Today</button></div>}
        {mode === 'history' && <><label>From<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label><label>Through<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label><label>Search<input type="search" placeholder="Customer, WO, container, pallet..." value={query} onChange={event => setQuery(event.target.value)} /></label></>}
        <label>Cooler<select value={coolerFilter} onChange={event => setCoolerFilter(event.target.value)}><option value="">All coolers</option>{FAC_COOLERS.map(cooler => <option key={cooler} value={cooler}>{cooler}</option>)}</select></label>
        <label>Customer<select value={customerFilter} onChange={event => setCustomerFilter(event.target.value)}><option value="">All customers</option>{FAC_CUSTOMERS.map(customer => <option key={customer}>{customer}</option>)}</select></label>
        <div className="fac-actions fac-toolbar-actions">{mode === 'history' ? <><button disabled={disabled || !visible.length || from > to && !!to} onClick={() => { void printReport(visible); }}><Printer size={16} />Print filtered ({visible.length})</button><button title="Export all filtered loads and pallets to Excel" disabled={disabled || !visible.length} onClick={() => { void action(async () => { exportInventoryWorkbook(`FAC-${from || 'all'}-${to || 'all'}.xlsx`, facReportSheets(visible)); }); }}><Download size={16} />Excel</button></> : <button disabled={disabled || uncommitted} onClick={() => openEditor(undefined, Number(coolerFilter) || 2)}><Plus size={16} />{mode === 'schedule' ? 'Plan 45-minute slot' : 'New rush load'}</button>}</div>
      </section>
      {from && to && from > to && mode === 'history' && <p className="fac-error" role="alert">From date must be on or before Through date.</p>}
      {mode === 'tracker' && <section className="fac-scanner" aria-label="Pallet scanner"><label>Saved load<select value={selectedId || ''} disabled={disabled || uncommitted} onChange={event => setSelectedId(Number(event.target.value) || null)}><option value="">Choose a scheduled, ready or cooling load</option>{loads.filter(load => pending(load) || load.status === 'cooling').map(load => <option value={load.id} key={load.id}>#{load.id} - Cooler {load.cooler} - {load.customer} - {load.workOrder || 'No WO'} / {load.runNumber || 'No run'} - {load.status}</option>)}</select></label>
        <label className="fac-barcode"><span><ScanBarcode size={16} />Pallet barcode</span><input ref={inputRef} value={barcode} maxLength={200} autoComplete="off" disabled={!selected || !pending(selected) || busy} onChange={event => changeBarcode(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); captureBarcode(); } }} /></label><span className="fac-muted">{scanning ? 'Saving pallets...' : selected ? `${selected.pallets.length} pallets saved` : 'No load selected'}</span>
        {selected && pending(selected) && <button disabled={disabled || uncommitted || !selected.pallets.length} onClick={() => { void startLoad(selected); }}><Play size={16} />Start cooling</button>}
        {selected?.status === 'cooling' && <button disabled={disabled} onClick={() => releaseLoad(selected)}><Square size={16} />Release</button>}
      </section>}
      <div className="fac-table-scroll"><table className="fac-table"><thead><tr><th>Load</th><th>Cooler</th><th>Customer</th><th>Status</th><th>{mode === 'schedule' ? 'Planned slot' : 'Arrival'}</th><th>WO / Run</th><th>Received No</th><th>Container</th><th>Famous</th><th>Billed</th><th>Pallets</th><th>Started / Released</th><th>Actions</th></tr></thead><tbody>{visible.map(load => <tr key={load.id} className={load.id === selectedId ? 'fac-selected' : ''}><td>#{load.id}</td><td>{load.cooler}</td><td>{load.customer}</td><td><span className={`fac-status ${load.status}`}>{load.status}</span></td><td>{mode === 'schedule' ? <>{timestamp(load.scheduledStart)}<br /><span className="fac-muted">to {timestamp(new Date(Date.parse(load.scheduledStart!) + FAC_TARGET_MS).toISOString())}</span></> : load.arrivalDate}</td><td>{load.workOrder || '-'} / {load.runNumber || '-'}</td><td>{load.receivedNumber || '-'}</td><td>{load.containerNumber || '-'}</td><td>{load.famous ? 'Yes' : 'No'}</td><td>{load.billed ? 'Yes' : 'No'}</td><td>{load.pallets.length}</td><td>{timestamp(load.startedAt)}<br />{timestamp(load.releasedAt)}</td><td>{loadActions(load)}</td></tr>)}</tbody></table>{loaded && !visible.length && <p className="fac-empty">No {mode === 'schedule' ? 'planned slots for this date' : 'matching loads'}.</p>}</div>
    </>}

    {selected && <section className="fac-detail" aria-label={`Load ${selected.id} details`}><div className="fac-section-heading"><h2>Load #{selected.id} / {selected.customer}</h2><div className="fac-actions">{loadActions(selected)}<button title="Close details" aria-label="Close details" disabled={disabled || uncommitted} onClick={() => setSelectedId(null)}><X size={16} /></button></div></div>
      <dl><dt>Cooler / Status</dt><dd>{selected.cooler} / {selected.status}</dd><dt>Arrival</dt><dd>{selected.arrivalDate}</dd><dt>Work order / Run</dt><dd>{selected.workOrder || '-'} / {selected.runNumber || '-'}</dd><dt>Received No</dt><dd>{selected.receivedNumber || '-'}</dd><dt>Container</dt><dd>{selected.containerNumber || '-'}</dd><dt>Famous / Billed</dt><dd>{selected.famous ? 'Yes' : 'No'} / {selected.billed ? 'Yes' : 'No'}</dd><dt>Planned</dt><dd>{timestamp(selected.scheduledStart)}</dd><dt>Started / Released</dt><dd>{timestamp(selected.startedAt)} / {timestamp(selected.releasedAt)}</dd><dt>Elapsed / Remaining</dt><dd>{duration(coolingElapsed(selected, now))} / {duration(FAC_TARGET_MS - coolingElapsed(selected, now))}</dd><dt>Created by</dt><dd>{selected.createdBy}</dd><dt>Notes</dt><dd className="fac-notes">{selected.notes || '-'}</dd></dl>
      <h3>Pallet IDs ({selected.pallets.length})</h3><ul className="fac-pallets">{selected.pallets.map(pallet => <li key={pallet}>{pallet}</li>)}</ul>{!selected.pallets.length && <p className="fac-muted">No pallets captured.</p>}
    </section>}

    {editor && <div className="fac-modal-backdrop"><section className="fac-modal" role="dialog" aria-modal="true" aria-labelledby="fac-editor-title"><div className="fac-section-heading"><h2 id="fac-editor-title">{editor.id ? `Edit load #${editor.id}` : mode === 'schedule' ? 'Plan 45-minute slot' : 'New rush load'}</h2><button title="Close editor" aria-label="Close editor" disabled={busy} onClick={() => setEditor(null)}><X size={18} /></button></div>
      {error && <p className="fac-error" role="alert">{error}</p>}
      <form onSubmit={saveMetadata}>
        {editor.status !== 'ready' && editor.status !== 'scheduled' && <p className="fac-muted">Only Famous and Billed can change after cooling starts.</p>}
        <fieldset disabled={busy || (editor.id !== null && editor.status !== 'ready' && editor.status !== 'scheduled')} className="fac-form-grid">
          <label>Customer<select value={editor.data.customer} onChange={event => setEditor({ ...editor, data: { ...editor.data, customer: event.target.value } })}>{FAC_CUSTOMERS.map(customer => <option key={customer}>{customer}</option>)}</select></label>
          <label>Cooler<select value={editor.data.cooler} onChange={event => setEditor({ ...editor, data: { ...editor.data, cooler: Number(event.target.value) } })}>{FAC_COOLERS.map(cooler => <option key={cooler}>{cooler}</option>)}</select></label>
          <label>Arrival date<input type="date" required value={editor.data.arrivalDate} onChange={event => setEditor({ ...editor, data: { ...editor.data, arrivalDate: event.target.value } })} /></label>
          <label>Planned start (local)<input type="datetime-local" required={mode === 'schedule' && editor.id === null} value={editor.data.scheduledStart} onChange={event => setEditor({ ...editor, data: { ...editor.data, scheduledStart: event.target.value } })} /></label>
          {(['workOrder', 'runNumber', 'receivedNumber', 'containerNumber'] as const).map((field, index) => <label key={field}>{['Work order', 'Run number', 'Received No', 'Container number'][index]}<input maxLength={10000} value={editor.data[field]} onChange={event => setEditor({ ...editor, data: { ...editor.data, [field]: event.target.value } })} /></label>)}
          <label className="fac-form-wide">Notes<textarea rows={3} maxLength={10000} value={editor.data.notes} onChange={event => setEditor({ ...editor, data: { ...editor.data, notes: event.target.value } })} /></label>
        </fieldset>
        <div className="fac-checks">{(['famous', 'billed'] as const).map(field => <label key={field}><input type="checkbox" disabled={busy} checked={editor.data[field]} onChange={event => setEditor({ ...editor, data: { ...editor.data, [field]: event.target.checked } })} />{field === 'famous' ? 'Famous' : 'Billed'}</label>)}</div>
        <div className="fac-actions fac-form-footer"><button type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button type="submit" disabled={disabled}><Save size={16} />{busy ? 'Saving...' : 'Save load'}</button></div>
      </form></section></div>}
    {conflict && <div className="fac-modal-backdrop"><section className="fac-modal fac-confirm" role="dialog" aria-modal="true" aria-labelledby="fac-conflict-title"><h2 id="fac-conflict-title"><AlertTriangle size={20} />Booked slot conflict</h2><p>{conflict.message}</p><p>Start load #{conflict.id} now and acknowledge the overlapping booking?</p>{error && <p className="fac-error" role="alert">{error}</p>}<div className="fac-actions"><button disabled={busy} onClick={() => setConflict(null)}>Keep booking</button><button disabled={busy} onClick={() => { const load = loads.find(item => item.id === conflict.id); if (load) void startLoad(load, true); }}><Play size={16} />Confirm start now</button></div></section></div>}
  </main>;
}