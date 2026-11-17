import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import { buildContainerForecastHistoryPrintHtml, buildContainerForecastPrintHtml } from '../data/containerForecastPrint';
import './ContainerForecast.css';

type ReleaseStatus = 'Pending' | 'Released' | 'On Hold' | 'Not Required';

export interface ContainerForecastRecord {
  id: number;
  steamshipLine?: string | null;
  vessel: string;
  containerNumber: string;
  customer?: string | null;
  commodity?: string | null;
  carrier?: string | null;
  chassis?: string | null;
  weight?: number | null;
  addonCharge?: number | null;
  overweightPermit: boolean | number;
  permitNumber?: string | null;
  ndNtNumber?: string | null;
  rateconNumber?: string | null;
  rateAmount?: number | null;
  pickupNumber?: string | null;
  pickupScac?: string | null;
  driverLoad?: string | null;
  portAppointmentNumber?: string | null;
  deliveryEta?: string | null;
  dropOffLocation: string;
  emptyReturnDate?: string | null;
  emptyLastFreeDay?: string | null;
  fullPickupLastFreeDay?: string | null;
  emptyReturnDriver?: string | null;
  vesselEta?: string | null;
  releaseStatus: ReleaseStatus;
  dispatchStatus?: string | null;
  tirDocumentFile?: string | null;
  deliveryOrderFile?: string | null;
  notes?: string | null;
  createdBy: string;
  updatedBy: string;
  updatedAt?: string;
};

interface VesselLocationSummary {
  vessel: string;
  dropOffLocation: string;
  containerCount: number;
  releasedCount: number;
  overweightCount: number;
}

interface ForecastOptions {
  vessels: string[];
  steamshipLines: string[];
  customers: string[];
  commodities: string[];
  carriers: string[];
  locations: string[];
}

type ForecastForm = Omit<ContainerForecastRecord, 'id' | 'createdBy' | 'updatedBy' | 'overweightPermit'> & {
  overweightPermit: boolean;
};

const emptyForm: ForecastForm = {
  steamshipLine: '', vessel: '', containerNumber: '', customer: '', commodity: '', carrier: '', chassis: '', weight: '', addonCharge: '', overweightPermit: false, permitNumber: '',
  ndNtNumber: '', rateconNumber: '', rateAmount: '', pickupNumber: '', pickupScac: '', driverLoad: '',
  portAppointmentNumber: '', deliveryEta: '', dropOffLocation: '', emptyReturnDate: '', emptyLastFreeDay: '',
  fullPickupLastFreeDay: '', emptyReturnDriver: '', vesselEta: '', releaseStatus: 'Pending', dispatchStatus: 'Pending', notes: '',
} as ForecastForm;

const text = (value: unknown) => String(value ?? '');
const displayDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};
const isChecked = (value: boolean | number) => value === true || value === 1;

