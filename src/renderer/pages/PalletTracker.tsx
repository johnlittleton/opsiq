import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/config';
import { TitleBar } from '../../components/layout/TitleBar';
import { useAuth } from '../context/AuthContext';
import { WORK_ORDER_CUSTOMERS } from '../../shared/constants/workOrderCustomers';
import './PalletTracker.css';

type Operation = 'RECEIVE' | 'MOVE' | 'SHIP';
type TrackerView = 'inventory' | 'setup';
type LocationType = 'COOLER' | 'LANE';

interface TrackerLocation {
  placardCode: string;
  locationType: LocationType;
  coolerPlacard: string | null;
  isActive: boolean | number;
}

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

interface LocationEvent {
  id: number;
  action: string;
  palletTag: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  referenceNumber: string | null;
  scannedBy: string;
  scannedAt: string;
}

interface LocationInventory {
  locations: TrackerLocation[];
  pallets: InventoryPallet[];
  recentEvents: LocationEvent[];
}

const AUTO_SUBMIT_DELAY_MS = 250;

const playScanFeedbackTone = (kind: 'success' | 'error') => {
  try {
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'success' ? 880 : 220;
    gainNode.gain.value = 0.0001;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    oscillator.start(now);
    oscillator.stop(now + 0.13);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 220);
  } catch {
    // Keep scanning uninterrupted even if audio output is unavailable.
  }
};

