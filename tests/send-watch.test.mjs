import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function fixture({ noNote = false, pending = false, approved = true, standalone = false, accessibleSend = false } = {}) {
  let click, tick = async () => {}, observe = () => {};
  const requests = [], alerts = [], controls = [], navigations = [];
  const button = { textContent: accessibleSend ? '➤' : noNote ? 'Send without a note' : 'Send', getAttribute: () => accessibleSend ? 'Send invitation' : null, getClientRects: () => [1], closest() { return this; } };
  const scope = { contains: candidate => candidate === button, querySelectorAll: () => [] };
  const editor = { value: 'A note edited by the user', getClientRects: () => [1], closest: () => scope };
  const document = { body: {}, addEventListener(type, fn) { click = fn; }, querySelector: () => null, querySelectorAll: selector => selector.includes('role="alert"') ? alerts : pending ? [{ textContent: 'Pending', getClientRects: () => [1] }] : controls };
  const context = { document, location: { pathname: standalone ? '/preload/custom-invite/' : '/in/person/', search: '?vanityName=test-person', assign: url => navigations.push(url) }, URLSearchParams, chrome: { runtime: { async sendMessage(message) { requests.push(message.type); return { ok: approved }; } } }, MutationObserver: class { constructor(fn) { observe = fn; } observe() {} disconnect() {} }, setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = async () => {}; } };
  runInNewContext(readFileSync(new URL('../chrome-extension/send-watch.js', import.meta.url), 'utf8'), context);
  context.outreachWatchSend({ editor: noNote ? null : editor });
  return { requests, alerts, controls, navigations, hideEditor() { editor.getClientRects = () => []; button.getClientRects = () => []; }, tick: () => tick(), change: () => observe(), async click() { click({ target: button }); await new Promise(setImmediate); }, addAlert(text) { const alert = { textContent: text, getClientRects: () => [1] }; alerts.push(alert); return alert; } };
}

test('opening a note, an existing Pending state and a failed send do not mark done', async () => {
  const f = fixture({ pending: true });
  await f.tick(); assert.deepEqual(f.requests, []);
  await f.click(); f.addAlert('Invitation could not be sent'); await f.tick();
  assert.deepEqual(f.requests, ['outreach-send-attempt']);
});

test('edited notes and reused success toasts confirm a send', async () => {
  const f = fixture(), alert = f.addAlert('');
  await f.click(); alert.textContent = 'Invitation sent'; f.change();
  alert.textContent = ''; await f.tick();
  assert.deepEqual(f.requests, ['outreach-send-attempt', 'outreach-delivered']);
  await f.tick(); assert.equal(f.requests.length, 2);
});

test('an invitation Send button with icon text is tracked by its accessible label', async () => {
  const f = fixture({ accessibleSend: true });
  await f.click();
  f.addAlert('Invitation sent');
  await f.tick();
  assert.deepEqual(f.requests, ['outreach-send-attempt', 'outreach-delivered']);
});

test('Send without a note confirms only after LinkedIn success', async () => {
  const f = fixture({ noNote: true });
  await f.click(); await f.tick(); assert.equal(f.requests.length, 1);
  f.addAlert('Connection request sent'); await f.tick();
  assert.equal(f.requests.at(-1), 'outreach-delivered');
});

test('old success toasts and rejected send sessions cannot confirm delivery', async () => {
  const f = fixture(); f.addAlert('Invitation sent'); await f.click(); await f.tick();
  assert.equal(f.requests.length, 1);
  const rejected = fixture({ approved: false }); await rejected.click(); rejected.addAlert('Invitation sent'); await rejected.tick();
  assert.equal(rejected.requests.length, 1);
});

for (const control of [
  { textContent: 'Pending', getAttribute: () => null },
  { textContent: 'Icon', getAttribute: () => 'Pending, click to withdraw invitation' },
  { textContent: '', getAttribute: () => 'Invitation pending' },
]) test('no toast: a new pending control confirms delivery: ' + (control.getAttribute() || control.textContent), async () => {
  const f = fixture();
  await f.click(); await f.tick();
  assert.equal(f.requests.length, 1);
  f.controls.push({ ...control, getClientRects: () => [1] });
  await f.tick();
  assert.equal(f.requests.at(-1), 'outreach-delivered');
});

test('an existing accessible Pending label is not a new send', async () => {
  const f = fixture();
  f.controls.push({ textContent: '', getAttribute: () => 'Invitation pending', getClientRects: () => [1] });
  await f.click(); await f.tick();
  assert.deepEqual(f.requests, ['outreach-send-attempt']);
});

test('a blank standalone invitation page returns to the same profile for verification without assuming delivery', async () => {
  const f = fixture({ standalone: true }); await f.click(); f.hideEditor();
  for (let i = 0; i < 8; i++) await f.tick();
  assert.deepEqual(f.navigations, ['https://www.linkedin.com/in/test-person/']);
  assert.deepEqual(f.requests, ['outreach-send-attempt']);
});

test('a failed standalone send is not redirected or completed', async () => {
  const f = fixture({ standalone: true }); await f.click(); f.hideEditor(); f.addAlert('Unable to send invitation');
  for (let i = 0; i < 9; i++) await f.tick();
  assert.deepEqual(f.navigations, []);
  assert.deepEqual(f.requests, ['outreach-send-attempt']);
});

test('a send with no positive evidence reports an unverified outcome without recording delivery', async () => {
  const f = fixture();
  await f.click();
  for (let check = 0; check < 240; check++) await f.tick();
  assert.deepEqual(f.requests, ['outreach-send-attempt', 'outreach-unconfirmed']);
});
