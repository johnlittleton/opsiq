export const KG_TO_LB = 2.2046226218;
export const OPSIQ_MAX_AIRBAGS = 6;

export type CaseWeightUnit = 'kg' | 'lb';
export type WeightEntryMethod =
  | 'same_case_count'
  | 'individual_cases'
  | 'individual_loaded'
  | 'total_shipment_product';

export type PatternRowType = 'SINGLE_CENTER' | 'DOUBLE' | 'EMPTY';

export type PatternRow<TPallet> = {
  rowNumber: number;
  layoutType: PatternRowType;
  centerPallet: TPallet | null;
  driverPallet: TPallet | null;
  passengerPallet: TPallet | null;
};

export type SupervisorProfile = {
  emptySteerAxleWeight: number;
  emptyDriveTandemWeight: number;
  emptyTrailerTandemWeight: number;
  kingpinLocationFtFromNose: number;
  trailerTandemCenterFtFromNose: number;
  steerShareOfKingpinReaction: number;
  driveShareOfKingpinReaction: number;
  maxSteerOperatingWeight: number;
  maxDriveTandemWeight: number;
  maxTrailerTandemWeight: number;
  maxGrossWeight: number;
  airbagsPerCenteredSingle: 1 | 2;
};

export type AxleEstimate = {
  estimatedSteer: number;
  estimatedDrive: number;
  estimatedTrailerTandem: number;
  estimatedGross: number;
};

export type AxleCardTone = 'green' | 'yellow' | 'red' | 'gray';

export type AxleCardStatus = {
  tone: AxleCardTone;
  text: 'OK' | 'NEAR LIMIT' | 'OVER LIMIT' | 'UNAVAILABLE';
};

export type PrimaryStatus =
  | 'LOAD MAP READY'
  | 'AIRBAG LIMIT EXCEEDED'
  | 'STEER AXLE OVER LIMIT'
  | 'DRIVE TANDEM OVER LIMIT'
  | 'TRAILER TANDEM OVER LIMIT'
  | 'GROSS WEIGHT OVER LIMIT'
  | 'TRAILER PATTERN CAPACITY EXCEEDED'
  | 'AXLE ESTIMATE UNAVAILABLE'
  | 'INPUT INCOMPLETE';

export type StatusInputs = {
  inputIncomplete: boolean;
  grossOver: boolean;
  patternCapacityExceeded: boolean;
  airbagLimitExceeded: boolean;
  driveOver: boolean;
  trailerOver: boolean;
  steerOver: boolean;
  axleEstimateUnavailable: boolean;
};

export type WeightCalculationInput = {
  palletCount: number;
  weightEntryMethod: WeightEntryMethod;
  caseWeight: number;
  caseWeightUnit: CaseWeightUnit;
  defaultCasesPerPallet: number;
  individualCasesPerPallet: number[];
  individualLoadedPalletWeights: number[];
  totalShipmentProductWeight: number;
  totalShipmentProductWeightUnit: CaseWeightUnit;
  physicalPalletWeightLb: number;
  enteredWeightIncludesPallet: boolean;
};

export type WeightCalculationResult = {
  productWeightsLb: number[];
  loadedWeightsLb: number[];
  totalCases: number;
  averageCaseWeightKg: number;
  totalProductKg: number;
  totalProductLb: number;
  caseWeightOutOfNormalRange: boolean;
  lightestLoadedPalletLb: number;
  heaviestLoadedPalletLb: number;
  averageLoadedPalletLb: number;
  inputErrors: string[];
};

export function kgToLb(kg: number): number {
  return kg * KG_TO_LB;
}

export function lbToKg(lb: number): number {
  return lb / KG_TO_LB;
}

export function normalizeCaseWeightToKg(value: number, unit: CaseWeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value);
}

