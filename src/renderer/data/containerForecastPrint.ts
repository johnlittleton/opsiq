export type PrintableContainerForecast = Record<string, unknown>;

const escapeHtml = (value: unknown) => String(value ?? '—')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const PRINT_FIELDS: Array<[string, string]> = [
  ['Steamship Line', 'steamshipLine'],
  ['Vessel', 'vessel'],
  ['Vessel ETA', 'vesselEta'],
  ['Full Container #', 'containerNumber'],
  ['Customer', 'customer'],
  ['Commodity', 'commodity'],
  ['Carrier', 'carrier'],
  ['Chassis', 'chassis'],
  ['Weight', 'weight'],
  ['Add-on Charge $', 'addonCharge'],
  ['Overweight Permit (52,000 lb or more)', 'overweightPermit'],
  ['Permit #', 'permitNumber'],
  ['ND/NT #', 'ndNtNumber'],
  ['Ratecon #', 'rateconNumber'],
  ['Rate $', 'rateAmount'],
  ['P/U #', 'pickupNumber'],
  ['SCAC (Holt)', 'pickupScac'],
  ['Driver / Load', 'driverLoad'],
  ['Port Appointment #', 'portAppointmentNumber'],
  ['Delivery ETA', 'deliveryEta'],
  ['Drop-off Location', 'dropOffLocation'],
  ['Full Pickup Last Free Day', 'fullPickupLastFreeDay'],
  ['Empty Return Last Free Day', 'emptyLastFreeDay'],
  ['Empty Return Date', 'emptyReturnDate'],
  ['Empty Return Driver', 'emptyReturnDriver'],
  ['Release Status', 'releaseStatus'],
  ['Dispatch Status', 'dispatchStatus'],
  ['TIR Document', 'tirDocumentFile'],
  ['Delivery Order', 'deliveryOrderFile'],
  ['Notes', 'notes'],
];

export function buildContainerForecastPrintHtml(record: PrintableContainerForecast): string {
  const rows = PRINT_FIELDS.map(([label, key]) => {
    const value = key === 'overweightPermit'
      ? (record[key] === true || record[key] === 1 ? 'Yes' : 'No')
      : escapeHtml(record[key]);
    return `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Container ${escapeHtml(record.containerNumber)}</title><style>
    @page{size:auto;margin:14mm}body{font-family:Arial,sans-serif;color:#14212a;margin:0}header{border-bottom:3px solid #c9181e;margin-bottom:16px;padding-bottom:10px}h1{font-size:21px;margin:0 0 5px}p{color:#52636b;margin:0;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #d5dfe2;padding:7px 9px;text-align:left;vertical-align:top}th{width:36%;background:#f2f2f2}footer{margin-top:20px;color:#66767c;font-size:10px}
    </style></head><body><header><h1>Container / Load Record</h1><p>${escapeHtml(record.vessel)} · ${escapeHtml(record.containerNumber)}</p></header><table>${rows}</table><footer>Printed ${escapeHtml(new Date().toLocaleString())}</footer></body></html>`;
}

export function buildContainerForecastHistoryPrintHtml(records: PrintableContainerForecast[]): string {
  const sections = records.map((record) => {
    const rows = PRINT_FIELDS.map(([label, key]) => {
      const value = key === 'overweightPermit'
        ? (record[key] === true || record[key] === 1 ? 'Yes' : 'No')
        : escapeHtml(record[key]);
      return `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
    }).join('');
    return `<article><h2>${escapeHtml(record.containerNumber)} <span>${escapeHtml(record.vessel)}</span></h2><table>${rows}</table></article>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Container History</title><style>
    @page{size:auto;margin:14mm}body{font-family:Arial,sans-serif;color:#171717;margin:0}header{border-bottom:3px solid #c9181e;margin-bottom:16px;padding-bottom:10px}h1{font-size:22px;margin:0 0 5px}header p{color:#555;margin:0;font-size:12px}article{margin:0 0 22px;break-inside:avoid}h2{font-size:15px;margin:0 0 7px;padding:7px 9px;background:#ededed;border-left:3px solid #c9181e}h2 span{font-weight:400;color:#555;margin-left:8px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border-bottom:1px solid #d8d8d8;padding:4px 7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{width:34%;background:#f5f5f5}footer{margin-top:18px;color:#666;font-size:10px}@media print{article{break-inside:avoid}}
    </style></head><body><header><h1>Container History</h1><p>${records.length} containers · Printed ${escapeHtml(new Date().toLocaleString())}</p></header>${sections}<footer>OpsIQ Container History</footer></body></html>`;
}

export function buildDispatchDailySchedulePrintHtml(records: PrintableContainerForecast[], dateLabel: string): string {
  const rows = records.map((record) => `<tr>
    <td>${escapeHtml(record.deliveryEta)}</td>
    <td><strong>${escapeHtml(record.containerNumber)}</strong></td>
    <td>${escapeHtml(record.vessel)}<small>${escapeHtml(record.steamshipLine || 'SSL not set')}</small></td>
    <td>${escapeHtml(record.customer)}<small>${escapeHtml(record.commodity || 'Commodity not set')}</small></td>
    <td>${escapeHtml(record.dropOffLocation)}</td>
    <td>${escapeHtml(record.carrier)}<small>${escapeHtml(record.driverLoad || 'Driver not assigned')}</small></td>
    <td>${escapeHtml(record.pickupNumber)}<small>${escapeHtml(record.portAppointmentNumber || 'Port appointment not set')}</small></td>
    <td>${escapeHtml(record.fullPickupLastFreeDay)}</td>
    <td>${escapeHtml(record.emptyLastFreeDay || record.emptyReturnDate)}</td>
    <td>${escapeHtml(record.releaseStatus)}</td>
    <td>${escapeHtml(record.dispatchStatus || 'Pending')}</td>
  </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Container Schedule - ${escapeHtml(dateLabel)}</title><style>
    @page{size:landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#171717;margin:0}header{border-bottom:3px solid #c9181e;margin-bottom:12px;padding-bottom:8px}h1{font-size:20px;margin:0 0 4px}p{color:#555;margin:0;font-size:11px}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #ccc;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee;font-size:8px;text-transform:uppercase}td small{display:block;color:#555;margin-top:2px}tbody tr:nth-child(even){background:#f7f7f7}footer{margin-top:10px;color:#666;font-size:9px}
    </style></head><body><header><h1>Container Schedule</h1><p>${escapeHtml(dateLabel)} · ${records.length} containers · Printed ${escapeHtml(new Date().toLocaleString())}</p></header><table><thead><tr><th>Delivery ETA</th><th>Container</th><th>Vessel / SSL</th><th>Customer / Commodity</th><th>Drop-off</th><th>Carrier / Driver</th><th>Pickup / Port Appt</th><th>Full Pickup LFD</th><th>Empty Return LFD</th><th>Release</th><th>Dispatch</th></tr></thead><tbody>${rows}</tbody></table><footer>OpsIQ Dispatch</footer></body></html>`;
}
