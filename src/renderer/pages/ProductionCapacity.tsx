import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductionCapacity.css';

const SHIFT_HOURS = 7.15;
const GIRO_CASES_PER_SHIFT = 1200;
const HP_CASES_PER_HOUR = 1100;
const RG_CASES_PER_SHIFT = 1200;
const PEOPLE_PER_LINE = 8;
const CAPACITY_HISTORY_KEY = 'opsiq-production-capacity-history';

type CapacityHistoryEntry = {
  id: string;
  savedAt: string;
  giroCases: number;
  hpCases: number;
  rg1Cases: number;
  rg2Cases: number;
  availableHeadcount: number;
  activeLines: number;
  requiredHeadcount: number;
  staffingStatus: string;
};

const PRODUCTION_LINES = [
  ...Array.from({ length: 6 }, (_, index) => ({
    name: `Giro Line ${index + 1}`,
    type: 'Giro',
    casesPerShift: GIRO_CASES_PER_SHIFT,
    casesPerHour: GIRO_CASES_PER_SHIFT / SHIFT_HOURS,
    peoplePerLine: PEOPLE_PER_LINE,
  })),
  {
    name: 'HP7',
    type: 'HP7',
    casesPerShift: HP_CASES_PER_HOUR * SHIFT_HOURS,
    casesPerHour: HP_CASES_PER_HOUR,
    peoplePerLine: PEOPLE_PER_LINE,
  },
  ...['RG1', 'RG2'].map((name) => ({
    name,
    type: name,
    casesPerShift: RG_CASES_PER_SHIFT,
    casesPerHour: RG_CASES_PER_SHIFT / SHIFT_HOURS,
    peoplePerLine: PEOPLE_PER_LINE,
  })),
];

const formatNumber = (value: number) => value.toLocaleString();

