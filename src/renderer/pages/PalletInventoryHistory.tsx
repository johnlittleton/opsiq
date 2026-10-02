import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import './PalletTracker.css';
import './PalletInventoryHistory.css';

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

interface InventoryEvent {
  id: number;
  action: string;
  palletTag: string | null;
  customer: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  referenceNumber: string | null;
  scannedBy: string;
  scannedAt: string;
}

const PalletInventoryHistory: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [search, setSearch] = useState('');
  const [pallets, setPallets] = useState<InventoryPallet[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      if (!updatedAt) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        const response = await fetch(`${API_BASE}/api/production/pallet-tracker/location-history?${params.toString()}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('Unexpected response from server. Refresh and try again.');
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Could not load pallet history');
        if (cancelled) return;
        setPallets(Array.isArray(data.pallets) ? data.pallets : []);
        setEvents(Array.isArray(data.events) ? data.events : []);
        setUpdatedAt(new Date());
        setError('');
      } catch (loadError: any) {
        if (!cancelled) setError(loadError?.message || 'Could not load pallet history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadHistory();
    const refreshId = window.setInterval(() => void loadHistory(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, [search, refreshToken]);

  const formatLocation = (pallet: InventoryPallet) => pallet.locationType === 'RECEIVING'
    ? 'Receiving'
    : `Cooler ${pallet.coolerPlacard} / Lane ${pallet.lanePlacard} / Position ${pallet.position}`;

  const visiblePallets = pallets.filter((pallet) => {
    const query = search.trim().toLowerCase();
    return !query || [pallet.palletTag, pallet.customer || 'Unassigned', formatLocation(pallet)].some((value) => value.toLowerCase().includes(query));
  });
  const customerFeed = Array.from(visiblePallets.reduce((groups, pallet) => {
    const customer = pallet.customer?.trim() || 'Unassigned';
    groups.set(customer, [...(groups.get(customer) || []), pallet]);
    return groups;
  }, new Map<string, InventoryPallet[]>())).sort(([first], [second]) => first.localeCompare(second));
  const visibleEvents = events.filter((event) => {
    const query = search.trim().toLowerCase();
    return !query || [event.customer || 'Unassigned', event.palletTag, event.action, event.fromLocation, event.toLocation, event.referenceNumber, event.scannedBy]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  return (
    <div className="pallet-tracker-page pallet-history-page">
      <TitleBar showLegend={false} />
      <main className="pallet-tracker-container pallet-history-container">
        <header className="pallet-tracker-header">
          <div>
            <p className="pallet-history-eyebrow">Inventory Control</p>
            <h1>Pallet History &amp; Live Inventory</h1>
            <p>{updatedAt ? `Live feed updated ${updatedAt.toLocaleTimeString()}` : 'Connecting to the live pallet inventory feed'}</p>
          </div>
          <div className="pallet-tracker-header-actions">
            <button className="summary-btn" onClick={() => setRefreshToken((token) => token + 1)} disabled={loading}>Refresh</button>
            <button className="nav-btn" onClick={() => navigate('/pallet-tracker')}>Pallet Inventory</button>
            <button className="nav-btn" onClick={() => navigate('/home')}>Home</button>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </header>

        <label className="pallet-history-search">
          Search customer, pallet tag, location, sales order, or pick ticket
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search all pallet transactions" />
        </label>
        {error && (
          <div className="pallet-history-error" role="alert">
            <div><strong>Inventory feed unavailable</strong><span>{error}</span></div>
            <button type="button" onClick={() => setRefreshToken((token) => token + 1)}>Retry</button>
          </div>
        )}

        {loading && !updatedAt && (
          <div className="pallet-history-loading" role="status" aria-live="polite">
            <span className="pallet-history-loading__indicator" />
            Loading live inventory and pallet transactions…
          </div>
        )}

        {!loading && !error && !pallets.length && !events.length && (
          <div className="pallet-history-empty-state">
            <span className="pallet-history-empty-state__mark">0</span>
            <div>
              <h2>No pallet transactions yet</h2>
              <p>Received pallets, location moves, and shipments will appear here. Start by recording an inbound pallet.</p>
            </div>
            <button type="button" onClick={() => navigate('/pallet-tracker')}>Open Pallet Inventory</button>
          </div>
        )}

        <section className={`pallet-history-section ${loading && !updatedAt ? 'is-loading' : ''}`}>
          <div className="pallet-section-heading">
            <div><h2>Transaction History</h2><span>{visibleEvents.length} matching records</span></div>
          </div>
          <div className="pallet-table-wrap">
            <table className="pallet-inventory-table">
              <thead><tr><th>Time</th><th>Action</th><th>Pallet Tag</th><th>Customer</th><th>From</th><th>To</th><th>Sales Order / Pick Ticket</th><th>Scanned By</th></tr></thead>
              <tbody>
                {visibleEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.scannedAt).toLocaleString()}</td>
                    <td><span className={`inventory-event-pill ${event.action.toLowerCase()}`}>{event.action.replace('_', ' ')}</span></td>
                    <td className="pallet-tag-cell">{event.palletTag || '--'}</td>
                    <td>{event.customer || 'Unassigned'}</td>
                    <td>{event.fromLocation || '--'}</td>
                    <td>{event.toLocation || '--'}</td>
                    <td>{event.referenceNumber || '--'}</td>
                    <td>{event.scannedBy}</td>
                  </tr>
                ))}
                {!visibleEvents.length && <tr><td colSpan={8} className="pallet-empty-cell">{loading ? 'Loading transactions…' : error ? 'Transaction feed could not be loaded. Use Retry above.' : search ? 'No transactions match this search.' : 'No transactions have been recorded yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`pallet-history-section ${loading && !updatedAt ? 'is-loading' : ''}`}>
          <div className="pallet-section-heading">
            <div><h2>Live Inventory by Customer</h2><span>{customerFeed.length} customers represented</span></div>
          </div>
          <div className="customer-live-feed">
            {customerFeed.map(([customer, customerPallets]) => (
              <div className="customer-feed-row" key={customer}>
                <span className="customer-feed-name">{customer}</span>
                <span>{customerPallets.length} pallets</span>
                <span>{customerPallets.filter((pallet) => pallet.locationType === 'RECEIVING').length} receiving</span>
                <span>{customerPallets.filter((pallet) => pallet.locationType === 'COOLER').length} in coolers</span>
              </div>
            ))}
            {!customerFeed.length && <div className="pallet-empty-cell">{loading ? 'Loading live customer stock…' : error ? 'Live stock could not be loaded. Use Retry above.' : 'No current pallets match this search.'}</div>}
          </div>
        </section>

        <section className={`pallet-history-section ${loading && !updatedAt ? 'is-loading' : ''}`}>
          <div className="pallet-section-heading">
            <div><h2>Live Inventory</h2><span>{visiblePallets.length} pallets currently in the building</span></div>
          </div>
          <div className="pallet-table-wrap">
            <table className="pallet-inventory-table">
              <thead><tr><th>Pallet Tag</th><th>Customer</th><th>Current Location</th><th>Received</th><th>Last Updated</th></tr></thead>
              <tbody>
                {visiblePallets.map((pallet) => (
                  <tr key={pallet.palletTag}>
                    <td className="pallet-tag-cell">{pallet.palletTag}</td>
                    <td>{pallet.customer || 'Unassigned'}</td>
                    <td>{formatLocation(pallet)}</td>
                    <td>{new Date(pallet.receivedAt).toLocaleString()}</td>
                    <td>{new Date(pallet.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {!visiblePallets.length && <tr><td colSpan={5} className="pallet-empty-cell">{loading ? 'Loading live inventory…' : error ? 'Live inventory could not be loaded. Use Retry above.' : search ? 'No pallets match this search.' : 'No pallets are currently in the building.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PalletInventoryHistory;