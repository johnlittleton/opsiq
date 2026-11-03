import * as XLSX from 'xlsx';

export interface InventoryReportSheet {
  name: string;
  rows: Record<string, unknown>[];
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function buildInventoryWorkbook(sheets: InventoryReportSheet[]) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    worksheet['!cols'] = headers.map((header) => ({ wch: Math.min(42, Math.max(header.length + 2, ...rows.map((row) => String(row[header] ?? '').length + 2))) }));
    if (headers.length && rows.length) worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1' };
    XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
  });
  return workbook;
}

export function exportInventoryWorkbook(filename: string, sheets: InventoryReportSheet[]) {
  XLSX.writeFile(buildInventoryWorkbook(sheets), filename, { compression: true });
}

export function buildInventoryPrintHtml(title: string, sheets: InventoryReportSheet[]) {
  const tables = sheets.map(({ name, rows }) => {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return `<section><h2>${escapeHtml(name)}</h2>${rows.length ? `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>No records.</p>'}</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:12px Arial,sans-serif;color:#111;padding:20px}h1{font-size:20px}h2{font-size:15px;margin:20px 0 8px}p{color:#555}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #999;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#e8edf0}tr{break-inside:avoid}section{margin-bottom:20px}@media print{body{padding:0}}</style></head><body><h1>${escapeHtml(title)}</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}</p>${tables}</body></html>`;
}

export function printInventoryReport(title: string, sheets: InventoryReportSheet[]) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Allow pop-ups to print this inventory report.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildInventoryPrintHtml(title, sheets));
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
}