export function buildWeights(input: WeightCalculationInput): WeightCalculationResult {
  const {
    palletCount,
    weightEntryMethod,
    caseWeight,
    caseWeightUnit,
    defaultCasesPerPallet,
    individualCasesPerPallet,
    individualLoadedPalletWeights,
    totalShipmentProductWeight,
    totalShipmentProductWeightUnit,
    physicalPalletWeightLb,
    enteredWeightIncludesPallet,
  } = input;

  const inputErrors: string[] = [];
  if (!Number.isInteger(palletCount) || palletCount <= 0) {
    inputErrors.push('palletCount must be a positive whole number');
  }

  if (!(caseWeight > 0)) {
    inputErrors.push('caseWeight must be greater than zero');
  }

  if (!Number.isInteger(defaultCasesPerPallet) || defaultCasesPerPallet <= 0) {
    inputErrors.push('casesPerPallet must be a positive whole number');
  }

  const caseWeightKg = normalizeCaseWeightToKg(caseWeight, caseWeightUnit);
  const caseWeightOutOfNormalRange = caseWeightKg < 13 || caseWeightKg > 20;

  const productWeightsLb: number[] = [];
  const loadedWeightsLb: number[] = [];
  let totalCases = 0;

  if (weightEntryMethod === 'same_case_count') {
    for (let i = 0; i < palletCount; i += 1) {
      const productLb = kgToLb(caseWeightKg * defaultCasesPerPallet);
      const loadedLb = enteredWeightIncludesPallet ? productLb : productLb + physicalPalletWeightLb;
      productWeightsLb.push(productLb);
      loadedWeightsLb.push(loadedLb);
      totalCases += defaultCasesPerPallet;
    }
  }

  if (weightEntryMethod === 'individual_cases') {
    for (let i = 0; i < palletCount; i += 1) {
      const cases = Math.floor(individualCasesPerPallet[i] ?? 0);
      if (cases <= 0) {
        inputErrors.push(`P-${String(i + 1).padStart(2, '0')} cases must be a positive whole number`);
      }
      const safeCases = Math.max(0, cases);
      const productLb = kgToLb(caseWeightKg * safeCases);
      const loadedLb = enteredWeightIncludesPallet ? productLb : productLb + physicalPalletWeightLb;
      productWeightsLb.push(productLb);
      loadedWeightsLb.push(loadedLb);
      totalCases += safeCases;
    }
  }

  if (weightEntryMethod === 'individual_loaded') {
    for (let i = 0; i < palletCount; i += 1) {
      const enteredLoaded = Number(individualLoadedPalletWeights[i] ?? 0);
      if (!(enteredLoaded > 0)) {
        inputErrors.push(`P-${String(i + 1).padStart(2, '0')} loaded pallet weight must be greater than zero`);
      }
      const safeLoaded = Math.max(0, enteredLoaded);
      const loadedLb = enteredWeightIncludesPallet ? safeLoaded : safeLoaded + physicalPalletWeightLb;
      const productLb = enteredWeightIncludesPallet
        ? Math.max(0, safeLoaded - physicalPalletWeightLb)
        : safeLoaded;
      productWeightsLb.push(productLb);
      loadedWeightsLb.push(loadedLb);
    }

    const totalProductLbFromLoaded = productWeightsLb.reduce((sum, x) => sum + x, 0);
    totalCases = caseWeightKg > 0 ? Math.round(lbToKg(totalProductLbFromLoaded) / caseWeightKg) : 0;
  }

  if (weightEntryMethod === 'total_shipment_product') {
    if (!(totalShipmentProductWeight > 0)) {
      inputErrors.push('total shipment product weight must be greater than zero');
    }

    const totalProductKg = normalizeCaseWeightToKg(totalShipmentProductWeight, totalShipmentProductWeightUnit);
    const eachProductLb = palletCount > 0 ? kgToLb(totalProductKg / palletCount) : 0;

    for (let i = 0; i < palletCount; i += 1) {
      const loadedLb = enteredWeightIncludesPallet ? eachProductLb : eachProductLb + physicalPalletWeightLb;
      productWeightsLb.push(eachProductLb);
      loadedWeightsLb.push(loadedLb);
    }

    totalCases = caseWeightKg > 0 ? Math.round(totalProductKg / caseWeightKg) : 0;
  }

  const totalProductLb = productWeightsLb.reduce((sum, x) => sum + x, 0);
  const totalProductKg = lbToKg(totalProductLb);
  const averageCaseWeightKg = caseWeightKg;
  const lightestLoadedPalletLb = loadedWeightsLb.length > 0 ? Math.min(...loadedWeightsLb) : 0;
  const heaviestLoadedPalletLb = loadedWeightsLb.length > 0 ? Math.max(...loadedWeightsLb) : 0;
  const averageLoadedPalletLb = loadedWeightsLb.length > 0 ? loadedWeightsLb.reduce((s, x) => s + x, 0) / loadedWeightsLb.length : 0;

  return {
    productWeightsLb,
    loadedWeightsLb,
    totalCases,
    averageCaseWeightKg,
    totalProductKg,
    totalProductLb,
    caseWeightOutOfNormalRange,
    lightestLoadedPalletLb,
    heaviestLoadedPalletLb,
    averageLoadedPalletLb,
    inputErrors,
  };
}

