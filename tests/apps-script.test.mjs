import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const headers = ['S. No.', 'Person', 'Company', 'Type', 'Status', 'Added (IST)', 'Sent on (IST)', 'Profile URL', 'Role / Job', 'Experience', 'Note', 'Note characters', 'Job / funding source', 'Batch', 'Original Notion record', 'Verification / migration notes', 'Normalised profile', 'Normalised name'];
const token = 'test-token-with-at-least-thirty-two-characters';
const spreadsheetId = '1M61OSpGnYkTYEbZbsaABS4j7QsxaHRV9L24PXniwIIY';
const contact = { name: 'Asha Rao', company: 'Fresh Co', profileUrl: 'https://www.linkedin.com/in/asha-rao/', jobTitle: 'UX Designer', jobUrl: 'https://www.linkedin.com/jobs/view/123/', message: 'Hello Asha', confirmedAt: '2026-10-24T06:00:00Z' };

function script(rows) {
  const sheet = {
    getDataRange() { return { getValues: () => rows.map(row => [...row]) }; },
    getLastRow() { return rows.length; },
    getRange(row, column) { return {
      getDisplayValue() { return String(rows[row - 1]?.[column - 1] ?? ''); },
      getFormula() { return ''; },
      setValue(value) { rows[row - 1] ||= []; rows[row - 1][column - 1] = value; },
    }; },
  };
  const context = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput(text) { return { text, setMimeType() { return this; } }; } },
    PropertiesService: { getScriptProperties() { return { getProperty() { return token; } }; } },
    LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
    SpreadsheetApp: { openById(id) { assert.equal(id, spreadsheetId); return { getSheetByName() { return sheet; } }; }, flush() {} },
    Utilities: { formatDate() { return '10/24/2026 11:30'; } },
    JSON, String, Number, Math, Date, Object, decodeURIComponent,
  };
  runInNewContext(readFileSync(new URL('../sheets/OutreachWriter.gs', import.meta.url), 'utf8'), context);
  const call = (override = {}) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ action: 'markDone', token, spreadsheetId, contact, ...override }) } }).text);
  return { rows, call };
}

test('Apps Script updates only status and sent time for a matching historical row', () => {
  const old = ['42', 'Asha Rao', 'Fresh Co', 'Job contact', 'To verify', '10/23/2026', '', contact.profileUrl, 'UX Designer', '', 'Historical note'];
  const { rows, call } = script([headers, old]);
  assert.equal(call().ok, true);
  assert.equal(rows[1][4], 'Invitation pending');
  assert.equal(rows[1][6], '10/24/2026 11:30');
  assert.equal(rows[1][10], 'Historical note');
  assert.equal(rows.length, 2);
  assert.equal(call().ok, true);
  assert.equal(rows.length, 2);
});

test('Apps Script appends one missing contact and rejects a wrong token', () => {
  const { rows, call } = script([headers, ['42', 'Other Person', 'Other Co', 'Job contact', 'Sent', '', '', 'https://www.linkedin.com/in/other-person/']]);
  assert.equal(call({ token: 'wrong' }).ok, false);
  assert.equal(rows.length, 2);
  const result = call();
  assert.equal(result.ok, true);
  assert.equal(result.rowNumber, 3);
  assert.equal(rows[2][0], 43);
  assert.equal(rows[2][1], 'Asha Rao');
  assert.equal(rows[2][4], 'Invitation pending');
  assert.equal(call().rowNumber, 3);
  assert.equal(rows.length, 3);
});

test('Sheet writer stores formula-like names as text in every generated column', () => {
  const { rows, call } = script([headers]);
  const result = call({ contact: { ...contact, name: '=1+1', company: '=1+1', message: '=1+1' } });
  assert.equal(result.ok, true);
  for (const header of ['Person', 'Company', 'Note', 'Normalised name']) {
    assert.equal(rows[1][headers.indexOf(header)], "'=1+1", header);
  }
});
