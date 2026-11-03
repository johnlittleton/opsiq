const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const express = require('express');
const Database = require('better-sqlite3');
const { DatabaseService } = require('../dist/server/server/database');
const { _electron } = require(process.env.OPSIQ_PLAYWRIGHT_PATH || 'playwright');

async function main() {
  const nativeDb = new Database(':memory:');
  nativeDb.exec(`
    CREATE TABLE food_safety_tin_cat_cycles (id INTEGER PRIMARY KEY, status TEXT DEFAULT 'open', targetCount INTEGER DEFAULT 147, startedBy TEXT, startedAt TEXT, dueAt TEXT, completedAt TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE UNIQUE INDEX one_open ON food_safety_tin_cat_cycles(status) WHERE status = 'open';
    CREATE TABLE food_safety_tin_cat_scans (id INTEGER PRIMARY KEY, cycleId INTEGER, assetCode TEXT, scannedBy TEXT, scannedAt TEXT, UNIQUE(cycleId, assetCode));
    CREATE TABLE food_safety_tin_cat_scan_edits (id INTEGER PRIMARY KEY, scanId INTEGER, originalAssetCode TEXT, newAssetCode TEXT, reason TEXT, editedBy TEXT, editedAt TEXT);
  `);
  const service = Object.assign(Object.create(DatabaseService.prototype), { db: nativeDb });
  const historical = await service.createFoodSafetyTinCatCycle('Dev Inspector');
  await service.addFoodSafetyTinCatScan(historical.id, 'TC-SEPTEMBER', 'Dev Inspector');
  nativeDb.prepare("UPDATE food_safety_tin_cat_scans SET scannedAt = '2026-09-10T08:00:00' WHERE cycleId = ?").run(historical.id);
  nativeDb.prepare("UPDATE food_safety_tin_cat_cycles SET status = 'completed' WHERE id = ?").run(historical.id);
  const current = await service.createFoodSafetyTinCatCycle('Dev Inspector');
  const fixture = express();
  fixture.use(express.json());
  fixture.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    next();
  });
  const route = (handler) => async (request, response) => {
    try { response.json(await handler(request)); }
    catch (error) { response.status(400).json({ error: error.message }); }
  };
  fixture.get('/api/auth/session', (request, response) => response.json({ name: 'Dev Inspector', role: 'executive' }));
  const base = '/api/food-safety/tin-cats';
  fixture.get(`${base}/cycles`, route(() => service.getFoodSafetyTinCatCycles()));
  fixture.get(`${base}/cycles/:id`, route((request) => service.getFoodSafetyTinCatCycle(Number(request.params.id))));
  fixture.post(`${base}/cycles/:id/scans`, route((request) => {
    if (request.body.assetCode === 'TC-REJECTED') throw new Error('Test scan rejected. Please retry.');
    return service.addFoodSafetyTinCatScan(Number(request.params.id), request.body.assetCode, 'Dev Inspector');
  }));
  fixture.get(`${base}/scans`, route((request) => service.getFoodSafetyTinCatScans(request.query)));
  fixture.put(`${base}/scans/:id`, route((request) => service.updateFoodSafetyTinCatScan(Number(request.params.id), request.body.assetCode, request.body.reason, 'Dev Inspector')));
  const server = fixture.listen(3002, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'opsiq-tin-cat-electron-'));
  let electron;
  try {
    electron = await _electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), `--user-data-dir=${userData}`], env: { ...process.env, NODE_ENV: 'development', VITE_DEV_SERVER_URL: process.env.OPSIQ_TEST_RENDERER_URL || 'http://localhost:5174' } });
    const page = await electron.firstWindow();
    await page.evaluate(() => localStorage.setItem('opsiq-session-token', 'isolated-dev-fixture'));
    await page.goto(`${process.env.OPSIQ_TEST_RENDERER_URL || 'http://localhost:5174'}/#/food-safety-tin-cats`);
    const scan = page.getByLabel('Scan tin-cat barcode');
    await scan.waitFor();
    if (process.argv.includes('--keep-open')) {
      console.log('READY: isolated dev Electron Tin Cat session. Local API 3002 / renderer 5174. Test data only; normal print dialogs enabled. Close the Electron window to end this sandbox.');
      await new Promise((resolve) => electron.once('close', resolve));
      electron = null;
      return;
    }
    await scan.fill('TC-REJECTED');
    await scan.press('Enter');
    await page.getByText('Test scan rejected. Please retry.').waitFor();
    assert.equal(await scan.inputValue(), 'TC-REJECTED');
    await page.waitForFunction(() => document.activeElement?.id === 'tin-cat-scan-input');
    await scan.fill('TC-001');
    await scan.press('Enter');
    await page.getByText('TC-001 scanned successfully.').waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'tin-cat-scan-input');
    assert.equal(await scan.inputValue(), '');
    await scan.fill('TC-002');
    await scan.press('Tab');
    await page.getByText('TC-002 scanned successfully.').waitFor();
    await scan.fill('tc-001');
    await scan.press('Enter');
    await page.getByText('TC-001 was already scanned in this cycle.').waitFor();
    assert.equal((await service.getFoodSafetyTinCatCycle(current.id)).scannedCount, 2);
    await page.getByRole('button', { name: 'Edit TC-001', exact: true }).click();
    await page.getByLabel('Tin cat barcode', { exact: true }).fill('TC-003');
    await page.getByLabel('Correction reason').fill('Verified physical label');
    await page.getByRole('button', { name: 'Save Correction' }).click();
    await page.getByRole('button', { name: 'Edit TC-003', exact: true }).waitFor();
    await page.evaluate(() => { window.__tinCatPrints = []; });
    await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('print-to-pdf'); ipcMain.handle('print-to-pdf', (_event, html) => { global.__tinCatPrints = [...(global.__tinCatPrints || []), html]; return { success: true }; }); });
    await page.getByRole('button', { name: 'Print TC-003', exact: true }).click();
    await page.screenshot({ path: path.join(userData, 'scan-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('heading', { name: 'Tin Cat History' }).waitFor();
    await page.getByRole('button', { name: 'All Dates' }).click();
    await page.getByRole('button', { name: 'Edit TC-SEPTEMBER', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Print Report', exact: true }).click();
    const prints = await electron.evaluate(() => global.__tinCatPrints || []);
    assert.equal(prints.length, 2);
    assert.ok(prints[1].includes('TC-SEPTEMBER') && prints[1].includes('TC-003') && prints[1].includes('Verified physical label'));
    await page.getByRole('searchbox').fill('TC-002');
    await page.getByRole('button', { name: 'Edit TC-002', exact: true }).waitFor();
    await page.waitForFunction(() => !document.body.textContent.includes('Loading inspection records...'));
    assert.equal(await page.getByRole('button', { name: 'Edit TC-003', exact: true }).count(), 0);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('button', { name: 'Edit TC-SEPTEMBER', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit TC-SEPTEMBER', exact: true }).click();
    await page.getByLabel('Tin cat barcode', { exact: true }).fill('TC-SEPTEMBER-CORRECTED');
    await page.getByLabel('Correction reason').fill('Historical correction');
    await page.getByRole('button', { name: 'Save Correction' }).click();
    await page.getByRole('button', { name: 'Edit TC-SEPTEMBER-CORRECTED', exact: true }).waitFor();
    await page.screenshot({ path: path.join(userData, 'history-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(userData, 'history-mobile.png'), fullPage: true });
    console.log(`PASS: real dev Electron Enter/Tab scans, duplicate rejection, focus, correction on both pages, search, full-range print payloads. Screenshots: ${userData}`);
  } finally {
    if (electron) await electron.close();
    await new Promise((resolve) => server.close(resolve));
    nativeDb.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });