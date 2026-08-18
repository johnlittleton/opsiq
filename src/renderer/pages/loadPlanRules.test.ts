import assert from 'node:assert/strict';
import {
  OPSIQ_MAX_AIRBAGS,
  buildNoseFirstAlternatingPattern,
  buildWeights,
  countRequiredAirbags,
  getAxleCardStatus,
  kgToLb,
  resolvePrimaryStatus,
  type SupervisorProfile,
} from './loadPlanRules';

type MockPallet = { id: number; loadedWeight: number };

function approx(actual: number, expected: number, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

(function caseConversionTests() {
  approx(kgToLb(13), 28.6600940834, 0.000001);
  approx(kgToLb(18), 39.6832071924, 0.000001);
  approx(kgToLb(20), 44.092452436, 0.000001);
})();

(function palletCalculationTests() {
  const commonInput = {
    palletCount: 1,
    weightEntryMethod: 'same_case_count' as const,
    caseWeight: 18,
    caseWeightUnit: 'kg' as const,
    defaultCasesPerPallet: 72,
    individualCasesPerPallet: [],
    individualLoadedPalletWeights: [],
    totalShipmentProductWeight: 0,
    totalShipmentProductWeightUnit: 'kg' as const,
    enteredWeightIncludesPallet: false,
  };

  const standard = buildWeights({ ...commonInput, physicalPalletWeightLb: 40 });
  approx(standard.productWeightsLb[0], 2857.1909178528, 0.0001);
  approx(standard.loadedWeightsLb[0], 2897.1909178528, 0.0001);

  const chep = buildWeights({ ...commonInput, physicalPalletWeightLb: 60 });
  approx(chep.loadedWeightsLb[0], 2917.1909178528, 0.0001);

  const includesPallet = buildWeights({
    ...commonInput,
    weightEntryMethod: 'individual_loaded' as const,
    individualLoadedPalletWeights: [2900],
    enteredWeightIncludesPallet: true,
    physicalPalletWeightLb: 40,
  });
  approx(includesPallet.loadedWeightsLb[0], 2900, 0.0001);
})();

(function patternTests() {
  const makePallets = (count: number): MockPallet[] =>
    Array.from({ length: count }, (_, i) => ({ id: i + 1, loadedWeight: 1000 }));

  const one = buildNoseFirstAlternatingPattern(makePallets(1), 13);
  assert.equal(one.centeredSingleRowCount, 1);
  assert.equal(one.unassigned.length, 0);

  const three = buildNoseFirstAlternatingPattern(makePallets(3), 13);
  assert.equal(three.centeredSingleRowCount, 1);
  assert.equal(three.rows.filter((r) => r.layoutType !== 'EMPTY').length, 2);

  const seven = buildNoseFirstAlternatingPattern(makePallets(7), 13);
  assert.equal(seven.centeredSingleRowCount, 3);
  assert.equal(seven.unassigned.length, 0);

  const thirteen = buildNoseFirstAlternatingPattern(makePallets(13), 13);
  assert.equal(thirteen.centeredSingleRowCount, 5);
  assert.equal(thirteen.unassigned.length, 0);

  const nineteen = buildNoseFirstAlternatingPattern(makePallets(19), 13);
  assert.equal(nineteen.centeredSingleRowCount, 7);
  assert.equal(nineteen.unassigned.length, 0);
})();

(function airbagTests() {
  const airbagsAtOne = countRequiredAirbags(5, 1);
  assert.equal(airbagsAtOne, 5);
  assert.ok(airbagsAtOne <= OPSIQ_MAX_AIRBAGS);

  const airbagsOverAtOne = countRequiredAirbags(7, 1);
  assert.equal(airbagsOverAtOne, 7);
  assert.ok(airbagsOverAtOne > OPSIQ_MAX_AIRBAGS);

  const airbagsAtTwo = countRequiredAirbags(5, 2);
  assert.equal(airbagsAtTwo, 10);
})();

(function axleThresholdStatusTests() {
  const steer11999 = getAxleCardStatus(11999, 12000);
  assert.equal(steer11999.text, 'NEAR LIMIT');

  const steer12000 = getAxleCardStatus(12000, 12000);
  assert.notEqual(steer12000.text, 'OVER LIMIT');

  const steer12001 = getAxleCardStatus(12001, 12000);
  assert.equal(steer12001.text, 'OVER LIMIT');

  const driveOver = resolvePrimaryStatus({
    inputIncomplete: false,
    grossOver: false,
    patternCapacityExceeded: false,
    airbagLimitExceeded: false,
    driveOver: true,
    trailerOver: false,
    steerOver: false,
    axleEstimateUnavailable: false,
  });
  assert.equal(driveOver.primary, 'DRIVE TANDEM OVER LIMIT');

  const trailerOver = resolvePrimaryStatus({
    inputIncomplete: false,
    grossOver: false,
    patternCapacityExceeded: false,
    airbagLimitExceeded: false,
    driveOver: false,
    trailerOver: true,
    steerOver: false,
    axleEstimateUnavailable: false,
  });
  assert.equal(trailerOver.primary, 'TRAILER TANDEM OVER LIMIT');

  const grossOver = resolvePrimaryStatus({
    inputIncomplete: false,
    grossOver: true,
    patternCapacityExceeded: false,
    airbagLimitExceeded: false,
    driveOver: false,
    trailerOver: false,
    steerOver: false,
    axleEstimateUnavailable: false,
  });
  assert.equal(grossOver.primary, 'GROSS WEIGHT OVER LIMIT');
})();

(function profileShapeCheck() {
  const profile: SupervisorProfile = {
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
  assert.equal(profile.steerShareOfKingpinReaction + profile.driveShareOfKingpinReaction, 1);
})();

console.log('loadPlanRules tests passed');
