export const PRODUCTION_LINES = [
  { id: 1, name: 'Giro Line 1' },
  { id: 2, name: 'Giro Line 2' },
  { id: 3, name: 'Giro Line 3' },
  { id: 4, name: 'Giro Line 4' },
  { id: 5, name: 'Giro Line 5' },
  { id: 6, name: 'Giro Line 6' },
  { id: 7, name: 'HP7' },
  { id: 8, name: 'RG1' },
  { id: 9, name: 'RG2' },
  { id: 10, name: 'Support Team' },
] as const;

export interface ProductionLineScanHistoryItem {
  date: string;
  employeeId: string;
  employeeName: string;
  action: 'assigned' | 'moved' | 'removed';
  fromLineId: number | null;
  toLineId: number | null;
  scanCode?: string;
  scannedAt: string;
}

export const productionLineName = (lineId: number | null) =>
  PRODUCTION_LINES.find((line) => line.id === lineId)?.name || 'Unassigned';