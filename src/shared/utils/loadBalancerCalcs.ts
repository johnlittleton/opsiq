/**
 * Load balancing calculations and algorithms
 */

import { TrailerSpec, TRUCK_SPECS, PALLET_SPECS } from '../constants/truckSpecs';
import {
  PalletPosition,
  WeightDistribution,
  LoadPlan,
  LoadAnalysis,
} from '../types/loadBalancer';

const PALLET_LENGTH_FEET = 4; // Standard pallet is ~48" long = 4 feet
const PALLET_WIDTH_FEET = 3.33; // Standard pallet is ~40" wide = 3.33 feet
const LOAD_DISTRIBUTION_START_OFFSET = 1; // Start loading 1 ft from front of trailer

function resolvePalletWeight(
  palletType: 'standard' | 'chep',
  palletWeightOverride?: number
): number {
  if (typeof palletWeightOverride === 'number' && palletWeightOverride > 0) {
    return palletWeightOverride;
  }

  return PALLET_SPECS[palletType].weight;
}

/**
 * Calculate weight distribution across axles
 * Using basic statics: moment = force × distance
 */
export function calculateWeightDistribution(
  trailerSpec: TrailerSpec,
  positions: PalletPosition[]
): WeightDistribution {
  if (positions.length === 0) {
    return {
      steeringAxle: 0,
      driveAxle: 0,
      trailerAxles: 0,
      totalWeight: 0,
    };
  }

  const totalLoadWeight = positions.reduce((sum, pos) => sum + pos.weight, 0);
  const totalWeight = totalLoadWeight + trailerSpec.tareWeight;

  // Calculate center of gravity using moments
  let totalMoment = 0;
  positions.forEach((pos) => {
    totalMoment += pos.weight * pos.positionFromFront;
  });

  // Add trailer tare weight moment (distributed evenly between drive and trailer axles)
  const taredMoment = (trailerSpec.tareWeight / 2) * ((trailerSpec.driveAxlePos + trailerSpec.trailerAxlePos) / 2);
  totalMoment += taredMoment;

  const cgPosition = totalMoment / totalWeight;

  // Calculate axle weights using lever principle
  const wheelbaseLength = trailerSpec.wheelbaseLength;
  const driveToTrailerDist = trailerSpec.trailerAxlePos - trailerSpec.driveAxlePos;

  // Distance from CG to each axle
  const cgToDriveAxle = cgPosition - trailerSpec.driveAxlePos;
  const cgToTrailerAxle = trailerSpec.trailerAxlePos - cgPosition;

  // Drive axle carries portion based on distance to trailer axle
  let driveAxleWeight = (totalWeight * cgToTrailerAxle) / driveToTrailerDist;

  // Trailer axles carry the rest
  let trailerAxleWeight = totalWeight - driveAxleWeight;

  // Steering axle carries a small percentage of tare weight (~10%)
  const steeringAxleWeight = trailerSpec.tareWeight * 0.1;
  driveAxleWeight -= steeringAxleWeight;

  // Ensure we don't go negative
  driveAxleWeight = Math.max(0, driveAxleWeight);
  trailerAxleWeight = Math.max(0, trailerAxleWeight);

  return {
    steeringAxle: Math.round(steeringAxleWeight),
    driveAxle: Math.round(driveAxleWeight),
    trailerAxles: Math.round(trailerAxleWeight),
    totalWeight: Math.round(totalWeight),
  };
}

/**
 * Validate load against DOT regulations
 */
