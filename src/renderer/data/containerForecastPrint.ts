export type PrintableContainerForecast = Record<string, unknown>;

const escapeHtml = (value: unknown) => String(value ?? '—')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const PRINT_FIELDS: Array<[string, string]> = [
  ['Vessel', 'vessel'],
  ['Vessel ETA', 'vesselEta'],
  ['Full Container #', 'containerNumber'],
  ['Chassis', 'chassis'],
  ['Weight', 'weight'],
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
  ['Empty Return Date', 'emptyReturnDate'],
  ['Empty Return Driver', 'emptyReturnDriver'],
  ['Release Status', 'releaseStatus'],
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
    @page{size:auto;margin:14mm}body{font-family:Arial,sans-serif;color:#14212a;margin:0}header{border-bottom:3px solid #188c78;margin-bottom:16px;padding-bottom:10px}h1{font-size:21px;margin:0 0 5px}p{color:#52636b;margin:0;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #d5dfe2;padding:7px 9px;text-align:left;vertical-align:top}th{width:36%;background:#f2f6f7}footer{margin-top:20px;color:#66767c;font-size:10px}
    </style></head><body><header><h1>Container / Load Record</h1><p>${escapeHtml(record.vessel)} · ${escapeHtml(record.containerNumber)}</p></header><table>${rows}</table><footer>Printed ${escapeHtml(new Date().toLocaleString())}</footer></body></html>`;
}
