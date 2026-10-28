export const fields = ['title', 'company', 'location', 'postedAt', 'experienceMin', 'experienceFlexible', 'salaryLpa', 'saturdayWork', 'roleCategory', 'applicationOpen'];
export function canonicalUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http or https source URL.');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|trk|trackingId|ref$)/i.test(key)) url.searchParams.delete(key);
  return url.toString().replace(/\/$/, '');
}
export function normalizeName(value = '') {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
}
export function profileSlug(value = '') {
  try {
    const url = new URL(value);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return '';
    return decodeURIComponent(url.pathname.match(/^\/in\/([^/]+)/i)?.[1] || '').toLowerCase();
  } catch { return ''; }
}
export function isDuplicate(contact, rows) {
  const name = normalizeName(contact.name), slug = profileSlug(contact.profileUrl);
  return rows.some(row => (name && normalizeName(row.name) === name) || (slug && profileSlug(row.profileUrl) === slug));
}
export function trackerConfirmsDelivery(contact, rows) {
  const slug = profileSlug(contact.profileUrl);
  const name = normalizeName(contact.name);
  return rows.some(row => {
    const rowSlug = profileSlug(row.profileUrl);
    const samePerson = rowSlug ? !!slug && rowSlug === slug : !!name && normalizeName(row.name) === name;
    return samePerson && ['sent', 'invitation pending'].includes(String(row.status || '').trim().toLowerCase());
  });
}
export function validateExtraction(raw, text) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Provider returned invalid job data.');
  const result = {};
  for (const name of fields) {
    const item = raw[name];
    const evidence = typeof item?.evidence === 'string' ? item.evidence.trim() : '';
    let value = item?.value ?? null;
    if (!evidence || !text.includes(evidence)) value = null;
    if (['experienceMin', 'salaryLpa'].includes(name) && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) value = null;
    if (['experienceFlexible', 'saturdayWork', 'applicationOpen'].includes(name) && typeof value !== 'boolean') value = null;
    if (!['experienceMin', 'salaryLpa', 'experienceFlexible', 'saturdayWork', 'applicationOpen'].includes(name) && typeof value !== 'string') value = null;
    result[name] = { value, evidence: value === null ? '' : evidence };
  }
  return result;
}
export function evaluateJob(facts, now = new Date()) {
  const get = key => facts[key]?.value ?? null;
  const failures = [], unresolved = [];
  const fail = (rule, reason) => failures.push({ rule, reason });
  const unknown = (rule, reason) => unresolved.push({ rule, reason });
  const posted = get('postedAt');
  if (!posted || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(posted) || !Number.isFinite(Date.parse(posted))) unknown('POST_DATE', 'An exact posting time and timezone are needed for the 72-hour window.');
  else {
    const age = now.getTime() - Date.parse(posted);
    if (age < 0) unknown('POST_DATE', 'Posting time is in the future.');
    else if (age > 72 * 3600000) fail('POST_DATE', 'Posted more than 72 hours ago.');
  }
  const category = get('roleCategory');
  if (['engineering', 'frontend', 'graphic', 'ui-only', 'lead', 'principal'].includes(category)) fail('ROLE', `Excluded role category: ${category}.`);
  else if (!['product', 'ux'].includes(category)) unknown('ROLE', 'Confirm that this is a Product or UX Designer role.');
  const title = get('title') || '';
  if (/\b(lead|principal|engineer|frontend|graphic)\b/i.test(title) && !failures.some(r => r.rule === 'ROLE')) fail('ROLE', 'Job title includes an excluded role.');
  const location = get('location');
  if (!location) unknown('LOCATION', 'Location or India-remote eligibility is missing.');
  else if (!/\b(india|bengaluru|bangalore|gurgaon|gurugram|pune|hyderabad|delhi|ncr|mumbai|chennai|noida)\b/i.test(location)) unknown('LOCATION', 'Confirm eligibility to work from India.');
  const experience = get('experienceMin');
  if (experience === null) unknown('EXPERIENCE', 'Minimum experience is missing.');
  else if (experience >= 5 && get('experienceFlexible') === false) fail('EXPERIENCE', 'Inflexible minimum of 5 or more years.');
  else if (experience >= 5) unknown('EXPERIENCE', 'Verify whether the experience requirement can accommodate 4+ years.');
  const pay = get('salaryLpa');
  if (pay === null) unknown('PAY', 'Salary is not verified.');
  else if (pay < 12) fail('PAY', 'Disclosed pay is below ₹12 LPA.');
  if (get('saturdayWork') === true) fail('WORKWEEK', 'Saturday work is disclosed.');
  else if (get('saturdayWork') === null) unknown('WORKWEEK', 'Workweek is not verified.');
  if (get('applicationOpen') === false) fail('APPLICATION', 'The listing says it is not accepting applications.');
  if (!get('title') || !get('company')) unknown('IDENTITY', 'Job title and company are required.');
  return { status: failures.length ? 'Excluded' : unresolved.length ? 'To verify' : 'Eligible', failures, unresolved };
}
export function indiaDay(date = new Date()) { return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
export const outreachCharacterLimit = 290;
export function limitOutreachMessage(value, limit = outreachCharacterLimit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const signOffMatch = text.match(/\s+(Thanks|Regards),?\s+Kartik\.?$/i);
  const signOff = signOffMatch ? ` ${signOffMatch[0].trim()}` : '';
  const body = signOff ? text.slice(0, signOffMatch.index).trim() : text;
  const available = limit - signOff.length;
  const clipped = body.slice(0, available + 1);
  const boundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, boundary > available * 0.7 ? boundary : available).replace(/[,:;\-–—\s]+$/, '')}${signOff}`.slice(0, limit);
}
export const sendingCapability = Object.freeze({ available: false, mode: 'manual', reason: 'No supported LinkedIn sending adapter is connected. Automatic sending is unavailable.' });
