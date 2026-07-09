const normalize = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

const ALLOWED_NORMALIZED_NAMES = new Set([
  normalize('John'),
  normalize('Tyler'),
  normalize('Phil Jr'),
  normalize('Phil Sr'),
  normalize('Philip Jr'),
  normalize('Philip Sr'),
  normalize('Phillip Jr'),
  normalize('Phillip Sr'),
]);

export const hasRestrictedFeatureAccess = (name: string): boolean => {
  const normalized = normalize(name);
  return ALLOWED_NORMALIZED_NAMES.has(normalized);
};
