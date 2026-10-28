const LOCAL_ORIGIN = 'http://127.0.0.1:4318';
const NOTE_LIMIT = 290;
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const fresh = value => {
  if (/^(?:within\s+)?past 24 hours(?:\s+\(linkedin filter\))?$/i.test(String(value || '').trim())) return true;
  if (/^(?:posted|reposted)?\s*(?:just now|today)$/i.test(value)) return true;
  const match = String(value || '').match(/^(?:posted|reposted)?\s*(\d+)\s*(minute|hour)s?\s*ago$/i);
  return !!match && Number(match[1]) * (match[2].toLowerCase() === 'hour' ? 60 : 1) < 1440;
};
const profileKey = value => { try { return new URL(value).pathname.replace(/\/$/, '').toLowerCase(); } catch { return ''; } };
const contactRole = headline => /\b(?:co[ -]?)?founder\b/i.test(headline || '') ? 'founder' : /recruit|talent|human resources|\bhr\b/i.test(headline || '') ? 'talent' : /(?:product|ux|ui|user experience|interaction)\s*(?:\/\s*ux\s*)?design|design(?:er| lead| manager| director)|head of design/i.test(headline || '') ? 'designer' : '';
const indianPlace = /\b(?:india|bengaluru|bangalore|mumbai|bombay|delhi|noida|gurugram|gurgaon|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|surat|lucknow|chandigarh|kochi|cochin|indore|bhopal|nagpur|vadodara|thiruvananthapuram|visakhapatnam|andhra pradesh|karnataka|maharashtra|telangana|tamil nadu|uttar pradesh|west bengal|gujarat|kerala|rajasthan|punjab|haryana)\b/i;
const isIndianLocation = value => indianPlace.test(String(value || ''));
const matchesContactLocation = (jobLocation, personLocation) => {
  const job = clean(jobLocation);
  const outsideIndia = job && !isIndianLocation(job) && !/^(?:remote|anywhere|worldwide|global|location not shown)$/i.test(job);
  return outsideIndia ? true : isIndianLocation(personLocation);
};
const eligibleJob = job => /(?:product|ux|ui|user experience|interaction).*design|design.*(?:product|ux|ui)/i.test(job.title || '') && !/\bintern(?:ship)?\b|\bcontract\b|part[ -]time|freelance|temporary/i.test(`${job.title} ${job.source || ''}`);
const searchUrl = (company, role = 'designer') => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} ${role === 'founder' ? '(founder OR cofounder)' : role === 'designer' ? '(designer OR "design lead" OR "design manager")' : '(recruiter OR "talent acquisition" OR "human resources")'}`)}`;
const searchesFor = cities => cities.flatMap(location => ['Product Designer', 'UX Designer'].map(keywords => `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords, location, ...(location === 'India' ? { geoId: '102713980' } : {}), f_TPR: 'r86400', f_JT: 'F', sortBy: 'DD' })}`));
function matchesCity(location, cities = ['India'], country = '', searchLocation = '') {
  if (!Array.isArray(cities) || cities.length === 0 || cities.includes('India')) return country === 'India' || isIndianLocation(location);
  const normalize = value => String(value || '').toLowerCase().replace(/bangalore/g, 'bengaluru').replace(/gurgaon/g, 'gurugram').replace(/bombay/g, 'mumbai');
  const visible = normalize(location);
  const searched = normalize(searchLocation).split(',')[0].trim();
  return cities.some(city => {
    const selected = normalize(city).split(',')[0].trim();
    return visible.includes(selected) || (searched && searched === selected);
  });
}

