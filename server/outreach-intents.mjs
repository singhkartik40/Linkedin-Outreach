import { randomUUID } from 'node:crypto';

const lifetime = 15 * 60 * 1000;
const intents = new Map();

export function beginOutreach(contact, now = Date.now()) {
  for (const [token, intent] of intents) if (intent.expiresAt <= now || intent.contactId === contact.id) intents.delete(token);
  const token = randomUUID();
  intents.set(token, { contactId: contact.id, profileUrl: contact.profileUrl, message: contact.message, expiresAt: now + lifetime });
  return token;
}

export function consumeOutreach(token, contact, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 100) return false;
  const intent = intents.get(token);
  if (!intent || intent.expiresAt <= now || intent.contactId !== contact.id || intent.profileUrl !== contact.profileUrl || intent.message !== contact.message) return false;
  intents.delete(token);
  return true;
}
