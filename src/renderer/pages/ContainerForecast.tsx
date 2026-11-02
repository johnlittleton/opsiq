import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import { buildContainerForecastPrintHtml } from '../data/containerForecastPrint';
import './ContainerForecast.css';

type ReleaseStatus = 'Pending' | 'Released' | 'On Hold' | 'Not Required';

export interface ContainerForecastRecord {
  id: number;
  vessel: string;
  containerNumber: string;
  chassis?: string | null;
  weight?: number | null;
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
  emptyReturnDriver?: string | null;
  vesselEta?: string | null;
  releaseStatus: ReleaseStatus;
  notes?: string | null;
  createdBy: string;
  updatedBy: string;
};

interface VesselLocationSummary {
  vessel: string;
  dropOffLocation: string;
  containerCount: number;
  releasedCount: number;
  overweightCount: number;
}

type ForecastForm = Omit<ContainerForecastRecord, 'id' | 'createdBy' | 'updatedBy' | 'overweightPermit'> & {
  overweightPermit: boolean;
};

const emptyForm: ForecastForm = {
  vessel: '', containerNumber: '', chassis: '', weight: '', overweightPermit: false, permitNumber: '',
  ndNtNumber: '', rateconNumber: '', rateAmount: '', pickupNumber: '', pickupScac: '', driverLoad: '',
  portAppointmentNumber: '', deliveryEta: '', dropOffLocation: '', emptyReturnDate: '', emptyReturnDriver: '',
  vesselEta: '', releaseStatus: 'Pending', notes: '',
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
  const [search, setSearch] = useState('');
  const [vesselFilter, setVesselFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [releaseFilter, setReleaseFilter] = useState('');
  const [etaStart, setEtaStart] = useState('');
  const [etaEnd, setEtaEnd] = useState('');
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [form, setForm] = useState<ForecastForm>(emptyForm);
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
    if (search.trim()) params.set('search', search.trim());
    const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts?${params}`, { headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Failed to load container forecasts.');
    const rows = Array.isArray(payload) ? payload as ContainerForecastRecord[] : [];
    setRecords(rows);
    setVessels(Array.from(new Set(rows.map((row) => row.vessel).filter(Boolean))).sort((a, b) => a.localeCompare(b)));
    setLocations(Array.from(new Set(rows.map((row) => row.dropOffLocation).filter(Boolean))).sort((a, b) => a.localeCompare(b)));
  }, [headers, vesselFilter, locationFilter, releaseFilter, search]);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams();
    if (etaStart) params.set('startDate', etaStart);
    if (etaEnd) params.set('endDate', etaEnd);
    const response = await fetch(`${API_BASE}/api/dispatch/container-forecasts/summary?${params}`, { headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Failed to load vessel report.');
    setSummary(Array.isArray(payload) ? payload : []);
  }, [headers, etaStart, etaEnd]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadRecords(), loadSummary()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load container forecasts.');
    } finally {
      setLoading(false);
    }
  }, [loadRecords, loadSummary]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const groupedSummary = useMemo(() => {
    const map = new Map<string, VesselLocationSummary[]>();
    for (const row of summary) map.set(row.vessel, [...(map.get(row.vessel) || []), row]);
    return Array.from(map.entries());
  }, [summary]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, vessel: vesselFilter, dropOffLocation: locationFilter });
    setNotice('');
    setFormOpen(true);
  };

  const openEdit = (record: ContainerForecastRecord) => {
    setEditingId(record.id);
    setForm({
      vessel: record.vessel, containerNumber: record.containerNumber, chassis: text(record.chassis),
      weight: record.weight == null ? '' : String(record.weight), overweightPermit: isChecked(record.overweightPermit),
      permitNumber: text(record.permitNumber), ndNtNumber: text(record.ndNtNumber), rateconNumber: text(record.rateconNumber),
      rateAmount: record.rateAmount == null ? '' : String(record.rateAmount), pickupNumber: text(record.pickupNumber),
      pickupScac: text(record.pickupScac), driverLoad: text(record.driverLoad), portAppointmentNumber: text(record.portAppointmentNumber),
      deliveryEta: text(record.deliveryEta), dropOffLocation: record.dropOffLocation, emptyReturnDate: text(record.emptyReturnDate),
      emptyReturnDriver: text(record.emptyReturnDriver), vesselEta: text(record.vesselEta), releaseStatus: record.releaseStatus,
      notes: text(record.notes),
    });
    setNotice('');
    setFormOpen(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        weight: form.weight === '' ? null : Number(form.weight),
        rateAmount: form.rateAmount === '' ? null : Number(form.rateAmount),
        createdBy: executiveName,
      };
      const response = await fetch(
        editingId ? `${API_BASE}/api/dispatch/container-forecasts/${editingId}` : `${API_BASE}/api/dispatch/container-forecasts`,
        { method: editingId ? 'PUT' : 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to save forecast record.');
      setFormOpen(false);
      setNotice(editingId ? 'Container forecast updated.' : 'Container added to forecast.');
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save forecast record.');
    } finally {
      setSaving(false);
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

  const handlePrint = async (record: ContainerForecastRecord) => {
    const printHtml = buildContainerForecastPrintHtml(record as unknown as Record<string, unknown>);
    if (window.electron?.printHTML) {
      const result = await window.electron.printHTML(printHtml);
      if (!result.success) setError(result.error || 'Unable to print container record.');
      return;
    }
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (!printWindow) {
      setError('Allow pop-ups to print the container record.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  const updateForm = <K extends keyof ForecastForm>(key: K, value: ForecastForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const groupedRecords = useMemo(() => {
    const map = new Map<string, ContainerForecastRecord[]>();
    for (const record of records) map.set(record.vessel, [...(map.get(record.vessel) || []), record]);
    return Array.from(map.entries());
  }, [records]);

  const displayedRecords = useMemo(() => {
    if (!historyMode) return records;
    const today = new Date().toISOString().slice(0, 10);
    return records.filter((record) => {
      const pastDates = [record.vesselEta, record.deliveryEta]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.slice(0, 10))
        .filter((value) => value < today);
      if (!pastDates.length) return false;
      if (historyStart && !pastDates.some((date) => date >= historyStart)) return false;
      if (historyEnd && !pastDates.some((date) => date <= historyEnd)) return false;
      return true;
    });
  }, [records, historyMode, historyStart, historyEnd]);

  return (
    <main className="container-forecast-page">
      <header className="container-forecast-header">
        <div><p>DISPATCH / {historyMode ? 'HISTORY' : 'FORECASTING'}</p><h1>{historyMode ? 'Container History' : 'Vessel & Container Forecast'}</h1></div>
        <div className="container-forecast-header-actions">
          {historyMode
            ? <button type="button" onClick={() => navigate('/container-forecast')}>← Forecast</button>
            : <button type="button" onClick={() => navigate('/container-forecast-history')}>History</button>}
          <button type="button" onClick={() => void loadAll()}>Refresh</button>
          {!historyMode && <button type="button" onClick={openNew}>＋ Add Container</button>}
        </div>
      </header>

      {notice && <div className="container-forecast-notice" role="status">{notice}</div>}
      {error && <div className="container-forecast-error" role="alert">{error}</div>}

      {!historyMode && <section className="container-forecast-report">
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
                <div className="container-forecast-vessel-heading"><h3>{vessel}</h3><strong>{rows.reduce((sum, row) => sum + Number(row.containerCount || 0), 0)}</strong></div>
                {rows.map((row) => <div className="container-forecast-location-row" key={`${vessel}-${row.dropOffLocation}`}><span>{row.dropOffLocation}</span><strong>{row.containerCount}</strong><small>{row.releasedCount} released · {row.overweightCount} overweight</small></div>)}
              </section>
            ))}
          </div>
        )}
      </section>}

      <section className={`container-forecast-records${historyMode ? ' is-history' : ''}`}>
        <div className="container-forecast-section-heading"><div><p>{historyMode ? 'PAST VESSEL / DELIVERY ETAS' : 'CONTAINER DISPATCH'}</p><h2>{historyMode ? 'Historical container records' : 'Forecast records'}</h2></div><span>{displayedRecords.length} records</span></div>
        {historyMode && <div className="container-forecast-date-filters container-forecast-history-filters">
          <label>From<input type="date" value={historyStart} max={historyEnd || undefined} onChange={(event) => setHistoryStart(event.target.value)} /></label>
          <label>Through<input type="date" value={historyEnd} min={historyStart || undefined} onChange={(event) => setHistoryEnd(event.target.value)} /></label>
          {(historyStart || historyEnd) && <button type="button" onClick={() => { setHistoryStart(''); setHistoryEnd(''); }}>Clear dates</button>}
        </div>}
        <div className="container-forecast-filters">
          <input aria-label="Search forecasts" placeholder="Search vessel, container, chassis, pickup, location..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter vessel" value={vesselFilter} onChange={(event) => setVesselFilter(event.target.value)}><option value="">All vessels</option>{vessels.map((vessel) => <option key={vessel}>{vessel}</option>)}</select>
          <select aria-label="Filter drop-off location" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select>
          <select aria-label="Filter release status" value={releaseFilter} onChange={(event) => setReleaseFilter(event.target.value)}><option value="">All release statuses</option>{['Pending', 'Released', 'On Hold', 'Not Required'].map((status) => <option key={status}>{status}</option>)}</select>
        </div>
        {loading ? <p className="container-forecast-empty">Loading forecast...</p> : displayedRecords.length === 0 ? <p className="container-forecast-empty">{historyMode ? 'No historical containers match these dates and filters.' : 'No containers match these filters.'}</p> : (
          <div className="container-forecast-table-scroll">
            <table className="container-forecast-table">
              <thead><tr><th>Vessel / ETA</th><th>Full Container #</th><th>Chassis</th><th>Weight</th><th>OW Permit</th><th>Permit #</th><th>ND/NT #</th><th>Ratecon # / Rate</th><th>Pickup # / SCAC</th><th>Driver / Load</th><th>Port Appt #</th><th>Delivery ETA</th><th>Drop-off Location</th><th>Empty Return</th><th>Release Status</th><th>Actions</th></tr></thead>
              <tbody>{displayedRecords.map((record) => (
                <tr key={record.id}>
                  <td>{record.vessel}<small>{displayDate(record.vesselEta)}</small></td>
                  <td className="container-forecast-container-number">{record.containerNumber}</td>
                  <td>{record.chassis || '—'}</td><td>{record.weight ?? '—'}</td><td>{isChecked(record.overweightPermit) ? 'Yes' : 'No'}</td><td>{record.permitNumber || '—'}</td><td>{record.ndNtNumber || '—'}</td>
                  <td>{record.rateconNumber || '—'}<small>{record.rateAmount == null ? '' : `$${Number(record.rateAmount).toFixed(2)}`}</small></td>
                  <td>{record.pickupNumber || '—'}<small>{record.pickupScac || ''}</small></td><td>{record.driverLoad || '—'}</td><td>{record.portAppointmentNumber || '—'}</td><td>{displayDate(record.deliveryEta)}</td><td>{record.dropOffLocation}</td>
                  <td>{displayDate(record.emptyReturnDate)}<small>{record.emptyReturnDriver || ''}</small></td><td><span className={`container-forecast-release is-${record.releaseStatus.toLowerCase().replace(/\s+/g, '-')}`}>{record.releaseStatus}</span></td>
                  <td><div className="container-forecast-actions"><button type="button" onClick={() => void handlePrint(record)}>Print</button>{!historyMode && <><button type="button" onClick={() => openEdit(record)}>Edit</button><button type="button" className="is-delete" onClick={() => void handleDelete(record)}>Delete</button></>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen && (
        <div className="container-forecast-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setFormOpen(false); }}>
          <form className="container-forecast-form" onSubmit={(event) => void handleSave(event)}>
            <div className="container-forecast-form-heading"><div><p>DISPATCH / CONTAINER RECORD</p><h2>{editingId ? 'Edit Container' : 'Add Container'}</h2></div><button type="button" aria-label="Close form" disabled={saving} onClick={() => setFormOpen(false)}>×</button></div>
            <div className="container-forecast-form-grid">
              <label>SSL / Vessel *<input required value={form.vessel} onChange={(event) => updateForm('vessel', event.target.value)} placeholder="e.g. MAERSK / POLAR COSTA" /></label>
              <label>Full Container # *<input required value={form.containerNumber} onChange={(event) => updateForm('containerNumber', event.target.value.toUpperCase())} placeholder="e.g. MNBU3845659" /></label>
              <label>Vessel ETA<input type="date" value={text(form.vesselEta)} onChange={(event) => updateForm('vesselEta', event.target.value)} /></label>
              <label>Chassis<input value={text(form.chassis)} onChange={(event) => updateForm('chassis', event.target.value)} /></label>
              <label>Weight<input type="number" min="0" step="0.01" value={text(form.weight)} onChange={(event) => updateForm('weight', event.target.value as any)} /></label>
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
              <label>Empty Return Date<input type="date" value={text(form.emptyReturnDate)} onChange={(event) => updateForm('emptyReturnDate', event.target.value)} /></label>
              <label>Empty Return Driver<input value={text(form.emptyReturnDriver)} onChange={(event) => updateForm('emptyReturnDriver', event.target.value)} /></label>
              <label>Release Status<select value={form.releaseStatus} onChange={(event) => updateForm('releaseStatus', event.target.value as ReleaseStatus)}>{['Pending', 'Released', 'On Hold', 'Not Required'].map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="container-forecast-form-wide">Notes<textarea rows={2} value={text(form.notes)} onChange={(event) => updateForm('notes', event.target.value)} /></label>
            </div>
            <div className="container-forecast-form-actions"><button type="button" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Container'}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