export default function ProductionCapacity() {
  const navigate = useNavigate();
  const [giroCasesInput, setGiroCasesInput] = useState('');
  const [hpCasesInput, setHpCasesInput] = useState('');
  const [rg1CasesInput, setRg1CasesInput] = useState('');
  const [rg2CasesInput, setRg2CasesInput] = useState('');
  const [availableHeadcountInput, setAvailableHeadcountInput] = useState('');
  const [history, setHistory] = useState<CapacityHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    try {
      const storedHistory = JSON.parse(localStorage.getItem(CAPACITY_HISTORY_KEY) || '[]');
      if (Array.isArray(storedHistory)) {
        setHistory(storedHistory.slice(0, 20));
      }
    } catch {
      setHistory([]);
    }
  }, []);

  const capacity = useMemo(() => {
    const giroCases = Math.max(0, Number(giroCasesInput) || 0);
    const hpCases = Math.max(0, Number(hpCasesInput) || 0);
    const rg1Cases = Math.max(0, Number(rg1CasesInput) || 0);
    const rg2Cases = Math.max(0, Number(rg2CasesInput) || 0);
    const availableHeadcount = Math.max(0, Number(availableHeadcountInput) || 0);
    const totalCases = giroCases + hpCases + rg1Cases + rg2Cases;
    const roomCapacity = PRODUCTION_LINES.reduce((total, line) => total + line.casesPerShift, 0);
    const remainingCasesByType = { Giro: giroCases, HP7: hpCases, RG1: rg1Cases, RG2: rg2Cases };
    const allocation = PRODUCTION_LINES.map((line) => {
      const assignedCases = Math.min(line.casesPerShift, remainingCasesByType[line.type as keyof typeof remainingCasesByType]);
      remainingCasesByType[line.type as keyof typeof remainingCasesByType] -= assignedCases;
      return {
        ...line,
        assignedCases,
        active: assignedCases > 0,
        lineHours: assignedCases / line.casesPerHour,
      };
    });
    const activeLines = allocation.filter((line) => line.active);
    const giroPeopleRequired = activeLines.reduce((total, line) => total + line.peoplePerLine, 0);
    const requiredHeadcount = activeLines.length * PEOPLE_PER_LINE;
    const staffSupportedLines = Math.min(PRODUCTION_LINES.length, Math.floor(availableHeadcount / PEOPLE_PER_LINE));
    const estimatedHours = activeLines.reduce((longest, line) => Math.max(longest, line.lineHours), 0);
    const utilization = roomCapacity === 0 ? 0 : (totalCases / roomCapacity) * 100;
    const unassignedCases = Object.values(remainingCasesByType).reduce((total, cases) => total + cases, 0);

    return {
      giroCases,
      hpCases,
      rg1Cases,
      rg2Cases,
      availableHeadcount,
      totalCases,
      roomCapacity,
      allocation,
      activeLines,
      giroPeopleRequired,
      requiredHeadcount,
      staffSupportedLines,
      headcountDifference: availableHeadcount - requiredHeadcount,
      estimatedHours,
      utilization,
      fitsInOneShift: totalCases <= roomCapacity,
      unassignedCases,
      hasHeadcountInput: availableHeadcountInput.trim().length > 0,
    };
  }, [giroCasesInput, hpCasesInput, rg1CasesInput, rg2CasesInput, availableHeadcountInput]);

  const staffingStatus = !capacity.hasHeadcountInput
    ? 'Headcount not entered'
    : capacity.headcountDifference < 0
      ? `Short staffed by ${Math.abs(capacity.headcountDifference)} people`
      : capacity.headcountDifference === 0
        ? 'Staffed to capacity'
        : 'Enough staff to run the plan';

  const saveHistorySnapshot = () => {
    const entry: CapacityHistoryEntry = {
      id: `${Date.now()}`,
      savedAt: new Date().toISOString(),
      giroCases: capacity.giroCases,
      hpCases: capacity.hpCases,
      rg1Cases: capacity.rg1Cases,
      rg2Cases: capacity.rg2Cases,
      availableHeadcount: capacity.availableHeadcount,
      activeLines: capacity.activeLines.length,
      requiredHeadcount: capacity.requiredHeadcount,
      staffingStatus,
    };
    const nextHistory = [entry, ...history].slice(0, 20);
    setHistory(nextHistory);
    localStorage.setItem(CAPACITY_HISTORY_KEY, JSON.stringify(nextHistory));
    setShowHistory(true);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(CAPACITY_HISTORY_KEY);
  };

  return (
    <main className="production-capacity">
      <header className="production-capacity__header">
        <nav className="production-capacity__navigation" aria-label="Page navigation">
          <button type="button" onClick={() => navigate(-1)}>← Back</button>
          <button type="button" onClick={() => navigate('/')}>⌂ Home</button>
        </nav>
        <div>
          <p className="production-capacity__eyebrow">Operations planning tool</p>
          <h1>Production Capacity</h1>
          <p className="production-capacity__subtitle">
            Enter the planned cases for Giro, HP7, and RG to see the room plan by production area.
          </p>
        </div>
        <div className={`production-capacity__status ${capacity.fitsInOneShift ? 'is-fit' : 'is-over'}`}>
          <span />
          {capacity.fitsInOneShift ? 'Fits in one shift' : 'More than one shift required'}
        </div>
        <div className="production-capacity__header-actions">
          <button type="button" onClick={saveHistorySnapshot}>Save Snapshot</button>
          <button type="button" onClick={() => setShowHistory((current) => !current)}>
            {showHistory ? 'Hide History' : `History (${history.length})`}
          </button>
        </div>
      </header>

      <section className="production-capacity__controls" aria-label="Capacity assumptions">
        <label className="production-capacity__control--giro">
          <span>Giro cases</span>
          <input
            type="number"
            min={0}
            placeholder="Enter Giro cases"
            value={giroCasesInput}
            onChange={(event) => setGiroCasesInput(event.target.value)}
          />
        </label>
        <label className="production-capacity__control--hp">
          <span>HP7 cases</span>
          <input
            type="number"
            min={0}
            placeholder="Enter HP7 cases"
            value={hpCasesInput}
            onChange={(event) => setHpCasesInput(event.target.value)}
          />
        </label>
        <label className="production-capacity__control--rg">
          <span>RG cases</span>
          <input
            type="number"
            min={0}
            placeholder="Enter RG1 cases"
            value={rg1CasesInput}
            onChange={(event) => setRg1CasesInput(event.target.value)}
          />
        </label>
        <label className="production-capacity__control--rg">
          <span>RG2 cases</span>
          <input
            type="number"
            min={0}
            placeholder="Enter RG2 cases"
            value={rg2CasesInput}
            onChange={(event) => setRg2CasesInput(event.target.value)}
          />
        </label>
        <label className="production-capacity__control--headcount">
          <span>Available headcount</span>
          <input
            type="number"
            min={0}
            placeholder="Enter people available"
            value={availableHeadcountInput}
            onChange={(event) => setAvailableHeadcountInput(event.target.value)}
          />
        </label>
      </section>

      <section className="production-capacity__staffing" aria-label="Staffing results">
        <div>
          <span>Staffing status</span>
          <strong className={capacity.hasHeadcountInput && capacity.headcountDifference < 0 ? 'is-short' : 'is-ready'}>
            {staffingStatus}
          </strong>
        </div>
        <div>
          <span>Required headcount</span>
          <strong>{capacity.requiredHeadcount}</strong>
          <small>{PEOPLE_PER_LINE} people per active line</small>
        </div>
        <div>
          <span>Lines supported by available staff</span>
          <strong>{capacity.staffSupportedLines}</strong>
          <small>of {PRODUCTION_LINES.length} available</small>
        </div>
      </section>

      <section className="production-capacity__summary" aria-label="Capacity results">
        <article>
          <span>Room capacity / shift</span>
          <strong>{formatNumber(Math.round(capacity.roomCapacity))}</strong>
          <small>cases</small>
        </article>
        <article>
          <span>Lines active</span>
          <strong>{capacity.activeLines.length}</strong>
          <small>of {PRODUCTION_LINES.length} available</small>
        </article>
        <article>
          <span>Giro people required</span>
          <strong>{capacity.giroPeopleRequired}</strong>
          <small>{PEOPLE_PER_LINE} per active line</small>
        </article>
        <article>
          <span>Estimated production time</span>
          <strong>{capacity.estimatedHours.toFixed(2)}</strong>
          <small>hours using all lines</small>
        </article>
        <article>
          <span>Capacity utilization</span>
          <strong>{Math.min(100, capacity.utilization).toFixed(1)}%</strong>
          <small>{capacity.unassignedCases > 0 ? `${formatNumber(Math.round(capacity.unassignedCases))} cases carry over` : 'of one shift'}</small>
        </article>
      </section>

      <section className="production-capacity__allocation" aria-label="Line allocation">
        <div className="production-capacity__section-heading">
          <div>
            <p className="production-capacity__eyebrow">Suggested allocation</p>
            <h2>Cases by line</h2>
          </div>
          <span>{formatNumber(capacity.totalCases)} total cases</span>
        </div>
        <div className="production-capacity__line-grid">
          {capacity.allocation.map((line) => (
            <article key={line.name} className={`production-capacity__line ${line.active ? 'is-active' : 'is-empty'}`}>
              <div className="production-capacity__line-heading">
                <strong>{line.name}</strong>
                <span>{line.active ? 'RUN' : 'OPEN'}</span>
              </div>
              <div className="production-capacity__line-cases">
                <strong>{formatNumber(line.assignedCases)}</strong>
                <span>cases</span>
              </div>
              <div className="production-capacity__line-bar">
                <span style={{ width: `${(line.assignedCases / line.casesPerShift) * 100}%` }} />
              </div>
              <small>{line.active ? `${line.lineHours.toFixed(2)} hours estimated` : `${formatNumber(Math.round(line.casesPerShift))} case capacity`}</small>
            </article>
          ))}
        </div>
      </section>

      <p className="production-capacity__assumption">
        Model: Giro Lines 1-6, HP7, RG1, and RG2 each require {PEOPLE_PER_LINE} people. Giro Lines 1-6 produce {formatNumber(GIRO_CASES_PER_SHIFT)} cases per {SHIFT_HOURS}-hour shift. HP7 produces {formatNumber(HP_CASES_PER_HOUR)} cases per hour. RG1 and RG2 produce {formatNumber(RG_CASES_PER_SHIFT)} cases per {SHIFT_HOURS}-hour shift.
      </p>

      {showHistory && (
        <section className="production-capacity__history" aria-label="Production capacity history">
          <div className="production-capacity__section-heading">
            <div>
              <p className="production-capacity__eyebrow">Saved calculations</p>
              <h2>Capacity History</h2>
            </div>
            {history.length > 0 && <button type="button" onClick={clearHistory}>Clear History</button>}
          </div>
          {history.length === 0 ? (
            <p className="production-capacity__history-empty">No saved capacity snapshots yet.</p>
          ) : (
            <div className="production-capacity__history-list">
              {history.map((entry) => (
                <article key={entry.id} className="production-capacity__history-item">
                  <strong>{new Date(entry.savedAt).toLocaleString()}</strong>
                  <span>Giro {formatNumber(entry.giroCases)} | HP7 {formatNumber(entry.hpCases)} | RG1 {formatNumber(entry.rg1Cases)} | RG2 {formatNumber(entry.rg2Cases)}</span>
                  <span>Staff: {formatNumber(entry.availableHeadcount)} | Required: {entry.requiredHeadcount} | Lines: {entry.activeLines}</span>
                  <b>{entry.staffingStatus}</b>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
