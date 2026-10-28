// Integration smoke: real Chrome extension with slow mocked LinkedIn pages and a temporary local app.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const jobs = `<!doctype html><html><body><div role="toolbar"><button id="employment">Employment type</button><div id="options"></div></div><script>let employmentClicks=0;document.querySelector('#employment').onclick=()=>{if(++employmentClicks===1)return;document.querySelector('#options').innerHTML='<div role="checkbox">Full-time</div><a href="#" id="apply">Show results</a>';document.querySelector('[role=checkbox]').onclick=()=>document.querySelector('[role=checkbox]').setAttribute('aria-checked','true');document.querySelector('#apply').onclick=e=>{e.preventDefault();if(document.querySelector('[role=checkbox]').getAttribute('aria-checked')==='true'){document.querySelector('#employment').textContent='Full-time';document.querySelector('#options').innerHTML='';}};};</script><div role="button" id="place"><div aria-label="Location Bengaluru (40 km)">Bengaluru (40 km)</div></div><div id="places"></div><script>document.querySelector('#place').onclick=()=>{document.querySelector('#places').innerHTML='<div contenteditable="true" aria-label="Location"></div><a href="?geoId=102713980">India</a>';document.querySelector('#places a').onclick=e=>{e.preventDefault();document.querySelector('#place').innerHTML='<div aria-label="Location India">India</div>';document.querySelector('#places').innerHTML='';};};</script><img src="https://www.linkedin.com/slow-loading.png" alt="">${Array.from({length:5}, (_, i) => `<div role="button" componentkey="job-card-component-ref-${4481910908+i}"><p>UX Designer</p><p>Browser Test Co ${i}</p><p>${i === 0 ? 'Gurugram (Hybrid)' : 'India'}</p><p>${i % 2 === 0 ? 'Viewed · Be an early applicant' : 'Posted 2 hours ago'}</p></div>`).join('')}</body></html>`;
const people = url => {
 const company = (url.searchParams.get('keywords') || '').match(/Browser Test Co \d/)?.[0] || 'Browser Test Co 0';
 const founder = url.searchParams.get('keywords').includes('founder');
 const designer = url.searchParams.get('keywords').includes('designer');
 const companyIndex = Number(company.at(-1));
 const filtered = url.searchParams.has('currentCompany');
 const cards = Array.from({length:8}, (_, i) => `<a componentkey="auto-component-${i}" href="https://www.linkedin.com/in/browser-test-person-${companyIndex}-${founder ? 'f' : designer ? 'd' : 'h'}-${i}/">Test Person ${i}<br> • 2nd<br>${founder ? 'Co-founder' : designer ? 'UX Designer' : 'Recruiter'} at ${company}<br>Bengaluru, India</a>`).join('');
 return `<!doctype html><html><body>${filtered || companyIndex === 4 ? cards : `<div role="button"><div aria-label="Filter by Current companies">Current companies</div></div><div id="filter"></div><script>document.querySelector('[role=button]').onclick=()=>{document.querySelector('#filter').innerHTML='<input placeholder="Add a company"><div role="listbox"></div><a href="#">Show results</a>';document.querySelector('input').oninput=()=>{document.querySelector('[role=listbox]').innerHTML='<div role="option">${company}</div>';document.querySelector('[role=option]').onclick=()=>{};};document.querySelector('a').onclick=e=>{e.preventDefault();const u=new URL(location.href);u.searchParams.set('currentCompany','["1"]');location.href=u.href;};};</script>`}</body></html>`;
};
const profile = `<!doctype html><html><body><main><button>Connect</button></main><script>document.querySelector('button').onclick=()=>{document.body.dataset.connectClicked='true'}</script></body></html>`;
const invite = `<!doctype html><html><body><button>Add a note</button><div id="editor"></div><script>document.querySelector('button').onclick=()=>{document.querySelector('#editor').innerHTML='<textarea placeholder="Write a note"></textarea><button>Send</button>';document.querySelector('#editor button').onclick=()=>{let status=document.createElement('div');status.setAttribute('role','alert');status.textContent='Invitation sent';document.body.appendChild(status);};}</script></body></html>`;

