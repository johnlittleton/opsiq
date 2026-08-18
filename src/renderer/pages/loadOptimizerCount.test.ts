import assert from 'node:assert/strict';
import {
  createPalletObjects,
  pairPallets,
  reconcileMappedPallets,
  summarizeDoubleSingleRows,
  type MappingSlot,
} from './loadOptimizerCount';

const PHYSICAL_SLOTS = 26;

function buildWeights(count: number): number[] {
  return Array.from({ length: count }, () => 3000);
}

function mapSequentially(palletCount: number): {
  pallets: ReturnType<typeof createPalletObjects>;
  slots: MappingSlot[];
} {
  const pallets = createPalletObjects(palletCount, buildWeights(palletCount), 40, false);
  const assignable = pallets.slice(0, PHYSICAL_SLOTS);
  const slots: MappingSlot[] = [];

  assignable.forEach((pallet, idx) => {
    const row = Math.floor(idx / 2) + 1;
    slots.push({ row, palletLabel: pallet.label });
  });

  return { pallets, slots };
}

function runCase(inputCount: number, expected: {
  generated: number;
  mapped: number;
  doubleRows?: number;
  singleRows?: number;
  unassigned: number;
  highestId?: string;
}) {
  const { pallets, slots } = mapSequentially(inputCount);
  const reconciliation = reconcileMappedPallets(inputCount, pallets, slots);
  const rowSummary = summarizeDoubleSingleRows(slots);

  assert.equal(pallets.length, expected.generated, `generated mismatch for ${inputCount}`);
  assert.equal(reconciliation.uniqueMappedPallets, expected.mapped, `mapped mismatch for ${inputCount}`);
  assert.equal(reconciliation.unassignedCount, expected.unassigned, `unassigned mismatch for ${inputCount}`);
  assert.equal(reconciliation.duplicateCount, 0, `duplicates found for ${inputCount}`);

  if (typeof expected.doubleRows === 'number') {
    assert.equal(rowSummary.doubleRows, expected.doubleRows, `double rows mismatch for ${inputCount}`);
  }

  if (typeof expected.singleRows === 'number') {
    assert.equal(rowSummary.singleRows, expected.singleRows, `single rows mismatch for ${inputCount}`);
  }

  if (expected.highestId) {
    assert.equal(pallets[pallets.length - 1]?.label, expected.highestId, `highest id mismatch for ${inputCount}`);
  }
}

(function testPairingBehavior() {
  const pallets = createPalletObjects(15, buildWeights(15), 40, false);
  const pairing = pairPallets(pallets);
  assert.equal(pairing.pairs.length, 7, 'expected 7 pairs for 15 pallets');
  assert.equal(pairing.remainingSingle?.label, 'P-15', 'expected P-15 to remain single');
})();

runCase(1, { generated: 1, mapped: 1, doubleRows: 0, singleRows: 1, unassigned: 0 });
runCase(2, { generated: 2, mapped: 2, doubleRows: 1, singleRows: 0, unassigned: 0 });
runCase(3, { generated: 3, mapped: 3, doubleRows: 1, singleRows: 1, unassigned: 0 });
runCase(14, { generated: 14, mapped: 14, doubleRows: 7, singleRows: 0, unassigned: 0, highestId: 'P-14' });
runCase(15, { generated: 15, mapped: 15, doubleRows: 7, singleRows: 1, unassigned: 0, highestId: 'P-15' });
runCase(26, { generated: 26, mapped: 26, doubleRows: 13, singleRows: 0, unassigned: 0 });
runCase(27, { generated: 27, mapped: 26, unassigned: 1 });

(function testNoDuplicateIdsInMap() {
  const pallets = createPalletObjects(8, buildWeights(8), 40, false);
  const slots: MappingSlot[] = [
    { row: 1, palletLabel: pallets[0].label },
    { row: 1, palletLabel: pallets[1].label },
    { row: 2, palletLabel: pallets[2].label },
    { row: 2, palletLabel: pallets[3].label },
    { row: 3, palletLabel: pallets[4].label },
    { row: 3, palletLabel: pallets[5].label },
    { row: 4, palletLabel: pallets[6].label },
    { row: 4, palletLabel: pallets[7].label },
  ];

  const reconciliation = reconcileMappedPallets(8, pallets, slots);
  assert.equal(reconciliation.duplicateCount, 0, 'duplicate IDs should be zero');
})();

console.log('loadOptimizerCount tests passed');
