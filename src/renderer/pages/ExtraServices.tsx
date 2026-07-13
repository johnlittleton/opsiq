import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TitleBar } from '../../components/layout/TitleBar';
import { API_BASE } from '../services/config';
import './ExtraServices.css';

type ServiceOption = {
  serviceType: string;
  label: string;
  unitType: 'pallet' | 'case' | string;
};

type ExtraServiceEntry = {
  id: number;
  serviceDate: string;
  serviceType: string;
  unitType: string;
  quantity: number;
  workerCount: number;
  totalRevenue: number;
  notes?: string;
  capturedBy?: string;
  createdAt: string;
};

type ExtraServiceSummary = {
  entryCount: number;
  totalRevenue: number;
  totalQuantity: number;
  totalWorkers: number;
  byType: Array<{
    serviceType: string;
    label: string;
    unitType: string;
    entryCount: number;
    totalQuantity: number;
    totalWorkers: number;
    totalRevenue: number;
  }>;
};

const HISTORICAL_MIN_DATE = '2026-07-08';

const DEFAULT_SERVICE_OPTIONS: ServiceOption[] = [
  { serviceType: 'RESTACKING', label: 'Restacking', unitType: 'pallet' },
  { serviceType: 'REPALLETIZE', label: 'Repalletize Pallet', unitType: 'pallet' },
  { serviceType: 'FORCED_AIR_COOLING', label: 'Forced Air Cooling', unitType: 'pallet' },
  { serviceType: 'CASE_PICKING', label: 'Case Picking', unitType: 'case' },
  { serviceType: 'RESTRAPPING', label: 'Restrapping Pallet', unitType: 'pallet' },
  { serviceType: 'PALLET_PULL_3RD_PARTY_QC', label: 'Pallet Pull for 3rd Party QC', unitType: 'pallet' },
];

const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ExtraServices: React.FC = () => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateString(new Date()));
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>(DEFAULT_SERVICE_OPTIONS);
  const [entries, setEntries] = useState<ExtraServiceEntry[]>([]);
  const [summary, setSummary] = useState<ExtraServiceSummary>({
    entryCount: 0,
    totalRevenue: 0,
    totalQuantity: 0,
    totalWorkers: 0,
    byType: [],
  });
  const [serviceType, setServiceType] = useState<string>(DEFAULT_SERVICE_OPTIONS[0].serviceType);
  const [quantity, setQuantity] = useState<number>(1);
  const [workerCount, setWorkerCount] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const effectiveDate = selectedDate < HISTORICAL_MIN_DATE ? HISTORICAL_MIN_DATE : selectedDate;

  const selectedServiceOption = useMemo(
    () => serviceOptions.find((option) => option.serviceType === serviceType) || serviceOptions[0],
    [serviceOptions, serviceType]
  );

  const loadData = async () => {
    const response = await fetch(`${API_BASE}/api/services/extra?date=${effectiveDate}`);
    if (!response.ok) {
      throw new Error('Failed to load extra services');
    }

    const data = await response.json();
    const nextOptions = Array.isArray(data?.serviceOptions) && data.serviceOptions.length > 0
      ? data.serviceOptions
      : DEFAULT_SERVICE_OPTIONS;

    setServiceOptions(nextOptions);
    if (!nextOptions.some((option: ServiceOption) => option.serviceType === serviceType)) {
      setServiceType(nextOptions[0].serviceType);
    }

    setEntries(Array.isArray(data?.entries) ? data.entries : []);
    setSummary({
      entryCount: Number(data?.summary?.entryCount || 0),
      totalRevenue: Number(data?.summary?.totalRevenue || 0),
      totalQuantity: Number(data?.summary?.totalQuantity || 0),
      totalWorkers: Number(data?.summary?.totalWorkers || 0),
      byType: Array.isArray(data?.summary?.byType) ? data.summary.byType : [],
    });
  };

  useEffect(() => {
    loadData().catch((error) => {
      console.error('Failed to load extra services:', error);
      setEntries([]);
      setSummary({ entryCount: 0, totalRevenue: 0, totalQuantity: 0, totalWorkers: 0, byType: [] });
    });
  }, [effectiveDate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serviceType || quantity <= 0 || workerCount <= 0) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/services/extra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceDate: effectiveDate,
          serviceType,
          quantity,
          workerCount,
          notes,
          capturedBy: 'Dock Team',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(String(errorBody?.error || 'Failed to save extra service'));
      }

      setQuantity(1);
      setWorkerCount(1);
      setNotes('');
      await loadData();
    } catch (error) {
      console.error('Failed to save extra service:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="extra-services-page">
      <TitleBar showLegend={false} />
      <div className="extra-services-page__content">
        <header className="extra-services-page__header">
          <div>
            <h1>Extra Services</h1>
            <p>Capture service activity without showing rates to dock users</p>
          </div>
          <div className="extra-services-page__actions">
            <input
              type="date"
              min={HISTORICAL_MIN_DATE}
              max={getLocalDateString(new Date())}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
            <button type="button" onClick={() => setSelectedDate(getLocalDateString(new Date()))}>Today</button>
            <button type="button" onClick={() => navigate('/home')}>Home</button>
          </div>
        </header>

        <section className="extra-services-page__summary">
          <article>
            <span className="label">Service Entries</span>
            <strong>{summary.entryCount}</strong>
          </article>
          <article>
            <span className="label">Units Logged</span>
            <strong>{summary.totalQuantity.toLocaleString()}</strong>
          </article>
          <article>
            <span className="label">Workers Logged</span>
            <strong>{summary.totalWorkers.toLocaleString()}</strong>
          </article>
          <article>
            <span className="label">Extra Services Revenue</span>
            <strong>${summary.totalRevenue.toFixed(2)}</strong>
          </article>
        </section>

        <section className="extra-services-page__main">
          <form className="extra-services-page__form" onSubmit={handleSubmit}>
            <h2>Add Service Entry</h2>
            <div className="extra-services-page__service-grid">
              {serviceOptions.map((option) => (
                <button
                  key={option.serviceType}
                  type="button"
                  className={`extra-services-page__service-chip ${serviceType === option.serviceType ? 'is-active' : ''}`}
                  onClick={() => setServiceType(option.serviceType)}
                >
                  <span>{option.label}</span>
                  <small>{option.unitType}</small>
                </button>
              ))}
            </div>

            <div className="extra-services-page__form-grid">
              <label>
                Workers
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={workerCount}
                  onChange={(event) => setWorkerCount(Math.max(1, Number(event.target.value || 1)))}
                />
              </label>
              <label>
                Quantity ({selectedServiceOption?.unitType || 'unit'})
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value || 1)))}
                />
              </label>
            </div>

            <label>
              Notes (optional)
              <textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Any service notes"
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Service'}
            </button>
          </form>

          <div className="extra-services-page__history">
            <h2>Entries on {effectiveDate}</h2>
            {entries.length > 0 ? (
              <div className="extra-services-page__history-list">
                {entries.map((entry) => {
                  const label = serviceOptions.find((option) => option.serviceType === entry.serviceType)?.label || entry.serviceType;
                  return (
                    <div key={entry.id} className="extra-services-page__history-row">
                      <div>
                        <strong>{label}</strong>
                        <p>{entry.workerCount} workers • {entry.quantity} {entry.unitType}s</p>
                      </div>
                      <div className="extra-services-page__history-right">
                        <strong>${Number(entry.totalRevenue || 0).toFixed(2)}</strong>
                        <span>{new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="extra-services-page__empty">No entries for this date.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ExtraServices;