export function buildNoseFirstAlternatingPattern<TPallet extends { id: number }>(
  pallets: TPallet[],
  trailerRows: number
): {
  rows: PatternRow<TPallet>[];
  unassigned: TPallet[];
  centeredSingleRowCount: number;
} {
  const rows: PatternRow<TPallet>[] = [];
  let index = 0;
  let centeredSingleRowCount = 0;

  for (let rowNumber = 1; rowNumber <= trailerRows; rowNumber += 1) {
    if (index >= pallets.length) {
      rows.push({
        rowNumber,
        layoutType: 'EMPTY',
        centerPallet: null,
        driverPallet: null,
        passengerPallet: null,
      });
      continue;
    }

    const oddRow = rowNumber % 2 === 1;

    if (oddRow) {
      rows.push({
        rowNumber,
        layoutType: 'SINGLE_CENTER',
        centerPallet: pallets[index],
        driverPallet: null,
        passengerPallet: null,
      });
      centeredSingleRowCount += 1;
      index += 1;
      continue;
    }

    if (index + 1 < pallets.length) {
      rows.push({
        rowNumber,
        layoutType: 'DOUBLE',
        centerPallet: null,
        driverPallet: pallets[index],
        passengerPallet: pallets[index + 1],
      });
      index += 2;
      continue;
    }

    rows.push({
      rowNumber,
      layoutType: 'SINGLE_CENTER',
      centerPallet: pallets[index],
      driverPallet: null,
      passengerPallet: null,
    });
    centeredSingleRowCount += 1;
    index += 1;
  }

  return {
    rows,
    unassigned: pallets.slice(index),
    centeredSingleRowCount,
  };
}

export function countRequiredAirbags(centeredSingleRowCount: number, airbagsPerCenteredSingle: 1 | 2): number {
  return centeredSingleRowCount * airbagsPerCenteredSingle;
}

export function validatePatternIntegrity<TPallet extends { id: number }>(
  rows: PatternRow<TPallet>[],
  expectedPalletCount: number
): {
  rowOneOccupied: boolean;
  noInternalEmptyRows: boolean;
  mappedCountMatches: boolean;
  duplicateIds: number;
} {
  const rowOneOccupied = rows[0]?.layoutType !== 'EMPTY';
  const occupiedRows = rows.filter((r) => r.layoutType !== 'EMPTY');
  const lastOccupiedRow = occupiedRows.length > 0 ? occupiedRows[occupiedRows.length - 1].rowNumber : 0;
  const noInternalEmptyRows = rows
    .filter((r) => r.rowNumber <= lastOccupiedRow)
    .every((r) => r.layoutType !== 'EMPTY');

  const mappedIds = rows.flatMap((row) => {
    const ids: number[] = [];
    if (row.centerPallet) ids.push(row.centerPallet.id);
    if (row.driverPallet) ids.push(row.driverPallet.id);
    if (row.passengerPallet) ids.push(row.passengerPallet.id);
    return ids;
  });

  const unique = new Set(mappedIds);
  const duplicateIds = mappedIds.length - unique.size;
  const mappedCountMatches = unique.size === expectedPalletCount;

  return {
    rowOneOccupied,
    noInternalEmptyRows,
    mappedCountMatches,
    duplicateIds,
  };
}