export default function ContainerForecast({ historyMode = false }: { historyMode?: boolean }) {
  const navigate = useNavigate();
  const { executiveName, sessionToken } = useAuth();
  const [records, setRecords] = useState<ContainerForecastRecord[]>([]);
  const [summary, setSummary] = useState<VesselLocationSummary[]>([]);
  const [vessels, setVessels] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [options, setOptions] = useState<ForecastOptions>({ vessels: [], steamshipLines: [], customers: [], commodities: [], carriers: [], locations: [] });
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [vesselFilter, setVesselFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [releaseFilter, setReleaseFilter] = useState('');
  const [etaStart, setEtaStart] = useState('');
  const [etaEnd, setEtaEnd] = useState('');
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [appliedHistoryStart, setAppliedHistoryStart] = useState('');
  const [appliedHistoryEnd, setAppliedHistoryEnd] = useState('');
  const [form, setForm] = useState<ForecastForm>(emptyForm);
  const [containerNumbers, setContainerNumbers] = useState('');
  const [tirFile, setTirFile] = useState<File | null>(null);
  const [deliveryOrderFile, setDeliveryOrderFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = useMemo(() => ({ Authorization: `Bearer ${sessionToken || localStorage.getItem('opsiq-session-token') || ''}` }), [sessionToken]);

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams();
    if (vesselFilter) params.set('vessel', vesselFilter);
    if (locationFilter) params.set('location', locationFilter);
    if (releaseFilter) params.set('releaseStatus', releaseFilter);
    if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
    const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts?${params}`, { headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Failed to load container forecasts.');
    const rows = Array.isArray(payload) ? payload as ContainerForecastRecord[] : [];
    setRecords(rows);
    setVessels(Array.from(new Set(rows.map((row) => row.vessel).filter(Boolean))).sort((a, b) => a.localeCompare(b)));
    setLocations(Array.from(new Set(rows.map((row) => row.dropOffLocation).filter(Boolean))).sort((a, b) => a.localeCompare(b)));
  }, [headers, vesselFilter, locationFilter, releaseFilter, appliedSearch]);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams();
    if (etaStart) params.set('startDate', etaStart);
    if (etaEnd) params.set('endDate', etaEnd);
    const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/summary?${params}`, { headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Failed to load vessel report.');
    setSummary(Array.isArray(payload) ? payload : []);
  }, [headers, etaStart, etaEnd]);

  const loadOptions = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/options`, { headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Failed to load container dropdown options.');
    const nextOptions = payload as ForecastOptions;
    setOptions(nextOptions);
    setLocations(nextOptions.locations || []);
  }, [headers]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadRecords(), loadSummary(), loadOptions()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load container forecasts.');
    } finally {
      setLoading(false);
    }
  }, [loadRecords, loadSummary, loadOptions]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const groupedSummary = useMemo(() => {
    const map = new Map<string, VesselLocationSummary[]>();
    for (const row of summary) map.set(row.vessel, [...(map.get(row.vessel) || []), row]);
    return Array.from(map.entries());
  }, [summary]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, vessel: vesselFilter, dropOffLocation: locationFilter });
    setContainerNumbers('');
    setTirFile(null);
    setDeliveryOrderFile(null);
    setNotice('');
    setFormOpen(true);
  };

  const openEdit = (record: ContainerForecastRecord) => {
    setEditingId(record.id);
    setForm({
      steamshipLine: text(record.steamshipLine), vessel: record.vessel, containerNumber: record.containerNumber,
      customer: text(record.customer), commodity: text(record.commodity), carrier: text(record.carrier), chassis: text(record.chassis),
      weight: record.weight == null ? '' : String(record.weight), addonCharge: record.addonCharge == null ? '' : String(record.addonCharge),
      overweightPermit: isChecked(record.overweightPermit),
      permitNumber: text(record.permitNumber), ndNtNumber: text(record.ndNtNumber), rateconNumber: text(record.rateconNumber),
      rateAmount: record.rateAmount == null ? '' : String(record.rateAmount), pickupNumber: text(record.pickupNumber),
      pickupScac: text(record.pickupScac), driverLoad: text(record.driverLoad), portAppointmentNumber: text(record.portAppointmentNumber),
      deliveryEta: text(record.deliveryEta), dropOffLocation: record.dropOffLocation, emptyReturnDate: text(record.emptyReturnDate),
      emptyLastFreeDay: text(record.emptyLastFreeDay), fullPickupLastFreeDay: text(record.fullPickupLastFreeDay),
      emptyReturnDriver: text(record.emptyReturnDriver), vesselEta: text(record.vesselEta), releaseStatus: record.releaseStatus,
      dispatchStatus: text(record.dispatchStatus || 'Pending'), notes: text(record.notes),
    });
    setContainerNumbers(record.containerNumber);
    setTirFile(null);
    setDeliveryOrderFile(null);
    setNotice('');
    setFormOpen(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const savedIds: number[] = [];
    try {
      const payload = {
        ...form,
        weight: form.weight === '' ? null : Number(form.weight),
        rateAmount: form.rateAmount === '' ? null : Number(form.rateAmount),
        addonCharge: form.addonCharge === '' ? null : Number(form.addonCharge),
        createdBy: executiveName,
      };
      const numbers = Array.from(new Set(containerNumbers.split(/[\s,;]+/).map((value) => value.trim().toUpperCase()).filter(Boolean)));
      if (!numbers.length) throw new Error('Enter at least one full container number.');
      if (editingId && numbers.length !== 1) throw new Error('Edit one container at a time.');
      for (const containerNumber of numbers) {
        const response = await fetch(
          editingId ? `${API_BASE}/api/dispatch/container-forecasts/${editingId}` : `${API_BASE}/api/dispatch/container-forecasts`,
          { method: editingId ? 'PUT' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, containerNumber }) },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || 'Unable to save forecast record.');
        savedIds.push(Number(result.id));
      }
      for (const id of savedIds) {
        if (tirFile) await uploadDocument(id, 'tir', tirFile);
        if (deliveryOrderFile) await uploadDocument(id, 'delivery-order', deliveryOrderFile);
      }
      setFormOpen(false);
      setNotice(editingId ? 'Container forecast updated.' : `${savedIds.length} container${savedIds.length === 1 ? '' : 's'} added to forecast.`);
      await loadAll();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save forecast record.';
      if (savedIds.length) {
        setFormOpen(false);
        setNotice(`Saved ${savedIds.length} container${savedIds.length === 1 ? '' : 's'} before this issue: ${message}`);
        await loadAll();
      } else setError(message);
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async (id: number, type: 'tir' | 'delivery-order', file: File) => {
    const data = new FormData();
    data.append('file', file);
    const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/${id}/documents/${type}`, { method: 'POST', headers, body: data });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Unable to upload container document.');
  };

  const downloadDocument = async (record: ContainerForecastRecord, type: 'tir' | 'delivery-order') => {
    try {
      const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/${record.id}/documents/${type}`, { headers });
      if (!response.ok) throw new Error('Unable to download container document.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = type === 'tir' ? 'TIR-document' : 'delivery-order';
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download container document.');
    }
  };

  const updateDispatchStatus = async (record: ContainerForecastRecord, dispatchStatus: 'Dispatched' | 'Done') => {
    try {
      const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/${record.id}`, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ dispatchStatus }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to update dispatch status.');
      setNotice(dispatchStatus === 'Done' ? `${record.containerNumber} moved to history.` : `${record.containerNumber} marked dispatched.`);
      await loadAll();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update dispatch status.');
    }
  };

  const handleDelete = async (record: ContainerForecastRecord) => {
    if (!window.confirm(`Delete container ${record.containerNumber} from the forecast?`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/${record.id}`, { method: 'DELETE', headers });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to delete container.');
      setNotice(`Container ${record.containerNumber} deleted.`);
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete container.');
    }
  };

  const printDocument = async (printHtml: string, title: string) => {
    if (window.electron?.printHTML) {
      const result = await window.electron.printHTML(printHtml);
      if (!result.success) setError(result.error || `Unable to print ${title}.`);
      return;
    }
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (!printWindow) {
      setError('Allow pop-ups to print this report.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  const handlePrint = async (record: ContainerForecastRecord) => {
    const printHtml = buildContainerForecastPrintHtml(record as unknown as Record<string, unknown>);
    await printDocument(printHtml, 'container record');
  };

  const handlePrintHistory = async () => {
    if (!displayedRecords.length) return;
    const printHtml = buildContainerForecastHistoryPrintHtml(displayedRecords as unknown as Record<string, unknown>[]);
    await printDocument(printHtml, 'container history');
  };

  const updateForm = <K extends keyof ForecastForm>(key: K, value: ForecastForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const groupedRecords = useMemo(() => {
    const map = new Map<string, ContainerForecastRecord[]>();
    for (const record of records) map.set(record.vessel, [...(map.get(record.vessel) || []), record]);
    return Array.from(map.entries());
  }, [records]);

  const displayedRecords = useMemo(() => {
    if (!historyMode) return records.filter((record) => String(record.dispatchStatus || '').toLowerCase() !== 'done');
    const today = new Date().toISOString().slice(0, 10);
    return records.filter((record) => {
      const completed = String(record.dispatchStatus || '').toLowerCase() === 'done';
      const pastDates = [record.vesselEta, record.deliveryEta]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.slice(0, 10))
        .filter((value) => value < today);
      const historyDates = completed ? [text(record.updatedAt).slice(0, 10)] : pastDates;
      if (!completed && !historyDates.length) return false;
      if (appliedHistoryStart && !historyDates.some((date) => date >= appliedHistoryStart)) return false;
      if (appliedHistoryEnd && !historyDates.some((date) => date <= appliedHistoryEnd)) return false;
      return true;
    });
  }, [records, historyMode, appliedHistoryStart, appliedHistoryEnd]);

  return (
    <main className="container-forecast-page">
      <header className="container-forecast-header">
        <div><p>DISPATCH / {historyMode ? 'HISTORY' : 'FORECASTING'}</p><h1>{historyMode ? 'Container History' : 'Vessel & Container Forecast'}</h1></div>
        <div className="container-forecast-header-actions">
          {historyMode
            ? <button type="button" onClick={() => navigate('/container-forecast')}>← Forecast</button>
            : <button type="button" onClick={() => navigate('/container-forecast-history')}>History</button>}
          {!historyMode && <button type="button" onClick={() => navigate('/empty-container-returns')}>Empty Return Report</button>}
          <button type="button" onClick={() => void loadAll()}>Refresh</button>
          {!historyMode && <button type="button" onClick={openNew}>＋ Add Container</button>}
        </div>
      </header>

      {notice && <div className="container-forecast-notice" role="status">{notice}</div>}
      {error && <div className="container-forecast-error" role="alert">{error}</div>}

      <div className={`container-forecast-workspace${historyMode ? ' is-history' : ''}`}>
      {!historyMode && <aside className="container-forecast-report">
        <div className="container-forecast-section-heading"><div><p>ARRIVALS BY VESSEL</p><h2>Forecast by drop-off location</h2></div><span>{summary.reduce((sum, row) => sum + Number(row.containerCount || 0), 0)} containers</span></div>
        <div className="container-forecast-date-filters">
          <label>Vessel ETA from<input type="date" value={etaStart} onChange={(event) => setEtaStart(event.target.value)} /></label>
          <label>Through<input type="date" value={etaEnd} onChange={(event) => setEtaEnd(event.target.value)} /></label>
          {(etaStart || etaEnd) && <button type="button" onClick={() => { setEtaStart(''); setEtaEnd(''); }}>Clear date filter</button>}
        </div>
        {groupedSummary.length === 0 ? <p className="container-forecast-empty">No forecast containers match this ETA range.</p> : (
          <div className="container-forecast-report-grid">
            {groupedSummary.map(([vessel, rows]) => (
              <section className="container-forecast-vessel-summary" key={vessel}>
                <div className="container-forecast-vessel-heading"><div><span>VESSEL</span><h3>{vessel}</h3></div><strong><small>CONTAINERS</small>{rows.reduce((sum, row) => sum + Number(row.containerCount || 0), 0)}</strong></div>
                <div className="container-forecast-vessel-locations">
                  {rows.map((row) => <div className="container-forecast-location-row" key={`${vessel}-${row.dropOffLocation}`}>
                    <div><span>{row.dropOffLocation}</span><small>{row.releasedCount} released · {row.overweightCount} overweight</small></div>
                    <strong>{row.containerCount}</strong>
                  </div>)}
                </div>
              </section>
            ))}
          </div>
        )}
      </aside>}

      <section className={`container-forecast-records${historyMode ? ' is-history' : ''}`}>
        <div className="container-forecast-section-heading"><div><p>{historyMode ? 'PAST VESSEL / DELIVERY ETAS' : 'CONTAINER DISPATCH'}</p><h2>{historyMode ? 'Historical container records' : 'Forecast records'}</h2></div>{historyMode ? <div className="container-forecast-history-actions"><span>{displayedRecords.length} records</span><button type="button" disabled={loading || !displayedRecords.length} onClick={() => void handlePrintHistory()}>Print History</button></div> : <span>{displayedRecords.length} records</span>}</div>
        {historyMode && <div className="container-forecast-date-filters container-forecast-history-filters">
          <label>From<input type="date" value={historyStart} max={historyEnd || undefined} onChange={(event) => setHistoryStart(event.target.value)} /></label>
          <label>Through<input type="date" value={historyEnd} min={historyStart || undefined} onChange={(event) => setHistoryEnd(event.target.value)} /></label>
          {(historyStart || historyEnd || appliedHistoryStart || appliedHistoryEnd) && <button type="button" onClick={() => { setHistoryStart(''); setHistoryEnd(''); setAppliedHistoryStart(''); setAppliedHistoryEnd(''); }}>Clear dates</button>}
        </div>}
        <div className="container-forecast-filters">
          <input aria-label="Search forecasts" placeholder="Search vessel, container, chassis, pickup, location..." value={search} onChange={(event) => { setSearch(event.target.value); if (!historyMode) setAppliedSearch(event.target.value); }} />
          {historyMode && <button type="button" className="container-forecast-search-button" onClick={() => { setAppliedSearch(search.trim()); setAppliedHistoryStart(historyStart); setAppliedHistoryEnd(historyEnd); }}>Search</button>}
          <select aria-label="Filter vessel" value={vesselFilter} onChange={(event) => setVesselFilter(event.target.value)}><option value="">All vessels</option>{vessels.map((vessel) => <option key={vessel}>{vessel}</option>)}</select>
          <select aria-label="Filter drop-off location" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select>
          <select aria-label="Filter release status" value={releaseFilter} onChange={(event) => setReleaseFilter(event.target.value)}><option value="">All release statuses</option>{['Pending', 'Released', 'On Hold', 'Not Required'].map((status) => <option key={status}>{status}</option>)}</select>
        </div>
        {loading ? <p className="container-forecast-empty">Loading forecast...</p> : displayedRecords.length === 0 ? <p className="container-forecast-empty">{historyMode ? 'No historical containers match these dates and filters.' : 'No containers match these filters.'}</p> : (
          <div className="container-forecast-card-list">
            {displayedRecords.map((record) => (
              <article className="container-forecast-record-card" key={record.id}>
                <header className="container-forecast-record-card-heading">
                  <div className="container-forecast-record-card-title"><span>CONTAINER</span><h3>{record.containerNumber}</h3><p>{record.vessel}{record.steamshipLine ? ` · ${record.steamshipLine}` : ''}</p></div>
                  <div className="container-forecast-record-card-statuses">
                    <span className={`container-forecast-release is-${record.releaseStatus.toLowerCase().replace(/\s+/g, '-')}`}>{record.releaseStatus}</span>
                    <span className={`container-forecast-dispatch is-${String(record.dispatchStatus || 'Pending').toLowerCase()}`}>{record.dispatchStatus || 'Pending'}</span>
                  </div>
                </header>
                <div className="container-forecast-record-details">
                  <section><h4>Load & destination</h4><dl className="container-forecast-detail-grid">
                    <div><dt>Customer</dt><dd>{record.customer || '—'}</dd></div>
                    <div><dt>Commodity</dt><dd>{record.commodity || '—'}</dd></div>
                    <div><dt>Drop-off</dt><dd>{record.dropOffLocation || '—'}</dd></div>
                    <div><dt>Chassis</dt><dd>{record.chassis || '—'}</dd></div>
                    <div><dt>Weight</dt><dd>{record.weight == null ? '—' : `${record.weight} lb`}</dd></div>
                    <div><dt>Overweight permit</dt><dd>{isChecked(record.overweightPermit) ? `Yes · ${record.permitNumber || 'No permit number'}` : 'No'}</dd></div>
                    <div><dt>ND/NT number</dt><dd>{record.ndNtNumber || '—'}</dd></div>
                  </dl></section>
                  <section><h4>Dispatch & timing</h4><dl className="container-forecast-detail-grid">
                    <div><dt>Carrier</dt><dd>{record.carrier || '—'}</dd></div>
                    <div><dt>Driver / load</dt><dd>{record.driverLoad || '—'}</dd></div>
                    <div><dt>Pickup number / SCAC</dt><dd>{record.pickupNumber || '—'}<small>{record.pickupScac || 'SCAC not set'}</small></dd></div>
                    <div><dt>Port appointment</dt><dd>{record.portAppointmentNumber || '—'}</dd></div>
                    <div><dt>Vessel ETA</dt><dd>{displayDate(record.vesselEta)}</dd></div>
                    <div><dt>Delivery ETA</dt><dd>{displayDate(record.deliveryEta)}</dd></div>
                    <div><dt>Full pickup LFD</dt><dd>{displayDate(record.fullPickupLastFreeDay)}</dd></div>
                    <div><dt>Empty return LFD</dt><dd>{displayDate(record.emptyLastFreeDay || record.emptyReturnDate)}<small>{record.emptyReturnDriver || 'No return driver assigned'}</small></dd></div>
                  </dl></section>
                  <section><h4>Rates & documents</h4><dl className="container-forecast-detail-grid">
                    <div><dt>Ratecon number</dt><dd>{record.rateconNumber || '—'}</dd></div>
                    <div><dt>Rate</dt><dd>{record.rateAmount == null ? '—' : `$${Number(record.rateAmount).toFixed(2)}`}</dd></div>
                    <div><dt>Add-on charge</dt><dd>{record.addonCharge == null ? '—' : `$${Number(record.addonCharge).toFixed(2)}`}</dd></div>
                  </dl></section>
                </div>
                <div className="container-forecast-actions">
                  {record.tirDocumentFile && <button type="button" onClick={() => void downloadDocument(record, 'tir')}>TIR</button>}
                  {record.deliveryOrderFile && <button type="button" onClick={() => void downloadDocument(record, 'delivery-order')}>Delivery Order</button>}
                  <button type="button" onClick={() => void handlePrint(record)}>Print</button>
                  {!historyMode && <><button type="button" onClick={() => openEdit(record)}>Edit</button>{String(record.dispatchStatus || '').toLowerCase() !== 'dispatched' && <button type="button" onClick={() => void updateDispatchStatus(record, 'Dispatched')}>Dispatched</button>}<button type="button" onClick={() => void updateDispatchStatus(record, 'Done')}>Done</button><button type="button" className="is-delete" onClick={() => void handleDelete(record)}>Delete</button></>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </div>

      {formOpen && (
        <div className="container-forecast-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
          <form className="container-forecast-form" onSubmit={(event) => void handleSave(event)}>
            <div className="container-forecast-form-heading"><div><p>DISPATCH / CONTAINER RECORD</p><h2>{editingId ? 'Edit Container' : 'Add Container'}</h2></div><button type="button" aria-label="Close form" disabled={saving} onClick={() => setFormOpen(false)}>×</button></div>
            <div className="container-forecast-form-grid">
              <label>SSL / Steamship Line<input list="container-forecast-ssls" value={text(form.steamshipLine)} onChange={(event) => updateForm('steamshipLine', event.target.value)} /><datalist id="container-forecast-ssls">{options.steamshipLines.map((value) => <option key={value} value={value} />)}</datalist></label>
              <label>Vessel *<input required list="container-forecast-vessels" value={form.vessel} onChange={(event) => updateForm('vessel', event.target.value)} placeholder="Vessel name" /><datalist id="container-forecast-vessels">{options.vessels.map((value) => <option key={value} value={value} />)}</datalist></label>
              <label className="container-forecast-form-wide">Full Container # *{editingId ? <input required value={containerNumbers} onChange={(event) => setContainerNumbers(event.target.value.toUpperCase())} placeholder="e.g. MNBU3845659" /> : <textarea required rows={2} value={containerNumbers} onChange={(event) => setContainerNumbers(event.target.value.toUpperCase())} placeholder="Enter one or more numbers, separated by commas or new lines" />}</label>
              <label>Vessel ETA<input type="date" value={text(form.vesselEta)} onChange={(event) => updateForm('vesselEta', event.target.value)} /></label>
              <label>Customer<input list="container-forecast-customers" value={text(form.customer)} onChange={(event) => updateForm('customer', event.target.value)} /><datalist id="container-forecast-customers">{options.customers.map((value) => <option key={value} value={value} />)}</datalist></label>
              <label>Commodity<input list="container-forecast-commodities" value={text(form.commodity)} onChange={(event) => updateForm('commodity', event.target.value)} /><datalist id="container-forecast-commodities">{options.commodities.map((value) => <option key={value} value={value} />)}</datalist></label>
              <label>Carrier<input list="container-forecast-carriers" value={text(form.carrier)} onChange={(event) => updateForm('carrier', event.target.value)} /><datalist id="container-forecast-carriers">{options.carriers.map((value) => <option key={value} value={value} />)}</datalist></label>
              <label>Chassis<input value={text(form.chassis)} onChange={(event) => updateForm('chassis', event.target.value)} /></label>
              <label>Weight<input type="number" min="0" step="0.01" value={text(form.weight)} onChange={(event) => updateForm('weight', event.target.value as any)} /></label>
              <label>Add-on Charge $<input type="number" min="0" step="0.01" value={text(form.addonCharge)} onChange={(event) => updateForm('addonCharge', event.target.value as any)} /></label>
              <label className="container-forecast-checkbox"><input type="checkbox" checked={form.overweightPermit} onChange={(event) => updateForm('overweightPermit', event.target.checked)} /> Overweight permit required (52,000 lb or more)</label>
              <label>Permit #<input value={text(form.permitNumber)} onChange={(event) => updateForm('permitNumber', event.target.value)} /></label>
              <label>ND/NT #<input value={text(form.ndNtNumber)} onChange={(event) => updateForm('ndNtNumber', event.target.value)} /></label>
              <label>Ratecon #<input value={text(form.rateconNumber)} onChange={(event) => updateForm('rateconNumber', event.target.value)} /></label>
              <label>Rate $<input type="number" min="0" step="0.01" value={text(form.rateAmount)} onChange={(event) => updateForm('rateAmount', event.target.value as any)} /></label>
              <label>P/U #<input value={text(form.pickupNumber)} onChange={(event) => updateForm('pickupNumber', event.target.value)} /></label>
              <label>SCAC (Holt)<input value={text(form.pickupScac)} onChange={(event) => updateForm('pickupScac', event.target.value.toUpperCase())} /></label>
              <label>Driver / Load<input value={text(form.driverLoad)} onChange={(event) => updateForm('driverLoad', event.target.value)} /></label>
              <label>Port Appt # (Full)<input value={text(form.portAppointmentNumber)} onChange={(event) => updateForm('portAppointmentNumber', event.target.value)} /></label>
              <label>Delivery ETA<input type="datetime-local" value={text(form.deliveryEta)} onChange={(event) => updateForm('deliveryEta', event.target.value)} /></label>
              <label>Drop-off Location *<input required list="container-forecast-locations" value={form.dropOffLocation} onChange={(event) => updateForm('dropOffLocation', event.target.value)} placeholder="Type any company or outside location" /><datalist id="container-forecast-locations">{locations.map((location) => <option key={location} value={location} />)}</datalist></label>
              <label>Full Load Pickup LFD<input type="date" value={text(form.fullPickupLastFreeDay)} onChange={(event) => updateForm('fullPickupLastFreeDay', event.target.value)} /></label>
              <label>Empty Return LFD<input type="date" value={text(form.emptyLastFreeDay)} onChange={(event) => updateForm('emptyLastFreeDay', event.target.value)} /></label>
              <label>Empty Return Date<input type="date" value={text(form.emptyReturnDate)} onChange={(event) => updateForm('emptyReturnDate', event.target.value)} /></label>
              <label>Empty Return Driver<input value={text(form.emptyReturnDriver)} onChange={(event) => updateForm('emptyReturnDriver', event.target.value)} /></label>
              <label>Release Status<select value={form.releaseStatus} onChange={(event) => updateForm('releaseStatus', event.target.value as ReleaseStatus)}>{['Pending', 'Released', 'On Hold', 'Not Required'].map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>TIR Document<input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/*" onChange={(event) => setTirFile(event.target.files?.[0] || null)} /></label>
              <label>Delivery Order<input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/*" onChange={(event) => setDeliveryOrderFile(event.target.files?.[0] || null)} /></label>
              {editingId && <div className="container-forecast-form-documents">{records.find((record) => record.id === editingId)?.tirDocumentFile && <button type="button" onClick={() => void downloadDocument(records.find((record) => record.id === editingId)!, 'tir')}>Download current TIR</button>}{records.find((record) => record.id === editingId)?.deliveryOrderFile && <button type="button" onClick={() => void downloadDocument(records.find((record) => record.id === editingId)!, 'delivery-order')}>Download current Delivery Order</button>}</div>}
              <label className="container-forecast-form-wide">Notes<textarea rows={2} value={text(form.notes)} onChange={(event) => updateForm('notes', event.target.value)} /></label>
            </div>
            <div className="container-forecast-form-actions"><button type="button" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Container'}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
