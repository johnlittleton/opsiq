import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductionCapacity.css';

const SHIFT_HOURS = 7.15;
const GIRO_CASES_PER_SHIFT = 1200;
const HP_CASES_PER_HOUR = 1100;
const RG_CASES_PER_SHIFT = 1200;
const GIRO_PEOPLE_PER_LINE = 8;

const PRODUCTION_LINES = [
  ...Array.from({ length: 6 }, (_, index) => ({
    name: `Giro Line ${index + 1}`,
    type: 'Giro',
    casesPerShift: GIRO_CASES_PER_SHIFT,
    casesPerHour: GIRO_CASES_PER_SHIFT / SHIFT_HOURS,
    peoplePerLine: GIRO_PEOPLE_PER_LINE,
  })),
  {
    name: 'HP7',
    type: 'Hand Pack',
    casesPerShift: HP_CASES_PER_HOUR * SHIFT_HOURS,
    casesPerHour: HP_CASES_PER_HOUR,
    peoplePerLine: 0,
  },
  ...['RG1', 'RG2'].map((name) => ({
    name,
    type: 'RG',
    casesPerShift: RG_CASES_PER_SHIFT,
    casesPerHour: RG_CASES_PER_SHIFT / SHIFT_HOURS,
    peoplePerLine: 0,
  })),
];

const formatNumber = (value: number) => value.toLocaleString();

export default function ProductionCapacity() {
  const navigate = useNavigate();
  const [giroCasesInput, setGiroCasesInput] = useState('');
  const [hpCasesInput, setHpCasesInput] = useState('');
  const [rgCasesInput, setRgCasesInput] = useState('');

  const capacity = useMemo(() => {
    const giroCases = Math.max(0, Number(giroCasesInput) || 0);
    const hpCases = Math.max(0, Number(hpCasesInput) || 0);
    const rgCases = Math.max(0, Number(rgCasesInput) || 0);
    const totalCases = giroCases + hpCases + rgCases;
    const roomCapacity = PRODUCTION_LINES.reduce((total, line) => total + line.casesPerShift, 0);
    const remainingCasesByType = { Giro: giroCases, 'Hand Pack': hpCases, RG: rgCases };
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
    const estimatedHours = activeLines.reduce((longest, line) => Math.max(longest, line.lineHours), 0);
    const utilization = roomCapacity === 0 ? 0 : (totalCases / roomCapacity) * 100;
    const unassignedCases = Object.values(remainingCasesByType).reduce((total, cases) => total + cases, 0);

    return {
      giroCases,
      hpCases,
      rgCases,
      totalCases,
      roomCapacity,
      allocation,
      activeLines,
      giroPeopleRequired,
      estimatedHours,
      utilization,
      fitsInOneShift: totalCases <= roomCapacity,
      unassignedCases,
    };
  }, [giroCasesInput, hpCasesInput, rgCasesInput]);

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
            placeholder="Enter RG cases"
            value={rgCasesInput}
            onChange={(event) => setRgCasesInput(event.target.value)}
          />
        </label>
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
          <small>{GIRO_PEOPLE_PER_LINE} per active Giro line</small>
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
        Model: Giro Lines 1-6 produce {formatNumber(GIRO_CASES_PER_SHIFT)} cases per {SHIFT_HOURS}-hour shift with {GIRO_PEOPLE_PER_LINE} people each. HP7 produces {formatNumber(HP_CASES_PER_HOUR)} cases per hour. RG1 and RG2 produce {formatNumber(RG_CASES_PER_SHIFT)} cases per {SHIFT_HOURS}-hour shift.
      </p>
    </main>
  );
}
