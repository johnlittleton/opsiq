export const isNativeIOSRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;

  return (
    window.location.protocol === 'capacitor:' ||
    (window as any).Capacitor?.isNativePlatform?.() === true ||
    (window as any).Capacitor?.getPlatform?.() === 'ios'
  );
};
