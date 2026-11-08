// Isolated, headless UI check. No real LinkedIn pages, contacts, or private app data.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const { createServer } = require('node:http');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('dist');
const version = JSON.parse(readFileSync('chrome-extension/manifest.json', 'utf8')).version;
const state = { provider: null, google: { connected: false, configured: false, writeConfigured: false }, spreadsheetId: 'fixture', tracker: null, jobs: [], contacts: [], events: [], sending: { available: false, reason: 'UI fixture' }, automation: { autoSync: false, desiredSending: 'manual' }, discoverySchedule: { enabled: false, nextRunAt: Date.now() + 3600000, lastRunAt: null, lastStatus: 'Not run yet', lastAdded: 0, leaseUntil: 0 } };
const person = { id: 'fixture-person', name: 'Saved Person', company: 'Fixture Company', headline: 'UX Designer at Fixture Company', location: 'Bengaluru, India', contactRole: 'designer', profileUrl: 'https://www.linkedin.com/in/fixture-person/', jobId: 'fixture-job', jobUrl: 'https://www.linkedin.com/jobs/view/1/', jobTitle: 'UX Designer', degree: 'Unknown', message: 'Fixture only; never sent', status: 'Draft ready', researchedAt: new Date().toISOString(), sheetStatus: 'Clear to contact' };
const server = createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(readFileSync(file));
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(version => {
      window.fixtureScans = []; window.fixtureStops = [];
      window.addEventListener('message', event => {
        const data = event.data;
        if (data?.source !== 'outreach-desk') return;
        if (data.type === 'scan-people') window.fixtureScans.push(data.payload);
        if (data.type === 'stop-scan') window.fixtureStops.push(data.payload);
        if (['ping-helper', 'scan-people', 'stop-scan'].includes(data.type)) window.postMessage({ source: 'outreach-desk-helper', requestId: data.requestId, version, ok: true }, location.origin);
        if (data.type === 'scan-people') {
          window.postMessage({ source: 'outreach-desk-helper', type: 'people-scan-progress', payload: { scanId: data.payload.scanId, percent: 40, detail: 'Fixture scan running', jobsFound: 1, peopleFound: 0 } }, location.origin);
          window.postMessage({ source: 'outreach-desk-helper', type: 'people-scan-batch', payload: { scanId: data.payload.scanId, people: [{ name: 'Saved Person' }], jobs: [], targeted: true } }, location.origin);
        }
      });
    }, version);
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const input = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
      let result = {};
      if (pathname === '/api/state') result = state;
      else if (pathname === '/api/discovery-schedule') {
        if (input.action === 'claim') result = { claimed: true, runId: 'fixture-run' };
        if (input.action === 'finish') { state.discoverySchedule.lastStatus = input.status; state.discoverySchedule.lastAdded = input.added; }
      } else if (pathname === '/api/people/import') { await new Promise(resolve => setTimeout(resolve, 150)); state.contacts = [person]; result = { added: 1, total: 1 }; }
      else if (pathname === '/api/jobs/discovered') result = { fresh: 0 };
      else if (pathname === '/api/job-board/sync') result = { added: 0, sources: {} };
      await route.fulfill({ json: result });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button', { name: 'Outreach', exact: true }).click();
    await page.getByRole('button', { name: 'Find 20 new people', exact: true }).click();
    await page.getByRole('button', { name: 'Stop scan', exact: true }).waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Founders & co-founders', exact: true }).click();
    await page.getByRole('button', { name: 'Queue this search', exact: true }).click();
    await page.getByRole('button', { name: 'Search queued', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Stop scan', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Scan stopped' }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole('button', { name: 'Stop scan', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.fixtureStops.length), 1);
    assert.equal(await page.evaluate(() => window.fixtureScans.length), 1, 'queued founder scan must not start after stop');
    assert.equal(state.discoverySchedule.lastStatus, 'Stopped by user');
    assert.equal(state.contacts.length, 1, 'accepted in-flight import is retained');
    await page.getByRole('button', { name: 'Designers & HR', exact: true }).click();
    await page.getByRole('button', { name: 'Saved Person', exact: true }).waitFor();
    // A refreshed dashboard must still offer Stop for an existing run.
    state.discoverySchedule = { ...state.discoverySchedule, enabled: true, runId: 'restored-run', leaseUntil: Date.now() + 600000, lastStatus: 'Running' };
    await page.reload();
    await page.getByRole('button', { name: 'Stop scan', exact: true }).waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Stop scan', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Scan stopped' }).waitFor({ timeout: 5000 });
    assert.equal(state.discoverySchedule.lastStatus, 'Stopped by user');
    assert.equal(state.contacts.length, 1);
    await page.getByRole('button', { name: /Outreach/ }).click();
    await page.getByRole('button', { name: 'Saved Person', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/stop-scan-ui.png', fullPage: true });
    console.log('PASS: Stop scan cancels the helper and queued audience, releases the run, and retains the accepted contact.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