const jobSearches = searchesFor(['India']);
const rolesFor = scan => scan.mode === 'founders' ? ['founder'] : scan.mode === 'all' ? ['designer', 'talent', 'founder'] : ['designer', 'talent'];
const audienceFull = (scan, role) => scan.results.filter(person => (person.contactRole === 'founder') === (role === 'founder')).length >= scan.limit;
function advancePeopleStage(scan) {
  const roles = rolesFor(scan);
  let index = roles.indexOf(scan.role) + 1;
  while (scan.companyIndex < scan.companies.length) {
    if (index >= roles.length) { scan.companyIndex += 1; index = 0; }
    if (scan.companyIndex >= scan.companies.length) return false;
    const role = roles[index];
    if (!audienceFull(scan, role)) { scan.role = role; scan.peoplePage = 1; return true; }
    index += 1;
  }
  return false;
}
function resultJobs(scan, people) {
  const urls = new Set(people.map(person => person.jobUrl));
  return scan.jobs.filter(job => !urls.size || urls.has(job.url)).slice(0, 60);
}
const probeTimers = new Map();
const inviteProbeTimers = new Map();
const scanStage = scan => `${scan.phase}:${scan.phase === 'jobs' ? scan.jobIndex : `${scan.companyIndex}:${scan.role || 'designer'}:${scan.peoplePage || 1}`}`;
const scanPageFor = (scan, url) => scan.phase === 'jobs' && /^https:\/\/www\.linkedin\.com\/jobs\/search(?:-results)?(?:[/?#]|$)/.test(url) ? 'jobs'
  : scan.phase === 'people' && url.startsWith('https://www.linkedin.com/search/results/people/') ? 'people' : '';
async function injectScanScript(tabId, page) {
  await chrome.scripting.executeScript({ target: { tabId }, files: [page === 'jobs' ? 'jobs.js' : 'search.js'] });
  return chrome.tabs.sendMessage(tabId, { type: 'scan-probe' }).catch(() => null);
}
async function retryOrFail(tabId, scan, page, reason) {
  const key = scanStage(scan);
  if (scan.probeRetried === key) {
    if (scan.phase === 'jobs') {
      scan.warnings = [...(scan.warnings || []), `Skipped a LinkedIn ${page} page: ${reason}`].slice(-10);
      await advanceJobsScan(tabId, scan);
      return;
    }
    await chrome.storage.local.remove('peopleScan');
    await sendScanResults({ error: `The Chrome helper could not finish the LinkedIn ${page} page (${reason}). In Chrome, allow Outreach Desk LinkedIn Helper on linkedin.com, reload the helper, and retry.`, jobs: scan.jobs, people: [] });
    return;
  }
  scan.probeRetried = key;
  await chrome.storage.local.set({ peopleScan: scan });
  await sendProgress({ phase: scan.phase, percent: scan.phase === 'jobs' ? 8 : 45, detail: `Reloading LinkedIn ${page} page so the helper can attach`, jobsFound: scan.jobs.length, peopleFound: scan.results.length });
  await chrome.tabs.reload(tabId);
}

function scheduleScanProbe(tabId, tab = {}, delay = 1800) {
  if (probeTimers.has(tabId)) clearTimeout(probeTimers.get(tabId));
  probeTimers.set(tabId, setTimeout(async () => {
    probeTimers.delete(tabId);
    try {
      const { peopleScan } = await chrome.storage.local.get('peopleScan');
      if (!peopleScan || peopleScan.tabId !== tabId) return;
      const current = await chrome.tabs.get(tabId);
      const url = current.url || tab.url || '';
      if (/^https:\/\/www\.linkedin\.com\/(?:authwall|login)/.test(url)) {
        await chrome.storage.local.remove('peopleScan');
        await sendScanResults({ error: 'LinkedIn opened a sign-in page. Sign in in Chrome, then run the scan again.', jobs: peopleScan.jobs, people: [] });
        return;
      }
      const page = scanPageFor(peopleScan, url);
      if (!page) return;
      let response = await chrome.tabs.sendMessage(tabId, { type: 'scan-probe' }).catch(() => null);
      if ((!response?.ok || response.page !== page) && current.status === 'loading' && Date.now() - (peopleScan.stageStartedAt || peopleScan.startedAt || Date.now()) < 10000) {
        await sendProgress({ phase: peopleScan.phase, percent: peopleScan.phase === 'jobs' ? 8 : 45, detail: `Waiting for the LinkedIn ${page} page to become ready`, jobsFound: peopleScan.jobs.length, peopleFound: peopleScan.results.length });
        scheduleScanProbe(tabId, current, 2000);
        return;
      }
      if (!response?.ok || response.page !== page) {
        await sendProgress({ phase: peopleScan.phase, percent: peopleScan.phase === 'jobs' ? 8 : 45, detail: `Attaching the helper to the LinkedIn ${page} page`, jobsFound: peopleScan.jobs.length, peopleFound: peopleScan.results.length });
        response = await injectScanScript(tabId, page).catch(() => null);
      }
      if (response?.ok && response.page === page) {
        const key = scanStage(peopleScan);
        setTimeout(async () => {
          const { peopleScan: pending } = await chrome.storage.local.get('peopleScan');
          if (pending?.tabId === tabId && pending.scanId === peopleScan.scanId && scanStage(pending) === key) await retryOrFail(tabId, pending, page, 'page script did not return results');
        }, 65000);
        return;
      }
      await retryOrFail(tabId, peopleScan, page, 'page script could not be attached');
    } catch (error) {
      await chrome.storage.local.remove('peopleScan');
      await sendScanResults({ error: `LinkedIn scan stopped: ${error.message}`, jobs: [], people: [] });
    }
  }, delay));
}
function scheduleInviteProbe(tabId, delay = 1200) {
  if (inviteProbeTimers.has(tabId)) clearTimeout(inviteProbeTimers.get(tabId));
  inviteProbeTimers.set(tabId, setTimeout(async () => {
    inviteProbeTimers.delete(tabId);
    try {
      const current = await chrome.tabs.get(tabId);
      if (!String(current.url || '').startsWith('https://www.linkedin.com/preload/custom-invite/')) return;
      const response = await chrome.tabs.sendMessage(tabId, { type: 'invite-probe' }).catch(() => null);
      if (!response?.ok) {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['invite.js'] });
        await chrome.tabs.sendMessage(tabId, { type: 'invite-probe' }).catch(() => null);
      }
    } catch {}
  }, delay));
}
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' && !changeInfo.url) return;
  const url = changeInfo.url || tab.url || '';
  if (url.startsWith('https://www.linkedin.com/preload/custom-invite/')) scheduleInviteProbe(tabId);
  scheduleScanProbe(tabId, tab);
});

