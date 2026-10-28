import { randomUUID } from 'node:crypto';
import { outreachCharacterLimit } from './domain.mjs';

export const completedContact = contact => ['Send confirmed', 'Sent'].includes(contact.status);
export function saveContactDraft(contact, input) {
  if (completedContact(contact) || contact.deletedAt) throw new Error('Restore the contact first; delivered outreach cannot be edited.');
  const status = String(input.status ?? contact.status);
  if (!['Draft ready', 'Skipped'].includes(status)) throw new Error('Use Mark done only after visible LinkedIn success.');
  const message = String(input.message ?? contact.message).replace(/\s+/g, ' ').trim();
  if (!message || message.length > outreachCharacterLimit) throw new Error('The outreach message must be 1–290 characters.');
  const messageVersions = [...(contact.messageVersions || [])];
  if (message !== contact.message) messageVersions.push({ id: randomUUID(), message: contact.message, replacedAt: new Date().toISOString() });
  return { ...contact, status, message, messageVersions, updatedAt: new Date().toISOString() };
}

export function changeContact(contact, input) {
  const now = new Date().toISOString();
  if (input.action === 'delete') return { ...contact, deletedAt: now };
  if (input.action === 'restore') return { ...contact, deletedAt: null };
  if (!['restore-version', 'delete-version', 'undo-delete-version'].includes(input.action)) throw new Error('Unknown contact action.');
  if (completedContact(contact) || contact.deletedAt) throw new Error('Completed or deleted contact history is read-only.');
  const versions = contact.messageVersions || [];
  const version = versions.find(item => item.id === input.versionId);
  if (!version) throw new Error('Message version not found.');
  if (input.action === 'restore-version') {
    if (version.deletedAt) throw new Error('Undo the version deletion before restoring it.');
    return saveContactDraft(contact, { message: version.message });
  }
  return { ...contact, messageVersions: versions.map(item => item.id === version.id ? { ...item, deletedAt: input.action === 'delete-version' ? now : null } : item) };
}
