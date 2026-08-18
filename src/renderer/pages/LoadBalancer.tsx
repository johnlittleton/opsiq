import React, { useMemo, useState } from 'react';
import { TitleBar } from '../../components/layout/TitleBar';
import { reconcileMappedPallets, type OptimizerPallet } from './loadOptimizerCount';
import {
  OPSIQ_MAX_AIRBAGS,
  buildNoseFirstAlternatingPattern,
  buildWeights,
  countRequiredAirbags,
  estimateAxles,
  getAxleCardStatus,
  isSupervisorProfileComplete,
  resolvePrimaryStatus,
  type AxleEstimate,
  type CaseWeightUnit,
  type PrimaryStatus,
  type SupervisorProfile,
  type WeightEntryMethod,
} from './loadPlanRules';
import './LoadBalancer.css';

type TrailerType = '53ft' | '48ft' | 'custom';
type PalletType = 'standard' | 'chep' | 'custom';

type TrailerLayout = {
  rows: number;
  positionsPerRow: number;
  label: string;
  trailerLengthFt: number;
};

type AppPallet = OptimizerPallet & {
  cases: number | null;
  displayText: string;
};

type RowPlan = ReturnType<typeof buildNoseFirstAlternatingPattern<AppPallet>>['rows'][number];

type AxleCard = {
  title: 'STEER' | 'DRIVE TANDEM' | 'TRAILER TANDEM' | 'GROSS';
  estimated: number | null;
  limit: number;
  status: ReturnType<typeof getAxleCardStatus>;
};

const DEFAULT_STANDARD_PALLET_WEIGHT = 40;
const DEFAULT_CHEP_PALLET_WEIGHT = 60;

const TRAILER_PRESETS: Record<Exclude<TrailerType, 'custom'>, TrailerLayout> = {
  '53ft': { rows: 13, positionsPerRow: 2, label: '53-foot trailer', trailerLengthFt: 53 },
  '48ft': { rows: 12, positionsPerRow: 2, label: '48-foot trailer', trailerLengthFt: 48 },
};

const DEFAULT_SUPERVISOR_PROFILE: SupervisorProfile = {
  emptySteerAxleWeight: 11600,
  emptyDriveTandemWeight: 7200,
  emptyTrailerTandemWeight: 8200,
  kingpinLocationFtFromNose: 3,
  trailerTandemCenterFtFromNose: 41,
  steerShareOfKingpinReaction: 0.25,
  driveShareOfKingpinReaction: 0.75,
  maxSteerOperatingWeight: 12000,
  maxDriveTandemWeight: 34000,
  maxTrailerTandemWeight: 34000,
  maxGrossWeight: 80000,
  airbagsPerCenteredSingle: 1,
};

const CERTIFIED_SCALE_NOTICE =
  'This OPSIQ tool provides an estimated loading plan using the entered pallet, case-weight, and equipment-profile information. It does not certify legal axle weight or cargo securement. Actual allowable weights depend on the specific tractor, trailer, axle and tire ratings, fifth-wheel position, tandem position, axle spacing, Federal Bridge Formula, route, permits, state requirements, and actual scale results. Cargo and dunnage airbags must be installed and inspected according to company procedures and the securement-device manufacturer\'s instructions. Verify the completed vehicle on a certified scale before highway travel.';

