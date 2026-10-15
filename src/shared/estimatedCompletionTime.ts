export function normalizeEstimatedCompletionTime(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('Estimated completion time must be a valid clock time (HH:mm)');
  }
  return value;
}

export function formatEstimatedCompletionTime(value?: string | null): string {
  if (!value) return 'Not set';
  const [hours, minutes] = normalizeEstimatedCompletionTime(value)!.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}