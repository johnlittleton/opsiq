export type OptimizerPallet = {
  id: number;
  label: string;
  productWeight: number;
  palletWeight: number;
  loadedWeight: number;
};

export type PairResult<T> = {
  pairs: Array<[T, T]>;
  remainingSingle: T | null;
};

export type MappingSlot = {
  row: number;
  palletLabel: string | null;
};

export type CountReconciliation = {
  enteredCount: number;
  generatedPalletObjects: number;
  mappedPalletEntries: number;
  uniqueMappedPallets: number;
  unassignedCount: number;
  duplicateCount: number;
  invalidMappedIds: string[];
  isValid: boolean;
};

export function createPalletObjects(
  palletCount: number,
  productWeights: number[],
  emptyPalletWeight: number,
  includesPalletWeight: boolean
): OptimizerPallet[] {
  const safeCount = Math.max(0, Math.floor(palletCount));

  return Array.from({ length: safeCount }, (_, index) => {
    const productWeight = Math.max(0, productWeights[index] ?? 0);
    const palletWeight = includesPalletWeight ? 0 : Math.max(0, emptyPalletWeight);
    const loadedWeight = productWeight + palletWeight;

    return {
      id: index + 1,
      label: `P-${String(index + 1).padStart(2, '0')}`,
      productWeight,
      palletWeight,
      loadedWeight,
    };
  });
}

export function pairPallets<T>(pallets: T[]): PairResult<T> {
  const pairs: Array<[T, T]> = [];
  let remainingSingle: T | null = null;

  for (let i = 0; i < pallets.length; i += 2) {
    if (i + 1 < pallets.length) {
      pairs.push([pallets[i], pallets[i + 1]]);
    } else {
      remainingSingle = pallets[i];
    }
  }

  return { pairs, remainingSingle };
}

export function reconcileMappedPallets(
  enteredCount: number,
  generatedPallets: Array<{ label: string }>,
  mappingSlots: MappingSlot[]
): CountReconciliation {
  const mappedPalletIds = mappingSlots
    .map((slot) => slot.palletLabel)
    .filter((label): label is string => Boolean(label));

  const uniqueMapped = new Set(mappedPalletIds);
  const generatedSet = new Set(generatedPallets.map((p) => p.label));
  const invalidMappedIds = Array.from(uniqueMapped).filter((id) => !generatedSet.has(id));

  const mappedEntries = mappedPalletIds.length;
  const uniqueMappedCount = uniqueMapped.size;
  const duplicateCount = mappedEntries - uniqueMappedCount;
  const unassignedCount = Math.max(0, enteredCount - uniqueMappedCount);

  const isValid =
    uniqueMappedCount <= enteredCount &&
    duplicateCount === 0 &&
    invalidMappedIds.length === 0 &&
    generatedPallets.length === enteredCount;

  return {
    enteredCount,
    generatedPalletObjects: generatedPallets.length,
    mappedPalletEntries: mappedEntries,
    uniqueMappedPallets: uniqueMappedCount,
    unassignedCount,
    duplicateCount,
    invalidMappedIds,
    isValid,
  };
}

export function summarizeDoubleSingleRows(mappingSlots: MappingSlot[]): {
  doubleRows: number;
  singleRows: number;
} {
  const byRow = new Map<number, number>();

  for (const slot of mappingSlots) {
    if (!slot.palletLabel) continue;
    byRow.set(slot.row, (byRow.get(slot.row) ?? 0) + 1);
  }

  let doubleRows = 0;
  let singleRows = 0;

  for (const count of byRow.values()) {
    if (count >= 2) doubleRows += 1;
    else if (count === 1) singleRows += 1;
  }

  return { doubleRows, singleRows };
}
