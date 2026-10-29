import { canonicalUrl, profileSlug } from './domain.mjs';
import { contactRole, explicitlyFormerEmployee } from './discovery-policy.mjs';
import { isIndianLocation } from './locations.mjs';
import { buildOutreachMessage } from './outreach-message.mjs';
import { randomUUID } from 'node:crypto';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 600);
export function founderFromDiscovery(person) {
  const name = clean(person.name), company = clean(person.company), headline = clean(person.headline), location = clean(person.location);
  const evidence = clean(person.evidence);
  if (/\b(?:former|previous|ex)[ -]+(?:co[ -]?)?founder\b/i.test(headline)) throw Error('Former founder roles are not current founder evidence.');
  const words = company.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !['private','limited','technologies','india'].includes(word));
  const profileUrl = canonicalUrl(person.profileUrl), sourceUrl = canonicalUrl(person.startupSourceUrl), googleUrl = canonicalUrl(person.googleUrl);
  if (!name || !company || !profileSlug(profileUrl) || !profileUrl.startsWith('https://') || contactRole(headline) !== 'founder' || explicitlyFormerEmployee(person) || !isIndianLocation(location) || !evidence.includes(headline) || !words.length || !words.every(word => headline.toLowerCase().includes(word))) throw Error('Founder needs visible current company, founder role, Indian location and LinkedIn profile evidence.');
  if (new URL(sourceUrl).protocol !== 'https:' || new URL(googleUrl).origin !== 'https://www.google.com' || new URL(googleUrl).pathname !== '/search') throw Error('Founder discovery source is invalid.');
  return { id: randomUUID(), name, company, headline, location, profileUrl, contactRole: 'founder', jobId: '', jobUrl: sourceUrl, jobTitle: 'Startup design pitch', jobLocation: location, jobRecency: '', startupSourceUrl: sourceUrl, googleUrl, discoverySource: 'Google + LinkedIn profile', degree: clean(person.degree) || 'Unknown', connectionState: 'Needs live check', connectionCheckedAt: null, relevance: `Startup discovered on Google; current founder role checked on LinkedIn.`, evidence, funding: null, message: buildOutreachMessage({ name, company, headline }), status: 'Draft ready', researchedAt: new Date().toISOString() };
}
