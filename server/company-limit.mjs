import { profileSlug, canonicalUrl } from './domain.mjs';
import { recentJobMinutes } from './recent-jobs.mjs';

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const companyKey = value => normalize(value).replace(/\s+(?:private limited|pvt ltd|limited|ltd|incorporated|inc)$/, '');
function postingUrl(value) {
  const link = String(value || '').match(/https?:\/\/[^\s]+/)?.[0];
  try {
    if (!link || !/\/(?:jobs?|careers|positions|openings|remote-jobs)\//i.test(new URL(link).pathname)) return '';
    return canonicalUrl(link).replace(/\/$/, '').replace(/^https:\/\/[a-z]+\.linkedin\.com/, 'https://linkedin.com');
  } catch { return ''; }
}
function sentTime(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return Date.parse(text) || 0;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return 0;
  const [, month, day, year, hour = '00', minute = '00'] = match;
  return Date.parse(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${minute}:00+05:30`) || 0;
}
export function repostedAfter(job) {
  const label = String(job.sourceRecency || job.jobRecency || '');
  const minutes = recentJobMinutes(label);
  const observed = Date.parse(job.observedAt || job.createdAt || job.researchedAt);
  if (!/^reposted\s+\d+\s+(?:minute|hour)s?\s+ago$/i.test(label) || minutes === null || !Number.isFinite(observed)) return 0;
  // A rounded "4 hours ago" means 4–5 hours. Use the older edge, never a speculative reset.
  return observed - (minutes + (/hour/i.test(label) ? 60 : 1)) * 60000;
}
export function trackerContactRows(tracker) {
  const values = tracker?.valueRanges?.find(range => /^'?Master'?\!/.test(range.range))?.values || [];
  const headers = (values[0] || []).map(normalize);
  const at = (row, name) => row[headers.indexOf(normalize(name))] || '';
  return values.slice(1).map(row => ({ name:at(row,'Person'),company:at(row,'Company'),profileUrl:at(row,'Profile URL'),status:at(row,'Status'),jobUrl:at(row,'Job / funding source'),confirmedAt:at(row,'Sent on (IST)') }));
}
export function companyOutreachLimit(target, tracker, contacts = []) {
  const company = companyKey(target.company || target.facts?.company?.value);
  const posting = target.contactRole === 'founder' && !target.jobId ? '' : postingUrl(target.jobUrl || target.url);
  const resetAfter = target.postingRepostedAfter ?? repostedAfter(target);
  const distinct = new Map();
  for (const row of [...trackerContactRows(tracker), ...contacts]) {
    if (!company || companyKey(row.company) !== company || !['sent','send confirmed','invitation pending','replied','accepted','connected'].includes(normalize(row.status))) continue;
    const rowPosting = postingUrl(row.jobUrl);
    if (posting && rowPosting && posting !== rowPosting) continue;
    const identity = profileSlug(row.profileUrl) || normalize(row.name);
    if (!identity) continue;
    const sent = sentTime(row.confirmedAt);
    // Missing dates remain counted; an unproven repost must never bypass the cap.
    if (resetAfter && sent && sent < resetAfter) continue;
    distinct.set(identity, true);
  }
  const count = distinct.size;
  return { count, blocked: count >= 5, reason: count >= 5 ? 'Five people already contacted for this company/posting. A verified repost can start a new round.' : '' };
}
