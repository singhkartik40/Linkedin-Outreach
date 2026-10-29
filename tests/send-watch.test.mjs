import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function fixture({ noNote = false, pending = false, approved = true } = {}) {
  let click, tick = async () => {}, observe = () => {};
  const requests = [], alerts = [];
  const button = { textContent: noNote ? 'Send without a note' : 'Send', getClientRects: () => [1], closest() { return this; } };
  const scope = { contains: candidate => candidate === button, querySelectorAll: () => [] };
  const editor = { value: 'A note edited by the user', getClientRects: () => [1], closest: () => scope };
  const document = { body: {}, addEventListener(type, fn) { click = fn; }, querySelector: () => null, querySelectorAll: selector => selector.includes('role="alert"') ? alerts : pending ? [{ textContent: 'Pending', getClientRects: () => [1] }] : [] };
  const context = { document, location: { pathname: '/in/person/' }, chrome: { runtime: { async sendMessage(message) { requests.push(message.type); return { ok: approved }; } } }, MutationObserver: class { constructor(fn) { observe = fn; } observe() {} disconnect() {} }, setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = async () => {}; } };
  runInNewContext(readFileSync(new URL('../chrome-extension/send-watch.js', import.meta.url), 'utf8'), context);
  context.outreachWatchSend({ editor: noNote ? null : editor });
  return { requests, alerts, tick: () => tick(), change: () => observe(), async click() { click({ target: button }); await Promise.resolve(); }, addAlert(text) { const alert = { textContent: text, getClientRects: () => [1] }; alerts.push(alert); return alert; } };
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
