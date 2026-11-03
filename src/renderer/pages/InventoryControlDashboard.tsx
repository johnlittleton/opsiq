import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Clock3, Download, FileSpreadsheet, MapPin, Package, Printer, RefreshCw, ScanLine } from 'lucide-react';
import { API_BASE } from '../services/config';
import { exportInventoryWorkbook, printInventoryReport, type InventoryReportSheet } from '../data/inventoryExports';
import './InventoryControlDashboard.css';

interface InventoryPallet {
  palletTag: string;
  customer: string | null;
  locationType: 'RECEIVING' | 'COOLER';
  coolerPlacard: string | null;
  lanePlacard: string | null;
  position: number | null;
  receivedAt: string;
  updatedAt: string;
}

interface InventoryLocation {
  placardCode: string;
  locationType: 'COOLER' | 'LANE';
  coolerPlacard: string | null;
  isActive: boolean | number;
}

interface InventoryEvent {
  id: number;
  action: string;
  palletTag: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  referenceNumber: string | null;
  scannedBy: string;
  scannedAt: string;
}

interface InventorySnapshot {
  locations: InventoryLocation[];
  pallets: InventoryPallet[];
  recentEvents: InventoryEvent[];
}

const emptySnapshot: InventorySnapshot = { locations: [], pallets: [], recentEvents: [] };

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatLocation = (pallet: InventoryPallet) => pallet.locationType === 'RECEIVING'
  ? 'Receiving'
  : `Cooler ${pallet.coolerPlacard || '—'} / Lane ${pallet.lanePlacard || '—'}${pallet.position == null ? '' : ` / Position ${pallet.position}`}`;

const formatPalletLocation = formatLocation;

