import { useState, type FormEvent } from 'react';
import { Pencil, Printer, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import { buildTinCatReportHtml, matchesTinCatSearch, type TinCatScanRecord } from '../data/tinCatReports';

export default function TinCatRecords({ scans, period, onUpdated, search: controlledSearch, onSearchChange }: {
  scans: TinCatScanRecord[];
  period: string;
  onUpdated: () => Promise<void>;
  search?: string;
  onSearchChange?: (search: string) => void;
}) {
  const { executiveName, sessionToken } = useAuth();
  const [localSearch, setLocalSearch] = useState('');
  const search = controlledSearch ?? localSearch;
  const [editing, setEditing] = useState<TinCatScanRecord | null>(null);
  const [assetCode, setAssetCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const filtered = controlledSearch === undefined ? scans.filter((scan) => matchesTinCatSearch(scan, search)) : scans;

  const printRecords = async (records: TinCatScanRecord[], individual = false) => {
    setError('');
    const html = buildTinCatReportHtml(records, individual ? 'Tin Cat Inspection Record' : 'Tin Cat Inspection Report', `${period}${search ? ` / Search: ${search}` : ''}`, executiveName || 'Inspector');
    try {
      if (window.electron?.printHTML) {
        const result = await window.electron.printHTML(html);
        if (!result.success) throw new Error(result.error || 'Unable to print inspection report.');
      } else {
        const popup = window.open('', '_blank', 'width=1100,height=800');
        if (!popup) throw new Error('Allow pop-ups to print inspection reports.');
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        window.setTimeout(() => popup.print(), 250);
      }
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Unable to print report.');
    }
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/food-safety/tin-cats/scans/${editing.id}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${sessionToken || localStorage.getItem('opsiq-session-token') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetCode, reason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to correct scan.');
      setEditing(null);
      await onUpdated();
      setNotice('Correction saved. Original scan details and correction history retained.');
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Unable to correct scan.');
    } finally { setBusy(false); }
  };

  return <>
    <div className="food-safety-record-tools">
      <input type="search" aria-label="Search tin cat scans" placeholder="Search tin cat, inspector, cycle or correction..." value={search} onChange={(event) => { setLocalSearch(event.target.value); onSearchChange?.(event.target.value); }} />
      <span>{filtered.length} records</span>
      <button type="button" disabled={!filtered.length} onClick={() => void printRecords(filtered)}><Printer size={16} /> Print Report</button>
    </div>
    {error && <p className="food-safety-message is-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!filtered.length ? <p className="food-safety-empty">No inspections match these filters.</p> : <div className="food-safety-record-table-scroll">
      <table className="food-safety-record-table"><thead><tr><th>Tin Cat</th><th>Cycle</th><th>Scanned By</th><th>Original Scan Time</th><th>Corrections</th><th>Actions</th></tr></thead><tbody>
        {filtered.map((scan) => <tr key={scan.id}>
          <td><strong>{scan.assetCode}</strong></td><td>#{scan.cycleId}</td><td>{scan.scannedBy}</td><td>{new Date(scan.scannedAt).toLocaleString()}</td>
          <td>{scan.edits?.length ? <details><summary>{scan.edits.length} corrections</summary>{scan.edits.map((edit, index) => <p key={index}>{edit.originalAssetCode} to {edit.newAssetCode}<br />{edit.reason}<br />{edit.editedBy} / {new Date(edit.editedAt).toLocaleString()}</p>)}</details> : 'None'}</td>
          <td><div className="food-safety-record-actions"><button type="button" title="Print inspection record" aria-label={`Print ${scan.assetCode}`} onClick={() => void printRecords([scan], true)}><Printer size={16} /></button><button type="button" title="Edit inspection record" aria-label={`Edit ${scan.assetCode}`} onClick={() => { setEditing(scan); setAssetCode(scan.assetCode); setReason(''); setError(''); setNotice(''); }}><Pencil size={16} /></button></div></td>
        </tr>)}
      </tbody></table>
    </div>}
    {editing && <div className="food-safety-edit-backdrop"><form className="food-safety-edit-form" role="dialog" aria-modal="true" aria-labelledby="tin-cat-edit-title" onSubmit={(event) => void saveEdit(event)}>
      <div className="food-safety-section-heading"><h2 id="tin-cat-edit-title">Correct Tin Cat Scan</h2><button type="button" aria-label="Close correction" disabled={busy} onClick={() => setEditing(null)}><X size={18} /></button></div>
      <p>Cycle #{editing.cycleId} / {editing.scannedBy} / {new Date(editing.scannedAt).toLocaleString()}</p>
      <label>Tin cat barcode<input autoFocus required value={assetCode} onChange={(event) => setAssetCode(event.target.value)} /></label>
      <label>Correction reason<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || !assetCode.trim() || !reason.trim()}>{busy ? 'Saving...' : 'Save Correction'}</button>
    </form></div>}
  </>;
}