export function validateLoad(
  trailerSpec: TrailerSpec,
  distribution: WeightDistribution
): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (distribution.steeringAxle > trailerSpec.limits.steeringAxle) {
    violations.push(
      `Steering axle overweight: ${distribution.steeringAxle} lbs (max: ${trailerSpec.limits.steeringAxle} lbs)`
    );
  }

  if (distribution.driveAxle > trailerSpec.limits.driveAxle) {
    violations.push(
      `Drive axle overweight: ${distribution.driveAxle} lbs (max: ${trailerSpec.limits.driveAxle} lbs)`
    );
  }

  if (distribution.trailerAxles > trailerSpec.limits.trailerAxles) {
    violations.push(
      `Trailer axles overweight: ${distribution.trailerAxles} lbs (max: ${trailerSpec.limits.trailerAxles} lbs)`
    );
  }

  if (distribution.totalWeight > trailerSpec.limits.gvwr) {
    violations.push(
      `Gross weight overweight: ${distribution.totalWeight} lbs (max: ${trailerSpec.limits.gvwr} lbs)`
    );
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Generate optimal load plan (center of gravity as close to center as possible)
 */
export function generateOptimalLoadPlan(
  trailerSpec: TrailerSpec,
  totalPallets: number,
  palletType: 'standard' | 'chep',
  palletWeightOverride?: number
): LoadPlan {
  const palletWeight = resolvePalletWeight(palletType, palletWeightOverride);
  const positions: PalletPosition[] = [];

  // Calculate total space needed
  const trailingLength = trailerSpec.trailerLength;
  const availableFeet = trailingLength - LOAD_DISTRIBUTION_START_OFFSET;
  const palletsFitWidthwise = Math.floor(trailerSpec.trailerLength / PALLET_WIDTH_FEET);

  // Try to center the load
  const centerPos = LOAD_DISTRIBUTION_START_OFFSET + availableFeet / 2;
  const palletSpacingStart = centerPos - (totalPallets * PALLET_LENGTH_FEET) / 2;

  for (let i = 0; i < totalPallets; i++) {
    const position = palletSpacingStart + i * PALLET_LENGTH_FEET;

    // Validate position is within trailer bounds
    if (position >= LOAD_DISTRIBUTION_START_OFFSET && position + PALLET_LENGTH_FEET <= trailingLength) {
      positions.push({
        index: i,
        positionFromFront: position,
        weight: palletWeight,
        palletType,
        palletCount: 1,
      });
    }
  }

  const distribution = calculateWeightDistribution(trailerSpec, positions);
  const validation = validateLoad(trailerSpec, distribution);

  return {
    id: `plan-optimal-${Date.now()}`,
    totalPallets: positions.length,
    positions,
    weightDistribution: distribution,
    isValid: validation.isValid,
    violations: validation.violations,
    notes: 'Optimized for balanced center of gravity',
  };
}

/**
 * Generate front-heavy load plan (pallets toward front)
 */
export function generateFrontHeavyLoadPlan(
  trailerSpec: TrailerSpec,
  totalPallets: number,
  palletType: 'standard' | 'chep',
  palletWeightOverride?: number
): LoadPlan {
  const palletWeight = resolvePalletWeight(palletType, palletWeightOverride);
  const positions: PalletPosition[] = [];

  for (let i = 0; i < totalPallets; i++) {
    const position = LOAD_DISTRIBUTION_START_OFFSET + i * PALLET_LENGTH_FEET;

    if (position + PALLET_LENGTH_FEET <= trailerSpec.trailerLength) {
      positions.push({
        index: i,
        positionFromFront: position,
        weight: palletWeight,
        palletType,
        palletCount: 1,
      });
    }
  }

  const distribution = calculateWeightDistribution(trailerSpec, positions);
  const validation = validateLoad(trailerSpec, distribution);

  return {
    id: `plan-front-${Date.now()}`,
    totalPallets: positions.length,
    positions,
    weightDistribution: distribution,
    isValid: validation.isValid,
    violations: validation.violations,
    notes: 'Front-heavy arrangement',
  };
}

/**
 * Generate rear-heavy load plan (pallets toward rear)
 */
export function generateRearHeavyLoadPlan(
  trailerSpec: TrailerSpec,
  totalPallets: number,
  palletType: 'standard' | 'chep',
  palletWeightOverride?: number
): LoadPlan {
  const palletWeight = resolvePalletWeight(palletType, palletWeightOverride);
  const positions: PalletPosition[] = [];

  for (let i = totalPallets - 1; i >= 0; i--) {
    const position =
      trailerSpec.trailerLength - PALLET_LENGTH_FEET - (totalPallets - 1 - i) * PALLET_LENGTH_FEET;

    if (position >= LOAD_DISTRIBUTION_START_OFFSET) {
      positions.push({
        index: i,
        positionFromFront: position,
        weight: palletWeight,
        palletType,
        palletCount: 1,
      });
    }
  }

  // Reverse to get proper order
  positions.reverse();

  const distribution = calculateWeightDistribution(trailerSpec, positions);
  const validation = validateLoad(trailerSpec, distribution);

  return {
    id: `plan-rear-${Date.now()}`,
    totalPallets: positions.length,
    positions,
    weightDistribution: distribution,
    isValid: validation.isValid,
    violations: validation.violations,
    notes: 'Rear-heavy arrangement',
  };
}

/**
 * Calculate maximum pallets that fit without exceeding DOT limits
 */
export function calculateMaxPallets(
  trailerSpec: TrailerSpec,
  palletType: 'standard' | 'chep',
  palletWeightOverride?: number
): number {
  const palletWeight = resolvePalletWeight(palletType, palletWeightOverride);
  const availableSpace = (trailerSpec.trailerLength - LOAD_DISTRIBUTION_START_OFFSET) / PALLET_LENGTH_FEET;

  let maxBySpace = Math.floor(availableSpace);
  const payloadCapacity = Math.max(0, trailerSpec.limits.gvwr - trailerSpec.tareWeight);
  let maxByWeight = Math.floor(payloadCapacity / palletWeight);

  // Test to find actual max considering weight distribution
  let foundMax = 0;
  for (let test = 1; test <= Math.min(maxBySpace, maxByWeight); test++) {
    const plan = generateOptimalLoadPlan(trailerSpec, test, palletType, palletWeightOverride);
    if (plan.isValid) {
      foundMax = test;
    } else {
      break;
    }
  }

  return foundMax;
}

/**
 * Analyze a load request and generate multiple load plans
 */
export function analyzeLoad(
  trailerTypeId: string,
  requestedPallets: number,
  palletType: 'standard' | 'chep',
  palletWeightOverride?: number
): LoadAnalysis {
  const trailerSpec = TRUCK_SPECS[trailerTypeId];

  if (!trailerSpec) {
    throw new Error(`Unknown trailer type: ${trailerTypeId}`);
  }

  const maxPallets = calculateMaxPallets(trailerSpec, palletType, palletWeightOverride);
  const canFitAll = requestedPallets <= maxPallets;

  // Generate plans
  const optimalPlan = generateOptimalLoadPlan(
    trailerSpec,
    requestedPallets,
    palletType,
    palletWeightOverride
  );

  const alternativePlans: LoadPlan[] = [];

  alternativePlans.push(generateFrontHeavyLoadPlan(trailerSpec, requestedPallets, palletType, palletWeightOverride));
  alternativePlans.push(generateRearHeavyLoadPlan(trailerSpec, requestedPallets, palletType, palletWeightOverride));

  const optimalDistribution = optimalPlan.weightDistribution;
  const optimalValidation = validateLoad(trailerSpec, optimalDistribution);

  return {
    canFitAll,
    maxPallets,
    optimalPlan,
    alternativePlans,
    violations: {
      steeringAxle: optimalValidation.violations.some((v) => v.includes('Steering axle')),
      driveAxle: optimalValidation.violations.some((v) => v.includes('Drive axle')),
      trailerAxles: optimalValidation.violations.some((v) => v.includes('Trailer axles')),
      gvwr: optimalValidation.violations.some((v) => v.includes('Gross weight')),
    },
  };
}
