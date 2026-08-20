import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProductionCapacity.css';

const SHIFT_HOURS = 7.15;
const GIRO_CASES_PER_SHIFT = 1200;
const HP_CASES_PER_HOUR = 1100;
const RG_CASES_PER_SHIFT = 1200;
const PEOPLE_PER_LINE = 8;
const REQUIRED_COMPACTOR_OPERATORS = 1;
const REQUIRED_STRAPPER_OPERATORS = 1;
const CAPACITY_HISTORY_KEY = 'opsiq-production-capacity-history';

type CapacityHistoryEntry = {
  id: string;
  savedAt: string;
  giroCases: number;
  hpCases: number;
  rg1Cases: number;
  rg2Cases: number;
  availableHeadcount: number;
  availableTaggers: number;
  availableForkliftDrivers: number;
  availableCompactorOperators: number;
  availableStrapperOperators: number;
  activeLines: number;
  requiredHeadcount: number;
  staffingStatus: string;
  requiredManHours: number;
  completionHoursWithStaff: number;
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
  const [availableTaggersInput, setAvailableTaggersInput] = useState('');
  const [availableForkliftDriversInput, setAvailableForkliftDriversInput] = useState('');
  const [availableCompactorOperatorsInput, setAvailableCompactorOperatorsInput] = useState('');
  const [availableStrapperOperatorsInput, setAvailableStrapperOperatorsInput] = useState('');
  const capacity = useMemo(() => {
    const giroCases = Math.max(0, Number(giroCasesInput) || 0);
    const hpCases = Math.max(0, Number(hpCasesInput) || 0);
    const rg1Cases = Math.max(0, Number(rg1CasesInput) || 0);
    const rg2Cases = Math.max(0, Number(rg2CasesInput) || 0);
    const availableHeadcount = Math.max(0, Number(availableHeadcountInput) || 0);
    const availableTaggers = Math.max(0, Number(availableTaggersInput) || 0);
    const availableForkliftDrivers = Math.max(0, Number(availableForkliftDriversInput) || 0);
    const availableCompactorOperators = Math.max(0, Number(availableCompactorOperatorsInput) || 0);
    const availableStrapperOperators = Math.max(0, Number(availableStrapperOperatorsInput) || 0);
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
    const requiredManHours = activeLines.reduce((total, line) => total + (line.lineHours * PEOPLE_PER_LINE), 0);
    const completionHoursWithStaff = availableHeadcount > 0 ? requiredManHours / availableHeadcount : 0;
    const requiredTaggers = Math.ceil(activeLines.length / 2);
    const requiredForkliftDrivers = Math.ceil(activeLines.length / 2);
    const supportRequirements = [
      { label: 'Taggers', required: requiredTaggers, available: availableTaggers },
      { label: 'Forklift drivers', required: requiredForkliftDrivers, available: availableForkliftDrivers },
      { label: 'Compactor operators', required: REQUIRED_COMPACTOR_OPERATORS, available: availableCompactorOperators },
      { label: 'Strapper operators', required: REQUIRED_STRAPPER_OPERATORS, available: availableStrapperOperators },
    ];
    const supportInputsEntered = [availableTaggersInput, availableForkliftDriversInput, availableCompactorOperatorsInput, availableStrapperOperatorsInput]
      .every((value) => value.trim().length > 0);
    const supportShortage = supportRequirements.reduce((total, role) => total + Math.max(0, role.required - role.available), 0);
    const supportManHours = completionHoursWithStaff > 0
      ? supportRequirements.reduce((total, role) => total + (role.required * completionHoursWithStaff), 0)
      : 0;
    const utilization = roomCapacity === 0 ? 0 : (totalCases / roomCapacity) * 100;
    const unassignedCases = Object.values(remainingCasesByType).reduce((total, cases) => total + cases, 0);

    return {
      giroCases,
      hpCases,
      rg1Cases,
      rg2Cases,
      availableHeadcount,
      availableTaggers,
      availableForkliftDrivers,
      availableCompactorOperators,
      availableStrapperOperators,
      totalCases,
      roomCapacity,
      allocation,
      activeLines,
      giroPeopleRequired,
      requiredHeadcount,
      staffSupportedLines,
      headcountDifference: availableHeadcount - requiredHeadcount,
      estimatedHours,
      requiredManHours,
      completionHoursWithStaff,
      supportRequirements,
      requiredTaggers,
      requiredForkliftDrivers,
      supportShortage,
      supportManHours,
      supportInputsEntered,
      utilization,
      fitsInOneShift: totalCases <= roomCapacity,
      unassignedCases,
      hasHeadcountInput: availableHeadcountInput.trim().length > 0,
    };
  }, [giroCasesInput, hpCasesInput, rg1CasesInput, rg2CasesInput, availableHeadcountInput, availableTaggersInput, availableForkliftDriversInput, availableCompactorOperatorsInput, availableStrapperOperatorsInput]);

  const staffingStatus = !capacity.hasHeadcountInput
    ? 'Headcount not entered'
    : capacity.headcountDifference < 0
      ? `Short staffed by ${Math.abs(capacity.headcountDifference)} people`
      : capacity.headcountDifference === 0
        ? 'Staffed to capacity'
        : 'Enough staff to run the plan';

  const overallStaffingStatus = capacity.hasHeadcountInput && capacity.supportInputsEntered
    ? capacity.headcountDifference < 0 || capacity.supportShortage > 0
      ? 'Short staffed'
      : 'Fully staffed'
    : 'Enter all available staffing';
  const hasAnyStaffingShortage = capacity.headcountDifference < 0 || capacity.supportShortage > 0;

  const saveHistorySnapshot = () => {
    const existing = JSON.parse(localStorage.getItem(CAPACITY_HISTORY_KEY) || '[]') as CapacityHistoryEntry[];
    const entry: CapacityHistoryEntry = {
      id: `${Date.now()}`,
      savedAt: new Date().toISOString(),
      giroCases: capacity.giroCases,
      hpCases: capacity.hpCases,
      rg1Cases: capacity.rg1Cases,
      rg2Cases: capacity.rg2Cases,
      availableHeadcount: capacity.availableHeadcount,
      availableTaggers: capacity.availableTaggers,
      availableForkliftDrivers: capacity.availableForkliftDrivers,
      availableCompactorOperators: capacity.availableCompactorOperators,
      availableStrapperOperators: capacity.availableStrapperOperators,
      activeLines: capacity.activeLines.length,
      requiredHeadcount: capacity.requiredHeadcount,
      staffingStatus: overallStaffingStatus,
      requiredManHours: capacity.requiredManHours,
      completionHoursWithStaff: capacity.completionHoursWithStaff,
    };
    localStorage.setItem(CAPACITY_HISTORY_KEY, JSON.stringify([entry, ...existing].slice(0, 50)));
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
          <button type="button" onClick={() => navigate('/production-capacity-history')}>History</button>
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

      <section className="production-capacity__support-controls" aria-label="Support staffing inputs">
        {[
          ['Taggers', availableTaggersInput, setAvailableTaggersInput, capacity.requiredTaggers],
          ['Forklift drivers', availableForkliftDriversInput, setAvailableForkliftDriversInput, capacity.requiredForkliftDrivers],
          ['Compactor operators', availableCompactorOperatorsInput, setAvailableCompactorOperatorsInput, REQUIRED_COMPACTOR_OPERATORS],
          ['Strapper operators', availableStrapperOperatorsInput, setAvailableStrapperOperatorsInput, REQUIRED_STRAPPER_OPERATORS],
        ].map(([label, value, setter, required]) => {
          const shortage = Math.max(0, Number(required) - Number(value || 0));
          return (
          <label key={String(label)} className={shortage > 0 ? 'is-short' : 'is-covered'}>
            <span>{label} available ({required} required)</span>
            <input
              className="production-capacity__support-input"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="0"
              aria-label={`${label} available`}
              value={String(value)}
              onChange={(event) => (setter as (next: string) => void)(event.target.value)}
            />
            <small>{shortage > 0 ? `Need ${shortage} more` : 'Covered'}</small>
          </label>
          );
        })}
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
        <div>
          <span>Required man-hours</span>
          <strong>{capacity.requiredManHours.toFixed(1)}</strong>
          <small>total labor effort</small>
        </div>
        <div>
          <span>Completion with available staff</span>
          <strong>{capacity.hasHeadcountInput ? `${capacity.completionHoursWithStaff.toFixed(2)} h` : '--'}</strong>
          <small>clock hours at entered headcount</small>
        </div>
        <div>
          <span>Overall staffing</span>
          <strong className={hasAnyStaffingShortage ? 'is-short' : 'is-ready'}>{overallStaffingStatus}</strong>
          <small>includes production and support roles</small>
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

    </main>
  );
}
