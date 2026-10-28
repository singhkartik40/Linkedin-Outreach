import test from 'node:test';
import assert from 'node:assert/strict';
import { beginOutreach, consumeOutreach } from '../server/outreach-intents.mjs';

test('a send receipt is bound to one contact and one prepared message', () => {
  const contact = { id: 'contact-1', profileUrl: 'https://www.linkedin.com/in/person/', message: 'Hello' };
  const token = beginOutreach(contact, 1000);
  assert.equal(consumeOutreach(token, { ...contact, message: 'Different' }, 1001), false);
  assert.equal(consumeOutreach(token, { ...contact, id: 'contact-2' }, 1001), false);
  assert.equal(consumeOutreach(token, contact, 1001), true);
  assert.equal(consumeOutreach(token, contact, 1002), false);
});

test('old send receipts expire and preparing again revokes the previous one', () => {
  const contact = { id: 'contact-3', profileUrl: 'https://www.linkedin.com/in/other/', message: 'Hi' };
  const old = beginOutreach(contact, 1000);
  const current = beginOutreach(contact, 2000);
  assert.equal(consumeOutreach(old, contact, 2001), false);
  assert.equal(consumeOutreach(current, contact, 2000 + 15 * 60 * 1000 + 1), false);
});
