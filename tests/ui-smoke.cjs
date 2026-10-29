// Run with PLAYWRIGHT_PACKAGE set to an installed playwright package path.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'outreach-ui-'));
  const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: '14319', DATA_DIR: dir }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Server startup timed out')), 10000); server.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); server.once('error', reject); });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/job-board/sync', route => route.fulfill({json:{added:0,sources:{}}}));
    await page.goto('http://127.0.0.1:14319');
    await page.getByRole('heading', { name: /Find the right person/ }).waitFor();
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true, animations: 'disabled' });
    await page.evaluate(async () => {
      const response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/careers/ux-designer', text: 'Example company is hiring a Product Designer in Bengaluru, India. Experience: 4 years.', mode: 'manual' }) });
      if (!response.ok) throw new Error(await response.text());
    });
    await page.reload();
    await page.getByRole('button', { name: /Job research 1/ }).click();
    await page.getByRole('button', { name: /Unreviewed job post/ }).waitFor();
    await page.getByRole('button', { name: /Unreviewed job post/ }).click();
    await page.getByRole('button', { name: 'Review facts' }).click();
    await page.getByLabel('Company', { exact: true }).fill('Example company');
    await page.locator('.fact-editor').filter({ has: page.getByLabel('Company', { exact: true }) }).getByLabel('Exact supporting quote').fill('Example company');
    await page.getByRole('button', { name: 'Save reviewed facts' }).click();
    await page.getByRole('status').filter({ hasText: 'Facts saved' }).waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Provider', { exact: true }).selectOption('compatible');
    await page.getByLabel('API base URL').fill('http://127.0.0.1:11434/v1');
    await page.getByLabel('Model ID').fill('local-test-model');
    await page.getByLabel('API key', { exact: true }).fill('UI_TEST_SECRET');
    await page.getByRole('button', { name: 'Save provider', exact: true }).click();
    await page.getByText('Key available', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('API key', { exact: true }).inputValue(), '');
    const state = await (await page.request.get('http://127.0.0.1:14319/api/state')).text();
    assert.ok(!state.includes('UI_TEST_SECRET'));
    await page.screenshot({ path: 'test-results/settings-desktop.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Automation', exact: true }).click();
    await page.getByLabel('Refresh the tracker automatically').check();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await page.getByRole('status').filter({ hasText: 'Automation preferences saved' }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Sending remains unavailable' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true, animations: 'disabled' });
    const scanPage = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const scanErrors = []; scanPage.on('pageerror', e => scanErrors.push(e.message));
    await scanPage.route('**/api/job-board/sync', route => route.fulfill({json:{added:0,sources:{}}}));
    await scanPage.addInitScript(() => {
      window.addEventListener('message', event => {
        if (event.source !== window || event.data?.source !== 'outreach-desk' || !['ping-helper', 'scan-people'].includes(event.data?.type)) return;
        const send = (type, payload) => window.postMessage({ source: 'outreach-desk-helper', type, payload }, location.origin);
        window.postMessage({ source: 'outreach-desk-helper', requestId: event.data.requestId, ok: true, version: '0.6.0' }, location.origin);
        if (event.data.type === 'ping-helper') return;
        if (!event.data.payload.job && event.data.payload.mode !== 'all') throw new Error('Every full scan must include founders');
        setTimeout(() => send('people-scan-progress', { phase: 'jobs', percent: 30, detail: 'Checking 2 recent jobs', jobsFound: 1, peopleFound: 0 }), 60);
        setTimeout(() => send('people-scan-progress', { phase: 'people', percent: 70, detail: 'Checking companies', jobsFound: 1, peopleFound: 12 }), 180);
        let discovery = {
          replace: false, cities: event.data.payload.cities,
          jobs: Array.from({length: 5}, (_, index) => ({ url: `https://www.linkedin.com/jobs/view/${9876543210 + index}/`, title: 'Product Designer', company: `Browser Test Co ${index}`, location: 'Bengaluru, India', recency: 'Posted 2 hours ago', source: 'Product Designer Browser Test Co India Posted 2 hours ago' })),
          people: Array.from({ length: 20 }, (_, i) => ({ name: `Test Person ${i + 1}`, headline: i % 4 < 2 ? 'UX Designer' : 'Recruiter', location: 'Bengaluru, India', company: `Browser Test Co ${Math.floor(i / 4)}`, jobUrl: `https://www.linkedin.com/jobs/view/${9876543210 + Math.floor(i / 4)}/`, profileUrl: `https://www.linkedin.com/in/browser-test-person-${i + 1}/` })),
        };
        if (event.data.payload.job) {
          const job=event.data.payload.job;
          discovery={targeted:true,replace:false,cities:event.data.payload.cities,jobs:[job],people:Array.from({length:4},(_,i)=>({name:`Targeted Person ${i}`,headline:i<2?'UX Designer':'Recruiter',location:'Bengaluru, India',company:job.company,jobUrl:job.url,profileUrl:`https://www.linkedin.com/in/job-targeted-${i}/`}))};
        }
        setTimeout(() => send('people-scan-batch', { ...discovery, people: discovery.people.slice(0, 4) }), 400);
        setTimeout(() => send('people-scan-results', discovery), 1800);
      });
    });
    await scanPage.goto('http://127.0.0.1:14319');
    await scanPage.getByRole('button', { name: /Outreach/ }).click();
    await scanPage.getByRole('button', {name:'Founders & co-founders',exact:true}).click();
    assert.equal(await scanPage.getByRole('button', {name:'Find startup founders',exact:true}).count(),1);
    await scanPage.getByRole('button', {name:'Designers & HR',exact:true}).click();
    await scanPage.getByRole('button', { name: 'Bengaluru', exact: true }).click();
    assert.equal(await scanPage.getByRole('button', { name: 'Bengaluru', exact: true }).getAttribute('aria-pressed'), 'true');
    await scanPage.getByRole('button', { name: 'Find 20 new people' }).click();
    await scanPage.getByRole('status').filter({ hasText: 'Checking 2 recent jobs' }).waitFor();
    assert.equal(await scanPage.locator('progress').getAttribute('value'), '30');
    await scanPage.getByRole('button', { name: 'Test Person 1', exact: true }).waitFor();
    assert.equal(await scanPage.getByRole('button', { name: 'Scanning LinkedIn…', exact: true }).isEnabled(), false, 'contacts appear before scan completion');
    await scanPage.getByRole('status').filter({ hasText: 'added 20 new people' }).waitFor();
    assert.equal((await (await scanPage.request.get('http://127.0.0.1:14319/api/state')).json()).contacts.length, 20);
    await scanPage.getByRole('button', { name: /Job research/ }).click();
    const directJob = scanPage.getByRole('link', { name: 'Open on LinkedIn ↗', exact: true }).first();
    assert.match(await directJob.getAttribute('href'), /^https:\/\/www\.linkedin\.com\/jobs\/view\/\d+\/?$/);
    assert.equal(await directJob.getAttribute('target'), '_blank');
    await scanPage.context().route('https://www.linkedin.com/jobs/view/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Original job listing</h1>' }));
    const [jobTab] = await Promise.all([scanPage.context().waitForEvent('page'), directJob.click()]);
    await jobTab.waitForLoadState('domcontentloaded');
    assert.match(jobTab.url(), /^https:\/\/www\.linkedin\.com\/jobs\/view\//);
    await jobTab.close();
    await scanPage.screenshot({ path: 'test-results/job-direct-links.png', fullPage: true });
    await scanPage.getByRole('button', {name:'Find 4 people for this job',exact:true}).first().click();
    try { await scanPage.getByRole('status').filter({hasText:'added 4 new people'}).waitFor(); } catch(error) { console.error('Targeted scan:',(await scanPage.locator('main').innerText()).slice(0,1700)); throw error; }
    await scanPage.getByRole('button', {name:'Targeted Person 0',exact:true}).waitFor();
    assert.equal((await (await scanPage.request.get('http://127.0.0.1:14319/api/state')).json()).contacts.filter(person=>person.name.startsWith('Targeted Person')).length,4);
    await scanPage.getByRole('button', { name: /Outreach/ }).click();
    await scanPage.getByLabel('Search contacts').fill('Test Person 1');
    await scanPage.getByRole('button', { name: 'Test Person 1', exact: true }).click();
    try { await scanPage.getByLabel('Outreach message', { exact: true }).fill('Edited outreach for the selected person.', { timeout: 5000 }); } catch (error) { console.error('Editor errors:', scanErrors); console.error((await scanPage.locator('body').innerText()).slice(-2500)); await scanPage.screenshot({ path: 'test-results/editor-debug.png', fullPage: true }); throw error; }
    await scanPage.getByRole('button', { name: 'Save message', exact: true }).click();
    await scanPage.getByRole('status').filter({ hasText: 'Message saved.' }).waitFor();
    assert.equal(await scanPage.getByRole('button', { name: 'Restore version', exact: true }).count(), 1);
    await scanPage.getByRole('button', { name: 'Delete version', exact: true }).click();
    await scanPage.getByText('Your previous messages appear here after an edit.').waitFor();
    await scanPage.getByLabel('Show deleted versions').check();
    await scanPage.getByRole('button', { name: 'Undo version deletion' }).click();
    await scanPage.getByRole('button', { name: 'Restore version', exact: true }).click();
    await scanPage.getByRole('status').filter({ hasText: 'Message history updated.' }).waitFor();
    assert.ok((await scanPage.getByLabel('Outreach message', { exact: true }).inputValue()).includes('https://karteek.work'));
    await scanPage.getByLabel('Select Test Person 1', { exact: true }).check();
    await scanPage.getByRole('button', { name: 'Delete selected', exact: true }).click();
    await scanPage.getByRole('status').filter({ hasText: 'moved to Deleted' }).waitFor();
    await scanPage.getByRole('button', { name: 'Undo deletion', exact: true }).click();
    await scanPage.getByRole('status').filter({ hasText: 'Deletion undone.' }).waitFor();
    await scanPage.getByLabel('Search contacts').fill('');
    await scanPage.getByRole('row').filter({ has: scanPage.getByRole('button', { name: 'Test Person 1', exact: true }) }).getByRole('checkbox', { name: 'Mark done' }).click();
    await scanPage.getByRole('alert').filter({ hasText: 'Sheet update pending' }).waitFor();
    assert.equal((await (await scanPage.request.get('http://127.0.0.1:14319/api/state')).json()).contacts.find(contact => contact.name === 'Test Person 1').status, 'Send confirmed');
    await scanPage.screenshot({ path: 'test-results/outreach-browser-scan.png', fullPage: true, animations: 'disabled' });
    await scanPage.setViewportSize({ width: 390, height: 844 });
    assert.equal(await scanPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await scanPage.screenshot({ path: 'test-results/outreach-mobile.png', fullPage: true, animations: 'disabled' });
    await scanPage.getByRole('button', {name:'Pause auto-scan',exact:true}).click();
    await scanPage.getByRole('button', {name:'Enable auto-scan',exact:true}).waitFor();
    assert.equal((await (await scanPage.request.get('http://127.0.0.1:14319/api/state')).json()).discoverySchedule.enabled, false);
    await scanPage.getByRole('button', {name:'Enable auto-scan',exact:true}).click();
    await scanPage.getByRole('button', {name:'Pause auto-scan',exact:true}).waitFor();
    await page.close();
    const { DatabaseSync } = require('node:sqlite');
    const fixtureDb = new DatabaseSync(path.join(dir,'outreach.sqlite'));
    const schedule = JSON.parse(fixtureDb.prepare("SELECT value FROM settings WHERE key='discoverySchedule'").get().value);
    fixtureDb.prepare("UPDATE settings SET value=? WHERE key='discoverySchedule'").run(JSON.stringify({...schedule,nextRunAt:Date.now()-1000}));
    fixtureDb.close();
    await scanPage.reload();
    await scanPage.getByRole('alert').filter({hasText:'found no new matching people'}).waitFor({timeout:15000});
    const afterAuto = (await (await scanPage.request.get('http://127.0.0.1:14319/api/state')).json()).discoverySchedule;
    assert.equal(afterAuto.lastStatus, 'No new verified matches');
    assert.equal(afterAuto.leaseUntil, 0);
    assert.ok(afterAuto.nextRunAt > Date.now());
    assert.deepEqual(scanErrors, []);
    assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile layout, research, settings, scan progress, 20-person import, Mark done, scheduled discovery without a click, pause/resume, and no browser errors.');
  } finally {
    if (browser) await browser.close();
    server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