export function isSupervisorProfileComplete(profile: SupervisorProfile): boolean {
  const numericValues = [
    profile.emptySteerAxleWeight,
    profile.emptyDriveTandemWeight,
    profile.emptyTrailerTandemWeight,
    profile.kingpinLocationFtFromNose,
    profile.trailerTandemCenterFtFromNose,
    profile.steerShareOfKingpinReaction,
    profile.driveShareOfKingpinReaction,
    profile.maxSteerOperatingWeight,
    profile.maxDriveTandemWeight,
    profile.maxTrailerTandemWeight,
    profile.maxGrossWeight,
    profile.airbagsPerCenteredSingle,
  ];

  if (numericValues.some((v) => !Number.isFinite(v) || v <= 0)) return false;
  if (profile.trailerTandemCenterFtFromNose <= profile.kingpinLocationFtFromNose) return false;

  const shareSum = profile.steerShareOfKingpinReaction + profile.driveShareOfKingpinReaction;
  if (Math.abs(shareSum - 1) > 0.0001) return false;

  return profile.airbagsPerCenteredSingle === 1 || profile.airbagsPerCenteredSingle === 2;
}

export function estimateAxles<TPallet extends { loadedWeight: number }>(
  rows: PatternRow<TPallet>[],
  trailerLengthFt: number,
  trailerRows: number,
  profile: SupervisorProfile
): AxleEstimate {
  const rowLengthFt = trailerLengthFt / trailerRows;
  const span = profile.trailerTandemCenterFtFromNose - profile.kingpinLocationFtFromNose;

  let totalCargoWeight = 0;
  let trailerTandemCargoReaction = 0;

  for (const row of rows) {
    if (row.layoutType === 'EMPTY') continue;
    const rowCenterFt = (row.rowNumber - 0.5) * rowLengthFt;

    const rowPallets = [row.centerPallet, row.driverPallet, row.passengerPallet].filter(
      (pallet): pallet is TPallet => Boolean(pallet)
    );

    for (const pallet of rowPallets) {
      totalCargoWeight += pallet.loadedWeight;
      trailerTandemCargoReaction +=
        (pallet.loadedWeight * (rowCenterFt - profile.kingpinLocationFtFromNose)) / span;
    }
  }

  const kingpinCargoReaction = totalCargoWeight - trailerTandemCargoReaction;

  const estimatedTrailerTandem = profile.emptyTrailerTandemWeight + trailerTandemCargoReaction;
  const estimatedSteer = profile.emptySteerAxleWeight + kingpinCargoReaction * profile.steerShareOfKingpinReaction;
  const estimatedDrive = profile.emptyDriveTandemWeight + kingpinCargoReaction * profile.driveShareOfKingpinReaction;
  const estimatedGross =
    profile.emptySteerAxleWeight + profile.emptyDriveTandemWeight + profile.emptyTrailerTandemWeight + totalCargoWeight;

  return {
    estimatedSteer,
    estimatedDrive,
    estimatedTrailerTandem,
    estimatedGross,
  };
}

export function getAxleCardStatus(estimated: number | null, limit: number): AxleCardStatus {
  if (estimated === null || !Number.isFinite(estimated)) {
    return { tone: 'gray', text: 'UNAVAILABLE' };
  }

  if (estimated > limit) {
    return { tone: 'red', text: 'OVER LIMIT' };
  }

  if (limit - estimated <= 1500) {
    return { tone: 'yellow', text: 'NEAR LIMIT' };
  }

  return { tone: 'green', text: 'OK' };
}

export function resolvePrimaryStatus(inputs: StatusInputs): {
  primary: PrimaryStatus;
  secondary: string[];
} {
  if (inputs.inputIncomplete) {
    return { primary: 'INPUT INCOMPLETE', secondary: [] };
  }

  const issues: PrimaryStatus[] = [];
  if (inputs.grossOver) issues.push('GROSS WEIGHT OVER LIMIT');
  if (inputs.patternCapacityExceeded) issues.push('TRAILER PATTERN CAPACITY EXCEEDED');
  if (inputs.airbagLimitExceeded) issues.push('AIRBAG LIMIT EXCEEDED');
  if (inputs.driveOver) issues.push('DRIVE TANDEM OVER LIMIT');
  if (inputs.trailerOver) issues.push('TRAILER TANDEM OVER LIMIT');
  if (inputs.steerOver) issues.push('STEER AXLE OVER LIMIT');
  if (inputs.axleEstimateUnavailable) issues.push('AXLE ESTIMATE UNAVAILABLE');

  if (issues.length === 0) {
    return { primary: 'LOAD MAP READY', secondary: [] };
  }

  const primary = issues[0];
  const secondary = issues.slice(1).map((issue) => issue);
  return { primary, secondary };
}
