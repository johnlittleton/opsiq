import { create } from 'zustand';
import { DockDoorWithCheckin, Shift } from '../../shared/types';
import { apiClient } from '../services/api';

interface AppState {
  // Dock state
  doors: DockDoorWithCheckin[];
  loading: boolean;
  error: string | null;
  
  // Global filters
  selectedDate: string;
  selectedShift: Shift | 'All';
  
  // Actions
  setDoors: (doors: DockDoorWithCheckin[]) => void;
  updateDoor: (door: DockDoorWithCheckin) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedDate: (date: string) => void;
  setSelectedShift: (shift: Shift | 'All') => void;
  initializeSync: () => void;
}

export const useAppStore = create<AppState>((set, get) => {
  // Initialize socket listeners
  apiClient.onSyncResponse((data) => {
    set({ doors: Array.isArray(data.doors) ? data.doors : [], loading: false });
  });

  apiClient.onDockUpdated((door) => {
    const { doors } = get();
    const doorsArray = Array.isArray(doors) ? doors : [];
    const index = doorsArray.findIndex(d => d.doorId === door.doorId);
    if (index !== -1) {
      const newDoors = [...doorsArray];
      newDoors[index] = door;
      set({ doors: newDoors });
    }
  });

  apiClient.onDockBulkUpdate((updatedDoors) => {
    set({ doors: updatedDoors });
  });

  return {
    doors: [],
    loading: true,
    error: null,
    selectedDate: new Date().toISOString().split('T')[0],
    selectedShift: 'All',

    setDoors: (doors) => set({ doors }),
    
    updateDoor: (door) => {
      const { doors } = get();
      const index = doors.findIndex(d => d.doorId === door.doorId);
      if (index !== -1) {
        const newDoors = [...doors];
        newDoors[index] = door;
        set({ doors: newDoors });
      }
    },
    
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setSelectedDate: (selectedDate) => set({ selectedDate }),
    setSelectedShift: (selectedShift) => set({ selectedShift }),
    
    initializeSync: () => {
      set({ loading: true });
      apiClient.requestSync();
    },
  };
});
