import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetWriter } from '../server/sheet-writer.mjs';

const url = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
const token = 'test-token-with-at-least-thirty-two-characters';
const spreadsheetId = '1M61OSpGnYkTYEbZbsaABS4j7QsxaHRV9L24PXniwIIY';
const contact = { name: 'Asha Rao', company: 'Fresh Co', profileUrl: 'https://www.linkedin.com/in/asha-rao/', jobTitle: 'UX Designer', jobUrl: 'https://www.linkedin.com/jobs/view/123/', message: 'Hello', confirmedAt: '2026-10-24T06:00:00Z' };

test('Sheet writer sends only confirmed contact data and verifies identity and status', async () => {
  let request;
  const writer = createSheetWriter({ url, token, fetcher: async (endpoint, options) => {
    request = { endpoint, options };
    return { ok: true, async json() { return { ok: true, spreadsheetId, profileSlug: 'asha-rao', status: 'Invitation pending', rowNumber: 297 }; } };
  } });
  assert.equal(writer.configured(), true);
  assert.deepEqual(await writer.markDone(contact, spreadsheetId), { rowNumber: 297, status: 'Invitation pending' });
  assert.equal(request.endpoint, url);
  assert.equal(JSON.parse(request.options.body).contact.profileUrl, contact.profileUrl);
  assert.equal(JSON.parse(request.options.body).token, token);
  assert.equal(request.options.redirect, 'follow');
});

test('Sheet writer never treats a wrong readback identity as success', async () => {
  const writer = createSheetWriter({ url, token, fetcher: async () => ({ ok: true, async json() { return { ok: true, spreadsheetId, profileSlug: 'different-person', status: 'Sent', rowNumber: 297 }; } }) });
  await assert.rejects(writer.markDone(contact, spreadsheetId), /not verified/i);
  assert.equal(createSheetWriter({ url: '', token: '' }).configured(), false);
});

test('Sheet writer does not expose secrets echoed in upstream errors', async () => {
  const writer = createSheetWriter({ url, token, fetcher: async () => ({ ok: true, async json() { return { ok: false, error: `Invalid token: ${token}` }; } }) });
  await assert.rejects(writer.markDone(contact, spreadsheetId), error => {
    assert.ok(!error.message.includes(token));
    return /not verified/i.test(error.message);
  });
});