async function sendScanResults(payload) {
  const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
  for (const tab of tabs) if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'people-scan-results', payload }).catch(() => {});
}
async function sendScanBatch(scan, people) {
  if (!people.length) return;
  const payload = { scanId: scan.scanId, mode: scan.mode || 'team', cities: scan.cities || ['India'], replace: scan.replace, jobs: resultJobs(scan, people), people };
  const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
  for (const tab of tabs) if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: 'people-scan-batch', payload }).catch(() => {});
}
async function sendProgress(payload) {
  const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
  for (const tab of tabs) if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'people-scan-progress', payload }).catch(() => {});
}
async function advanceJobsScan(tabId, scan) {
  const searches = scan.searches || jobSearches;
  scan.jobIndex += 1;
  if (scan.jobIndex < searches.length) {
    scan.stageStartedAt = Date.now();
    await chrome.storage.local.set({ peopleScan: scan });
    const next = new URL(searches[scan.jobIndex]);
    await sendProgress({ phase: 'jobs', percent: 10 + Math.round(25 * scan.jobIndex / searches.length), detail: `${next.searchParams.get('keywords')} · ${next.searchParams.get('location')} · search ${scan.jobIndex + 1}/${searches.length}${scan.warnings?.length ? ` · ${scan.warnings.length} skipped` : ''}`, jobsFound: scan.jobs.length, peopleFound: 0 });
    await chrome.tabs.update(tabId, { url: 'about:blank' });
    await chrome.tabs.update(tabId, { url: searches[scan.jobIndex] });
    return;
  }
  scan.companies = [...new Set(scan.jobs.map(job => clean(job.company)).filter(Boolean))].slice(0, 20);
  if (!scan.companies.length) {
    await chrome.storage.local.set({ lastScanDiagnostics: { ...scan, completedAt: Date.now() } });
    await chrome.storage.local.remove('peopleScan');
    const cardsSeen = (scan.jobDiagnostics || []).reduce((total, page) => total + (page.cardsSeen || 0), 0);
    await sendScanResults({ error: cardsSeen ? `LinkedIn showed ${cardsSeen} job cards across ${searches.length} searches, but none passed the recent full-time design checks.${scan.warnings?.length ? ` Latest issue: ${scan.warnings.at(-1)}` : ''}` : `LinkedIn job cards could not be read across ${searches.length} searches.${scan.warnings?.length ? ` Latest issue: ${scan.warnings.at(-1)}` : ' The results page may still be loading.'}`, jobs: scan.jobs, people: [], diagnostics: scan.jobDiagnostics || [] });
    return;
  }
  scan.phase = 'people'; scan.companyIndex = 0; scan.role = scan.mode === 'founders' ? 'founder' : 'designer'; scan.stageStartedAt = Date.now();
  await chrome.storage.local.set({ peopleScan: scan });
  await sendProgress({ phase: 'people', percent: 40, detail: `Recent jobs checked. Searching people at ${scan.companies[0]}`, jobsFound: scan.jobs.length, peopleFound: 0 });
  await chrome.tabs.update(tabId, { url: 'about:blank' });
  await chrome.tabs.update(tabId, { url: searchUrl(scan.companies[0], scan.role) });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === 'outreach-delivered') {
    chrome.storage.local.get('outreachSession').then(async ({ outreachSession }) => {
      const tabUrl = sender.tab?.url || '';
      if (!outreachSession?.awaitingConfirmation || outreachSession.expiresAt < Date.now() || outreachSession.tabId !== sender.tab?.id || !/^https:\/\/www\.linkedin\.com\/(?:in\/|preload\/custom-invite\/)/.test(tabUrl)) { sendResponse({ ok: false }); return; }
      await chrome.storage.local.remove('outreachSession');
      const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
      for (const tab of tabs) if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: 'outreach-delivered', contactId: outreachSession.contactId }).catch(() => {});
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (request?.type === 'outreach-send-attempt') {
    chrome.storage.local.get('outreachSession').then(async ({ outreachSession }) => {
      if (!outreachSession || outreachSession.tabId !== sender.tab?.id || outreachSession.expiresAt < Date.now()) { sendResponse({ ok: false }); return; }
      await chrome.storage.local.set({ outreachSession: { ...outreachSession, awaitingConfirmation: true } });
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (request?.type === 'scan-context') {
    chrome.storage.local.get('peopleScan').then(({ peopleScan }) => {
      sendResponse(peopleScan?.tabId === sender.tab?.id && peopleScan.phase === 'people'
        ? { company: peopleScan.companies[peopleScan.companyIndex], role: peopleScan.role || 'designer', stageId: scanStage(peopleScan) } : peopleScan?.tabId === sender.tab?.id && peopleScan.phase === 'jobs' ? { city: new URL((peopleScan.searches || jobSearches)[peopleScan.jobIndex]).searchParams.get('location') || 'India', stageId: scanStage(peopleScan) } : {});
    }).catch(() => sendResponse({}));
    return true;
  }
  if (request?.type === 'scan-page-heartbeat') {
    chrome.storage.local.get('peopleScan').then(({ peopleScan }) => {
      if (peopleScan?.tabId === sender.tab?.id && request.stageId === scanStage(peopleScan)) sendProgress({ phase: peopleScan.phase, percent: peopleScan.phase === 'jobs' ? 6 + Math.round(29 * peopleScan.jobIndex / (peopleScan.searches || jobSearches).length) : 40 + Math.round(55 * peopleScan.companyIndex / peopleScan.companies.length), detail: clean(request.detail).slice(0, 180) || `Checking LinkedIn ${peopleScan.phase === 'jobs' ? 'jobs' : 'people'} page ${peopleScan.phase === 'jobs' ? peopleScan.jobIndex + 1 : peopleScan.companyIndex + 1}`, jobsFound: peopleScan.jobs.length, peopleFound: peopleScan.results.length }).catch(() => {});
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (request?.type === 'jobs-scan-page') {
    chrome.storage.local.get('peopleScan').then(async ({ peopleScan }) => {
      if (!peopleScan || peopleScan.tabId !== sender.tab?.id || peopleScan.phase !== 'jobs' || (request.payload?.stageId && request.payload.stageId !== scanStage(peopleScan))) return;
      if (request.payload?.error) peopleScan.warnings = [...(peopleScan.warnings || []), request.payload.error].slice(-10);
      peopleScan.jobDiagnostics = [...(peopleScan.jobDiagnostics || []), { ...request.payload?.diagnostics, stage: scanStage(peopleScan), error: request.payload?.error || '' }];
      const seen = new Set(peopleScan.jobs.map(job => job.url));
      for (const job of request.payload?.jobs || []) if (job.url && eligibleJob(job) && fresh(job.recency) && matchesCity(job.location, peopleScan.cities, job.country, job.searchLocation) && !seen.has(job.url)) { peopleScan.jobs.push(job); seen.add(job.url); }
      await advanceJobsScan(sender.tab.id, peopleScan);
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (request?.type === 'people-scan-page') {
    chrome.storage.local.get('peopleScan').then(async ({ peopleScan }) => {
      if (!peopleScan || peopleScan.tabId !== sender.tab?.id || peopleScan.phase !== 'people' || (request.payload?.stageId && request.payload.stageId !== scanStage(peopleScan))) return;
      const seen = new Set(peopleScan.results.map(person => profileKey(person.profileUrl)));
      const previousCount = peopleScan.results.length;
      peopleScan.rejections ||= { known: 0, location: 0, role: 0, companyUnverified: 0 };
      if (!request.payload?.verifiedCompany) peopleScan.rejections.companyUnverified += 1;
      for (const person of request.payload?.verifiedCompany ? request.payload.people || [] : []) {
        const key = profileKey(person.profileUrl);
        if (!key || seen.has(key)) continue;
        if (peopleScan.excludedProfiles.includes(key)) { peopleScan.rejections.known += 1; continue; }
        const company = peopleScan.companies[peopleScan.companyIndex];
        const job = peopleScan.jobs.find(item => clean(item.company).toLowerCase() === company.toLowerCase());
        if (!job) continue;
        if (!matchesContactLocation(job.country === 'India' ? `${job.location}, India` : job.location, person.location)) { peopleScan.rejections.location += 1; continue; }
        const role = contactRole(person.headline);
        if (role !== (peopleScan.role || 'designer')) { peopleScan.rejections.role += 1; continue; }
        if (audienceFull(peopleScan, role)) continue;
        if (peopleScan.results.filter(item => item.company.toLowerCase() === company.toLowerCase() && item.contactRole === role).length >= 2) continue;
        peopleScan.results.push({ ...person, company, contactRole: role, jobUrl: job.url });
        seen.add(key);
      }
      const company = peopleScan.companies[peopleScan.companyIndex];
      await sendScanBatch(peopleScan, peopleScan.results.slice(previousCount));
      const roleCount = peopleScan.results.filter(person => person.company === company && person.contactRole === peopleScan.role).length;
      if (roleCount < 2 && !audienceFull(peopleScan, peopleScan.role) && request.payload?.hasNextPage && (peopleScan.peoplePage || 1) < 3) {
        const next = new URL(sender.tab.url);
        if (next.origin === 'https://www.linkedin.com' && next.pathname === '/search/results/people/') {
          peopleScan.peoplePage = (peopleScan.peoplePage || 1) + 1;
          peopleScan.stageStartedAt = Date.now();
          next.searchParams.set('page', String(peopleScan.peoplePage));
          await chrome.storage.local.set({ peopleScan });
          await sendProgress({ phase: 'people', percent: 40 + Math.round(55 * peopleScan.companyIndex / peopleScan.companies.length), detail: `Checking more ${peopleScan.role} profiles at ${company} · page ${peopleScan.peoplePage}`, jobsFound: peopleScan.jobs.length, peopleFound: peopleScan.results.length });
          await chrome.tabs.update(sender.tab.id, { url: 'about:blank' });
          await chrome.tabs.update(sender.tab.id, { url: next.href });
          sendResponse({ ok: true }); return;
        }
      }
      const hasNextStage = advancePeopleStage(peopleScan);
      if (!hasNextStage) {
        const payload = { scanId: peopleScan.scanId, mode: peopleScan.mode || 'team', cities: peopleScan.cities || ['India'], warnings: peopleScan.warnings || [], rejections: peopleScan.rejections, replace: peopleScan.replace, jobs: resultJobs(peopleScan, peopleScan.results), people: peopleScan.results };
        await chrome.storage.local.set({ lastScanDiagnostics: { ...peopleScan, completedAt: Date.now() } });
        await chrome.storage.local.remove('peopleScan');
        await sendProgress({ phase: 'complete', percent: 100, detail: `Checked ${peopleScan.jobs.length} jobs and found ${payload.people.length} new people`, jobsFound: peopleScan.jobs.length, peopleFound: payload.people.length });
        await sendScanResults(payload);
        sendResponse({ ok: true, complete: true });
      } else {
        peopleScan.stageStartedAt = Date.now();
        await chrome.storage.local.set({ peopleScan });
        await sendProgress({ phase: 'people', percent: 40 + Math.round(55 * peopleScan.companyIndex / peopleScan.companies.length), detail: `Finding ${peopleScan.role === "founder" ? "founders" : peopleScan.role === "designer" ? "designers" : "HR / talent"} at ${peopleScan.companies[peopleScan.companyIndex]} (${peopleScan.companyIndex + 1}/${peopleScan.companies.length})`, jobsFound: peopleScan.jobs.length, peopleFound: peopleScan.results.length });
        await chrome.tabs.update(sender.tab.id, { url: 'about:blank' });
        await chrome.tabs.update(sender.tab.id, { url: searchUrl(peopleScan.companies[peopleScan.companyIndex], peopleScan.role) });
        sendResponse({ ok: true, complete: false });
      }
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (!['prepare-outreach', 'scan-people'].includes(request?.type)) return;
  if (!sender.url?.startsWith(`${LOCAL_ORIGIN}/`)) { sendResponse({ ok: false, error: 'Untrusted sender.' }); return; }

  if (request.type === 'scan-people') {
    const limit = Math.min(50, Math.max(20, Number(request.payload?.limit) || 20));
    const cities = Array.isArray(request.payload?.cities) && request.payload.cities.length ? [...new Set(request.payload.cities.map(clean).filter(city => city && city.length <= 80))].slice(0, 12) : ['India'];
    if (!cities.length) { sendResponse({ ok: false, error: 'Select at least one city.' }); return; }
    const searches = searchesFor(cities);
    sendResponse({ ok: true });
    chrome.tabs.create({ url: 'about:blank', active: true }).then(async tab => {
      if (!tab?.id) throw new Error('Could not open LinkedIn people search.');
      const startedAt = Date.now();
      await chrome.storage.local.set({ peopleScan: { scanId: `${startedAt}-${Math.random().toString(36).slice(2)}`, tabId: tab.id, phase: 'jobs', mode: 'all', jobIndex: 0, cities, searches, jobs: [], companies: [], companyIndex: 0, results: [], excludedProfiles: (request.payload?.excludedProfiles || []).map(profileKey).filter(Boolean), limit, replace: !!request.payload?.replace, startedAt, stageStartedAt: startedAt } });
      await sendProgress({ phase: 'jobs', percent: 5, detail: 'Checking the latest LinkedIn jobs', jobsFound: 0, peopleFound: 0 });
      await chrome.tabs.update(tab.id, { url: searches[0] });
    }).catch(async error => {
      await sendScanResults({ replace: !!request.payload?.replace, people: [], error: error.message });
    });
    return;
  }

  try {
    const profile = new URL(request.payload?.profileUrl);
    const message = clean(request.payload?.message);
    const contactId = clean(request.payload?.contactId);
    const receiptToken = clean(request.payload?.receiptToken);
    if (profile.protocol !== 'https:' || !/(^|\.)linkedin\.com$/.test(profile.hostname) || !profile.pathname.startsWith('/in/')) throw new Error('Invalid LinkedIn profile URL.');
    profile.search = ''; profile.hash = '';
    if (!profile.pathname.endsWith('/')) profile.pathname += '/';
    if (!message || message.length > NOTE_LIMIT) throw new Error(`Connection note must be 1–${NOTE_LIMIT} characters.`);
    if (!/^[\da-f-]{36}$/i.test(contactId) || !/^[\da-f-]{36}$/i.test(receiptToken)) throw new Error('Outreach receipt is missing or invalid.');
    const pendingOutreach = { profileUrl: profile.href, message, contactName: clean(request.payload?.contactName), createdAt: Date.now(), expiresAt: Date.now() + 15 * 60 * 1000 };
    chrome.storage.local.set({ pendingOutreach }, async () => {
      if (chrome.runtime.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return; }
      try {
        const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/in/*' });
        const existing = tabs.find(tab => {
          try { return new URL(tab.url).pathname.replace(/\/$/, '') === profile.pathname.replace(/\/$/, ''); }
          catch { return false; }
        });
        if (existing?.id) {
          await chrome.storage.local.set({ outreachSession: { contactId, tabId: existing.id, profileUrl: profile.href, expiresAt: pendingOutreach.expiresAt, awaitingConfirmation: false } });
          await chrome.tabs.update(existing.id, { active: true });
          await chrome.tabs.reload(existing.id);
          sendResponse({ ok: true, tabId: existing.id });
        } else {
          const tab = await chrome.tabs.create({ url: profile.href, active: true });
          if (tab?.id) {
            await chrome.storage.local.set({ outreachSession: { contactId, tabId: tab.id, profileUrl: profile.href, expiresAt: pendingOutreach.expiresAt, awaitingConfirmation: false } });
          }
          sendResponse({ ok: !!tab, tabId: tab?.id });
        }
      } catch (error) { sendResponse({ ok: false, error: error.message }); }
    });
  } catch (error) { sendResponse({ ok: false, error: error.message }); }
  return true;
});