function formatWhole(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatWeight(value: number | null): string {
  if (value === null) return '--';
  return `${formatWhole(value)} lb`;
}

function statusClass(primaryStatus: PrimaryStatus): string {
  if (primaryStatus === 'LOAD MAP READY') return 'map-status--balanced-estimated-load-pattern';
  if (primaryStatus === 'AXLE ESTIMATE UNAVAILABLE') return 'map-status--estimate-unavailable';
  if (primaryStatus === 'INPUT INCOMPLETE') return 'map-status--axle-information-required';
  return 'map-status--axle-limit-warning';
}

function makePalletLabel(id: number): string {
  return `P-${String(id).padStart(2, '0')}`;
}

function getPatternSheetCells(row: RowPlan): { left: string; center: string; right: string } {
  if (row.layoutType === 'SINGLE_CENTER' && row.centerPallet) {
    return {
      left: 'AIR BAG',
      center: row.centerPallet.displayText,
      right: 'AIR BAG',
    };
  }

  if (row.layoutType === 'DOUBLE' && row.driverPallet && row.passengerPallet) {
    return {
      left: row.driverPallet.displayText,
      center: '',
      right: row.passengerPallet.displayText,
    };
  }

  return { left: '', center: '', right: '' };
}

const LoadBalancer: React.FC = () => {
  const [trailerType, setTrailerType] = useState<TrailerType>('53ft');
  const [customRows, setCustomRows] = useState(13);
  const [customTrailerLengthFt, setCustomTrailerLengthFt] = useState(53);

  const [palletCountInput, setPalletCountInput] = useState('7');
  const [weightEntryMethod, setWeightEntryMethod] = useState<WeightEntryMethod>('same_case_count');

  const [caseWeightUnit, setCaseWeightUnit] = useState<CaseWeightUnit>('kg');
  const [caseWeightInput, setCaseWeightInput] = useState('18');
  const [casesPerPalletInput, setCasesPerPalletInput] = useState('72');

  const [individualCasesPerPallet, setIndividualCasesPerPallet] = useState<number[]>(Array.from({ length: 7 }, () => 72));
  const [individualLoadedWeights, setIndividualLoadedWeights] = useState<number[]>(Array.from({ length: 7 }, () => 2800));
  const [totalShipmentProductWeightInput, setTotalShipmentProductWeightInput] = useState('9072');
  const [totalShipmentProductUnit, setTotalShipmentProductUnit] = useState<CaseWeightUnit>('kg');

  const [palletType, setPalletType] = useState<PalletType>('standard');
  const [customPalletWeight, setCustomPalletWeight] = useState(40);
  const [enteredWeightIncludesPallet, setEnteredWeightIncludesPallet] = useState(false);

  const [airbagsAvailable, setAirbagsAvailable] = useState(true);
  const [blockingAvailable, setBlockingAvailable] = useState(true);

  const [standardPalletWeight, setStandardPalletWeight] = useState(DEFAULT_STANDARD_PALLET_WEIGHT);
  const [chepPalletWeight, setChepPalletWeight] = useState(DEFAULT_CHEP_PALLET_WEIGHT);
  const [supervisorProfile, setSupervisorProfile] = useState<SupervisorProfile>(DEFAULT_SUPERVISOR_PROFILE);

  const [rows, setRows] = useState<RowPlan[]>([]);
  const [primaryStatus, setPrimaryStatus] = useState<PrimaryStatus>('INPUT INCOMPLETE');
  const [secondaryIssues, setSecondaryIssues] = useState<string[]>([]);
  const [patternNote, setPatternNote] = useState('Pattern starts at Row 1 and uses required centered-single/double sequence.');
  const [axleEstimate, setAxleEstimate] = useState<AxleEstimate | null>(null);
  const [unassignedPallets, setUnassignedPallets] = useState<AppPallet[]>([]);
  const [airbagsRequired, setAirbagsRequired] = useState(0);
  const [centeredSingleRowCount, setCenteredSingleRowCount] = useState(0);
  const [didGenerate, setDidGenerate] = useState(false);

  const trailerLayout = useMemo<TrailerLayout>(() => {
    if (trailerType === '53ft') return TRAILER_PRESETS['53ft'];
    if (trailerType === '48ft') return TRAILER_PRESETS['48ft'];
    return {
      rows: Math.max(1, Number(customRows) || 1),
      positionsPerRow: 2,
      label: 'Custom trailer',
      trailerLengthFt: Math.max(20, Number(customTrailerLengthFt) || 20),
    };
  }, [trailerType, customRows, customTrailerLengthFt]);

  const parsedPalletCount = useMemo(() => Math.max(1, Math.floor(Number(palletCountInput) || 1)), [palletCountInput]);

  const physicalPalletWeightLb = useMemo(() => {
    if (palletType === 'standard') return Math.max(0, standardPalletWeight);
    if (palletType === 'chep') return Math.max(0, chepPalletWeight);
    return Math.max(0, customPalletWeight);
  }, [palletType, standardPalletWeight, chepPalletWeight, customPalletWeight]);

  const tareWeight =
    supervisorProfile.emptySteerAxleWeight +
    supervisorProfile.emptyDriveTandemWeight +
    supervisorProfile.emptyTrailerTandemWeight;

  const displayedIssueList = useMemo(() => {
    if (secondaryIssues.length === 0) return [] as string[];
    return secondaryIssues;
  }, [secondaryIssues]);

  const visiblePalletCount = parsedPalletCount;

  const buildPallets = () => {
    const caseWeight = Number(caseWeightInput) || 0;
    const defaultCasesPerPallet = Math.floor(Number(casesPerPalletInput) || 0);
    const totalShipmentProductWeight = Number(totalShipmentProductWeightInput) || 0;

    const weightResult = buildWeights({
      palletCount: parsedPalletCount,
      weightEntryMethod,
      caseWeight,
      caseWeightUnit,
      defaultCasesPerPallet,
      individualCasesPerPallet,
      individualLoadedPalletWeights: individualLoadedWeights,
      totalShipmentProductWeight,
      totalShipmentProductWeightUnit: totalShipmentProductUnit,
      physicalPalletWeightLb,
      enteredWeightIncludesPallet,
    });

    const pallets: AppPallet[] = Array.from({ length: parsedPalletCount }, (_, idx) => {
      const productWeight = weightResult.productWeightsLb[idx] ?? 0;
      const loadedWeight = weightResult.loadedWeightsLb[idx] ?? 0;
      const palletWeight = Math.max(0, loadedWeight - productWeight);

      const cases =
        weightEntryMethod === 'same_case_count'
          ? defaultCasesPerPallet
          : weightEntryMethod === 'individual_cases'
            ? Math.max(0, Math.floor(individualCasesPerPallet[idx] ?? 0))
            : null;

      return {
        id: idx + 1,
        label: makePalletLabel(idx + 1),
        productWeight,
        palletWeight,
        loadedWeight,
        cases,
        displayText: cases !== null && cases > 0 ? `${cases} CS` : `${formatWhole(loadedWeight)} LB`,
      };
    });

    return { pallets, weightResult, defaultCasesPerPallet };
  };

  const axleCards: AxleCard[] = useMemo(() => {
    return [
      {
        title: 'STEER',
        estimated: axleEstimate ? axleEstimate.estimatedSteer : null,
        limit: supervisorProfile.maxSteerOperatingWeight,
        status: getAxleCardStatus(axleEstimate ? axleEstimate.estimatedSteer : null, supervisorProfile.maxSteerOperatingWeight),
      },
      {
        title: 'DRIVE TANDEM',
        estimated: axleEstimate ? axleEstimate.estimatedDrive : null,
        limit: supervisorProfile.maxDriveTandemWeight,
        status: getAxleCardStatus(axleEstimate ? axleEstimate.estimatedDrive : null, supervisorProfile.maxDriveTandemWeight),
      },
      {
        title: 'TRAILER TANDEM',
        estimated: axleEstimate ? axleEstimate.estimatedTrailerTandem : null,
        limit: supervisorProfile.maxTrailerTandemWeight,
        status: getAxleCardStatus(
          axleEstimate ? axleEstimate.estimatedTrailerTandem : null,
          supervisorProfile.maxTrailerTandemWeight
        ),
      },
      {
        title: 'GROSS',
        estimated: axleEstimate ? axleEstimate.estimatedGross : null,
        limit: supervisorProfile.maxGrossWeight,
        status: getAxleCardStatus(axleEstimate ? axleEstimate.estimatedGross : null, supervisorProfile.maxGrossWeight),
      },
    ];
  }, [axleEstimate, supervisorProfile]);

  const summaryMetrics = useMemo(() => {
    const { pallets, weightResult } = buildPallets();
    const totalCargo = pallets.reduce((sum, p) => sum + p.loadedWeight, 0);

    return {
      palletCount: parsedPalletCount,
      totalCases: weightResult.totalCases,
      averageCaseWeightKg: weightResult.averageCaseWeightKg,
      totalProductKg: weightResult.totalProductKg,
      totalProductLb: weightResult.totalProductLb,
      totalPhysicalPalletWeightLb: pallets.reduce((sum, p) => sum + p.palletWeight, 0),
      totalCargoWeightLb: totalCargo,
      tareWeightLb: tareWeight,
      estimatedGrossLb: totalCargo + tareWeight,
      caseWeightOutOfNormalRange: weightResult.caseWeightOutOfNormalRange,
      lightestLoadedPalletLb: weightResult.lightestLoadedPalletLb,
      heaviestLoadedPalletLb: weightResult.heaviestLoadedPalletLb,
      averageLoadedPalletLb: weightResult.averageLoadedPalletLb,
      inputErrors: weightResult.inputErrors,
    };
  }, [
    parsedPalletCount,
    caseWeightInput,
    casesPerPalletInput,
    weightEntryMethod,
    caseWeightUnit,
    totalShipmentProductWeightInput,
    totalShipmentProductUnit,
    individualCasesPerPallet,
    individualLoadedWeights,
    physicalPalletWeightLb,
    enteredWeightIncludesPallet,
    tareWeight,
  ]);

  const handleGenerate = () => {
    const { pallets, weightResult } = buildPallets();

    const pattern = buildNoseFirstAlternatingPattern(pallets, trailerLayout.rows);

    const mappedSlots = pattern.rows.flatMap((row) => {
      if (row.layoutType === 'SINGLE_CENTER' && row.centerPallet) {
        return [{ row: row.rowNumber, palletLabel: row.centerPallet.label }];
      }
      if (row.layoutType === 'DOUBLE') {
        return [
          { row: row.rowNumber, palletLabel: row.driverPallet?.label ?? null },
          { row: row.rowNumber, palletLabel: row.passengerPallet?.label ?? null },
        ];
      }
      return [];
    });

    const reconciliation = reconcileMappedPallets(parsedPalletCount, pallets, mappedSlots);

    const rowOneOccupied = pattern.rows[0]?.layoutType !== 'EMPTY';
    const occupiedRows = pattern.rows.filter((r) => r.layoutType !== 'EMPTY');
    const lastOccupiedRow = occupiedRows.length > 0 ? occupiedRows[occupiedRows.length - 1].rowNumber : 0;
    const hasInternalEmptyRows = pattern.rows
      .filter((row) => row.rowNumber <= lastOccupiedRow)
      .some((row) => row.layoutType === 'EMPTY');

    const inputErrors = [...weightResult.inputErrors];
    if (!rowOneOccupied) inputErrors.push('Row 1 must be occupied.');
    if (hasInternalEmptyRows) inputErrors.push('No internal empty rows are allowed.');
    if (reconciliation.duplicateCount > 0) inputErrors.push('Duplicate pallet IDs detected.');
    if (supervisorProfile.airbagsPerCenteredSingle !== 1 && supervisorProfile.airbagsPerCenteredSingle !== 2) {
      inputErrors.push('airbagsPerCenteredSingle must be 1 or 2.');
    }

    const airbagsNeeded = countRequiredAirbags(pattern.centeredSingleRowCount, supervisorProfile.airbagsPerCenteredSingle);
    const airbagLimitExceeded = airbagsNeeded > OPSIQ_MAX_AIRBAGS;
    const capacityExceeded = pattern.unassigned.length > 0;

    const profileComplete = isSupervisorProfileComplete(supervisorProfile);
    const estimate = profileComplete
      ? estimateAxles(pattern.rows, trailerLayout.trailerLengthFt, trailerLayout.rows, supervisorProfile)
      : null;

    const grossOver = estimate ? estimate.estimatedGross > supervisorProfile.maxGrossWeight : false;
    const driveOver = estimate ? estimate.estimatedDrive > supervisorProfile.maxDriveTandemWeight : false;
    const trailerOver = estimate ? estimate.estimatedTrailerTandem > supervisorProfile.maxTrailerTandemWeight : false;
    const steerOver = estimate ? estimate.estimatedSteer > supervisorProfile.maxSteerOperatingWeight : false;

    const { primary, secondary } = resolvePrimaryStatus({
      inputIncomplete: inputErrors.length > 0,
      grossOver,
      patternCapacityExceeded: capacityExceeded,
      airbagLimitExceeded,
      driveOver,
      trailerOver,
      steerOver,
      axleEstimateUnavailable: !profileComplete,
    });

    const additionalIssues: string[] = [...secondary];
    if ((driveOver || trailerOver || steerOver) && primary !== 'GROSS WEIGHT OVER LIMIT') {
      additionalIssues.push('REQUIRED PATTERN HAS AN AXLE-WEIGHT WARNING');
      additionalIssues.push('SUPERVISOR REVIEW REQUIRED');
    }

    if (primary === 'AIRBAG LIMIT EXCEEDED') {
      additionalIssues.unshift(`THIS PATTERN REQUIRES ${airbagsNeeded} AIRBAGS`);
      additionalIssues.unshift(`OPSIQ MAXIMUM: ${OPSIQ_MAX_AIRBAGS}`);
      additionalIssues.unshift('ALTERNATE LOADING METHOD OR SUPERVISOR REVIEW REQUIRED');
    }

    setRows(pattern.rows);
    setUnassignedPallets(pattern.unassigned);
    setCenteredSingleRowCount(pattern.centeredSingleRowCount);
    setAirbagsRequired(airbagsNeeded);
    setAxleEstimate(estimate);
    setDidGenerate(true);
    setPrimaryStatus(primary);
    setSecondaryIssues(additionalIssues);

    if (primary === 'AXLE ESTIMATE UNAVAILABLE') {
      setPatternNote('AXLE ESTIMATE UNAVAILABLE. CERTIFIED SCALE VERIFICATION REQUIRED.');
    } else {
      setPatternNote('Pattern starts at Row 1 with continuous centered-single/double sequence and no load bars.');
    }
  };

  const handleReset = () => {
    setTrailerType('53ft');
    setCustomRows(13);
    setCustomTrailerLengthFt(53);
    setPalletCountInput('7');
    setWeightEntryMethod('same_case_count');
    setCaseWeightUnit('kg');
    setCaseWeightInput('18');
    setCasesPerPalletInput('72');
    setIndividualCasesPerPallet(Array.from({ length: 7 }, () => 72));
    setIndividualLoadedWeights(Array.from({ length: 7 }, () => 2800));
    setTotalShipmentProductWeightInput('9072');
    setTotalShipmentProductUnit('kg');
    setPalletType('standard');
    setCustomPalletWeight(40);
    setEnteredWeightIncludesPallet(false);
    setAirbagsAvailable(true);
    setBlockingAvailable(true);
    setStandardPalletWeight(DEFAULT_STANDARD_PALLET_WEIGHT);
    setChepPalletWeight(DEFAULT_CHEP_PALLET_WEIGHT);
    setSupervisorProfile(DEFAULT_SUPERVISOR_PROFILE);
    setRows([]);
    setPrimaryStatus('INPUT INCOMPLETE');
    setSecondaryIssues([]);
    setPatternNote('Pattern starts at Row 1 and uses required centered-single/double sequence.');
    setAxleEstimate(null);
    setUnassignedPallets([]);
    setAirbagsRequired(0);
    setCenteredSingleRowCount(0);
    setDidGenerate(false);
  };

  const handlePrint = () => {
    if (!didGenerate) {
      handleGenerate();
      window.setTimeout(() => window.print(), 80);
      return;
    }
    window.print();
  };

  return (
    <div className="load-balancer-page">
      <div className="load-calculator__no-print">
        <TitleBar />
      </div>

      <div className="load-calculator-page">
        <div className="load-calculator-grid">
          <section className="calc-section load-inputs load-calculator__no-print">
            <h2>Trailer Load Optimizer</h2>

            <div className="field-group">
              <label>Trailer Size</label>
              <select value={trailerType} onChange={(e) => setTrailerType(e.target.value as TrailerType)}>
                <option value="53ft">53-foot trailer</option>
                <option value="48ft">48-foot trailer</option>
              </select>
            </div>

            <div className="field-group">
              <label>Number of Pallets</label>
              <input
                type="number"
                min={1}
                value={palletCountInput}
                onChange={(e) => {
                  const next = e.target.value;
                  if (/^\d*$/.test(next)) {
                    setPalletCountInput(next === '' ? '1' : next);
                    const count = Math.max(1, parseInt(next || '1', 10));
                    if (individualCasesPerPallet.length < count) {
                      const grown = [...individualCasesPerPallet];
                      while (grown.length < count) grown.push(Math.max(1, parseInt(casesPerPalletInput, 10) || 1));
                      setIndividualCasesPerPallet(grown);
                    }
                    if (individualLoadedWeights.length < count) {
                      const grown = [...individualLoadedWeights];
                      while (grown.length < count) grown.push(2800);
                      setIndividualLoadedWeights(grown);
                    }
                  }
                }}
              />
            </div>

            <div className="field-group">
              <label>Weight-Entry Method</label>
              <select value={weightEntryMethod} onChange={(e) => setWeightEntryMethod(e.target.value as WeightEntryMethod)}>
                <option value="same_case_count">Same case weight and case count (recommended)</option>
                <option value="individual_cases">Individual cases per pallet</option>
                <option value="individual_loaded">Individual loaded pallet weights</option>
                <option value="total_shipment_product">Total shipment product weight</option>
              </select>
            </div>

            <div className="inline-grid two-col">
              <div className="field-group">
                <label>Case Weight Unit</label>
                <select value={caseWeightUnit} onChange={(e) => setCaseWeightUnit(e.target.value as CaseWeightUnit)}>
                  <option value="kg">KG</option>
                  <option value="lb">LB</option>
                </select>
              </div>
              <div className="field-group">
                <label>Case Weight</label>
                <input
                  type="number"
                  min={0}
                  value={caseWeightInput}
                  onChange={(e) => setCaseWeightInput(e.target.value)}
                />
              </div>
            </div>

            <div className="field-group">
              <label>Cases Per Pallet</label>
              <input
                type="number"
                min={1}
                value={casesPerPalletInput}
                onChange={(e) => setCasesPerPalletInput(e.target.value)}
              />
            </div>

            <div className="diag-line">Quick flow: Trailer size, pallets, case weight, cases per pallet, and pallet type.</div>

            {summaryMetrics.caseWeightOutOfNormalRange && (
              <div className="warning-banner warning-banner--amber compact">
                CASE WEIGHT IS OUTSIDE THE NORMAL 13-20 KG RANGE. VERIFY THE ENTERED VALUE.
              </div>
            )}

            <div className="field-group">
              <label>Pallet Type</label>
              <select value={palletType} onChange={(e) => setPalletType(e.target.value as PalletType)}>
                <option value="standard">Standard 48 x 40 pallet - {standardPalletWeight} lb</option>
                <option value="chep">CHEP 48 x 40 pallet - {chepPalletWeight} lb</option>
                <option value="custom">Custom pallet weight</option>
              </select>
            </div>

            {palletType === 'custom' && (
              <div className="field-group">
                <label>Custom Pallet Weight</label>
                <input
                  type="number"
                  min={0}
                  value={customPalletWeight}
                  onChange={(e) => setCustomPalletWeight(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
            )}

            <h3>Available Securement</h3>
            <label className="checkbox-row">
              <input type="checkbox" checked={airbagsAvailable} onChange={(e) => setAirbagsAvailable(e.target.checked)} />
              Airbags
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={blockingAvailable} onChange={(e) => setBlockingAvailable(e.target.checked)} />
              Approved blocking
            </label>

            <details className="calc-section" style={{ marginTop: 8 }}>
              <summary>Optional Individual Pallet Details</summary>

              <label className="checkbox-row" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={enteredWeightIncludesPallet}
                  onChange={(e) => setEnteredWeightIncludesPallet(e.target.checked)}
                />
                Entered weight already includes physical pallet
              </label>

              {weightEntryMethod === 'individual_cases' && (
                <div className="individual-list" style={{ marginTop: 8 }}>
                  {Array.from({ length: visiblePalletCount }).map((_, idx) => (
                    <div key={`case-${idx}`} className="field-group inline-row">
                      <label>{makePalletLabel(idx + 1)} cases</label>
                      <input
                        type="number"
                        min={1}
                        value={individualCasesPerPallet[idx] ?? 0}
                        onChange={(e) => {
                          const next = [...individualCasesPerPallet];
                          next[idx] = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setIndividualCasesPerPallet(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {weightEntryMethod === 'individual_loaded' && (
                <div className="individual-list" style={{ marginTop: 8 }}>
                  {Array.from({ length: visiblePalletCount }).map((_, idx) => (
                    <div key={`loaded-${idx}`} className="field-group inline-row">
                      <label>{makePalletLabel(idx + 1)} loaded weight (lb)</label>
                      <input
                        type="number"
                        min={1}
                        value={individualLoadedWeights[idx] ?? 0}
                        onChange={(e) => {
                          const next = [...individualLoadedWeights];
                          next[idx] = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setIndividualLoadedWeights(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {weightEntryMethod === 'total_shipment_product' && (
                <div className="inline-grid two-col" style={{ marginTop: 8 }}>
                  <div className="field-group">
                    <label>Total Shipment Product Weight</label>
                    <input
                      type="number"
                      min={1}
                      value={totalShipmentProductWeightInput}
                      onChange={(e) => setTotalShipmentProductWeightInput(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label>Total Shipment Unit</label>
                    <select
                      value={totalShipmentProductUnit}
                      onChange={(e) => setTotalShipmentProductUnit(e.target.value as CaseWeightUnit)}
                    >
                      <option value="kg">KG</option>
                      <option value="lb">LB</option>
                    </select>
                  </div>
                </div>
              )}
            </details>

            <details className="calc-section" style={{ marginTop: 8 }}>
              <summary>Supervisor Settings</summary>
              <h3>Configured Operating Limits</h3>
              <div className="inline-grid two-col">
                <div className="field-group">
                  <label>Steer Axle Operating Limit</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.maxSteerOperatingWeight}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        maxSteerOperatingWeight: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Drive Tandem Limit</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.maxDriveTandemWeight}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        maxDriveTandemWeight: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Trailer Tandem Limit</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.maxTrailerTandemWeight}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        maxTrailerTandemWeight: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Gross Vehicle Weight Limit</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.maxGrossWeight}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        maxGrossWeight: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                  />
                </div>
              </div>

              <h3>Equipment Profile</h3>
              <div className="inline-grid two-col">
                <div className="field-group">
                  <label>Empty Steer Axle Weight</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.emptySteerAxleWeight}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        emptySteerAxleWeight: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Empty Drive Tandem Weight</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.emptyDriveTandemWeight}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        emptyDriveTandemWeight: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Empty Trailer Tandem Weight</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.emptyTrailerTandemWeight}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        emptyTrailerTandemWeight: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Kingpin Position From Trailer Nose (ft)</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.kingpinLocationFtFromNose}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        kingpinLocationFtFromNose: Math.max(0, parseFloat(e.target.value) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Trailer Tandem-Center Position From Nose (ft)</label>
                  <input
                    type="number"
                    min={0}
                    value={supervisorProfile.trailerTandemCenterFtFromNose}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        trailerTandemCenterFtFromNose: Math.max(0, parseFloat(e.target.value) || 0),
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Steer Share Of Kingpin Reaction (0-1)</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step="0.01"
                    value={supervisorProfile.steerShareOfKingpinReaction}
                    onChange={(e) => {
                      const steerShare = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0));
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        steerShareOfKingpinReaction: steerShare,
                        driveShareOfKingpinReaction: Number((1 - steerShare).toFixed(4)),
                      }));
                    }}
                  />
                </div>
                <div className="field-group">
                  <label>Drive Share Of Kingpin Reaction (auto)</label>
                  <input type="number" readOnly value={supervisorProfile.driveShareOfKingpinReaction} />
                </div>
                <div className="field-group">
                  <label>Airbags Required Per Centered Single</label>
                  <select
                    value={supervisorProfile.airbagsPerCenteredSingle}
                    onChange={(e) =>
                      setSupervisorProfile((prev) => ({
                        ...prev,
                        airbagsPerCenteredSingle: Number(e.target.value) === 2 ? 2 : 1,
                      }))
                    }
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </div>
              </div>
            </details>

            <div className="action-row">
              <button type="button" onClick={handleGenerate}>GENERATE LOAD MAP</button>
              <button type="button" className="secondary" onClick={handleReset}>Reset</button>
              <button type="button" onClick={handlePrint}>Print</button>
            </div>
          </section>

          <section className="load-results-area">
            <section className="calc-section">
              <h2>Weight Summary</h2>
              <div className="result-grid">
                <div className="result-card result-card--blue"><span>Number of pallets</span><strong>{summaryMetrics.palletCount}</strong></div>
                <div className="result-card result-card--blue"><span>Total cases</span><strong>{formatWhole(summaryMetrics.totalCases)}</strong></div>
                <div className="result-card result-card--blue"><span>Average case weight</span><strong>{summaryMetrics.averageCaseWeightKg.toFixed(2)} kg</strong></div>
                <div className="result-card result-card--blue"><span>Total product kilograms</span><strong>{formatWhole(summaryMetrics.totalProductKg)} kg</strong></div>
                <div className="result-card result-card--blue"><span>Total product pounds</span><strong>{formatWhole(summaryMetrics.totalProductLb)} lb</strong></div>
                <div className="result-card result-card--blue"><span>Physical pallet weight</span><strong>{formatWhole(summaryMetrics.totalPhysicalPalletWeightLb)} lb</strong></div>
                <div className="result-card result-card--blue"><span>Total cargo weight</span><strong>{formatWhole(summaryMetrics.totalCargoWeightLb)} lb</strong></div>
                <div className="result-card result-card--blue"><span>Estimated tractor/trailer tare</span><strong>{formatWhole(summaryMetrics.tareWeightLb)} lb</strong></div>
                <div className={`result-card ${summaryMetrics.estimatedGrossLb > supervisorProfile.maxGrossWeight ? 'result-card--red' : 'result-card--green'}`}>
                  <span>Estimated gross weight</span><strong>{formatWhole(summaryMetrics.estimatedGrossLb)} lb</strong>
                </div>
              </div>

              {weightEntryMethod === 'individual_cases' && (
                <div className="result-grid" style={{ marginTop: 8 }}>
                  <div className="result-card result-card--blue"><span>Lightest loaded pallet</span><strong>{formatWhole(summaryMetrics.lightestLoadedPalletLb)} lb</strong></div>
                  <div className="result-card result-card--blue"><span>Heaviest loaded pallet</span><strong>{formatWhole(summaryMetrics.heaviestLoadedPalletLb)} lb</strong></div>
                  <div className="result-card result-card--blue"><span>Average loaded pallet weight</span><strong>{formatWhole(summaryMetrics.averageLoadedPalletLb)} lb</strong></div>
                </div>
              )}
            </section>

            <section className="calc-section map-section">
              <h2>Estimated Load Plan</h2>
              <div className={`map-status ${statusClass(primaryStatus)}`}>{primaryStatus}</div>

              {displayedIssueList.length > 0 && (
                <div className="warning-banner warning-banner--amber">
                  {displayedIssueList.map((issue, idx) => (
                    <p key={`${issue}-${idx}`}>{issue}</p>
                  ))}
                </div>
              )}

              <div className="axle-card-grid">
                {axleCards.map((card) => (
                  <div key={card.title} className={`axle-card axle-card--${card.status.tone}`}>
                    <h3>{card.title}</h3>
                    <div className="axle-card__weight">{formatWeight(card.estimated)} / {formatWhole(card.limit)} lb</div>
                    <div className="axle-card__status">{card.status.text}</div>
                  </div>
                ))}
              </div>

              <div className="warning-banner warning-banner--amber compact" style={{ marginTop: 8 }}>
                STEER AXLE OPERATING LIMIT: {formatWhole(supervisorProfile.maxSteerOperatingWeight)} LB
              </div>

              <div className="warning-banner warning-banner--amber compact" style={{ marginTop: 8 }}>
                OPSIQ COMPANY AIRBAG LIMIT - MAXIMUM AIRBAGS PER LOAD: {OPSIQ_MAX_AIRBAGS}
              </div>

              <div className="result-grid" style={{ marginTop: 8 }}>
                <div className="result-card result-card--blue">
                  <span>Centered single rows</span>
                  <strong>{centeredSingleRowCount}</strong>
                </div>
                <div className={`result-card ${airbagsRequired > OPSIQ_MAX_AIRBAGS ? 'result-card--red' : 'result-card--green'}`}>
                  <span>Total airbags required</span>
                  <strong>{airbagsRequired}</strong>
                </div>
                <div className="result-card result-card--blue">
                  <span>Airbags required per centered single</span>
                  <strong>{supervisorProfile.airbagsPerCenteredSingle}</strong>
                </div>
              </div>

              {primaryStatus === 'STEER AXLE OVER LIMIT' && axleEstimate && (
                <div className="warning-banner warning-banner--red" style={{ marginTop: 8 }}>
                  <h3>STEER AXLE OVER OPSIQ OPERATING LIMIT</h3>
                  <p>ESTIMATED: {formatWhole(axleEstimate.estimatedSteer)} LB</p>
                  <p>LIMIT: {formatWhole(supervisorProfile.maxSteerOperatingWeight)} LB</p>
                  <p>SUPERVISOR REVIEW AND CERTIFIED SCALE REQUIRED</p>
                </div>
              )}

              {primaryStatus === 'GROSS WEIGHT OVER LIMIT' && (
                <div className="warning-banner warning-banner--red" style={{ marginTop: 8 }}>
                  <h3>GROSS WEIGHT OVER LIMIT</h3>
                  <p>MOVING PALLETS CANNOT CORRECT EXCESSIVE GROSS WEIGHT</p>
                  <p>REMOVE WEIGHT OR SPLIT THE LOAD</p>
                </div>
              )}

              {primaryStatus === 'AXLE ESTIMATE UNAVAILABLE' && (
                <div className="warning-banner warning-banner--amber" style={{ marginTop: 8 }}>
                  <p>AXLE ESTIMATE UNAVAILABLE</p>
                  <p>CERTIFIED SCALE VERIFICATION REQUIRED</p>
                </div>
              )}

              {!airbagsAvailable && !blockingAvailable && (
                <div className="warning-banner warning-banner--amber" style={{ marginTop: 8 }}>
                  <p>CENTERED SINGLE ROWS REQUIRE APPROVED SECUREMENT.</p>
                </div>
              )}

              <div className="diag-line">{patternNote}</div>

              <div className="map-meta">
                <span>{trailerLayout.label}</span>
                <span>{trailerLayout.rows} rows x {trailerLayout.positionsPerRow} positions</span>
                <span>Row 1 fixed at trailer head</span>
              </div>

              <div className="map-labels">
                <span>Driver Side</span>
                <span>Passenger Side</span>
              </div>

              <div className="map-grid-wrapper">
                <div className="map-nose">Trailer Nose</div>
                <div className="map-grid" style={{ gridTemplateColumns: '120px repeat(2, minmax(110px, 1fr)) 180px' }}>
                  {rows.map((row) => (
                    <React.Fragment key={row.rowNumber}>
                      <div className="row-label">Row {row.rowNumber}</div>

                      {row.layoutType === 'SINGLE_CENTER' && row.centerPallet ? (
                        <div className="map-cell centered" style={{ gridColumn: 'span 2' }}>
                          <span className="centered-side">AIR BAG</span>
                          <div className="centered-main">
                            <div>{row.centerPallet.label}</div>
                            <strong>{formatWhole(row.centerPallet.loadedWeight)} lb</strong>
                            <div>{row.centerPallet.displayText}</div>
                          </div>
                          <span className="centered-side">AIR BAG</span>
                        </div>
                      ) : (
                        <>
                          <div className={`map-cell ${row.driverPallet ? 'filled' : 'empty'}`}>
                            {row.driverPallet ? (
                              <>
                                <div>{row.driverPallet.label}</div>
                                <strong>{formatWhole(row.driverPallet.loadedWeight)} lb</strong>
                                <div>{row.driverPallet.displayText}</div>
                              </>
                            ) : (
                              <span>EMPTY</span>
                            )}
                          </div>
                          <div className={`map-cell ${row.passengerPallet ? 'filled' : 'empty'}`}>
                            {row.passengerPallet ? (
                              <>
                                <div>{row.passengerPallet.label}</div>
                                <strong>{formatWhole(row.passengerPallet.loadedWeight)} lb</strong>
                                <div>{row.passengerPallet.displayText}</div>
                              </>
                            ) : (
                              <span>EMPTY</span>
                            )}
                          </div>
                        </>
                      )}

                      <div className="row-total">
                        {row.layoutType === 'DOUBLE' ? 'DOUBLE' : row.layoutType === 'SINGLE_CENTER' ? 'SINGLE CENTER' : 'EMPTY'}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div className="map-rear">Rear Doors</div>
              </div>

              <section className="pattern-sheet">
                <h3>Trailer Loading Pattern</h3>
                <div className="pattern-sheet__meta">
                  <span>PRODUCT: ESTIMATED LOAD PLAN</span>
                  <span>Qty: {formatWhole(summaryMetrics.totalCases)}</span>
                  <span>Pallets: {summaryMetrics.palletCount}</span>
                </div>
                <table className="pattern-sheet__table">
                  <thead>
                    <tr>
                      <th>Driver Side</th>
                      <th>Center</th>
                      <th>Passenger Side</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const cells = getPatternSheetCells(row);
                      return (
                        <tr key={`sheet-${row.rowNumber}`}>
                          <td>{cells.left}</td>
                          <td>{cells.center}</td>
                          <td>{cells.right}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="pattern-sheet__comment-block">
                  <div className="pattern-sheet__comment-row">
                    <span className="pattern-sheet__comment-label">COMMENTS:</span>
                    <span>CENTERED SINGLE - AIRBAGS REQUIRED ON BOTH SIDES</span>
                  </div>
                  <div className="pattern-sheet__comment-line">***** ESTIMATED LOAD PLAN - CERTIFIED SCALE VERIFICATION REQUIRED *****</div>
                </div>
              </section>

              {unassignedPallets.length > 0 && (
                <div className="unassigned-section">
                  <h3>Unassigned Pallets</h3>
                  <div className="unassigned-list">
                    {unassignedPallets.map((p) => (
                      <div key={p.id} className="unassigned-item">
                        {p.label} - {formatWhole(p.loadedWeight)} lb
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="calc-section">
              <h2>Forklift Loading Sequence</h2>
              <ol className="sequence-list">
                {rows.filter((row) => row.layoutType !== 'EMPTY').length > 0 ? (
                  rows
                    .filter((row) => row.layoutType !== 'EMPTY')
                    .flatMap((row) => {
                      if (row.layoutType === 'SINGLE_CENTER' && row.centerPallet) {
                        return [
                          `Load ${row.centerPallet.label} centered in Row ${row.rowNumber}.`,
                          'Install required company-approved airbag configuration for this centered single.',
                        ];
                      }
                      if (row.layoutType === 'DOUBLE' && row.driverPallet && row.passengerPallet) {
                        return [
                          `Load ${row.driverPallet.label} and ${row.passengerPallet.label} side by side in Row ${row.rowNumber}.`,
                        ];
                      }
                      return [];
                    })
                    .map((line, idx) => <li key={`seq-${idx}`}>{line}</li>)
                ) : (
                  <li>Generate load map to view instructions.</li>
                )}
              </ol>
            </section>

            <section className="calc-section safety-section">
              <p>{CERTIFIED_SCALE_NOTICE}</p>
            </section>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LoadBalancer;
