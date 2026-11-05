import { buildInventoryPrintHtml, type InventoryReportSheet } from './inventoryExports';

export interface FacLoad {
  id: number;
  cooler: number;
  customer: string;
  status: 'scheduled' | 'ready' | 'cooling' | 'completed' | 'cancelled';
  scheduledStart: string | null;
  startedAt: string | null;
  releasedAt: string | null;
  arrivalDate: string;
  workOrder: string;
  runNumber: string;
  receivedNumber: string;
  containerNumber: string;
  famous: boolean;
  billed: boolean;
  notes: string;
  createdBy: string;
  pallets: string[];
}

export const FAC_COOLERS = [2, 3, 6, 7];
export const FAC_CUSTOMERS = ['Four Star', 'Vanguard', 'Buffalo Repack', 'Fresh Taste', 'ESU'];
export const FAC_TARGET_MS = 45 * 60 * 1000;

export function localDate(value: Date = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function coolingElapsed(load: FacLoad, now: number): number {
  return load.startedAt ? Math.max(0, (load.releasedAt ? Date.parse(load.releasedAt) : now) - Date.parse(load.startedAt)) : 0;
}

export function filterFacHistory(loads: FacLoad[], from: string, to: string, query: string): FacLoad[] {
  const search = query.trim().toLowerCase();
  return loads.filter(load => {
    if (load.status !== 'completed' && load.status !== 'cancelled') return false;
    const date = load.releasedAt ? localDate(new Date(load.releasedAt)) : load.arrivalDate;
    return (!from || date >= from) && (!to || date <= to)
      && (!search || Object.values(load).join(' ').toLowerCase().includes(search));
  }).sort((first, second) => second.id - first.id);
}

export function facReportSheets(loads: FacLoad[]): InventoryReportSheet[] {
  return [
    { name: 'FAC Loads', rows: loads.map(load => ({
      'Load ID': load.id, Cooler: load.cooler, Customer: load.customer, Status: load.status,
      'Arrival Date': load.arrivalDate, 'Work Order': load.workOrder, Run: load.runNumber,
      'Received No': load.receivedNumber, Container: load.containerNumber,
      Famous: load.famous ? 'Yes' : 'No', Billed: load.billed ? 'Yes' : 'No', Notes: load.notes,
      'Scheduled Start': load.scheduledStart || '', 'Started At': load.startedAt || '',
      'Released At': load.releasedAt || '', 'Cooling Minutes': Number((coolingElapsed(load, Date.now()) / 60000).toFixed(2)),
      'Created By': load.createdBy, 'Pallet Count': load.pallets.length, 'Pallet IDs': load.pallets.join(', '),
    })) },
    { name: 'FAC Pallets', rows: loads.flatMap(load => load.pallets.map(pallet => ({
      'Load ID': load.id, Customer: load.customer, Cooler: load.cooler, 'Work Order': load.workOrder,
      Run: load.runNumber, Container: load.containerNumber, 'Pallet ID': pallet,
    }))) },
  ];
}

export function buildFacReportHtml(title: string, loads: FacLoad[]): string {
  return buildInventoryPrintHtml(title, facReportSheets(loads));
}