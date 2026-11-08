import test from 'node:test';
import assert from 'node:assert/strict';
import { beginOutreach, consumeOutreach } from '../server/outreach-intents.mjs';
import { resumeUrl } from '../server/outreach-message.mjs';

test('a send receipt is bound to one contact and one prepared message', () => {
  const contact = { id: 'contact-1', profileUrl: 'https://www.linkedin.com/in/person/', message: `Hello. Resume: ${resumeUrl}` };
  const token = beginOutreach(contact, 1000);
  assert.equal(consumeOutreach(token, { ...contact, message: 'Different' }, 1001), false);
  assert.equal(consumeOutreach(token, { ...contact, id: 'contact-2' }, 1001), false);
  assert.equal(consumeOutreach(token, contact, 1001), true);
  assert.equal(consumeOutreach(token, contact, 1002), false);
});

test('old send receipts expire and preparing again revokes the previous one', () => {
  const contact = { id: 'contact-3', profileUrl: 'https://www.linkedin.com/in/other/', message: `Hi. Resume: ${resumeUrl}` };
  const old = beginOutreach(contact, 1000);
  const current = beginOutreach(contact, 2000);
  assert.equal(consumeOutreach(old, contact, 2001), false);
  assert.equal(consumeOutreach(current, contact, 2000 + 15 * 60 * 1000 + 1), false);
});

test('missing, truncated, changed and overlong resume notes cannot receive a send receipt', () => {
  const contact = { id: 'bad-note', profileUrl: 'https://www.linkedin.com/in/person/' };
  for (const message of ['Hello', `Resume: ${resumeUrl.slice(0, -1)}`, `Resume: ${resumeUrl}-wrong`, `Resume: ${resumeUrl.replace('16hilLHZ3', 'wrong-file')}`, `${'x'.repeat(290)} ${resumeUrl}`]) {
    assert.throws(() => beginOutreach({ ...contact, message }), /resume link|1–290/);
  }
  const message = `Hi. Resume: (${resumeUrl}).`;
  const token = beginOutreach({ ...contact, message });
  assert.equal(consumeOutreach(token, { ...contact, message }), true);
});
