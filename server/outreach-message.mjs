import { outreachCharacterLimit } from './domain.mjs';

export const portfolioUrl = 'https://karteek.work';
export const resumeUrl = 'https://drive.google.com/file/d/16hilLHZ3_4nvYX56vPKkKpMFjUqpk1oN/view?usp=sharing';
export const requiredPhrase = 'I believe I’d be a strong fit.';

export function buildOutreachMessage({ name, company, jobTitle, headline = '' }) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const first = clean(name).split(' ')[0];
  if (/\b(?:co[ -]?)?founder\b/i.test(headline)) {
    const links = `Portfolio: ${portfolioUrl} Resume: ${resumeUrl}`;
    for (const greeting of [`Hi ${first},`, 'Hi,']) {
      for (const pitch of [`I saw the ${clean(jobTitle)} opening at ${clean(company)}. I design product/UX experiences. May I share a design pitch for your team?`, `I saw ${clean(company)}'s design opening. May I pitch how I could help your product team?`, 'I design product/UX experiences. May I share a design pitch for your team?']) {
        const message = `${greeting} ${pitch} ${links}`;
        if (message.length <= outreachCharacterLimit) return message;
      }
    }
  }
  const request = /\b(?:co[ -]?)?founder\b/i.test(headline) ? 'Would you consider me?' : 'Could you refer me?';
  const links = `Portfolio: ${portfolioUrl} Resume: ${resumeUrl}`;
  const contexts = [
    `${clean(jobTitle)} at ${clean(company)}`,
    `a design role at ${clean(company)}`,
    clean(jobTitle),
    'your design opening',
  ];
  // Shorten prose, never URLs; choose complete sentences that fit the channel.
  for (const context of contexts) {
    for (const greeting of [`Hi ${first},`, 'Hi,']) {
      for (const experience of ['I have 4+ years in product/UX design. ', '']) {
        const message = `${greeting} I'm interested in ${context}. ${experience}${requiredPhrase} ${request} ${links}`;
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