export default function InventoryControlDashboard() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadSnapshot = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/production/pallet-tracker/location-inventory`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load current pallet inventory.');
      setSnapshot({
        locations: Array.isArray(payload?.locations) ? payload.locations : [],
        pallets: Array.isArray(payload?.pallets) ? payload.pallets : [],
        recentEvents: Array.isArray(payload?.recentEvents) ? payload.recentEvents : [],
      });
      setUpdatedAt(new Date());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load current pallet inventory.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const timer = window.setInterval(() => { if (!document.hidden) void loadSnapshot(true); }, 30000);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  const metrics = useMemo(() => {
    const receiving = snapshot.pallets.filter((pallet) => pallet.locationType === 'RECEIVING').length;
    const cooler = snapshot.pallets.length - receiving;
    const activeLanes = snapshot.locations.filter((location) => location.locationType === 'LANE' && Boolean(location.isActive));
    const activeCoolers = snapshot.locations.filter((location) => location.locationType === 'COOLER' && Boolean(location.isActive));
    const customers = new Map<string, number>();
    for (const pallet of snapshot.pallets) {
      const customer = pallet.customer?.trim() || 'Unassigned';
      customers.set(customer, (customers.get(customer) || 0) + 1);
    }
    const customerBreakdown = Array.from(customers.entries()).sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
    const laneCapacity = activeLanes.length * 10;
    const laneOccupancy = snapshot.pallets.filter((pallet) => pallet.locationType === 'COOLER' && Boolean(pallet.lanePlacard)).length;
    return { receiving, cooler, activeLanes, activeCoolers, customerBreakdown, laneCapacity, laneOccupancy };
  }, [snapshot]);

  const reportSheets = useMemo<InventoryReportSheet[]>(() => [
    { name: 'Current Inventory', rows: snapshot.pallets.map((pallet) => ({
      'Pallet Tag': pallet.palletTag,
      Customer: pallet.customer || 'Unassigned',
      Location: formatPalletLocation(pallet),
      Received: pallet.receivedAt,
      'Last Updated': pallet.updatedAt,
    })) },
    { name: 'By Customer', rows: metrics.customerBreakdown.map(([customer, count]) => ({ Customer: customer, 'Pallets On Hand': count })) },
    { name: 'Locations', rows: snapshot.locations.map((location) => ({
      Placard: location.placardCode,
      Type: location.locationType,
      Cooler: location.coolerPlacard || '',
      Active: Boolean(location.isActive),
      'Pallets In Location': location.locationType === 'LANE' ? snapshot.pallets.filter((pallet) => pallet.lanePlacard === location.placardCode).length : snapshot.pallets.filter((pallet) => pallet.coolerPlacard === location.placardCode).length,
    })) },
    { name: 'Recent Activity', rows: snapshot.recentEvents.map((event) => ({
      Action: event.action,
      'Pallet / Location': event.palletTag || event.toLocation || event.fromLocation || '',
      'From Location': event.fromLocation || '',
      'To Location': event.toLocation || '',
      Reference: event.referenceNumber || '',
      'Scanned By': event.scannedBy,
      Time: event.scannedAt,
    })) },
  ], [snapshot, metrics.customerBreakdown]);

  const exportReport = () => exportInventoryWorkbook(`inventory-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`, reportSheets);
  const printReport = () => printInventoryReport('Inventory Dashboard Report', reportSheets);

  return (
    <main className="inventory-dashboard">
      <header className="inventory-dashboard__header">
        <div>
          <p>WAREHOUSE OPERATIONS / INVENTORY CONTROL</p>
          <h1>Inventory Dashboard</h1>
          <span>Current pallet positions and movement activity</span>
        </div>
        <div className="inventory-dashboard__actions">
          <span className="inventory-dashboard__live"><i />{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Live inventory'}</span>
          <button type="button" title="Refresh inventory" aria-label="Refresh inventory" disabled={refreshing} onClick={() => void loadSnapshot(true)}><RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />Refresh</button>
          <button type="button" onClick={exportReport}><FileSpreadsheet size={16} /><Download size={15} />Export Excel</button>
          <button type="button" onClick={printReport}><Printer size={16} />Print Report</button>
          <button type="button" onClick={() => navigate('/pallet-tracker')}><ScanLine size={16} />Pallet Inventory</button>
          <button type="button" onClick={() => navigate('/inventory-pallet-history')}><Activity size={16} />History</button>
          <button type="button" onClick={() => navigate('/inventory-auditor')}><MapPin size={16} />Auditor</button>
        </div>
      </header>

      {error && <div className="inventory-dashboard__error" role="alert">{error}<button type="button" onClick={() => void loadSnapshot()}>Retry</button></div>}

      <section className="inventory-dashboard__metrics" aria-label="Current inventory summary">
        <article className="inventory-dashboard__metric inventory-dashboard__metric--total"><span><Package size={16} />On hand</span><strong>{loading ? '—' : snapshot.pallets.length.toLocaleString()}</strong><small>pallets currently in inventory</small></article>
        <article className="inventory-dashboard__metric inventory-dashboard__metric--receiving"><span><ArrowDownToLine size={16} />Receiving</span><strong>{loading ? '—' : metrics.receiving.toLocaleString()}</strong><small>pallets awaiting putaway</small></article>
        <article className="inventory-dashboard__metric inventory-dashboard__metric--cooler"><span><MapPin size={16} />Stored</span><strong>{loading ? '—' : metrics.cooler.toLocaleString()}</strong><small>pallets assigned to cooler lanes</small></article>
        <article className="inventory-dashboard__metric inventory-dashboard__metric--locations"><span><ArrowLeftRight size={16} />Active locations</span><strong>{loading ? '—' : metrics.activeCoolers.length + metrics.activeLanes.length}</strong><small>{metrics.activeCoolers.length} coolers · {metrics.activeLanes.length} lanes</small></article>
      </section>

      <div className="inventory-dashboard__content">
        <section className="inventory-dashboard__panel inventory-dashboard__customers">
          <div className="inventory-dashboard__panel-heading"><div><p>ON-HAND DISTRIBUTION</p><h2>Inventory by customer</h2></div><span>{metrics.customerBreakdown.length} customers</span></div>
          {loading ? <p className="inventory-dashboard__empty">Loading inventory...</p> : metrics.customerBreakdown.length === 0 ? <p className="inventory-dashboard__empty">No pallets are currently on hand.</p> : (
            <div className="inventory-dashboard__customer-list">
              {metrics.customerBreakdown.map(([customer, count]) => (
                <div className="inventory-dashboard__customer-row" key={customer}>
                  <div className="inventory-dashboard__customer-label"><strong>{customer}</strong><span>{count.toLocaleString()} pallets</span></div>
                  <div className="inventory-dashboard__bar-track"><span style={{ width: `${Math.max(3, (count / snapshot.pallets.length) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="inventory-dashboard__panel inventory-dashboard__storage">
          <div className="inventory-dashboard__panel-heading"><div><p>STORAGE FOOTPRINT</p><h2>Cooler lane occupancy</h2></div><span>{metrics.laneCapacity ? `${Math.round((metrics.laneOccupancy / metrics.laneCapacity) * 100)}%` : '—'}</span></div>
          <div className="inventory-dashboard__occupancy"><div><strong>{loading ? '—' : metrics.laneOccupancy.toLocaleString()}</strong><span>occupied pallet positions</span></div><div><strong>{loading ? '—' : metrics.laneCapacity.toLocaleString()}</strong><span>configured positions · 10 per active lane</span></div></div>
          <div className="inventory-dashboard__bar-track inventory-dashboard__bar-track--large"><span style={{ width: `${metrics.laneCapacity ? Math.min(100, (metrics.laneOccupancy / metrics.laneCapacity) * 100) : 0}%` }} /></div>
          <div className="inventory-dashboard__location-counts"><span>{metrics.activeCoolers.length} active coolers</span><span>{metrics.activeLanes.length} active lanes</span><span>{metrics.receiving} in receiving</span></div>
          <button type="button" className="inventory-dashboard__text-action" onClick={() => navigate('/pallet-tracker')}>Open pallet locations <span aria-hidden="true">→</span></button>
        </section>

        <section className="inventory-dashboard__panel inventory-dashboard__activity">
          <div className="inventory-dashboard__panel-heading"><div><p>LIVE MOVEMENTS</p><h2>Recent inventory activity</h2></div><button type="button" onClick={() => navigate('/inventory-pallet-history')}>Full history <span aria-hidden="true">→</span></button></div>
          {loading ? <p className="inventory-dashboard__empty">Loading activity...</p> : snapshot.recentEvents.length === 0 ? <p className="inventory-dashboard__empty">No inventory activity recorded yet.</p> : (
            <div className="inventory-dashboard__event-list">
              {snapshot.recentEvents.slice(0, 8).map((event) => (
                <div className="inventory-dashboard__event" key={event.id}>
                  <span className={`inventory-dashboard__event-icon is-${event.action.toLowerCase()}`}>{event.action === 'RECEIVED' ? <ArrowDownToLine size={16} /> : event.action === 'SHIPPED' ? <ArrowUpFromLine size={16} /> : <ArrowLeftRight size={16} />}</span>
                  <div className="inventory-dashboard__event-main"><strong>{event.action.replace('_', ' ')}</strong><span>{event.palletTag || event.toLocation || event.fromLocation || 'Location updated'}</span><small>{event.scannedBy || 'System'}{event.referenceNumber ? ` · Ref ${event.referenceNumber}` : ''}</small></div>
                  <time><Clock3 size={13} />{formatTimestamp(event.scannedAt)}</time>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}