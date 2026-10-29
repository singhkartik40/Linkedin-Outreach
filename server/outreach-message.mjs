import { outreachCharacterLimit } from './domain.mjs';

export const portfolioUrl = 'https://karteek.work';
export const resumeUrl = 'https://drive.google.com/file/d/16hilLHZ3_4nvYX56vPKkKpMFjUqpk1oN/view?usp=sharing';
export const requiredPhrase = 'I believe I’d be a strong fit.';

export function buildOutreachMessage({ name, company, jobTitle, headline = '' }) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const first = clean(name).split(' ')[0];
  const founder = /\b(?:co[ -]?)?founder\b/i.test(headline);
  const recruiter = /recruit|talent|human resources|\bhr\b/i.test(headline);
  const seed = [...`${name}|${company}|${headline}`].reduce((sum, letter) => (sum * 31 + letter.codePointAt(0)) >>> 0, 0);
  const requests = founder
    ? ['May I share a brief design pitch?', 'Would you be open to a short design pitch?', 'May I pitch a few ways to help your team?', 'If helpful, may I send a brief design pitch?']
    : recruiter
      ? ['Would you kindly consider my profile?', 'May I ask if my background could fit?', 'If suitable, may I share my profile with you?', 'I would appreciate your consideration.']
      : ['May I ask for your guidance on this role?', 'If comfortable, would you consider a referral?', 'I would appreciate any guidance you can share.', 'Would you be open to a brief chat about the role?'];
  const openings = ["I'm interested in", 'I came across', "I'd love to explore", 'I noticed'];
  const contexts = founder
    ? [clean(company), 'your team']
    : [`the ${clean(jobTitle)} role at ${clean(company)}`, `a design role at ${clean(company)}`, 'your design opening'];
  const links = `Portfolio: ${portfolioUrl} Resume: ${resumeUrl}`;
  // Keep complete sentences and both URLs, shortening context only when necessary.
  for (const context of contexts) {
    for (const greeting of [`Hi ${first},`, 'Hello,']) {
      for (const experience of [' I have 4+ years in product/UX design.', '']) {
        const opening = founder ? `I came across ${context}.` : `${openings[seed % openings.length]} ${context}.`;
        const message = `${greeting} ${opening}${experience} ${requests[seed % requests.length]} ${links}`;
        if (message.length <= outreachCharacterLimit) return message;
      }
    }
  }
  throw new Error('The outreach message cannot fit with both links intact.');
}

export function refreshDraftMessages(contacts) {
  return contacts.map(contact => {
    if (contact.status !== 'Draft ready') return contact;
    const message = buildOutreachMessage(contact);
    if (message === contact.message) return contact;
    return { ...contact, message, messageVersions: [...(contact.messageVersions || []), { message: contact.message, replacedAt: new Date().toISOString() }] };
  });
}
