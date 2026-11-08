import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const origin = 'http://127.0.0.1:4318/';
const scan = () => ({ scanId: 'scan-a', tabId: 42, phase: 'jobs', jobIndex: 0, companyIndex: 0, jobs: [], results: [], cities: ['India'], searches: ['https://www.linkedin.com/jobs/search/?keywords=Product+Designer&location=India', 'https://www.linkedin.com/jobs/search/?keywords=UX+Designer&location=India'], excludedProfiles: [], mode: 'team', limit: 20 });
function helper(initial = {}) {
  let listener;
  const state = structuredClone(initial), removed = [], navigations = [], messages = [], clearedTimers = [];
  const control = { beforeSave: null, create: async () => ({ id: 42 }) };
  const chrome = {
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      async get(key) { return { [key]: structuredClone(state[key]) }; },
      async set(values) { if (control.beforeSave) await control.beforeSave(values); Object.assign(state, structuredClone(values)); },
      async remove(key) { delete state[key]; },
    } },
    tabs: {
      onUpdated: { addListener() {} },
      create: (...args) => control.create(...args),
      async query() { return [{ id: 9 }]; },
      async remove(id) { removed.push(id); },
      async update(id, value) { navigations.push({ id, ...value }); },
      async sendMessage(id, value) { messages.push({ id, ...value }); },
    },
  };
  runInNewContext(readFileSync(new URL('../chrome-extension/background.js', import.meta.url), 'utf8'), {
    chrome, URL, URLSearchParams, Date, Math, Set, Map, Number, String, encodeURIComponent,
    setTimeout: () => 123, clearTimeout: id => clearedTimers.push(id),
  });
  const receive = (request, sender = { url: origin }) => new Promise(resolve => {
    let replied = false;
    const handled = listener(request, sender, response => { replied = true; resolve(response); });
    if (!replied && handled !== true) resolve(null);
  });
  return { state, removed, navigations, messages, clearedTimers, control, receive };
}

test('stop scan removes only its scan tab and retains completed contacts and outreach session', async () => {
  const h = helper({ peopleScan: { ...scan(), jobs: [{ url: 'job' }], results: [{ name: 'Saved Person' }] }, outreachSession: { tabId: 88 }, confirmedDeliveries: [{ contactId: 'sent' }] });
  const response = await h.receive({ type: 'stop-scan', payload: { scanId: 'scan-a' } });
  assert.equal(response?.ok, true);
  assert.equal(response.stopped, true);
  assert.equal(h.state.peopleScan, undefined);
  assert.deepEqual(h.removed, [42]);
  assert.equal(h.state.lastScanDiagnostics.cancelled, true);
  assert.equal(h.state.lastScanDiagnostics.results[0].name, 'Saved Person');
  assert.deepEqual(h.state.outreachSession, { tabId: 88 });
  assert.deepEqual(h.state.confirmedDeliveries, [{ contactId: 'sent' }]);
});

test('stop scan is idempotent and rejects an untrusted sender', async () => {
  const h = helper({ peopleScan: scan() });
  assert.equal((await h.receive({ type: 'stop-scan' }, { url: 'https://example.com/' }))?.ok, false);
  assert.equal(h.state.peopleScan.scanId, 'scan-a');
  await h.receive({ type: 'stop-scan' });
  assert.equal((await h.receive({ type: 'stop-scan' }))?.ok, true);
  assert.deepEqual(h.removed, [42]);
});

test('a stale stop request cannot cancel a newer scan', async () => {
  const h = helper({ peopleScan: scan() });
  const response = await h.receive({ type: 'stop-scan', payload: { scanId: 'older-scan' } });
  assert.equal(response?.ok, false);
  assert.equal(h.state.peopleScan.scanId, 'scan-a');
  assert.deepEqual(h.removed, []);
});

test('stop during tab creation closes the late scan tab without starting searches', async () => {
  const h = helper();
  let release;
  h.control.create = () => new Promise(resolve => { release = resolve; });
  assert.equal((await h.receive({ type: 'scan-people', payload: { cities: ['India'], mode: 'team' } })).ok, true);
  assert.equal((await h.receive({ type: 'stop-scan' }))?.ok, true);
  release({ id: 42 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.peopleScan, undefined);
  assert.deepEqual(h.removed, [42]);
  assert.deepEqual(h.navigations, []);
});

test('an in-flight scan-stage save cannot resurrect a cancelled scan or navigate again', { timeout: 2000 }, async () => {
  const h = helper({ peopleScan: scan() });
  let release, saving;
  const started = new Promise(resolve => { saving = resolve; });
  h.control.beforeSave = async values => {
    if (values.peopleScan) { saving(); await new Promise(resolve => { release = resolve; }); }
  };
  const stage = h.receive({ type: 'jobs-scan-page', payload: { jobs: [], stageId: 'jobs:0' } }, { tab: { id: 42 } });
  await started;
  assert.equal((await h.receive({ type: 'stop-scan', payload: { scanId: 'scan-a' } }))?.ok, true);
  release();
  await stage;
  assert.equal(h.state.peopleScan, undefined);
  assert.deepEqual(h.navigations, []);
});

test('stop during the initial state save cancels the starting tab as well', { timeout: 2000 }, async () => {
  const h = helper();
  let release, saving;
  const started = new Promise(resolve => { saving = resolve; });
  h.control.beforeSave = async values => {
    if (values.peopleScan) { saving(); await new Promise(resolve => { release = resolve; }); }
  };
  await h.receive({ type: 'scan-people', payload: { scanId: 'scan-starting', mode: 'team' } });
  await started;
  assert.equal((await h.receive({ type: 'stop-scan', payload: { scanId: 'scan-starting' } }))?.ok, true);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.peopleScan, undefined);
  assert.deepEqual(h.removed, [42]);
  assert.deepEqual(h.navigations, []);
});

test('the dashboard bridge forwards a stop request and its acknowledgement', () => {
  let receive;
  const forwarded = [], replies = [];
  const window = { location: { origin: origin.slice(0, -1) }, addEventListener(type, fn) { receive = fn; }, postMessage(value) { replies.push(value); } };
  const chrome = { runtime: { id: 'helper', getManifest: () => ({ version: '0.6.10' }), onMessage: { addListener() {} }, sendMessage(value, done) { forwarded.push(value); done({ ok: true, stopped: true }); } } };
  runInNewContext(readFileSync(new URL('../chrome-extension/bridge.js', import.meta.url), 'utf8'), { window, chrome });
  receive({ source: window, origin: window.location.origin, data: { source: 'outreach-desk', type: 'stop-scan', requestId: 'stop-1', payload: { scanId: 'scan-a' } } });
  assert.equal(forwarded.length, 1);
  assert.equal(replies.at(-1).requestId, 'stop-1');
  assert.equal(replies.at(-1).ok, true);
});
