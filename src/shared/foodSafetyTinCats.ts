export const FOOD_SAFETY_TIN_CAT_TARGET = 147;
export const FOOD_SAFETY_CYCLE_DAYS = 14;

export function normalizeTinCatCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function getTinCatProgress(scannedCount: number, target = FOOD_SAFETY_TIN_CAT_TARGET) {
  const scanned = Math.max(0, Math.min(target, Math.trunc(Number(scannedCount) || 0)));
  return {
    scanned,
    target,
    remaining: Math.max(0, target - scanned),
    percent: target > 0 ? Math.round((scanned / target) * 100) : 0,
  };
}

export function getTinCatStatus(scanCount: number, dueAt: string, now: Date = new Date()): 'open' | 'completed' | 'overdue' {
  if (scanCount >= FOOD_SAFETY_TIN_CAT_TARGET) return 'completed';
  return new Date(dueAt).getTime() <= now.getTime() ? 'overdue' : 'open';
}