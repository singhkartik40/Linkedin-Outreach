import { initialSchedule, claimSchedule, finishSchedule, INTERVAL } from './discovery-schedule.mjs';
import { companyOutreachLimit, repostedAfter } from './company-limit.mjs';
import { createJobBoard, jobSnapshot, jobSearchEligibility } from './job-board.mjs';
import { founderFromDiscovery } from './founder-discovery.mjs';
import { beginOutreach, consumeOutreach } from './outreach-intents.mjs';
import { eligibleDesignJob, withinCompanyQuota, contactRole, currentEmployment } from './discovery-policy.mjs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import { createGoogle } from './google.mjs';
import { createSheetWriter } from './sheet-writer.mjs';
import { buildOutreachMessage, refreshDraftMessages } from './outreach-message.mjs';
import { changeContact, saveContactDraft } from './contact-actions.mjs';
import { matchesCity, matchesContactToJobLocation, isIndianLocation } from './locations.mjs';
import { isLatestJob } from './recent-jobs.mjs';
import { canonicalUrl, validateExtraction, evaluateJob, sendingCapability, isDuplicate, profileSlug, trackerConfirmsDelivery } from './domain.mjs';
import { providerDefaults, validateProvider, generate, parseJson, extractionPrompt } from './providers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4318);
const store = createStore(process.env.DATA_DIR || path.join(root, '.data'));
const jobBoard = createJobBoard(store);
if (!store.get('fullNoteLinksMigrationV2')) {
  store.set('contacts', refreshDraftMessages(store.get('contacts', [])));
  store.set('fullNoteLinksMigrationV2', true);
}
if (!store.get('politeDraftsV061')) {
  store.set('contacts', refreshDraftMessages(store.get('contacts', [])));
  store.set('politeDraftsV061', true);
}
store.set('contacts', store.get('contacts', []).map(contact => ({ ...contact, messageVersions: (contact.messageVersions || []).map(version => ({ ...version, id: version.id || randomUUID() })) })));
const google = createGoogle();
let sheetWriter = createSheetWriter();
const defaultSpreadsheetId = '1M61OSpGnYkTYEbZbsaABS4j7QsxaHRV9L24PXniwIIY';
if (!store.get('spreadsheetId', '')) store.set('spreadsheetId', defaultSpreadsheetId);
const sessionKeys = new Map();
const identity = config => `${config.provider}:${config.baseUrl}`;
const keyFor = config => sessionKeys.get(identity(config)) ?? process.env[providerDefaults[config.provider].env] ?? '';
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, 'http://127.0.0.1:5173']);
const allowedHosts = new Set([`127.0.0.1:${port}`, '127.0.0.1:5173']);
function reply(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 150000) throw new Error('Input is too large. Limit pasted text to 60,000 characters.'); }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('Invalid JSON request.'); }
}
if (!store.get('discoverySchedule')) store.set('discoverySchedule', initialSchedule());
function publicState() {
  const provider = store.get('provider');
  const tracker = store.get('tracker');
  const savedContacts = store.get('contacts', []);
  const jobs = store.jobs().filter(job => isIndianLocation(job.facts.location?.value || job.text)).map(job => {
    const limit = companyOutreachLimit(job, tracker, savedContacts);
    return { ...job, assessment: evaluateJob(job.facts), peopleSearch: limit.blocked ? { ...jobSearchEligibility(job), eligible: false, reason: limit.reason } : jobSearchEligibility(job) };
  });
  const master = tracker?.valueRanges?.find(range => /^'?Master'?\!/.test(range.range))?.values || [];
  const headers = master[0] || [], column = name => headers.findIndex(value => String(value).trim().toLowerCase() === name.toLowerCase());
  const sheetRows = master.slice(1).map(row => ({ name: row[column('Person')] || '', profileUrl: row[column('Profile URL')] || '', status: row[column('Status')] || '' }));
  const contacts = savedContacts.map(contact => {
    const companyLimit = companyOutreachLimit(contact, tracker, savedContacts);
    const duplicate = tracker ? isDuplicate(contact, sheetRows) : false;
    const completed = ['Send confirmed', 'Sent'].includes(contact.status);
    const employmentVerified = !!currentEmployment(contact);
    const sheetSyncStatus = completed ? contact.status === 'Sent' ? 'Verified in tracker' : 'Awaiting Sheet update' : null;
    return { ...contact, companyLimit, employmentVerified, message: String(contact.message || ''), sheetStatus: !tracker ? 'Tracker not connected' : duplicate ? 'Already in tracker' : 'Clear to contact', sheetSyncStatus, sheetCheckedAt: tracker?.syncedAt || null, outreachBlocked: companyLimit.blocked || !employmentVerified || !!contact.deletedAt || contact.status === 'Skipped' || completed || !tracker || duplicate };
  });
  const { valueRanges, ...trackerSummary } = tracker || {};
  return { jobBoardSources: store.get('jobBoardSources', {}), discoverySchedule: store.get('discoverySchedule'), provider: provider ? { ...provider, hasKey: !!keyFor(provider) } : null, google: { ...google.status(), writeConfigured: sheetWriter.configured() }, spreadsheetId: store.get('spreadsheetId', defaultSpreadsheetId), tracker: tracker ? trackerSummary : null, jobs, contacts, events: store.events(), sending: sendingCapability, automation: store.get('automation', { autoSync: false, desiredSending: 'automatic' }) };
}
function contactFromDiscovery(person, jobs) {
  const name = String(person.name || '').replace(/\s+/g, ' ').trim();
  const profileUrl = canonicalUrl(person.profileUrl);
  if (!name || !/^https:\/\/(?:[a-z]+\.)?linkedin\.com\/in\//i.test(profileUrl)) throw new Error('A discovered person has an invalid name or LinkedIn profile.');
  const company = String(person.company || '').replace(/\s+/g, ' ').trim();
  const jobUrl = canonicalUrl(person.jobUrl);
  const job = jobs.find(item => item.url === jobUrl && String(item.facts?.company?.value || '').trim().toLowerCase() === company.toLowerCase());
  if (!job) throw new Error('Every new person must match a latest job from this scan at the same company.');
  const jobTitle = String(job.facts?.title?.value || 'Product or UX design role');
  const jobCompany = String(job.facts?.company?.value || company || new URL(job.url).hostname);
  const funding = person.funding || null;
  const message = buildOutreachMessage({ name, company: jobCompany, jobTitle, headline: person.headline, funding });
  const now = new Date().toISOString();
  return { contactRole: contactRole(person.headline), id: randomUUID(), jobId: job.id, jobUrl: job.url, jobTitle, jobLocation: String(job.facts?.location?.value || ''), jobRecency: job.sourceRecency || '', company: jobCompany, name, headline: String(person.headline || 'LinkedIn profile').replace(/\s+/g, ' ').trim(), location: String(person.location || 'Location not shown').replace(/\s+/g, ' ').trim(), profileUrl, degree: String(person.degree || 'Unknown'), connectionState: 'Needs live check', connectionCheckedAt: null, relevance: funding ? `Recent funding reported for ${jobCompany}; a current ${jobTitle} opening suggests an active design need.` : `Found in a LinkedIn people search for ${jobCompany} after the ${jobTitle} role was scanned.`, evidence: String(person.headline || `LinkedIn search result for ${name} at ${jobCompany}`).replace(/\s+/g, ' ').trim(), funding, message, status: 'Draft ready', researchedAt: now };
}
let syncActive = false;
let trackerCheck;
async function ensureFreshTracker() {
  const age = Date.now() - Date.parse(store.get('tracker')?.syncedAt || '');
  if (Number.isFinite(age) && age >= 0 && age < 5 * 60000) return;
  trackerCheck ||= syncTracker().finally(() => { trackerCheck = null; });
  try { await trackerCheck; } catch { throw Error('Could not refresh the tracker. Retry Refresh tracker before starting outreach.'); }
}
async function syncTracker() {
  if (syncActive) throw new Error('A tracker refresh is already running.');
  syncActive = true;
  try {
    const tracker = await google.sync(store.get('spreadsheetId', ''));
    store.set('tracker', tracker); store.event('tracker', `Read ${tracker.rowCount} Master rows. ${tracker.schemaValid ? 'Required headers found.' : 'Schema needs review.'}`);
    const master = tracker.valueRanges.find(range => /^'?Master'?\!/.test(range.range))?.values || [];
    const headers = master[0] || [];
    const col = name => headers.findIndex(value => String(value).trim().toLowerCase() === name.toLowerCase());
    const rows = master.slice(1).map(row => ({ name: row[col('Person')] || '', profileUrl: row[col('Profile URL')] || '', status: String(row[col('Status')] || '').trim() }));
    const contacts = store.get('contacts', []);
    let verified = 0;
    const reconciled = contacts.map(contact => {
      if (contact.status !== 'Send confirmed' || !contact.confirmedAt) return contact;
      if (!trackerConfirmsDelivery(contact, rows)) return contact;
      verified += 1;
      return { ...contact, status: 'Sent', sheetVerifiedAt: tracker.syncedAt };
    });
    if (verified) { store.set('contacts', reconciled); store.event('tracker', `${verified} completed contact${verified === 1 ? '' : 's'} verified in the Sheet.`); }
    return tracker;
  } finally { syncActive = false; }
}
async function syncCompletedContact(id) {
  const contacts = store.get('contacts', []), contact = contacts.find(item => item.id === id);
  if (!contact || !['Send confirmed', 'Sent'].includes(contact.status)) throw new Error('Confirm visible LinkedIn delivery before updating the Sheet.');
  if (contact.status === 'Sent') return { saved: true, sheetUpdated: true, alreadyDone: true };
  try {
    const written = await sheetWriter.markDone(contact, store.get('spreadsheetId', defaultSpreadsheetId));
    store.set('contacts', store.get('contacts', []).map(item => item.id === id ? { ...item, status: 'Sent', sheetVerifiedAt: new Date().toISOString(), sheetRow: written.rowNumber, sheetWriteStatus: written.status, updatedAt: new Date().toISOString() } : item));
    store.event('tracker', `${contact.name}: confirmed delivery written and read back from Master row ${written.rowNumber}.`);
    return { saved: true, sheetUpdated: true, rowNumber: written.rowNumber, status: written.status };
  } catch (error) {
    store.event('sync-error', `${contact.name}: delivery confirmed locally; automatic Sheet update is pending.`);
    return { saved: true, sheetUpdated: false, error: error.message };
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (!allowedHosts.has(req.headers.host)) return reply(res, 403, { error: 'Use the local app URL.' });
  let url;
  try { url = new URL(req.url, `http://127.0.0.1:${port}`); }
  catch { return reply(res, 400, { error: 'Invalid request URL.' }); }
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return reply(res, 403, { error: 'Origin not allowed.' });
  if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method) && !allowedOrigins.has(req.headers.origin)) return reply(res, 403, { error: 'Open the local app to make changes.' });
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') return reply(res, 200, { app: 'outreach-desk', ready: true });
    if (url.pathname === '/api/state' && req.method === 'GET') return reply(res, 200, publicState());
    if (url.pathname === '/api/job-board/sync' && req.method === 'POST') return reply(res, 200, await jobBoard.sync());
    if (/^\/api\/jobs\/[\w-]+\/people-search$/.test(url.pathname) && req.method === 'POST') {
      await ensureFreshTracker();
      const job = store.jobs().find(item => item.id === url.pathname.split('/')[3]);
      if (!job) return reply(res, 404, { error: 'Job not found.' });
      if (!isIndianLocation(job.facts.location?.value)) throw Error('Job discovery is set to India only.');
      const limit = companyOutreachLimit(job, store.get('tracker'), store.get('contacts', []));
      if (limit.blocked) throw Error(limit.reason);
      return reply(res, 200, { job: jobSnapshot(job) });
    }
    if (url.pathname === '/api/founders/import' && req.method === 'POST') {
      await ensureFreshTracker();
      const input = await body(req), current = store.get('contacts', []), known = new Set(current.map(contact => profileSlug(contact.profileUrl)));
      let added = 0, rejected = 0;
      for (const person of (Array.isArray(input.people) ? input.people : []).slice(0, 20)) {
        let contact; try { contact = founderFromDiscovery(person); } catch { rejected++; continue; }
        const slug = profileSlug(contact.profileUrl);
        if (companyOutreachLimit(contact, store.get('tracker'), current).blocked || known.has(slug) || current.filter(item => item.company.toLowerCase() === contact.company.toLowerCase() && item.contactRole === 'founder').length >= 2) continue;
        current.push(contact); known.add(slug); added++;
      }
      store.set('contacts', current);
      return reply(res, 200, { added, addedFounders: added, rejected, total: current.length });
    }
    if (url.pathname === '/api/settings/provider' && req.method === 'POST') {
      const input = await body(req), config = validateProvider(input);
      if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw new Error('API key must be text.');
      if (input.apiKey?.trim()) sessionKeys.set(identity(config), input.apiKey.trim());
      store.set('provider', config); store.event('settings', `${providerDefaults[config.provider].label} configuration updated. No API key logged.`);
      return reply(res, 200, { saved: true });
    }
    if (url.pathname === '/api/provider/test' && req.method === 'POST') {
      const config = store.get('provider'); if (!config) throw new Error('Save provider settings first.');
      await generate(config, keyFor(config), 'Return only {"ok":true}.');
      return reply(res, 200, { message: 'Provider responded successfully.' });
    }
    if (url.pathname === '/api/jobs' && req.method === 'POST') {
      const input = await body(req);
      if (typeof input.text !== 'string' || input.text.trim().length < 30 || input.text.length > 60000) throw new Error('Paste between 30 and 60,000 characters of source text.');
      const sourceUrl = canonicalUrl(input.url);
      if (store.jobs().some(j => j.url === sourceUrl)) return reply(res, 409, { error: 'This source URL is already in your research.' });
      let raw;
      if (input.mode === 'manual') raw = {};
      else {
        const config = store.get('provider'); if (!config) throw new Error('Configure an AI provider, or save the source for manual review.');
        raw = parseJson(await generate(config, keyFor(config), extractionPrompt(input.text)));
      }
      const facts = validateExtraction(raw, input.text), assessment = evaluateJob(facts);
      try { store.addJob(sourceUrl, { text: input.text, facts, extraction: input.mode === 'manual' ? 'manual' : store.get('provider').provider, assessment }); }
      catch (error) { if (String(error.message).includes('UNIQUE')) return reply(res, 409, { error: 'This job was saved by another request.' }); throw error; }
      store.event('job', `Job imported: ${assessment.status}. ${assessment.failures.length} exclusions, ${assessment.unresolved.length} unresolved checks.`);
      return reply(res, 201, { saved: true });
    }
    if (url.pathname === '/api/jobs/discovered' && req.method === 'POST') {
      const input = await body(req), discovered = Array.isArray(input.jobs) ? input.jobs.slice(0, 60) : [];
      let added = 0, fresh = 0;
      for (const item of discovered) {
        if (!isLatestJob(item) || !eligibleDesignJob(item) || !(item.country === 'India' || isIndianLocation(item.location)) || !matchesCity(item.location, input.cities, item.country, item.searchLocation)) continue;
        let sourceUrl;
        try { sourceUrl = canonicalUrl(item.url); } catch { continue; }
        if (!/^https:\/\/(?:[a-z]+\.)?linkedin\.com\/jobs\/view\/\d+/i.test(sourceUrl)) continue;
        const title = String(item.title || '').trim().slice(0, 200), company = String(item.company || '').trim().slice(0, 160);
        if (!title || !company) continue;
        fresh += 1;
        const existing = store.jobs().find(job => job.url === sourceUrl);
        if (existing) {
          const { id, url: savedUrl, createdAt, ...saved } = existing;
          store.updateJob(id, { ...saved, sourceRecency: String(item.recency).trim().slice(0, 100), observedAt: new Date().toISOString() });
          continue;
        }
        const location = `${String(item.location || '').trim().slice(0, 160)}${item.country === 'India' && !/\bindia\b/i.test(item.location || '') ? ', India' : ''}`, sourceRecency = String(item.recency || '').trim().slice(0, 100);
        const text = `${title}\n${company}\n${location}\nLinkedIn search age: ${sourceRecency}\n${String(item.source || '').slice(0, 1200)}`;
        const raw = { title: { value: title, evidence: title }, company: { value: company, evidence: company }, location: location ? { value: location, evidence: location } : undefined };
        const facts = validateExtraction(raw, text);
        store.addJob(sourceUrl, { text, facts, assessment: evaluateJob(facts), extraction: 'visible_linkedin_search', sourceRecency });
        added += 1;
      }
      if (added) store.event('job', `Found ${added} new LinkedIn jobs in a people-finding run. Details still need verification.`);
      return reply(res, 200, { added, scanned: discovered.length, fresh });
    }
    if (/^\/api\/jobs\/[\w-]+\/facts$/.test(url.pathname) && req.method === 'POST') {
      const id = url.pathname.split('/')[3], job = store.jobs().find(j => j.id === id);
      if (!job) return reply(res, 404, { error: 'Job not found.' });
      const input = await body(req), facts = validateExtraction(input.facts, job.text);
      const { id: ignoredId, url: ignoredUrl, createdAt: ignoredDate, ...data } = job;
      store.updateJob(id, { ...data, facts, assessment: evaluateJob(facts), reviewedAt: new Date().toISOString() });
      store.event('review', 'Job facts reviewed. Unsupported quotes remain unresolved.');
      return reply(res, 200, { saved: true });
    }
    if (/^\/api\/contacts\/[\w-]+$/.test(url.pathname) && req.method === 'POST') {
      const id = url.pathname.split('/')[3], contacts = store.get('contacts', []), contact = contacts.find(item => item.id === id);
      if (!contact) return reply(res, 404, { error: 'Contact not found.' });
      const input = await body(req), updated = saveContactDraft(contact, input);
      store.set('contacts', contacts.map(item => item.id === id ? updated : item));
      store.event('contact', `${contact.name}: ${updated.status}.`);
      return reply(res, 200, { saved: true });
    }
    if (/^\/api\/contacts\/[\w-]+\/actions$/.test(url.pathname) && req.method === 'POST') {
      const id = url.pathname.split('/')[3], contacts = store.get('contacts', []), contact = contacts.find(item => item.id === id);
      if (!contact) return reply(res, 404, { error: 'Contact not found.' });
      const input = await body(req), updated = changeContact(contact, input);
      store.set('contacts', contacts.map(item => item.id === id ? updated : item));
      store.event('contact', `${contact.name}: ${input.action}.`);
      return reply(res, 200, { saved: true });
    }
    if (/^\/api\/contacts\/[\w-]+\/done$/.test(url.pathname) && req.method === 'POST') {
      const id = url.pathname.split('/')[3], contacts = store.get('contacts', []), contact = contacts.find(item => item.id === id);
      if (!contact) return reply(res, 404, { error: 'Contact not found.' });
      if (contact.deletedAt || contact.status === 'Skipped') throw new Error('A skipped contact cannot be marked done.');
      if (!['Sent', 'Send confirmed'].includes(contact.status)) {
        const confirmedAt = new Date().toISOString();
        store.set('contacts', contacts.map(item => item.id === id ? { ...item, status: 'Send confirmed', confirmedAt, deliveryEvidence: 'User attested visible LinkedIn success', updatedAt: confirmedAt } : item));
        store.event('contact', `${contact.name}: delivery marked done by user; Sheet write started.`);
      }
      return reply(res, 200, await syncCompletedContact(id));
    }
    if (/^\/api\/contacts\/[\w-]+\/prepare$/.test(url.pathname) && req.method === 'POST') {
      await ensureFreshTracker();
      const id = url.pathname.split('/')[3], contact = publicState().contacts.find(item => item.id === id);
      if (!contact) return reply(res, 404, { error: 'Contact not found.' });
      if (contact.companyLimit.blocked) throw new Error(contact.companyLimit.reason);
      if (contact.outreachBlocked) throw new Error('This contact is not clear for outreach. Refresh the tracker and check the contact.');
      return reply(res, 200, { receiptToken: beginOutreach(contact) });
    }
    if (/^\/api\/contacts\/[\w-]+\/confirm-from-helper$/.test(url.pathname) && req.method === 'POST') {
      const id = url.pathname.split('/')[3], contact = store.get('contacts', []).find(item => item.id === id);
      if (!contact) return reply(res, 404, { error: 'Contact not found.' });
      const input = await body(req);
      if (!consumeOutreach(input.receiptToken, contact)) return reply(res, 403, { error: 'The outreach receipt is invalid or expired.' });
      if (contact.deletedAt || contact.status !== 'Draft ready') return reply(res, 409, { error: 'Contact is no longer ready for outreach.' });
      const confirmedAt = new Date().toISOString();
      store.set('contacts', store.get('contacts', []).map(item => item.id === id ? { ...item, status: 'Send confirmed', confirmedAt, deliveryEvidence: 'LinkedIn send confirmed by Chrome helper', updatedAt: confirmedAt } : item));
      store.event('contact', `${contact.name}: LinkedIn send confirmed by Chrome helper; Sheet write started.`);
      return reply(res, 200, await syncCompletedContact(id));
    }
    if (/^\/api\/contacts\/[\w-]+\/sync-sheet$/.test(url.pathname) && req.method === 'POST') {
      const id = url.pathname.split('/')[3];
      return reply(res, 200, await syncCompletedContact(id));
    }
    if (url.pathname === '/api/people/import' && req.method === 'POST') {
      await ensureFreshTracker();
      const input = await body(req), people = Array.isArray(input.people) ? input.people.slice(0, 50) : [];
      if (!people.length) return reply(res, 200, { saved: true, added: 0, total: store.get('contacts', []).length });
      const freshUrls = new Set((Array.isArray(input.jobs) ? input.jobs : []).filter(item => {
        if (item.verifiedJobId) { const saved = store.jobs().find(job => job.id === item.verifiedJobId && job.url === canonicalUrl(item.url)); if (!saved) return false; try { jobSnapshot(saved); return true; } catch { return false; } }
        return isLatestJob(item) && eligibleDesignJob(item) && matchesCity(item.location, input.cities, item.country, item.searchLocation);
      }).map(item => { try { return canonicalUrl(item.url); } catch { return ''; } }).filter(Boolean));
      if (!freshUrls.size) throw new Error('No visibly recent jobs were supplied with this scan. No people were imported.');
      const jobs = store.jobs().filter(job => freshUrls.has(job.url) && isIndianLocation(job.facts.location?.value || job.text)), current = store.get('contacts', []);
      const founderMode = input.mode === 'founders';
      const mixedMode = input.mode === 'all';
      const preserved = input.replace ? current.filter(contact => (!mixedMode && (contactRole(contact.headline) === 'founder') !== founderMode) || contact.deletedAt || ['Sent', 'Send confirmed', 'Skipped'].includes(contact.status)) : current;
      const byProfile = new Map(preserved.map(contact => [profileSlug(contact.profileUrl), contact]));
      let added = 0;
      const accepted = [];
      for (const person of people) {
        const currentEmploymentEvidence = currentEmployment(person);
        if (!currentEmploymentEvidence) continue;
        const isFounder = contactRole(person.headline) === 'founder';
        const matchedJob = jobs.find(job => job.url === canonicalUrl(person.jobUrl));
        const contact = { ...contactFromDiscovery({ ...person, funding: null }, jobs), postingRepostedAfter: matchedJob ? repostedAfter(matchedJob) : 0, currentEmploymentEvidence, employmentCheckedAt: new Date().toISOString() }, slug = profileSlug(contact.profileUrl);
        if (companyOutreachLimit(contact, store.get('tracker'), current).blocked) continue;
        if ((!mixedMode && isFounder !== founderMode) || !slug || !matchesContactToJobLocation(contact.jobLocation, contact.location)) continue;
        const existing = byProfile.get(slug);
        if (existing) {
          if (existing.status === 'Draft ready' && !existing.deletedAt && existing.company.toLowerCase() === contact.company.toLowerCase()) byProfile.set(slug, { ...existing, headline: contact.headline, currentEmploymentEvidence, employmentCheckedAt: contact.employmentCheckedAt });
          continue;
        }
        if (!withinCompanyQuota(contact, accepted)) continue;
        accepted.push(contact);
        byProfile.set(slug, contact); added += 1;
      }
      store.set('contacts', [...byProfile.values()]);
      store.event('contact-research', `${input.replace ? 'Refreshed' : 'Found'} ${added} LinkedIn people and prepared outreach drafts.`);
      return reply(res, 200, { saved: true, added, addedFounders: accepted.filter(contact => contact.contactRole === 'founder').length, total: byProfile.size });
    }
    if (url.pathname === '/api/tracker/configure' && req.method === 'POST') {
      const input = await body(req), value = String(input.spreadsheetId || '').trim();
      const id = value.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || value;
      if (!/^[\w-]{20,}$/.test(id)) throw new Error('Enter a valid spreadsheet ID or Google Sheets URL.');
      if (id !== store.get('spreadsheetId')) store.set('tracker', null);
      store.set('spreadsheetId', id); return reply(res, 200, { saved: true });
    }
    if (url.pathname === '/api/tracker/writer/configure' && req.method === 'POST') {
      const input = await body(req);
      if (typeof input.url !== 'string' || typeof input.token !== 'string') throw new Error('Enter an Apps Script deployment URL and write token.');
      const next = createSheetWriter({ url: input.url, token: input.token });
      if (!next.configured()) throw new Error('Use an Apps Script /exec URL and a write token of at least 32 characters.');
      sheetWriter = next;
      store.event('settings', 'Sheet writer configured in server memory. No write token logged.');
      return reply(res, 200, { saved: true });
    }
    if (url.pathname === '/api/tracker/sync' && req.method === 'POST') { await syncTracker(); return reply(res, 200, { synced: true }); }
    if (url.pathname === '/api/discovery-schedule' && req.method === 'POST') {
      const input = await body(req), schedule = store.get('discoverySchedule', initialSchedule());
      if (input.action === 'claim') {
        await ensureFreshTracker();
        const next = claimSchedule(store.get('discoverySchedule', initialSchedule()), input.automatic === true);
        if (next) store.set('discoverySchedule', next);
        return reply(res, 200, { claimed: !!next, runId: next?.runId });
      }
      if (input.action === 'finish') {
        store.set('discoverySchedule', finishSchedule(schedule, input.runId, input.status, input.added));
        return reply(res, 200, { saved: true });
      }
      if (typeof input.enabled !== 'boolean') throw Error('Choose whether automatic discovery is enabled.');
      store.set('discoverySchedule', { ...schedule, enabled: input.enabled, nextRunAt: input.enabled ? Date.now() + INTERVAL : schedule.nextRunAt });
      return reply(res, 200, { saved: true });
    }
    if (url.pathname === '/api/automation' && req.method === 'POST') {
      const input = await body(req);
      if (!['manual', 'automatic'].includes(input.desiredSending) || typeof input.autoSync !== 'boolean') throw new Error('Invalid automation settings.');
      store.set('automation', { autoSync: input.autoSync, desiredSending: input.desiredSending });
      return reply(res, 200, { saved: true, sending: sendingCapability });
    }
    if (url.pathname === '/api/send' && req.method === 'POST') return reply(res, 409, { error: sendingCapability.reason });
    if (url.pathname.startsWith('/api/')) return reply(res, 404, { error: 'Unknown endpoint.' });
    if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed.' });
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
    const file = path.resolve(root, 'dist', relative);
    if (!file.startsWith(path.join(root, 'dist') + path.sep)) return reply(res, 403, { error: 'Invalid path.' });
    try {
      const content = await readFile(file);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(content);
    } catch { reply(res, 404, { error: 'Build the dashboard with npm run build, then open the app.' }); }
  } catch (error) {
    const known = error instanceof Error ? error.message : 'Request failed.';
    // Never return upstream response bodies or request objects containing secrets.
    reply(res, 400, { error: known.startsWith('SQLite') ? 'Local storage operation failed.' : known });
  }
});
const timer = setInterval(async () => {
  if (!store.get('automation')?.autoSync || !store.get('spreadsheetId') || syncActive) return;
  try { await syncTracker(); } catch { store.event('sync-error', 'Automatic tracker refresh failed. Check public Sheet sharing or refresh manually.'); }
}, 5 * 60 * 60 * 1000);
timer.unref();
if (port === 4318) {
  void ensureFreshTracker().catch(() => {});
  const trackerTimer = setInterval(() => { void ensureFreshTracker().catch(() => {}); }, 5 * 60000);
  trackerTimer.unref();
  const boardTimer = setInterval(() => { void jobBoard.sync().catch(() => {}); }, 6 * 3600000);
  boardTimer.unref();
  void jobBoard.sync().catch(() => {});
}
server.listen(port, '127.0.0.1', () => console.log(`Outreach Desk is running at http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); });
