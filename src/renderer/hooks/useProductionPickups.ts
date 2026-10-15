import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import type { ProductionPickup } from '../data/productionPickups';

export function useProductionPickups() {
  const [appointments, setAppointments] = useState<ProductionPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const records = await apiClient.getAppointments({ type: 'Outbound' });
        if (!disposed) {
          setAppointments(records);
          setError(false);
        }
      } catch {
        if (!disposed) setError(true);
      } finally {
        fetching = false;
        if (!disposed) setLoading(false);
      }
    };
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, []);

  return { appointments, loading, error };
}