import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTracker, parseCsv } from '../server/google.mjs';
import { createStore } from '../server/store.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
test('tracker detects missing schema and counts populated historical rows', () => {
  const metadata = { properties: { title: 'Tracker' }, sheets: [{ properties: { title: 'Master' } }] };
  const result = inspectTracker(metadata, [{ range: 'Master!A1:R200', values: [['S. No.', 'Person'], ['100', 'Asha'], [], ['900', 'Sam']] }]);
  assert.equal(result.rowCount, 2); assert.equal(result.schemaValid, false); assert.ok(result.missingTabs.includes('Instructions')); assert.ok(result.missingHeaders.includes('Profile URL'));
});
test('public Sheet CSV parser preserves commas, quotes, and multiline notes', () => {
  assert.deepEqual(parseCsv('"Person","Note"\r\n"Asha","Hello, ""team""\nSecond line"'), [['Person', 'Note'], ['Asha', 'Hello, "team"\nSecond line']]);
});
test('SQLite survives restart and rejects duplicate source URLs', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'outreach-store-'));
  let store = createStore(dir);
  try {
    store.addJob('https://example.com/job/1', { text: 'source' });
    assert.throws(() => store.addJob('https://example.com/job/1', { text: 'source' }));
    store.set('provider', { provider: 'openai', model: 'test' }); store.close(); store = createStore(dir);
    assert.equal(store.jobs().length, 1); assert.equal(store.get('provider').model, 'test');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
