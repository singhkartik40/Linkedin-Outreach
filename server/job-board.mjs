import { canonicalUrl, validateExtraction, evaluateJob } from './domain.mjs';
import { eligibleDesignJob } from './discovery-policy.mjs';
import { recentJobMinutes } from './recent-jobs.mjs';
import { isIndianLocation } from './locations.mjs';

export const boardSources = [
  { name: 'Jobicy', url: 'https://jobicy.com/api/jobs?count=200&tag=design&geo=india', pollMs: 3600000, delay: 'Listings delayed by 3 hours' },
  { name: 'Remotive', url: 'https://remotive.com/api/remote-jobs?category=design', pollMs: 6 * 3600000, delay: 'Listings delayed by 24 hours' },
];
const clean = value => {
  let text = '', insideTag = false;
  for (const character of String(value || '')) {
    if (character === '<') { insideTag = true; text += ' '; }
    else if (character === '>') insideTag = false;
    else if (!insideTag) text += character;
  }
  return text.replaceAll('&amp;', '&').replace(/\s+/g, ' ').trim();
};
export function normalizeBoardJobs(name, data, now = Date.now()) {
  if (!Array.isArray(data.jobs)) throw Error('Unexpected feed response');
  return data.jobs.slice(0, 500).flatMap(item => {
    const isJobicy = name === 'Jobicy';
    const title = clean(isJobicy ? item.jobTitle : item.title), company = clean(isJobicy ? item.companyName : item.company_name);
    const types = clean(isJobicy ? (item.jobType || []).join(' ') : item.job_type);
    const date = String(isJobicy ? item.pubDate : item.publication_date || '');
    const postedAt = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(date) ? date : `${date.replace(' ', 'T')}Z`);
    if (!company || !eligibleDesignJob({ title, source: types }) || !/full[ _-]?time/i.test(types) || !Number.isFinite(postedAt) || postedAt > now || now - postedAt > 7 * 86400000) return [];
    let url; try { url = canonicalUrl(item.url); } catch { return []; }
    if (new URL(url).protocol !== 'https:' || !(isJobicy ? /^https:\/\/jobicy\.com\/jobs\// : /^https:\/\/remotive\.com\/remote-jobs\//).test(url)) return [];
    const location = clean(isJobicy ? item.jobGeo : item.candidate_required_location) || 'Remote — eligibility not stated';
    if (!isIndianLocation(location)) return [];
    const text = `${title}\n${company}\n${location}\nFull-time\n${new Date(postedAt).toISOString()}\n${clean(isJobicy ? item.jobDescription : item.description).slice(0, 18000)}`;
    const raw = Object.fromEntries(Object.entries({ title, company, location, postedAt: new Date(postedAt).toISOString() }).map(([key, value]) => [key, { value, evidence: value }]));
    const facts = validateExtraction(raw, text);
    return [{ url, text, facts, assessment: evaluateJob(facts), extraction: 'public_job_feed', sourceName: name, employmentType: 'Full-time', publishedAt: new Date(postedAt).toISOString(), fetchedAt: new Date(now).toISOString(), sourceRecency: new Date(postedAt).toISOString() }];
  });
}
export function jobSearchEligibility(job, now = Date.now()) {
  const age = job.publishedAt ? (now - Date.parse(job.publishedAt)) / 60000 : (recentJobMinutes(job.sourceRecency) ?? Infinity) + (now - Date.parse(job.observedAt || job.createdAt)) / 60000;
  const title = job.facts.title?.value, company = job.facts.company?.value;
  const fullTime = job.employmentType === 'Full-time' || job.extraction === 'visible_linkedin_search' || /\bfull[ -]time\b/i.test(job.text || '');
  let reason = '';
  if (!title || !company) reason = 'Job title or company needs verification.';
  else if (!eligibleDesignJob({ title, source: job.employmentType || '' })) reason = 'This role is not a full-time design role (internships and contracts are excluded).';
  else if (!fullTime) reason = 'Full-time status needs verification on the original listing.';
  else if (!Number.isFinite(age) || age < 0) reason = 'Posting time is unverified. Scan recent LinkedIn jobs for fresh evidence.';
  else if (age >= 4320) reason = `Posted about ${Math.floor(age / 60)} hours ago — outside your 3-day outreach window. Scan recent LinkedIn jobs for newer roles.`;
  return { eligible: !reason, reason, ageMinutes: Number.isFinite(age) && age >= 0 ? age : null };
}
export function jobSnapshot(job, now = Date.now()) {
  const eligibility = jobSearchEligibility(job, now);
  if (!eligibility.eligible) throw Error(eligibility.reason);
  return { url: job.url, title: job.facts.title.value, company: job.facts.company.value, location: job.facts.location?.value || '', recency: `${Math.floor(eligibility.ageMinutes)} minutes ago`, source: 'Full-time', sourceName: job.sourceName || 'LinkedIn', verifiedJobId: job.id };
}
export function createJobBoard(store, fetcher = fetch) {
  let active;
  async function sync() {
    if (active) return active;
    active = (async () => {
      const sources = { ...store.get('jobBoardSources', {}) };
      let added = 0;
      const results = await Promise.allSettled(boardSources.map(async source => {
        const previous = sources[source.name];
        if (previous?.attemptAt && Date.now() - Date.parse(previous.attemptAt) < source.pollMs) return;
        const attemptAt = new Date().toISOString();
        try {
          const response = await fetcher(source.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
          if (!response.ok) throw Error(`HTTP ${response.status}`);
          const raw = await response.text();
          if (Buffer.byteLength(raw) > 6000000) throw Error('Feed exceeded size limit');
          const jobs = normalizeBoardJobs(source.name, JSON.parse(raw));
          const known = new Set(store.jobs().map(job => job.url));
          for (const { url, ...job } of jobs) if (!known.has(url)) { store.addJob(url, job); known.add(url); added++; }
          sources[source.name] = { attemptAt, syncedAt: attemptAt, status: 'Connected', count: jobs.length, delay: source.delay };
        } catch (error) { sources[source.name] = { ...previous, attemptAt, status: `Unavailable: ${error.message}`, delay: source.delay }; }
      }));
      if (results.some(result => result.status === 'rejected')) throw Error('A job feed could not be processed');
      store.set('jobBoardSources', sources);
      return { added, sources };
    })().finally(() => { active = null; });
    return active;
  }
  return { sync };
}
