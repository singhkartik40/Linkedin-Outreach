import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('a reloaded extension reports a reconnect notice instead of throwing in an old dashboard tab', () => {
  let receive;
  const replies = [];
  const window = { location: { origin: 'http://127.0.0.1:4318' }, addEventListener(type, callback) { receive = callback; }, postMessage(message) { replies.push(message); } };
  const runtime = { id: 'helper', getManifest: () => ({ version: '0.4.10' }), onMessage: { addListener() {} } };
  runInNewContext(readFileSync(new URL('../chrome-extension/bridge.js', import.meta.url), 'utf8'), { window, chrome: { runtime } });
  Object.defineProperty(runtime, 'id', { get() { throw Error('Extension context invalidated.'); } });
  assert.doesNotThrow(() => receive({ source: window, origin: window.location.origin, data: { source: 'outreach-desk', type: 'ping-helper', requestId: 'reload-test' } }));
  assert.equal(replies.at(-1).ok, false);
  assert.match(replies.at(-1).error, /Refresh Outreach Desk/);
});

test('Chrome helper accepts the full note without a separate short note', async () => {
  let listener, saved;
  const chrome = {
    runtime: { onMessage: { addListener(callback) { listener = callback; } }, lastError: null },
    storage: { local: { set(value, callback) { saved = { ...saved, ...value }; callback?.(); return Promise.resolve(); } } },
    tabs: { onUpdated: { addListener() {} }, query: async () => [], create: async () => ({ id: 42 }), update: async () => ({ id: 42 }) },
  };
  runInNewContext(readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8'), { chrome, URL, URLSearchParams, Date, Math, Set, Number, String, encodeURIComponent });
  const request = { type: 'prepare-outreach', payload: { contactId: '11111111-1111-4111-8111-111111111111', receiptToken: '22222222-2222-4222-8222-222222222222', profileUrl: 'https://www.linkedin.com/in/example/', message: 'Full outreach message for later follow-up.' } };
  const response = await new Promise(resolve => listener(request, { url: 'http://127.0.0.1:4318/' }, resolve));
  assert.equal(response.ok, true);
  assert.equal(saved.pendingOutreach.shortNote, undefined);
  assert.equal(saved.pendingOutreach.message, request.payload.message);
  const invalid = await new Promise(resolve => listener({ ...request, payload: { ...request.payload, message: 'x'.repeat(291) } }, { url: 'http://127.0.0.1:4318/' }, resolve));
  assert.equal(invalid.ok, false);
});

test('scan checks recent jobs before people, excludes saved profiles, and reports progress', async () => {
  let listener;
  const state = {};
  const navigation = [], updates = [];
  const chrome = {
    runtime: { onMessage: { addListener(callback) { listener = callback; } } },
    storage: { local: {
      async get(key) { return { [key]: state[key] }; },
      async set(values) { Object.assign(state, values); },
      async remove(key) { delete state[key]; },
    } },
    scripting: { async executeScript() {} },
    tabs: {
      onUpdated: { addListener() {} },
      async query() { return [{ id: 9 }]; },
      async create() { return { id: 42 }; },
      async update(id, options) { if (options.url !== 'about:blank') navigation.push(options.url); return { id }; },
      async sendMessage(id, message) { updates.push(message); },
    },
  };
  runInNewContext(readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8'), { chrome, URL, URLSearchParams, Date, Math, Set, Number, String, encodeURIComponent });
  const receive = (message, sender) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`No response to ${message.type}`)), 1000);
    listener(message, sender, response => { clearTimeout(timer); resolve(response); });
  });
  assert.equal((await receive({ type: 'scan-people', payload: { limit: 20, cities: ['Delhi'], excludedProfiles: ['https://www.linkedin.com/in/saved-person/'] } }, { url: 'http://127.0.0.1:4318/' })).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(navigation[0], /\/jobs\/search\//);
  assert.match(navigation[0], /f_TPR=r86400/);
  assert.equal(state.peopleScan.mode, 'all', 'every new scan includes founders');
  state.peopleScan.mode = 'team'; // This case isolates the job-to-team stages.
  const job = (id, company, location, recency) => ({ url: `https://www.linkedin.com/jobs/view/${id}/`, title: 'Product Designer', company, location, recency, searchLocation: 'Delhi', source: 'Job card' });
  await receive({ type: 'jobs-scan-page', payload: { jobs: [], error: 'First city page did not finish loading', stageId: 'jobs:0' } }, { tab: { id: 42 } });
  assert.match(navigation[1], /\/jobs\/search\//);
  assert.equal(state.peopleScan.warnings.length, 1);
  await receive({ type: 'jobs-scan-page', payload: { jobs: [job(123, 'Acme', 'Gurugram (Hybrid)', 'Past 24 hours (LinkedIn filter)'), job(456, 'Beta', 'Noida', 'Posted 2 hours ago')] } }, { tab: { id: 42 } });
  assert.equal(state.peopleScan.jobs.length, 2);
  assert.match(navigation[2], /search\/results\/people/);
  assert.match(navigation[2], /Acme/);
  const person = (slug) => ({ name: slug, headline: 'UX Designer', location: 'Bengaluru, India', profileUrl: `https://www.linkedin.com/in/${slug}/` });
  await receive({ type: 'people-scan-page', payload: { verifiedCompany: true, people: [person('saved-person'), person('new-one'), person('new-one')] } }, { tab: { id: 42 } });
  assert.match(navigation[3], /Acme/);
  await receive({ type: 'people-scan-page', payload: { verifiedCompany: true, people: [] } }, { tab: { id: 42 } });
  assert.match(navigation[4], /Beta/);
  await receive({ type: 'people-scan-page', payload: { verifiedCompany: true, people: [person('new-two')] } }, { tab: { id: 42 } });
  await receive({ type: 'people-scan-page', payload: { verifiedCompany: true, people: [] } }, { tab: { id: 42 } });
  const result = updates.find(message => message.type === 'people-scan-results');
  assert.deepEqual(Array.from(result.payload.people, person => person.name), ['new-one', 'new-two']);
  assert.equal(result.payload.jobs.length, 2);
  assert.equal(result.payload.warnings.length, 1);
  assert.equal(result.payload.people[0].jobUrl, 'https://www.linkedin.com/jobs/view/123/');
  assert.equal(result.payload.people[1].jobUrl, 'https://www.linkedin.com/jobs/view/456/');
  const batches = updates.filter(message => message.type === 'people-scan-batch');
  assert.equal(batches.length, 2);
  assert.equal(batches[0].payload.people[0].name, 'new-one');
  assert.equal(batches[1].payload.people[0].name, 'new-two');
  assert.equal(updates.at(-2).payload.percent, 100);
  assert.equal(state.peopleScan, undefined);
});

test('a missing LinkedIn jobs script reloads once, then advances to the next role search', async () => {
  let onUpdated, timerCallback;
  let reloads = 0;
  const messages = [];
  const state = { peopleScan: { tabId: 42, phase: 'jobs', jobIndex: 0, companyIndex: 0, jobs: [], results: [] } };
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    storage: { local: {
      async get() { return { peopleScan: state.peopleScan }; },
      async set(value) { Object.assign(state, value); },
      async remove(key) { delete state[key]; },
    } },
    scripting: { async executeScript() {} },
    tabs: {
      onUpdated: { addListener(callback) { onUpdated = callback; } },
      async get() { return { url: 'https://www.linkedin.com/jobs/search-results?keywords=Product%20Designer' }; },
      async query() { return [{ id: 9 }]; },
      async sendMessage(id, message) { if (id === 42) throw Error('No receiver'); messages.push(message); },
      async reload() { reloads += 1; },
      async update() {},
    },
  };
  runInNewContext(readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8'), { chrome, URL, URLSearchParams, Date, Math, Set, Number, String, Map, encodeURIComponent, setTimeout(callback) { timerCallback = callback; return 1; }, clearTimeout() {} });
  onUpdated(42, { status: 'complete' }, { url: 'https://www.linkedin.com/jobs/search-results?keywords=Product%20Designer' });
  await timerCallback();
  assert.equal(reloads, 1);
  assert.equal(state.peopleScan.probeRetried, 'jobs:0');
  onUpdated(42, { status: 'complete' }, { url: 'https://www.linkedin.com/jobs/search-results?keywords=Product%20Designer' });
  await timerCallback();
  assert.equal(reloads, 1);
  assert.equal(state.peopleScan.jobIndex, 1);
  assert.equal(state.peopleScan.warnings.length, 1);
  assert.match(messages.at(-1).payload.detail, /UX Designer/);
});

test('a loading jobs page is not reloaded before its content script can attach', async () => {
  let onUpdated, timerCallback;
  let loading = true, reloads = 0, probes = 0;
  const scan = { scanId: 'slow-page', tabId: 42, phase: 'jobs', jobIndex: 0, jobs: [], results: [] };
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    storage: { local: { async get() { return { peopleScan: scan }; }, async set() {}, async remove() {} } },
    tabs: {
      onUpdated: { addListener(callback) { onUpdated = callback; } },
      async get() { return { status: loading ? 'loading' : 'complete', url: 'https://www.linkedin.com/jobs/search-results/' }; },
      async query() { return []; },
      async sendMessage() { probes += 1; if (loading) throw Error('No receiver until document_idle'); return { ok: true, page: 'jobs' }; },
      async reload() { reloads += 1; },
    },
  };
  runInNewContext(readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8'), { chrome, URL, URLSearchParams, Date, Math, Set, Number, String, Map, encodeURIComponent, setTimeout(callback) { timerCallback = callback; return 1; }, clearTimeout() {} });
  onUpdated(42, { url: 'https://www.linkedin.com/jobs/search-results/', status: 'loading' }, {});
  await timerCallback();
  assert.equal(reloads, 0, 'loading a slow page must not trigger an early reload');
  assert.equal(probes, 1);
  loading = false;
  onUpdated(42, { status: 'complete' }, {});
  await timerCallback();
  assert.equal(probes, 2);
  assert.equal(reloads, 0);
});

test('people scanner reads current LinkedIn profile cards', () => {
  const source = readFileSync(new URL('../chrome-extension/search.js', import.meta.url), 'utf8').replace(/^\(\(\) => \{\s*/, '').replace(/\s*run\(\)(?:\.catch[^\n]*)?;\s*\}\)\(\);\s*$/, '');
  const card = {
    href: 'https://www.linkedin.com/in/jane-doe/', innerText: 'Jane Doe\n • 2nd\nRecruiter at Acme\nIndia\nConnect',
    matches: selector => selector === 'a[href*="/in/"]', getClientRects: () => [1],
  };
  const document = { querySelectorAll: selector => selector.startsWith('a[componentkey') ? [card] : [] };
  const context = { document, location: { href: 'https://www.linkedin.com/search/results/people/' }, URL, Map, chrome: { runtime: { onMessage: { addListener() {} } } } };
  runInNewContext(source + '\nthis.found = collect("Acme", false); this.optionName = companyOptionName({ innerText: "ServiceNow\\nSoftware Development", querySelector: () => null });', context);
  assert.equal(context.found.length, 1);
  assert.equal(context.found[0].name, 'Jane Doe');
  assert.equal(context.found[0].headline, 'Recruiter at Acme');
  assert.equal(context.found[0].degree, '2');
  assert.equal(context.optionName, 'ServiceNow');
});

test('job card collector trusts the active past-day filter when a viewed card hides its age', () => {
  const source = readFileSync(new URL('../chrome-extension/jobs.js', import.meta.url), 'utf8').replace(/^\(\(\) => \{\s*/, '').replace('if (globalThis.__outreachDeskJobsHelper) return;', '').replace(/\s*run\(\)(?:\.catch[^\n]*)?;\s*\}\)\(\);\s*$/, '');
  const card = {
    textContent: 'Product Designer PineGap.ai Gurugram Viewed Be an early applicant',
    getAttribute(name) { return name === 'componentkey' ? 'job-card-component-ref-4481910908' : null; },
    querySelectorAll(selector) { return selector === 'p' ? [
      { innerText: 'Product Designer\nProduct Designer' }, { innerText: 'PineGap.ai' }, { innerText: 'Gurugram (Hybrid)' }, { innerText: 'Viewed · Be an early applicant' },
    ] : []; },
    querySelector(selector) { return selector === 'p' ? { innerText: 'Product Designer\nProduct Designer' } : null; },
  };
  const context = { document: { querySelectorAll() { return [card]; } }, URL, location: { href: 'https://www.linkedin.com/jobs/search-results/?f_TPR=r86400' }, chrome: { runtime: { onMessage: { addListener() {} } } } };
  runInNewContext(source + '\nthis.found = collect({ city: "Delhi" });', context);
  assert.equal(context.found.length, 1);
  assert.equal(context.found[0].url, 'https://www.linkedin.com/jobs/view/4481910908/');
  assert.equal(context.found[0].company, 'PineGap.ai');
  assert.equal(context.found[0].recency, 'Past 24 hours (LinkedIn filter)');
  assert.equal(context.found[0].searchLocation, 'Delhi');
});

test('founder scan excludes other roles, caps each company at two and completes after founder stage', async () => {
 let listener;
 const state = {peopleScan:{scanId:'founders',tabId:42,phase:'people',mode:'founders',role:'founder',companies:['Acme'],companyIndex:0,jobs:[{url:'https://www.linkedin.com/jobs/view/123/',company:'Acme'}],results:[],excludedProfiles:[],limit:20,cities:['India']}};
 const messages=[];
 const chrome={runtime:{onMessage:{addListener(cb){listener=cb;}}},storage:{local:{async get(){return {...state};},async set(v){Object.assign(state,v);},async remove(k){delete state[k];}}},tabs:{onUpdated:{addListener(){}},async query(){return [{id:9}];},async sendMessage(id,message){messages.push(message);}}};
 runInNewContext(readFileSync(new URL('../chrome-extension/background.js',import.meta.url),'utf8'),{chrome,URL,URLSearchParams,Date,Math,Set,Map,Number,String,encodeURIComponent});
 const people=['Founder','Co-founder & Designer','Founder & CEO','Recruiter'].map((headline,i)=>({headline,name:`Person ${i}`,location:'Bengaluru, India',profileUrl:`https://www.linkedin.com/in/founder-${i}/`}));
 await new Promise(resolve=>listener({type:'people-scan-page',payload:{verifiedCompany:true,people}},{tab:{id:42}},resolve));
 const result=messages.find(m=>m.type==='people-scan-results').payload;
 assert.equal(result.mode,'founders');
 assert.equal(result.people.length,2);
 assert.ok(result.people.every(p=>p.contactRole==='founder'));
 assert.equal(state.peopleScan,undefined);
});

test('combined scan discovers startups on Google, verifies founders on LinkedIn and streams them without jobs', async () => {
  let listener;
  const state = { peopleScan: { scanId:'all',tabId:42,phase:'people',mode:'all',role:'talent',companies:['Acme'],companyIndex:0,jobs:[],results:[],excludedProfiles:[],limit:20,cities:['India'] } };
  const messages=[],navigation=[];
  const chrome={runtime:{onMessage:{addListener(cb){listener=cb;}}},storage:{local:{async get(){return {...state};},async set(v){Object.assign(state,v);},async remove(k){delete state[k];}}},tabs:{onUpdated:{addListener(){}},async query(){return [{id:9}];},async update(id,options){navigation.push(options.url);},async sendMessage(id,message){messages.push(message);}}};
  runInNewContext(readFileSync(new URL('../chrome-extension/background.js',import.meta.url),'utf8'),{chrome,URL,URLSearchParams,Date,Math,Set,Map,Number,String,encodeURIComponent,setTimeout(){return 1;},clearTimeout(){}});
  const receive=(type,payload,url='')=>new Promise(resolve=>listener({type,payload},{tab:{id:42,url}},resolve));
  await receive('people-scan-page',{verifiedCompany:true,people:[]});
  assert.equal(state.peopleScan.phase,'startups'); assert.match(navigation.at(-1),/google.com/);
  await receive('startup-scan-page',{stageId:'startups:0:0',companies:[{company:'Acme',startupSourceUrl:'https://www.linkedin.com/company/acme/'}]},navigation.at(-1));
  assert.equal(state.peopleScan.phase,'google-founders');
  const googleUrl=navigation.at(-1);
  await receive('google-founders-page',{stageId:'google-founders:0:0',people:[{name:'Asha',company:'Acme',profileUrl:'https://www.linkedin.com/in/asha/',startupSourceUrl:'https://www.linkedin.com/company/acme/',googleUrl}]},googleUrl);
  assert.equal(state.peopleScan.phase,'founder-profile');
  await receive('founder-profile-page',{stageId:'founder-profile:0:0',person:{name:'Asha Rao',headline:'Founder at Acme',location:'Indore, India',evidence:'Founder at Acme'}},navigation.at(-1));
  const batch=messages.find(message=>message.type==='people-scan-batch');
  assert.equal(batch.payload.independentFounders,true); assert.equal(batch.payload.people[0].name,'Asha Rao');
  const result=messages.find(message=>message.type==='people-scan-results').payload;
  assert.equal(result.founders.length,1); assert.equal(result.people.length,0); assert.equal(state.peopleScan,undefined);
});
