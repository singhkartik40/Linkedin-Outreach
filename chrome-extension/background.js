const LOCAL_ORIGIN = 'http://127.0.0.1:4318';
const NOTE_LIMIT = 290;
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const fresh = value => {
  if (/^(?:within\s+)?past (?:24 hours|3 days)(?:\s+\(linkedin filter\))?$/i.test(String(value || '').trim())) return true;
  if (/^(?:posted|reposted)?\s*(?:just now|today)$/i.test(value)) return true;
  const match = String(value || '').match(/^(?:posted|reposted)?\s*(\d+)\s*(minute|hour|day)s?\s*ago$/i);
  return !!match && Number(match[1]) * ({minute:1,hour:60,day:1440}[match[2].toLowerCase()]) < 4320;
};
const profileKey = value => { try { return new URL(value).pathname.replace(/\/$/, '').toLowerCase(); } catch { return ''; } };
function matchesOutreachTab(value, profileUrl) {
  try {
    const current = new URL(value);
    if (current.origin !== 'https://www.linkedin.com') return false;
    const path = current.pathname === '/preload/custom-invite/'
      ? `/in/${current.searchParams.get('vanityName') || ''}`
      : decodeURIComponent(current.pathname).replace(/\/$/, '');
    return path.toLowerCase() === decodeURIComponent(profileKey(profileUrl)).toLowerCase();
  } catch { return false; }
}
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
const searchesFor = cities => cities.flatMap(location => ['Product Designer', 'UX Designer'].map(keywords => `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords, location, ...(location === 'India' ? { geoId: '102713980' } : {}), f_TPR: 'r259200', f_JT: 'F', sortBy: 'DD' })}`));
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
const rolesFor = scan => scan.mode === 'founders' ? ['founder'] : ['designer', 'talent'];
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
const cancelledScans = new Set();
let scanGeneration = 0;
let startingScan = null;
function assertScanRunning(scan) {
  if (cancelledScans.has(scan.scanId)) throw new Error('Scan stopped by user.');
}
async function saveScan(scan) {
  assertScanRunning(scan);
  await chrome.storage.local.set({ peopleScan: scan });
  if (cancelledScans.has(scan.scanId)) {
    const { peopleScan: current } = await chrome.storage.local.get('peopleScan');
    if (current?.scanId === scan.scanId) await chrome.storage.local.remove('peopleScan');
    assertScanRunning(scan);
  }
}
async function updateScanTab(scan, url) {
  assertScanRunning(scan);
  await chrome.tabs.update(scan.tabId, { url });
  assertScanRunning(scan);
}
const scanStage = scan => `${scan.phase}:${scan.phase === 'jobs' ? scan.jobIndex : ['startups','google-founders','founder-profile'].includes(scan.phase) ? `${scan.startupIndex || 0}:${scan.candidateIndex || 0}` : `${scan.companyIndex}:${scan.role || 'designer'}:${scan.peoplePage || 1}`}`;
const scanPageFor = (scan, url) => scan.phase === 'jobs' && /^https:\/\/www\.linkedin\.com\/jobs\/search(?:-results)?(?:[/?#]|$)/.test(url) ? 'jobs'
  : scan.phase === 'people' && url.startsWith('https://www.linkedin.com/search/results/people/') ? 'people'
  : ['startups','google-founders'].includes(scan.phase) && url.startsWith('https://www.google.com/search?') ? 'google'
  : scan.phase === 'founder-profile' && url.startsWith('https://www.linkedin.com/in/') ? 'founder' : '';
async function injectScanScript(tabId, page) {
  await chrome.scripting.executeScript({ target: { tabId }, files: page === 'people' ? ['employment.js', 'search.js'] : [page === 'jobs' ? 'jobs.js' : 'discovery.js'] });
  return chrome.tabs.sendMessage(tabId, { type: 'scan-probe' }).catch(() => null);
}
async function retryOrFail(tabId, scan, page, reason) {
  assertScanRunning(scan);
  const key = scanStage(scan);
  if (scan.probeRetried === key) {
    if (['startups','google-founders','founder-profile'].includes(scan.phase)) {
      scan.warnings = [...(scan.warnings || []), `Skipped ${scan.phase}: ${reason}`];
      if (scan.phase === 'startups') return finishScan(scan);
      return advanceFounders(scan);
    }
    if (scan.phase === 'jobs') {
      scan.warnings = [...(scan.warnings || []), `Skipped a LinkedIn ${page} page: ${reason}`].slice(-10);
      await advanceJobsScan(tabId, scan);
      return;
    }
    await chrome.storage.local.remove('peopleScan');
    scan.warnings = [...(scan.warnings || []), `LinkedIn ${page} page failed: ${reason}`];
    await finishScan(scan);
    return;
  }
  scan.probeRetried = key;
  await saveScan(scan);
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
      if (url.startsWith('https://www.google.com/sorry/') || url.startsWith('https://consent.google.com/')) {
        peopleScan.warnings = [...(peopleScan.warnings || []), 'Google requires verification or consent in the scan tab. Complete it yourself in Chrome, then retry founder discovery.'];
        await finishScan(peopleScan); return;
      }
      if (/^https:\/\/www\.linkedin\.com\/(?:authwall|login)/.test(url)) {
        peopleScan.warnings = [...(peopleScan.warnings || []), 'LinkedIn opened a sign-in page. Sign in in Chrome, then retry.'];
        await finishScan(peopleScan);
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
        await chrome.scripting.executeScript({ target: { tabId }, files: ['send-watch.js', 'invite.js'] });
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
  assertScanRunning(scan);
  if (!people.length) return;
  const payload = { scanId: scan.scanId, mode: scan.mode || 'team', cities: scan.cities || ['India'], replace: scan.replace, jobs: resultJobs(scan, people), people, independentFounders: scan.phase === 'founder-profile', targeted: !!scan.targeted };
  const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
  for (const tab of tabs) if (tab.id) { assertScanRunning(scan); await chrome.tabs.sendMessage(tab.id, { type: 'people-scan-batch', payload }).catch(() => {}); }
}
async function sendProgress(payload) {
  const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
  for (const tab of tabs) if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'people-scan-progress', payload }).catch(() => {});
}
async function closeScanTab(scan) { if (Number.isInteger(scan.tabId) && chrome.tabs.remove) await chrome.tabs.remove(scan.tabId).catch(() => {}); }
async function finishScan(scan) {
  assertScanRunning(scan);
  await chrome.storage.local.set({ lastScanDiagnostics: { ...scan, completedAt: Date.now() } });
  assertScanRunning(scan);
  await chrome.storage.local.remove('peopleScan');
  await sendScanResults({ scanId: scan.scanId, mode: scan.mode, cities: scan.cities, warnings: scan.warnings || [], replace: scan.replace, jobs: resultJobs(scan, scan.results), people: scan.results.filter(person => !person.independentFounder), founders: scan.results.filter(person => person.independentFounder), targeted: !!scan.targeted });
  await closeScanTab(scan);
}
async function navigate(scan, url, detail) {
  assertScanRunning(scan);
  scan.stageStartedAt = Date.now();
  await saveScan(scan);
  await sendProgress({ phase: scan.phase, percent: 75 + Math.min(20, (scan.startupIndex || 0) * 2), detail, jobsFound: scan.jobs.length, peopleFound: scan.results.length });
  await updateScanTab(scan, 'about:blank');
  await updateScanTab(scan, url);
  scheduleScanProbe(scan.tabId, {}, 1500);
}
async function startFounders(scan) {
  assertScanRunning(scan);
  if (scan.targeted || scan.mode === 'team') return finishScan(scan);
  scan.phase = 'startups'; scan.startupIndex = 0;
  const { founderSearchOffset = 0 } = await chrome.storage.local.get('founderSearchOffset');
  const offset = Number(founderSearchOffset) || 0;
  await chrome.storage.local.set({ founderSearchOffset: (offset + 10) % 40 });
  const locations = scan.cities.filter(city => city !== 'India');
  const city = locations[Math.floor(offset / 10) % Math.max(1, locations.length)] || 'India';
  await navigate(scan, `https://www.google.com/search?q=${encodeURIComponent(`SaaS product platform ${city} site:linkedin.com/company -ventures -capital -incubator -accelerator -community -news -directory`)}&num=10&start=${offset}`, 'Google: discovering product startups before looking for their founders');
}
async function searchStartupFounder(scan) {
  const startup = scan.startups[scan.startupIndex];
  if (!startup || scan.results.filter(person => person.independentFounder).length >= 20) return finishScan(scan);
  scan.phase = 'google-founders'; scan.candidateIndex = 0;
  await navigate(scan, `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in/ "${startup.company}" (founder OR cofounder) India`)}&num=10`, `Google: finding founder profiles at ${startup.company}`);
}
async function advanceFounders(scan) {
  if (scan.phase === 'founder-profile' && ++scan.candidateIndex < scan.candidates.length) {
    return navigate(scan, scan.candidates[scan.candidateIndex].profileUrl, 'Checking founder identity and current company on LinkedIn');
  }
  scan.startupIndex++;
  return searchStartupFounder(scan);
}
async function resumeJobSearch(tabId, scan) {
  assertScanRunning(scan);
  const searches = scan.searches || jobSearches;
  scan.phase = 'jobs';
    scan.stageStartedAt = Date.now();
    await saveScan(scan);
    const next = new URL(searches[scan.jobIndex]);
    await sendProgress({ phase: 'jobs', percent: 10 + Math.round(25 * scan.jobIndex / searches.length), detail: `${next.searchParams.get('keywords')} · ${next.searchParams.get('location')} · search ${scan.jobIndex + 1}/${searches.length}${scan.warnings?.length ? ` · ${scan.warnings.length} skipped` : ''}`, jobsFound: scan.jobs.length, peopleFound: 0 });
    await updateScanTab(scan, 'about:blank');
    await updateScanTab(scan, searches[scan.jobIndex]);
    return;
}
async function advanceJobsScan(tabId, scan) {
  assertScanRunning(scan);
  const searches = scan.searches || jobSearches;
  scan.jobIndex += 1;
  scan.searchedCompanies ||= [];
  const pendingCompanies = [...new Set(scan.jobs.map(job => clean(job.company)).filter(Boolean))].filter(company => !scan.searchedCompanies.includes(company));
  if (pendingCompanies.length && scan.jobIndex % 2 === 0 && !audienceFull(scan, 'designer')) {
    scan.companies = pendingCompanies; scan.searchedCompanies.push(...pendingCompanies);
    scan.phase = 'people'; scan.companyIndex = 0; scan.role = 'designer'; scan.peoplePage = 1; scan.stageStartedAt = Date.now();
    await saveScan(scan);
    await sendProgress({phase:'people',percent:35,detail:`Finding people from verified jobs at ${scan.companies[0]}`,jobsFound:scan.jobs.length,peopleFound:scan.results.length});
    await updateScanTab(scan, searchUrl(scan.companies[0], 'designer'));
    return;
  }
  if (scan.jobIndex < searches.length) {
    return resumeJobSearch(tabId, scan);
  }
  scan.companies = pendingCompanies;
  if (scan.jobs.length && (!pendingCompanies.length || audienceFull(scan, 'designer'))) return scan.mode === 'all' ? startFounders(scan) : finishScan(scan);
  if (!scan.companies.length) {
    await chrome.storage.local.set({ lastScanDiagnostics: { ...scan, completedAt: Date.now() } });
    if (scan.mode === 'all') { scan.warnings = [...(scan.warnings || []), 'No recent LinkedIn jobs passed the checks; founder discovery continued on Google.']; return startFounders(scan); }
    await chrome.storage.local.remove('peopleScan');
    const cardsSeen = (scan.jobDiagnostics || []).reduce((total, page) => total + (page.cardsSeen || 0), 0);
    await sendScanResults({ error: cardsSeen ? `LinkedIn showed ${cardsSeen} job cards across ${searches.length} searches, but none passed the recent full-time design checks.${scan.warnings?.length ? ` Latest issue: ${scan.warnings.at(-1)}` : ''}` : `LinkedIn job cards could not be read across ${searches.length} searches.${scan.warnings?.length ? ` Latest issue: ${scan.warnings.at(-1)}` : ' The results page may still be loading.'}`, jobs: scan.jobs, people: [], diagnostics: scan.jobDiagnostics || [] });
    await closeScanTab(scan);
    return;
  }
  scan.phase = 'people'; scan.companyIndex = 0; scan.role = scan.mode === 'founders' ? 'founder' : 'designer'; scan.stageStartedAt = Date.now();
  await saveScan(scan);
  await sendProgress({ phase: 'people', percent: 40, detail: `Recent jobs checked. Searching people at ${scan.companies[0]}`, jobsFound: scan.jobs.length, peopleFound: 0 });
  await updateScanTab(scan, 'about:blank');
  await updateScanTab(scan, searchUrl(scan.companies[0], scan.role));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (['startup-scan-page','google-founders-page','founder-profile-page'].includes(request?.type)) {
    chrome.storage.local.get('peopleScan').then(async ({ peopleScan: scan }) => {
      const expected = { 'startup-scan-page': 'startups', 'google-founders-page': 'google-founders', 'founder-profile-page': 'founder-profile' }[request.type];
      if (!scan || scan.tabId !== sender.tab?.id || scan.phase !== expected || request.payload?.stageId !== scanStage(scan) || !scanPageFor(scan, sender.tab?.url || '')) { sendResponse({ ok: false }); return; }
      if (request.payload.error) scan.warnings = [...(scan.warnings || []), clean(request.payload.error).slice(0, 250)];
      if (scan.phase === 'startups') {
        scan.startups = [...new Map((request.payload.companies || []).filter(item => item.company && /^https:\/\/(?:www\.)?linkedin\.com\/company\//.test(item.startupSourceUrl)).map(item => [item.company.toLowerCase(), item])).values()].slice(0, 10);
        await searchStartupFounder(scan);
      } else if (scan.phase === 'google-founders') {
        scan.candidates = (request.payload.people || []).filter(person => /^https:\/\/(?:[a-z]+\.)?linkedin\.com\/in\//.test(person.profileUrl) && !scan.excludedProfiles.includes(profileKey(person.profileUrl)) && !scan.results.some(saved => profileKey(saved.profileUrl) === profileKey(person.profileUrl))).slice(0, 2);
        if (!scan.candidates.length) await advanceFounders(scan);
        else { scan.phase = 'founder-profile'; scan.candidateIndex = 0; await navigate(scan, scan.candidates[0].profileUrl, `LinkedIn: checking founder at ${scan.startups[scan.startupIndex].company}`); }
      } else {
        const candidate = scan.candidates[scan.candidateIndex], person = request.payload.person;
        if (person?.name && contactRole(person.headline) === 'founder' && isIndianLocation(person.location) && !scan.results.some(saved => profileKey(saved.profileUrl) === profileKey(candidate.profileUrl))) {
          const founder = { ...candidate, ...person, company: scan.startups[scan.startupIndex].company, contactRole: 'founder', independentFounder: true };
          scan.results.push(founder); await sendScanBatch(scan, [founder]);
        }
        await advanceFounders(scan);
      }
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (request?.type === 'outreach-context') {
    chrome.storage.local.get('outreachSession').then(({ outreachSession }) => {
      const owned = outreachSession?.tabId === sender.tab?.id && outreachSession?.expiresAt > Date.now() && matchesOutreachTab(sender.url, outreachSession.profileUrl);
      sendResponse(owned ? { receiptToken: outreachSession.receiptToken, awaitingConfirmation: outreachSession.awaitingConfirmation } : {});
    }).catch(() => sendResponse({}));
    return true;
  }
  if (['outreach-delivered', 'outreach-unconfirmed'].includes(request?.type)) {
    chrome.storage.local.get('outreachSession').then(async ({ outreachSession }) => {
      const tabUrl = sender.tab?.url || '';
      if (!outreachSession?.awaitingConfirmation || outreachSession.expiresAt < Date.now() || outreachSession.tabId !== sender.tab?.id || !matchesOutreachTab(sender.url || tabUrl, outreachSession.profileUrl)) { sendResponse({ ok: false }); return; }
      if (request.type === 'outreach-unconfirmed') {
        const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
        const { contactId, receiptToken } = outreachSession;
        for (const tab of tabs) if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: request.type, contactId, receiptToken }).catch(() => {});
        sendResponse({ ok: true });
        return;
      }
      const { confirmedDeliveries = [] } = await chrome.storage.local.get('confirmedDeliveries');
      const delivery = { contactId: outreachSession.contactId, receiptToken: outreachSession.receiptToken, expiresAt: outreachSession.expiresAt, tabId: outreachSession.tabId, profileUrl: outreachSession.profileUrl };
      await chrome.storage.local.set({ confirmedDeliveries: [...confirmedDeliveries.filter(item => item.contactId !== delivery.contactId && item.expiresAt > Date.now()), delivery] });
      await chrome.storage.local.remove('outreachSession');
      const tabs = await chrome.tabs.query({ url: [`${LOCAL_ORIGIN}/*`] });
      for (const tab of tabs) if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: 'outreach-delivered', ...delivery }).catch(() => {});
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (request?.type === 'outreach-send-attempt') {
    chrome.storage.local.get('outreachSession').then(async ({ outreachSession }) => {
      if (!outreachSession || outreachSession.tabId !== sender.tab?.id || outreachSession.expiresAt < Date.now() || !matchesOutreachTab(sender.url || sender.tab?.url, outreachSession.profileUrl)) { sendResponse({ ok: false }); return; }
      await chrome.storage.local.set({ outreachSession: { ...outreachSession, awaitingConfirmation: true } });
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (request?.type === 'scan-context') {
    chrome.storage.local.get('peopleScan').then(({ peopleScan }) => {
      if (peopleScan?.tabId === sender.tab?.id && ['startups','google-founders','founder-profile'].includes(peopleScan.phase)) { sendResponse({ phase: peopleScan.phase, stageId: scanStage(peopleScan), ...(peopleScan.startups?.[peopleScan.startupIndex] || {}) }); return; }
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
        await saveScan(peopleScan);
        await sendScanBatch(peopleScan, [peopleScan.results.at(-1)]);
      }
      const company = peopleScan.companies[peopleScan.companyIndex];

      const roleCount = peopleScan.results.filter(person => person.company === company && person.contactRole === peopleScan.role).length;
      if (roleCount < 2 && !audienceFull(peopleScan, peopleScan.role) && request.payload?.hasNextPage && (peopleScan.peoplePage || 1) < 3) {
        const next = new URL(sender.tab.url);
        if (next.origin === 'https://www.linkedin.com' && next.pathname === '/search/results/people/') {
          peopleScan.peoplePage = (peopleScan.peoplePage || 1) + 1;
          peopleScan.stageStartedAt = Date.now();
          next.searchParams.set('page', String(peopleScan.peoplePage));
          await saveScan(peopleScan);
          await sendProgress({ phase: 'people', percent: 40 + Math.round(55 * peopleScan.companyIndex / peopleScan.companies.length), detail: `Checking more ${peopleScan.role} profiles at ${company} · page ${peopleScan.peoplePage}`, jobsFound: peopleScan.jobs.length, peopleFound: peopleScan.results.length });
          await updateScanTab(peopleScan, 'about:blank');
          await updateScanTab(peopleScan, next.href);
          sendResponse({ ok: true }); return;
        }
      }
      const hasNextStage = advancePeopleStage(peopleScan);
      if (!hasNextStage) {
        if (!peopleScan.targeted && peopleScan.jobIndex < (peopleScan.searches || jobSearches).length) { await resumeJobSearch(sender.tab.id, peopleScan); sendResponse({ok:true}); return; }
        if (peopleScan.mode === 'all') { await startFounders(peopleScan); sendResponse({ ok: true }); return; }
        const payload = { scanId: peopleScan.scanId, mode: peopleScan.mode || 'team', cities: peopleScan.cities || ['India'], warnings: peopleScan.warnings || [], rejections: peopleScan.rejections, replace: peopleScan.replace, jobs: resultJobs(peopleScan, peopleScan.results), people: peopleScan.results };
        await chrome.storage.local.set({ lastScanDiagnostics: { ...peopleScan, completedAt: Date.now() } });
        await chrome.storage.local.remove('peopleScan');
        await sendProgress({ phase: 'complete', percent: 100, detail: `Checked ${peopleScan.jobs.length} jobs and found ${payload.people.length} new people`, jobsFound: peopleScan.jobs.length, peopleFound: payload.people.length });
        await sendScanResults(payload);
        await closeScanTab(peopleScan);
        sendResponse({ ok: true, complete: true });
      } else {
        peopleScan.stageStartedAt = Date.now();
        await saveScan(peopleScan);
        await sendProgress({ phase: 'people', percent: 40 + Math.round(55 * peopleScan.companyIndex / peopleScan.companies.length), detail: `Finding ${peopleScan.role === "founder" ? "founders" : peopleScan.role === "designer" ? "designers" : "HR / talent"} at ${peopleScan.companies[peopleScan.companyIndex]} (${peopleScan.companyIndex + 1}/${peopleScan.companies.length})`, jobsFound: peopleScan.jobs.length, peopleFound: peopleScan.results.length });
        await updateScanTab(peopleScan, 'about:blank');
        await updateScanTab(peopleScan, searchUrl(peopleScan.companies[peopleScan.companyIndex], peopleScan.role));
        sendResponse({ ok: true, complete: false });
      }
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (!['prepare-outreach', 'scan-people', 'stop-scan', 'sync-deliveries', 'ack-delivery'].includes(request?.type)) return;
  if (!sender.url?.startsWith(`${LOCAL_ORIGIN}/`)) { sendResponse({ ok: false, error: 'Untrusted sender.' }); return; }
  if (request.type === 'stop-scan') {
    chrome.storage.local.get('peopleScan').then(async ({ peopleScan: scan }) => {
      const active = scan || startingScan;
      if (active && request.payload?.scanId && request.payload.scanId !== active.scanId) { sendResponse({ ok: false, error: 'A different scan is running. Refresh Outreach Desk before stopping it.' }); return; }
      scanGeneration++;
      if (active) cancelledScans.add(active.scanId);
      startingScan = null;
      if (scan) {
        if (cancelledScans.size > 100) cancelledScans.delete(cancelledScans.values().next().value);
        if (probeTimers.has(scan.tabId)) clearTimeout(probeTimers.get(scan.tabId));
        probeTimers.delete(scan.tabId);
        await chrome.storage.local.remove('peopleScan');
        await chrome.storage.local.set({ lastScanDiagnostics: { ...scan, cancelled: true, completedAt: Date.now() } });
      }
      if (active) await closeScanTab(active);
      sendResponse({ ok: true, stopped: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (['sync-deliveries', 'ack-delivery'].includes(request?.type)) {
    chrome.storage.local.get('confirmedDeliveries').then(async ({ confirmedDeliveries = [] }) => {
      const pending = confirmedDeliveries.filter(item => item.expiresAt > Date.now());
      if (request.type === 'ack-delivery') {
        const matches = item => item && item.expiresAt > Date.now() && item.contactId === request.payload?.contactId && item.receiptToken === request.payload?.receiptToken;
        const { outreachSession } = request.payload?.manual === true ? await chrome.storage.local.get('outreachSession') : {};
        const confirmed = pending.find(matches);
        const recorded = confirmed || (matches(outreachSession) ? outreachSession : null);
        if (recorded?.tabId && recorded.profileUrl) {
          const tab = await chrome.tabs.get(recorded.tabId).catch(() => null);
          if (tab && matchesOutreachTab(tab.pendingUrl || tab.url, recorded.profileUrl)) await chrome.tabs.remove(recorded.tabId);
        }
        if (confirmed) {
          const latest = await chrome.storage.local.get('confirmedDeliveries');
          await chrome.storage.local.set({ confirmedDeliveries: (latest.confirmedDeliveries || []).filter(item => !matches(item) && item.expiresAt > Date.now()) });
        }
        if (matches(outreachSession)) {
          const latest = await chrome.storage.local.get(['outreachSession', 'pendingOutreach']);
          if (matches(latest.outreachSession)) await chrome.storage.local.remove('outreachSession');
          if (latest.pendingOutreach?.receiptToken === request.payload.receiptToken) await chrome.storage.local.remove('pendingOutreach');
        }
      }
      if (request.type === 'sync-deliveries' && sender.tab?.id) for (const delivery of pending) await chrome.tabs.sendMessage(sender.tab.id,{type:'outreach-delivered',...delivery}).catch(() => {});
      sendResponse({ok:true});
    }).catch(() => sendResponse({ok:false}));
    return true;
  }

  if (request.type === 'scan-people') {
    const targetJob = request.payload?.job;
    if (targetJob && (!targetJob.verifiedJobId || !eligibleJob(targetJob) || !fresh(targetJob.recency) || !targetJob.company || !/^https:\/\//.test(targetJob.url))) { sendResponse({ ok: false, error: 'The selected job is not a verified recent design job.' }); return; }
    const limit = targetJob ? 4 : Math.min(50, Math.max(20, Number(request.payload?.limit) || 20));
    const cities = Array.isArray(request.payload?.cities) && request.payload.cities.length ? [...new Set(request.payload.cities.map(clean).filter(city => city && city.length <= 80))].slice(0, 12) : ['India'];
    if (!cities.length) { sendResponse({ ok: false, error: 'Select at least one city.' }); return; }
    const searches = searchesFor(cities);
    const generation = ++scanGeneration;
    const suppliedId = clean(request.payload?.scanId);
    const scanId = /^[\w-]{1,100}$/.test(suppliedId) ? suppliedId : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    startingScan = { scanId, tabId: null };
    sendResponse({ ok: true });
    chrome.tabs.create({ url: 'about:blank', active: true }).then(async tab => {
      if (!tab?.id) throw new Error('Could not open LinkedIn people search.');
      if (generation !== scanGeneration) { await chrome.tabs.remove(tab.id).catch(() => {}); return; }
      startingScan.tabId = tab.id;
      const startedAt = Date.now();
      const scan = { scanId, tabId: tab.id, phase: 'jobs', mode: targetJob ? 'team' : ['team','founders'].includes(request.payload?.mode) ? request.payload.mode : 'all', targeted: !!targetJob, jobIndex: 0, cities, searches, jobs: targetJob ? [targetJob] : [], companies: [], companyIndex: 0, results: [], excludedProfiles: (request.payload?.excludedProfiles || []).map(profileKey).filter(Boolean), limit, replace: targetJob ? false : !!request.payload?.replace, startedAt, stageStartedAt: startedAt };
      if (scan.mode === 'founders') { await startFounders(scan); return; }
      if (targetJob) { scan.phase = 'people'; scan.companies = [clean(targetJob.company)]; scan.role = 'designer'; await saveScan(scan); await updateScanTab(scan, searchUrl(targetJob.company, 'designer')); return; }
      await saveScan(scan);
      await sendProgress({ phase: 'jobs', percent: 5, detail: 'Checking the latest LinkedIn jobs', jobsFound: 0, peopleFound: 0 });
      await updateScanTab(scan, searches[0]);
    }).catch(async error => {
      if (generation !== scanGeneration) return;
      await sendScanResults({ replace: !!request.payload?.replace, people: [], error: error.message });
    }).finally(() => { if (startingScan?.scanId === scanId) startingScan = null; });
    return;
  }

  try {
    const profile = new URL(request.payload?.profileUrl);
    const message = clean(request.payload?.message);
    const contactId = clean(request.payload?.contactId);
    const receiptToken = clean(request.payload?.receiptToken);
    if (profile.protocol !== 'https:' || !/(^|\.)linkedin\.com$/.test(profile.hostname) || !/^\/in\/[^/]+\/?$/.test(profile.pathname) || profile.username || profile.password || profile.port) throw new Error('Invalid LinkedIn profile URL.');
    profile.hostname = 'www.linkedin.com';
    profile.search = ''; profile.hash = '';
    if (!profile.pathname.endsWith('/')) profile.pathname += '/';
    if (!message || message.length > NOTE_LIMIT) throw new Error(`Connection note must be 1–${NOTE_LIMIT} characters.`);
    if (!/^[\da-f-]{36}$/i.test(contactId) || !/^[\da-f-]{36}$/i.test(receiptToken)) throw new Error('Outreach receipt is missing or invalid.');
    const pendingOutreach = { profileUrl: profile.href, message, receiptToken, contactName: clean(request.payload?.contactName), createdAt: Date.now(), expiresAt: Date.now() + 15 * 60 * 1000 };
    chrome.storage.local.set({ pendingOutreach }, async () => {
      if (chrome.runtime.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return; }
      try {
        const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/in/*' });
        const existing = tabs.find(tab => {
          try { return new URL(tab.url).pathname.replace(/\/$/, '') === profile.pathname.replace(/\/$/, ''); }
          catch { return false; }
        });
        if (existing?.id) {
          await chrome.storage.local.set({ outreachSession: { contactId, receiptToken, tabId: existing.id, profileUrl: profile.href, expiresAt: pendingOutreach.expiresAt, awaitingConfirmation: false } });
          await chrome.tabs.update(existing.id, { active: true });
          await chrome.tabs.reload(existing.id);
          sendResponse({ ok: true, tabId: existing.id });
        } else {
          const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
          if (tab?.id) {
            await chrome.storage.local.set({ outreachSession: { contactId, receiptToken, tabId: tab.id, profileUrl: profile.href, expiresAt: pendingOutreach.expiresAt, awaitingConfirmation: false } });
            await chrome.tabs.update(tab.id, { url: profile.href });
          }
          sendResponse({ ok: !!tab, tabId: tab?.id });
        }
      } catch (error) { sendResponse({ ok: false, error: error.message }); }
    });
  } catch (error) { sendResponse({ ok: false, error: error.message }); }
  return true;
});