(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'outreach-extension-'));
  const extension = path.join(dir, 'helper');
  cpSync(path.resolve('chrome-extension'), extension, { recursive: true });
  const backgroundPath = path.join(extension, 'background.js');
  writeFileSync(backgroundPath, readFileSync(backgroundPath, 'utf8').replace('http://127.0.0.1:4318', 'http://127.0.0.1:14319'));
  const manifestPath = path.join(extension, 'manifest.json');
  writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8').replaceAll('127.0.0.1:4318', '127.0.0.1:14319'));
  const server = spawn(process.execPath, ['--import', './tests/fixtures/funding-fetch.mjs', 'server/index.mjs'], { env: { ...process.env, PORT: '14319', DATA_DIR: path.join(dir, 'data') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let context;
  try {
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Server startup timed out')), 10000); server.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); server.once('error', reject); });
    context = await chromium.launchPersistentContext(path.join(dir, 'profile'), { executablePath: process.env.CHROME_EXECUTABLE || undefined, channel: process.env.CHROME_EXECUTABLE ? undefined : 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const jobQueries = new Set();
    await context.route('https://www.linkedin.com/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/slow-loading.png') { await new Promise(resolve => setTimeout(resolve, 4000)); return route.fulfill({ status: 200, contentType: 'image/png', body: '' }).catch(() => {}); }
      if (url.pathname.startsWith('/jobs/search')) {
        jobQueries.add(`${url.searchParams.get('location')}:${url.searchParams.get('keywords')}`);
        // Reproduce the real LinkedIn variant: redirect drops f_JT and menu omits Full-time.
        const detailScript = `<div id="detail"></div><script>setTimeout(()=>{const u=new URL(location.href);u.searchParams.delete('f_JT');history.replaceState(null,'',u);},750);document.querySelectorAll('[componentkey^="job-card-component-ref-"]').forEach((card,index)=>card.onclick=()=>{const id=card.getAttribute('componentkey').split('-').at(-1);document.querySelector('#detail').innerHTML='<a href="https://www.linkedin.com/jobs/view/'+id+'/">UX Designer</a><a>Full-time</a><div componentkey="JobDetails_AboutTheJob_'+id+'">About the job: a full-time design role.</div>';});</script>`;
        return route.fulfill({ status: 200, contentType: 'text/html', body: jobs.replaceAll('India', url.searchParams.get('location') || 'India').replaceAll('<div role="checkbox">Full-time</div>', '<div role="checkbox">Part-time</div>').replace('</body>', detailScript + '</body>') });
      }
      if (url.pathname.startsWith('/search/results/people/')) return route.fulfill({ status: 200, contentType: 'text/html', body: people(url) });
      if (url.pathname.startsWith('/in/')) return route.fulfill({ status: 200, contentType: 'text/html', body: profile.replace('browser-test-person-1', url.pathname.split('/')[2]) });
      if (url.pathname.startsWith('/preload/custom-invite/')) return route.fulfill({ status: 200, contentType: 'text/html', body: invite });
      return route.fulfill({ status: 404, body: '' });
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:14319/');
    await page.getByRole('button', { name: /Outreach/ }).click();
    await page.getByRole('button', { name: 'Delhi', exact: true }).click();
    await page.getByRole('button', { name: 'Mumbai', exact: true }).click();
    await page.getByRole('button', { name: 'Find 20 new people' }).click();
    try { await page.getByRole('status').filter({ hasText: 'added 30 new people' }).waitFor({ timeout: 180000 }); }
    catch (error) {
      console.error('Dashboard:', (await page.locator('body').innerText()).slice(0, 1200));
      console.error('Tabs:', context.pages().map(tab => tab.url()));
      console.error('Workers:', context.serviceWorkers().map(worker => worker.url()));
      const linkedIn = context.pages().find(tab => tab.url().includes('/search/results/people/'));
      if (linkedIn) console.error('People DOM:', await linkedIn.evaluate(() => ({ cards: document.querySelectorAll('a[componentkey^="auto-component-"][href*="/in/"]').length, first: document.querySelector('a[componentkey^="auto-component-"][href*="/in/"]')?.innerText, body: document.body.innerText.slice(0, 300) })));
      throw error;
    }
    const state = await (await page.request.get('http://127.0.0.1:14319/api/state')).json();
    assert.equal(state.contacts.length, 30);
    assert.equal(state.contacts.filter(person => person.contactRole === 'founder').length, 10);
    assert.ok(state.contacts.filter(person => person.contactRole === 'founder').every(person => person.funding?.url && /pitch/i.test(person.message)));
    assert.deepEqual([...jobQueries].sort(), ['Delhi:Product Designer', 'Delhi:UX Designer', 'Mumbai:Product Designer', 'Mumbai:UX Designer']);
    assert.equal(state.jobs.filter(job => job.sourceRecency === 'Past 24 hours (LinkedIn filter)').length, 3, 'Viewed/Applied cards inherit the active past-day filter');
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/extension-scan.png', fullPage: true });
    for (let i=0;i<5;i++) { const group=state.contacts.filter(p=>p.company===`Browser Test Co ${i}`); assert.equal(group.length,6); assert.equal(group.filter(p=>p.headline.includes('UX Designer')).length,2); assert.equal(group.filter(p=>p.contactRole === 'founder').length,2); }
    assert.equal(state.contacts[0].company, 'Browser Test Co 0');
    const worker = context.serviceWorkers()[0];
    assert.ok(worker, 'unpacked extension worker is active');
    const fullMessage = state.contacts[0].message;
    assert.ok(fullMessage.length > 200 && fullMessage.length <= 290);
    assert.ok(fullMessage.includes('https://karteek.work'));
    assert.ok(fullMessage.includes('16hilLHZ3_4nvYX56vPKkKpMFjUqpk1oN/view?usp=sharing'));
    await worker.evaluate(message => chrome.storage.local.set({ pendingOutreach: { profileUrl: 'https://www.linkedin.com/in/browser-test-person-1/', message, shortNote: 'Legacy short note must not be used', expiresAt: Date.now() + 60000 } }), fullMessage);
    const invitation = await context.newPage();
    await invitation.goto('https://www.linkedin.com/in/browser-test-person-1/');
    await invitation.locator('textarea').waitFor({ timeout: 15000 });
    assert.equal(await invitation.locator('textarea').inputValue(), fullMessage);
    assert.equal(await invitation.getByRole('button', { name: 'Send' }).count(), 1);
    await invitation.close();
    const db = new DatabaseSync(path.join(dir, 'data', 'outreach.sqlite'));
    const tracker = { title: 'Test tracker', rowCount: 0, syncedAt: new Date().toISOString(), schemaValid: true, tabs: ['Master'], headers: ['Person', 'Profile URL', 'Status'], missingTabs: [], missingHeaders: [], valueRanges: [{ range: 'Master!A1:C1', values: [['Person', 'Profile URL', 'Status']] }] };
    db.prepare("INSERT INTO settings(key,value) VALUES('tracker',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(tracker));
    db.close();
    await page.reload();
    await page.getByRole('button', { name: /Outreach/ }).click();
    const recipient = state.contacts[0];
    const existingProfile = await context.newPage();
    await existingProfile.goto(recipient.profileUrl);
    const recipientRow = page.locator('tr').filter({ has: page.locator(`a[href="${recipient.profileUrl}"]`) });
    await recipientRow.getByRole('button', { name: 'Send outreach' }).click();
    const prepared = await (await page.request.get('http://127.0.0.1:14319/api/state')).json();
    assert.equal(prepared.contacts.find(p => p.id === recipient.id).status, 'Draft ready', 'opening the note is not a send');
    let userInvite;
    for (let attempt = 0; attempt < 30 && !userInvite; attempt += 1) {
      userInvite = context.pages().find(tab => tab.url().includes('/preload/custom-invite/'));
      if (!userInvite) await page.waitForTimeout(500);
    }
    if (!userInvite) console.error('No invitation tab:', { tabs: context.pages().map(tab => tab.url()), chromeTabs: await worker.evaluate(() => chrome.tabs.query({})), storage: await worker.evaluate(() => chrome.storage.local.get(['outreachSession', 'pendingOutreach'])), dashboard: (await page.locator('body').innerText()).slice(0, 600) });
    assert.ok(userInvite);
    await userInvite.locator('textarea').waitFor({ timeout: 15000 });
    await userInvite.getByRole('button', { name: 'Send', exact: true }).click();
    try { await page.getByRole('button', { name: 'Completed (1)' }).waitFor({ timeout: 15000 }); }
    catch (error) {
      console.error('Confirmation debug:', { tabs: context.pages().map(tab => tab.url()), inviteText: await userInvite.locator('body').innerText(), storage: await worker.evaluate(() => chrome.storage.local.get(['outreachSession', 'pendingOutreach'])), dashboard: (await page.locator('body').innerText()).slice(0, 900) });
      throw error;
    }
    const confirmed = await (await page.request.get('http://127.0.0.1:14319/api/state')).json();
    assert.equal(confirmed.contacts.find(p => p.id === recipient.id).status, 'Send confirmed');
    assert.equal(confirmed.contacts.find(p => p.id === recipient.id).deliveryEvidence, 'LinkedIn send confirmed by Chrome helper');
    console.log('PASS: real Chrome extension imported 20 team contacts plus 10 funded metro founders in one scan, filled a connection note, and marked done after a fixture send confirmation.');
  } finally {
    if (context) await context.close();
    server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