const PalletTracker: React.FC = () => {
  const navigate = useNavigate();
  const { executiveName, logout } = useAuth();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const autoSubmitTimerRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);

  const [view, setView] = useState<TrackerView>('inventory');
  const [operation, setOperation] = useState<Operation>('RECEIVE');
  const [scanValue, setScanValue] = useState('');
  const [receiveCustomer, setReceiveCustomer] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [pendingMoveStage, setPendingMoveStage] = useState<'PALLET' | 'COOLER' | 'LANE'>('PALLET');
  const [pendingPalletTag, setPendingPalletTag] = useState('');
  const [pendingCoolerPlacard, setPendingCoolerPlacard] = useState('');
  const [locationAction, setLocationAction] = useState<'ADD' | 'REMOVE'>('ADD');
  const [locationType, setLocationType] = useState<LocationType>('COOLER');
  const [parentCooler, setParentCooler] = useState('');
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [autoSubmitEnabled, setAutoSubmitEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [inventory, setInventory] = useState<LocationInventory>({ locations: [], pallets: [], recentEvents: [] });
  const [statusMessage, setStatusMessage] = useState('Ready to receive pallets');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [inventoryUpdatedAt, setInventoryUpdatedAt] = useState<Date | null>(null);

  const parseApiResponse = useCallback(async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Unexpected response from server (${response.status}). Refresh the app and try again.`);
    }
    return response.json();
  }, []);

  const loadInventory = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/production/pallet-tracker/location-inventory`);
      if (!response.ok) throw new Error('Failed to load pallet inventory');
      const data = await parseApiResponse(response);
      setInventory({
        locations: Array.isArray(data.locations) ? data.locations : [],
        pallets: Array.isArray(data.pallets) ? data.pallets : [],
        recentEvents: Array.isArray(data.recentEvents) ? data.recentEvents : [],
      });
      setInventoryUpdatedAt(new Date());
    } catch (error: any) {
      console.error('Failed to load pallet inventory:', error);
      setErrorMessage(error?.message || 'Failed to load pallet inventory');
    }
  }, [parseApiResponse]);

  useEffect(() => {
    setErrorMessage('');
    void loadInventory();
    const refreshId = window.setInterval(() => void loadInventory(), 10000);
    return () => window.clearInterval(refreshId);
  }, [loadInventory]);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [view, operation, pendingMoveStage, locationAction, locationType]);

  const activeCoolers = useMemo(
    () => inventory.locations.filter((location) => location.locationType === 'COOLER' && Boolean(location.isActive)),
    [inventory.locations]
  );
  const activeLanes = useMemo(
    () => inventory.locations.filter((location) => location.locationType === 'LANE' && Boolean(location.isActive)),
    [inventory.locations]
  );
  const coolerPalletCount = inventory.pallets.filter((pallet) => pallet.locationType === 'COOLER').length;
  const receivingPalletCount = inventory.pallets.filter((pallet) => pallet.locationType === 'RECEIVING').length;
  const customerInventory = useMemo(() => {
    const grouped = new Map<string, InventoryPallet[]>();
    inventory.pallets.forEach((pallet) => {
      const customer = pallet.customer?.trim() || 'Unassigned';
      grouped.set(customer, [...(grouped.get(customer) || []), pallet]);
    });
    return Array.from(grouped.entries()).sort(([first], [second]) => first.localeCompare(second));
  }, [inventory.pallets]);
  const filteredPallets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return inventory.pallets.filter((pallet) => !customerFilter || (pallet.customer?.trim() || 'Unassigned') === customerFilter)
      .filter((pallet) => !normalizedSearch || [
        pallet.palletTag,
        pallet.customer,
        pallet.locationType,
        pallet.coolerPlacard,
        pallet.lanePlacard,
        pallet.position == null ? '' : String(pallet.position),
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)));
  }, [inventory.pallets, search, customerFilter]);

  const postInventoryAction = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE}/api/production/pallet-tracker/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, scannedBy: executiveName || 'Unknown' }),
    });
    const result = await parseApiResponse(response);
    if (!response.ok) throw new Error(result?.error || 'Could not save inventory scan');
    return result;
  };

  const finishScan = async (successMessage: string) => {
    await loadInventory();
    setStatusMessage(successMessage);
    if (soundEnabled) playScanFeedbackTone('success');
    setScanValue('');
    scanInputRef.current?.focus();
  };

  const submitOperationScan = async (rawValue: string) => {
    const scannedValue = rawValue.trim();
    if (!scannedValue || loading || scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      if (view === 'setup') {
        if (locationAction === 'ADD') {
          const location = await postInventoryAction('locations', {
            locationType,
            placardCode: scannedValue,
            coolerPlacard: locationType === 'LANE' ? parentCooler : undefined,
          });
          await finishScan(`${location.locationType} placard added: ${location.placardCode}`);
        } else {
          const response = await fetch(`${API_BASE}/api/production/pallet-tracker/locations/${encodeURIComponent(scannedValue)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scannedBy: executiveName || 'Unknown' }),
          });
          const result = await parseApiResponse(response);
          if (!response.ok) throw new Error(result?.error || 'Could not remove location');
          await finishScan(`Location removed: ${result.placardCode}`);
        }
        return;
      }

      if (operation === 'RECEIVE') {
        if (!receiveCustomer.trim()) throw new Error('Select or enter a customer before receiving pallets');
        await postInventoryAction('receive', { palletTag: scannedValue, customer: receiveCustomer.trim() });
        await finishScan(`Pallet ${scannedValue} received for ${receiveCustomer.trim()}`);
      } else if (operation === 'SHIP') {
        if (!referenceNumber.trim()) throw new Error('Enter a sales order or pick ticket before scanning pallets');
        await postInventoryAction('ship', { palletTag: scannedValue, referenceNumber: referenceNumber.trim() });
        await finishScan(`Pallet ${scannedValue} shipped on ${referenceNumber.trim()}`);
      } else if (pendingMoveStage === 'PALLET') {
        setPendingPalletTag(scannedValue);
        setPendingMoveStage('COOLER');
        setStatusMessage(`Pallet ${scannedValue} selected. Scan the destination cooler placard.`);
        setScanValue('');
      } else if (pendingMoveStage === 'COOLER') {
        const cooler = activeCoolers.find((location) => location.placardCode.toLowerCase() === scannedValue.toLowerCase());
        if (!cooler) throw new Error(`Cooler placard ${scannedValue} is not configured. Add it in Location Setup first.`);
        setPendingCoolerPlacard(cooler.placardCode);
        setPendingMoveStage('LANE');
        setStatusMessage(`Cooler ${cooler.placardCode} selected. Scan its lane placard.`);
        setScanValue('');
      } else {
        const result = await postInventoryAction('move', {
          palletTag: pendingPalletTag,
          coolerPlacard: pendingCoolerPlacard,
          lanePlacard: scannedValue,
        });
        await finishScan(`Pallet ${pendingPalletTag} placed at ${pendingCoolerPlacard} / ${result.lanePlacard} / position ${result.position}`);
        setPendingPalletTag('');
        setPendingCoolerPlacard('');
        setPendingMoveStage('PALLET');
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to record scan');
      setStatusMessage('Scan was not recorded');
      if (soundEnabled) playScanFeedbackTone('error');
      setScanValue('');
      if (operation === 'MOVE') {
        setPendingPalletTag('');
        setPendingCoolerPlacard('');
        setPendingMoveStage('PALLET');
      }
      scanInputRef.current?.focus();
    } finally {
      scanInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleScanKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitOperationScan(scanValue);
    }
  };

  useEffect(() => {
    if (!autoSubmitEnabled || loading) return;
    const candidate = scanValue.trim();
    if (!candidate) return;

    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
    }

    autoSubmitTimerRef.current = window.setTimeout(() => {
      void submitOperationScan(candidate);
    }, AUTO_SUBMIT_DELAY_MS);

    return () => {
      if (autoSubmitTimerRef.current) {
        window.clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
    };
  }, [autoSubmitEnabled, loading, scanValue, view, operation, pendingMoveStage, pendingPalletTag, pendingCoolerPlacard, locationAction, locationType, parentCooler, referenceNumber, activeCoolers, executiveName, soundEnabled, receiveCustomer]);

  const cancelMove = () => {
    setPendingPalletTag('');
    setPendingCoolerPlacard('');
    setPendingMoveStage('PALLET');
    setScanValue('');
    setStatusMessage('Move cancelled. Ready to scan a pallet.');
  };

  const scannerLabel = view === 'setup'
    ? locationAction === 'ADD'
      ? `Scan ${locationType.toLowerCase()} placard`
      : 'Scan placard to remove'
    : operation === 'RECEIVE'
      ? 'Scan inbound pallet tag'
      : operation === 'SHIP'
        ? 'Scan pallet tag to ship'
        : pendingMoveStage === 'PALLET'
          ? 'Scan pallet tag to move'
          : pendingMoveStage === 'COOLER'
            ? 'Scan destination cooler placard'
            : 'Scan destination lane placard';

  const scannerPlaceholder = view === 'inventory' && operation === 'MOVE' && pendingMoveStage === 'COOLER'
    ? 'Scan cooler placard'
    : view === 'inventory' && operation === 'MOVE' && pendingMoveStage === 'LANE'
      ? 'Scan lane placard'
      : view === 'setup'
        ? 'Scan location placard'
        : 'Click here, then scan';

  const formatLocation = (pallet: InventoryPallet) => pallet.locationType === 'RECEIVING'
    ? 'Receiving'
    : `Cooler ${pallet.coolerPlacard} / Lane ${pallet.lanePlacard} / Position ${pallet.position}`;

  const laneOccupancy = (laneCode: string) => inventory.pallets.filter((pallet) => pallet.lanePlacard === laneCode).length;
  const receivingQueue = inventory.pallets.filter((pallet) => pallet.locationType === 'RECEIVING');

  return (
    <div className="pallet-tracker-page">
      <TitleBar showLegend={false} />
      <div className="pallet-tracker-container">
        <div className="pallet-tracker-header">
          <div>
            <p className="wms-eyebrow">Warehouse Operations</p>
            <h1>Pallet Inventory Control</h1>
            <p>Live pallet positions, receiving queue, customer stock, and outbound activity</p>
          </div>
          <div className="pallet-tracker-header-actions">
            <span className="wms-live-indicator"><span />Live{inventoryUpdatedAt ? ` · ${inventoryUpdatedAt.toLocaleTimeString()}` : ''}</span>
            <button className="nav-btn" onClick={() => void loadInventory()}>Refresh</button>
            <button className="summary-btn" onClick={() => navigate('/inventory-pallet-history')}>History / Live Feed</button>
            <button className="nav-btn" onClick={() => navigate('/home')}>Home</button>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </div>

        <div className="pallet-tracker-tabs" role="tablist" aria-label="Pallet inventory views">
          <button type="button" className={view === 'inventory' ? 'active' : ''} onClick={() => setView('inventory')}>Inventory</button>
          <button type="button" className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}>Location Setup</button>
        </div>

        {view === 'inventory' ? (
          <>
            <div className="pallet-inventory-metrics">
              <div><span>In Building</span><strong>{inventory.pallets.length}</strong></div>
              <div><span>Receiving</span><strong>{receivingPalletCount}</strong></div>
              <div><span>In Coolers</span><strong>{coolerPalletCount}</strong></div>
              <div><span>Configured Lanes</span><strong>{activeLanes.length}</strong></div>
            </div>

            <div className="wms-dashboard-grid">
            <div className="wms-floor-column">
            <section className="wms-floor-board" aria-label="Warehouse storage locations">
              <div className="pallet-section-heading">
                <div><h2>Cooler Storage Map</h2><span>10 numbered positions per lane · occupied positions show the pallet tag</span></div>
                <button type="button" className="text-action" onClick={() => setView('setup')}>Manage locations</button>
              </div>
              {!activeCoolers.length ? (
                <div className="wms-map-empty"><strong>No cooler locations configured</strong><span>Add cooler and lane placards in Location Setup to see storage occupancy here.</span></div>
              ) : (
                <div className="wms-cooler-grid">
                  {activeCoolers.map((cooler) => {
                    const coolerLanes = activeLanes.filter((lane) => lane.coolerPlacard === cooler.placardCode);
                    const coolerPallets = inventory.pallets.filter((pallet) => pallet.coolerPlacard === cooler.placardCode);
                    return (
                      <section className="wms-cooler" key={cooler.placardCode}>
                        <header><strong>Cooler {cooler.placardCode}</strong><span>{coolerPallets.length} pallets</span></header>
                        {!coolerLanes.length ? <div className="wms-map-empty">No lanes configured</div> : (
                          <div className="wms-lane-list">
                            {coolerLanes.map((lane) => {
                              const lanePallets = inventory.pallets.filter((pallet) => pallet.lanePlacard === lane.placardCode);
                              const palletAtPosition = new Map(lanePallets.map((pallet) => [Number(pallet.position), pallet]));
                              return (
                                <div className="wms-lane" key={lane.placardCode}>
                                  <div className="wms-lane-heading"><strong>Lane {lane.placardCode}</strong><span>{lanePallets.length}/10</span></div>
                                  <div className="wms-lane-slots">
                                    {Array.from({ length: 10 }, (_, index) => {
                                      const position = index + 1;
                                      const pallet = palletAtPosition.get(position);
                                      return (
                                        <div className={`wms-slot ${pallet ? 'is-occupied' : ''}`} key={position} title={pallet ? `${pallet.palletTag} · ${pallet.customer || 'Unassigned'}` : `Position ${position} · Open`}>
                                          <span>{position}</span>
                                          <strong>{pallet?.palletTag || 'Open'}</strong>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="wms-receiving-queue">
              <div className="pallet-section-heading">
                <div><h2>Receiving / Putaway Queue</h2><span>{receivingQueue.length} pallets need a cooler lane position</span></div>
                <button type="button" className="wms-action-button" onClick={() => setOperation('MOVE')} disabled={!receivingQueue.length}>Start Putaway</button>
              </div>
              {receivingQueue.length ? (
                <div className="pallet-table-wrap">
                  <table className="pallet-inventory-table">
                    <thead><tr><th>Pallet Tag</th><th>Customer</th><th>Received</th><th>Next Step</th></tr></thead>
                    <tbody>{receivingQueue.map((pallet) => (
                      <tr key={pallet.palletTag}>
                        <td className="pallet-tag-cell">{pallet.palletTag}</td>
                        <td>{pallet.customer || 'Unassigned'}</td>
                        <td>{new Date(pallet.receivedAt).toLocaleString()}</td>
                        <td><span className="wms-status-pill">Awaiting putaway</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div className="wms-queue-clear">Receiving queue is clear.</div>}
            </section>

            </div>
            <div className="wms-operations-column">
            <div className="pallet-operation-switch" role="group" aria-label="Pallet operation">
              <button type="button" className={operation === 'RECEIVE' ? 'active receive' : ''} onClick={() => { setOperation('RECEIVE'); cancelMove(); }}>Receive</button>
              <button type="button" className={operation === 'MOVE' ? 'active move' : ''} onClick={() => setOperation('MOVE')}>Move to Cooler</button>
              <button type="button" className={operation === 'SHIP' ? 'active ship' : ''} onClick={() => { setOperation('SHIP'); cancelMove(); }}>Ship</button>
            </div>

            <div className="scanner-box location-scanner-box">
              {operation === 'RECEIVE' && (
                <label className="field-group">
                  Customer
                  <select
                    value={receiveCustomer}
                    onChange={(event) => setReceiveCustomer(event.target.value)}
                    disabled={loading}
                  >
                    <option value="">Select customer...</option>
                    {WORK_ORDER_CUSTOMERS.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
                  </select>
                </label>
              )}
              {operation === 'SHIP' && (
                <label className="field-group">
                  Sales order or pick ticket
                  <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Enter shipment reference" />
                </label>
              )}
              <label htmlFor="pallet-scan-input">{scannerLabel}</label>
              <input
                id="pallet-scan-input"
                ref={scanInputRef}
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                onKeyDown={handleScanKeyDown}
                placeholder={scannerPlaceholder}
                autoComplete="off"
                autoFocus
                disabled={loading}
              />
              <div className="scanner-preferences">
                <label className="auto-submit-row">
                  <input type="checkbox" checked={autoSubmitEnabled} onChange={(event) => setAutoSubmitEnabled(event.target.checked)} />
                  Auto-submit scans
                </label>
                <label className="auto-submit-row">
                  <input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />
                  Scan feedback sound
                </label>
                {operation === 'MOVE' && pendingMoveStage !== 'PALLET' && (
                  <button type="button" className="text-action" onClick={cancelMove}>Cancel move</button>
                )}
              </div>
              <div className="scanner-actions">
                <button className="scan-submit-btn" disabled={loading || !scanValue.trim()} onClick={() => void submitOperationScan(scanValue)}>
                  {loading ? 'Saving...' : 'Submit Scan'}
                </button>
                <span className="status-message" role="status" aria-live="polite">{statusMessage}</span>
              </div>
              {errorMessage && <div className="error-message" role="alert">{errorMessage}</div>}
            </div>

            <section className="pallet-inventory-section">
              <div className="pallet-section-heading">
                <div><h2>Current Pallet Locations</h2><span>{filteredPallets.length} pallets shown</span></div>
                <div className="inventory-filters">
                  <select aria-label="Filter inventory by customer" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
                    <option value="">All customers</option>
                    {WORK_ORDER_CUSTOMERS.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
                    {customerInventory.some(([customer]) => customer === 'Unassigned') && <option value="Unassigned">Unassigned</option>}
                    {customerInventory.filter(([customer]) => customer !== 'Unassigned' && !WORK_ORDER_CUSTOMERS.includes(customer)).map(([customer]) => <option key={customer} value={customer}>{customer}</option>)}
                  </select>
                  <input aria-label="Search pallet inventory" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tag or location" />
                </div>
              </div>
              <div className="customer-live-feed">
                {customerInventory.filter(([customer]) => !customerFilter || customer === customerFilter).map(([customer, pallets]) => (
                  <button type="button" className="customer-feed-row" key={customer} onClick={() => setCustomerFilter(customerFilter === customer ? '' : customer)}>
                    <span className="customer-feed-name">{customer}</span>
                    <span>{pallets.length} pallets</span>
                    <span>{pallets.filter((pallet) => pallet.locationType === 'RECEIVING').length} receiving</span>
                    <span>{pallets.filter((pallet) => pallet.locationType === 'COOLER').length} in coolers</span>
                  </button>
                ))}
                {!customerInventory.length && <div className="pallet-empty-cell">No customer inventory recorded yet.</div>}
              </div>
              <div className="pallet-table-wrap">
                <table className="pallet-inventory-table">
                  <thead><tr><th>Pallet Tag</th><th>Customer</th><th>Current Location</th><th>Received</th><th>Last Updated</th></tr></thead>
                  <tbody>
                    {filteredPallets.map((pallet) => (
                      <tr key={pallet.palletTag}>
                        <td className="pallet-tag-cell">{pallet.palletTag}</td>
                        <td>{pallet.customer || 'Unassigned'}</td>
                        <td>{formatLocation(pallet)}</td>
                        <td>{new Date(pallet.receivedAt).toLocaleString()}</td>
                        <td>{new Date(pallet.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                    {!filteredPallets.length && <tr><td colSpan={5} className="pallet-empty-cell">No pallets match this search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="recent-panel wms-activity-panel">
              <div className="recent-panel-header"><div><h3>Recent Inventory Activity</h3><div className="recent-subtitle">Latest receiving, moves, shipments, and placard changes</div></div></div>
              {inventory.recentEvents.length ? (
                <div className="pallet-table-wrap">
                  <table className="pallet-inventory-table">
                    <thead><tr><th>Action</th><th>Pallet / Location</th><th>Reference</th><th>Time</th></tr></thead>
                    <tbody>{inventory.recentEvents.map((event) => (
                      <tr key={event.id}>
                        <td><span className={`inventory-event-pill ${event.action.toLowerCase()}`}>{event.action.replace('_', ' ')}</span></td>
                        <td>{event.palletTag || event.toLocation || event.fromLocation || '--'}</td>
                        <td>{event.referenceNumber || '--'}</td>
                        <td>{new Date(event.scannedAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div className="no-data">No inventory activity recorded yet.</div>}
            </section>
            </div>
            </div>
          </>
        ) : (
          <>
            <section className="location-setup-panel">
              <div className="pallet-section-heading"><div><h2>Location Placards</h2><span>Register physical cooler and lane barcode labels</span></div></div>
              <div className="location-setup-controls">
                <label className="field-group">
                  Setup action
                  <select value={locationAction} onChange={(event) => setLocationAction(event.target.value as 'ADD' | 'REMOVE')}>
                    <option value="ADD">Add placard</option>
                    <option value="REMOVE">Remove placard</option>
                  </select>
                </label>
                {locationAction === 'ADD' && <>
                  <label className="field-group">
                    Location type
                    <select value={locationType} onChange={(event) => setLocationType(event.target.value as LocationType)}>
                      <option value="COOLER">Cooler</option>
                      <option value="LANE">Lane</option>
                    </select>
                  </label>
                  {locationType === 'LANE' && <label className="field-group">
                    Parent cooler
                    <select value={parentCooler} onChange={(event) => setParentCooler(event.target.value)}>
                      <option value="">Select cooler</option>
                      {activeCoolers.map((cooler) => <option key={cooler.placardCode} value={cooler.placardCode}>{cooler.placardCode}</option>)}
                    </select>
                  </label>}
                </>}
              </div>
              <div className="scanner-box location-scanner-box">
                <label htmlFor="location-placard-input">{scannerLabel}</label>
                <input
                  id="location-placard-input"
                  ref={scanInputRef}
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  onKeyDown={handleScanKeyDown}
                  placeholder="Scan location placard"
                  autoComplete="off"
                  autoFocus
                  disabled={loading || (locationAction === 'ADD' && locationType === 'LANE' && !parentCooler)}
                />
                <div className="scanner-actions">
                  <button className="scan-submit-btn" disabled={loading || !scanValue.trim() || (locationAction === 'ADD' && locationType === 'LANE' && !parentCooler)} onClick={() => void submitOperationScan(scanValue)}>
                    {loading ? 'Saving...' : locationAction === 'ADD' ? 'Add Placard' : 'Remove Placard'}
                  </button>
                  <span className="status-message" role="status" aria-live="polite">{statusMessage}</span>
                </div>
                {errorMessage && <div className="error-message" role="alert">{errorMessage}</div>}
              </div>
              <div className="configured-location-list">
                {!activeCoolers.length && <div className="pallet-empty-cell">No cooler placards configured yet.</div>}
                {activeCoolers.map((cooler) => {
                  const lanes = activeLanes.filter((lane) => lane.coolerPlacard === cooler.placardCode);
                  return (
                    <div className="configured-cooler" key={cooler.placardCode}>
                      <div><strong>Cooler {cooler.placardCode}</strong><span>{lanes.length} lanes</span></div>
                      {lanes.length ? <div className="configured-lanes">{lanes.map((lane) => (
                        <div className="configured-lane" key={lane.placardCode}>
                          <span>Lane {lane.placardCode}</span>
                          <span>{laneOccupancy(lane.placardCode)} / 10 occupied</span>
                        </div>
                      ))}</div> : <span className="no-lanes">No lanes configured</span>}
                    </div>
                  );
                })}
              </div>
              {locationAction === 'REMOVE' && <p className="location-removal-note">Occupied locations cannot be removed. Remove a cooler's active lanes before removing the cooler.</p>}
            </section>
          </>
        )}

      </div>
    </div>
  );
};

export default PalletTracker;
