import test from 'node:test';
import assert from 'node:assert/strict';
import { saveContactDraft, changeContact } from '../server/contact-actions.mjs';
import { matchesCity } from '../server/locations.mjs';

const contact = { id: 'one', name: 'Asha', status: 'Draft ready', message: 'Original message' };
test('edits retain versions; restoring a previous version retains the current message', () => {
  const edited = saveContactDraft(contact, { message: 'Updated message' });
  assert.equal(edited.messageVersions[0].message, contact.message);
  const restored = changeContact(edited, { action: 'restore-version', versionId: edited.messageVersions[0].id });
  assert.equal(restored.message, contact.message);
  assert.equal(restored.messageVersions.at(-1).message, 'Updated message');
  assert.throws(() => saveContactDraft(contact, { message: 'x'.repeat(291) }));
});
test('contact and version deletion are recoverable, and delivery records stay immutable', () => {
  const edited = saveContactDraft(contact, { message: 'New text' });
  const deleted = changeContact(edited, { action: 'delete' });
  assert.ok(deleted.deletedAt);
  assert.equal(changeContact(deleted, { action: 'restore' }).message, 'New text');
  assert.throws(() => saveContactDraft(deleted, { message: 'Overwrite' }));
  const versionId = edited.messageVersions[0].id;
  const hidden = changeContact(edited, { action: 'delete-version', versionId });
  assert.ok(hidden.messageVersions[0].deletedAt);
  assert.throws(() => changeContact(hidden, { action: 'restore-version', versionId }));
  assert.equal(changeContact(hidden, { action: 'undo-delete-version', versionId }).messageVersions[0].deletedAt, null);
  assert.throws(() => saveContactDraft({ ...contact, status: 'Sent' }, { message: 'Change history' }));
  assert.equal(changeContact({ ...contact, status: 'Sent' }, { action: 'delete' }).status, 'Sent');
});
test('city matching checks visible job location and accepts common city aliases', () => {
  assert.equal(matchesCity('Bangalore, Karnataka, India (Hybrid)', ['Bengaluru']), true);
  assert.equal(matchesCity('Gurgaon, India', ['Gurugram']), true);
  assert.equal(matchesCity('Mumbai, India', ['Pune']), false);
  assert.equal(matchesCity('', ['Bengaluru']), false);
  assert.equal(matchesCity('India (Remote)', ['Remote']), true);
  assert.equal(matchesCity('India', ['Remote']), false);
});
