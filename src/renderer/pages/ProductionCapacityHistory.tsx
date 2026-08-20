import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductionCapacityHistory.css';

const CAPACITY_HISTORY_KEY = 'opsiq-production-capacity-history';

type CapacityHistoryEntry = {
  id: string;
  savedAt: string;
  giroCases: number;
  hpCases: number;
  rg1Cases: number;
  rg2Cases: number;
  availableHeadcount: number;
  availableTaggers?: number;
  availableForkliftDrivers?: number;
  availableCompactorOperators?: number;
  availableStrapperOperators?: number;
  activeLines: number;
  requiredHeadcount: number;
  staffingStatus: string;
  requiredManHours: number;
  completionHoursWithStaff: number;
};

const formatNumber = (value: number) => Number(value || 0).toLocaleString();

export default function ProductionCapacityHistory() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<CapacityHistoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [savedDate, setSavedDate] = useState('');

  const loadHistory = () => {
    try {
      const storedHistory = JSON.parse(localStorage.getItem(CAPACITY_HISTORY_KEY) || '[]');
      setHistory(Array.isArray(storedHistory) ? storedHistory : []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const clearHistory = () => {
    localStorage.removeItem(CAPACITY_HISTORY_KEY);
    setHistory([]);
  };

  const filteredHistory = history.filter((entry) => {
    const searchText = [
      entry.staffingStatus,
      entry.giroCases,
      entry.hpCases,
      entry.rg1Cases,
      entry.rg2Cases,
      entry.activeLines,
      entry.availableHeadcount,
    ].join(' ').toLowerCase();
    const entryDate = new Date(entry.savedAt).toISOString().slice(0, 10);
    return searchText.includes(search.trim().toLowerCase()) && (!savedDate || entryDate === savedDate);
  });

  return (
    <main className="production-capacity-history">
      <header className="production-capacity-history__header">
        <div>
          <p className="production-capacity-history__eyebrow">Operations planning tool</p>
          <h1>Production Capacity History</h1>
          <p>Review saved case plans, staffing requirements, support coverage, and estimated labor hours.</p>
        </div>
        <div className="production-capacity-history__actions">
          <button type="button" onClick={() => navigate('/production-capacity')}>Back to Capacity</button>
          <button type="button" onClick={() => navigate('/home')}>Home</button>
          {history.length > 0 && <button type="button" className="is-danger" onClick={clearHistory}>Clear History</button>}
        </div>
      </header>

      <section className="production-capacity-history__filters" aria-label="Capacity history filters">
        <label>
          <span>Search saved plans</span>
          <input
            type="search"
            placeholder="Search cases, staffing, or lines"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>Saved date</span>
          <input type="date" value={savedDate} onChange={(event) => setSavedDate(event.target.value)} />
        </label>
        <div className="production-capacity-history__filter-count">
          Showing {filteredHistory.length} of {history.length} saved plans
        </div>
      </section>

      {history.length === 0 ? (
        <section className="production-capacity-history__empty">
          <h2>No saved capacity plans</h2>
          <p>Save a snapshot from the Production Capacity tool to see it here.</p>
          <button type="button" onClick={() => navigate('/production-capacity')}>Open Capacity Tool</button>
        </section>
      ) : filteredHistory.length === 0 ? (
        <section className="production-capacity-history__empty">
          <h2>No matching capacity plans</h2>
          <p>Clear the search or choose a different saved date.</p>
        </section>
      ) : (
        <section className="production-capacity-history__list" aria-label="Saved capacity plans">
          {filteredHistory.map((entry) => (
            <article className="production-capacity-history__record" key={entry.id}>
              <div className="production-capacity-history__record-header">
                <div>
                  <p className="production-capacity-history__eyebrow">Saved plan</p>
                  <h2>{new Date(entry.savedAt).toLocaleString()}</h2>
                </div>
                <strong className={entry.staffingStatus.toLowerCase().includes('short') ? 'is-short' : 'is-ready'}>
                  {entry.staffingStatus}
                </strong>
              </div>

              <div className="production-capacity-history__grid">
                <div><span>Giro cases</span><strong>{formatNumber(entry.giroCases)}</strong></div>
                <div><span>HP7 cases</span><strong>{formatNumber(entry.hpCases)}</strong></div>
                <div><span>RG1 cases</span><strong>{formatNumber(entry.rg1Cases)}</strong></div>
                <div><span>RG2 cases</span><strong>{formatNumber(entry.rg2Cases)}</strong></div>
                <div><span>Active lines</span><strong>{entry.activeLines}</strong></div>
                <div><span>Production headcount</span><strong>{entry.availableHeadcount}</strong></div>
                <div><span>Required headcount</span><strong>{entry.requiredHeadcount}</strong></div>
                <div><span>Required man-hours</span><strong>{Number(entry.requiredManHours || 0).toFixed(1)}</strong></div>
                <div><span>Completion with staff</span><strong>{Number(entry.completionHoursWithStaff || 0).toFixed(2)} h</strong></div>
              </div>

              <div className="production-capacity-history__support">
                <h3>Support staffing</h3>
                <div><span>Taggers</span><strong>{entry.availableTaggers ?? '--'}</strong></div>
                <div><span>Forklift drivers</span><strong>{entry.availableForkliftDrivers ?? '--'}</strong></div>
                <div><span>Compactor operators</span><strong>{entry.availableCompactorOperators ?? '--'}</strong></div>
                <div><span>Strapper operators</span><strong>{entry.availableStrapperOperators ?? '--'}</strong></div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
