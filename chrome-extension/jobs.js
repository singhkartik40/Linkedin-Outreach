(() => {
if (globalThis.__outreachDeskJobsHelper) return;
globalThis.__outreachDeskJobsHelper = true;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const fresh = value => {
  if (/^(?:within\s+)?past (?:24 hours|3 days)(?:\s+\(linkedin filter\))?$/i.test(String(value || '').trim())) return true;
  if (/^(?:posted|reposted)?\s*(?:just now|today)$/i.test(value)) return true;
  const match = String(value || '').match(/^(?:posted|reposted)?\s*(\d+)\s*(minute|hour|day)s?\s*ago$/i);
  return !!match && Number(match[1]) * ({minute:1,hour:60,day:1440}[match[2].toLowerCase()]) < 4320;
};
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === 'scan-probe') { sendResponse({ ok: true, page: 'jobs' }); void run(); return; }
});
let running = false, completedStage = '';
const jobCards = '[role="button"][componentkey^="job-card-component-ref-"], li.jobs-search-results__list-item, .job-card-container, [data-occludable-job-id], .base-card';
const designRole = value => /(?:product|ux|ui|user experience|interaction).*design|design.*(?:product|ux|ui)/i.test(value) && !/\bintern(?:ship)?\b|\bcontract\b|part[ -]time|freelance|temporary/i.test(value);
function postingAge(value) {
  return clean(value).match(/(?:\b(?:posted|reposted)\s+)?(?:just now|today|\d+\s*(?:minute|hour|day|week|month)s?\s*ago)\b/i)?.[0] || '';
}
function collect(context = {}) {
  const filteredToPastDay = /^r(?:86400|259200)$/.test(new URL(location.href).searchParams.get('f_TPR') || '');
  const cards = [...document.querySelectorAll(jobCards)];
  const jobs = [];
  for (const card of cards) {
    const cardId = card.getAttribute('componentkey')?.match(/^job-card-component-ref-(\d+)$/)?.[1];
    if (cardId) {
      const parts = [...card.querySelectorAll('p')].map(part => clean(part.innerText)).filter(Boolean);
      const dismiss = [...card.querySelectorAll('button, [role=button]')].map(e => e.getAttribute('aria-label') || '').find(text => /^Dismiss .+ job$/i.test(text));
      const title = dismiss ? clean(dismiss.replace(/^Dismiss /i, '').replace(/ job$/i, '')) : clean(card.querySelector('p')?.innerText?.split('\n').filter(Boolean).at(-1));
      const titleInParts = parts[0] === title || parts[0]?.includes(title);
      const company = parts[titleInParts ? 1 : 0] || '', locationText = parts[titleInParts ? 2 : 1] || '';
      const visibleRecency = postingAge(parts.slice(titleInParts ? 3 : 2).join(' '));
      const recency = visibleRecency || (filteredToPastDay ? (new URL(location.href).searchParams.get('f_TPR') === 'r259200' ? 'Past 3 days (LinkedIn filter)' : 'Past 24 hours (LinkedIn filter)') : '');
      if (title && company) jobs.push({ url: `https://www.linkedin.com/jobs/view/${cardId}/`, title, company, location: locationText, recency, searchLocation: context.city || '', source: clean(card.textContent).slice(0, 1200) });
      continue;
    }
    const link = card.querySelector('a[href*="/jobs/view/"]');
    if (!link) continue;
    const url = new URL(link.href, location.href);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || !/^\/jobs\/view\/\d+/.test(url.pathname)) continue;
    url.search = ''; url.hash = '';
    const title = clean(card.querySelector('.job-card-list__title, .base-search-card__title, .job-card-container__link')?.textContent || link.textContent);
    const company = clean(card.querySelector('.job-card-container__primary-description, .base-search-card__subtitle, .job-card-container__company-name')?.textContent);
    const locationText = clean(card.querySelector('.job-card-container__metadata-item, .job-search-card__location')?.textContent);
    const visibleRecency = postingAge(card.querySelector('time, .job-search-card__listdate')?.textContent || card.innerText);
    const recency = visibleRecency || (filteredToPastDay ? (new URL(location.href).searchParams.get('f_TPR') === 'r259200' ? 'Past 3 days (LinkedIn filter)' : 'Past 24 hours (LinkedIn filter)') : '');
    if (title && company) jobs.push({ url: url.href.replace(/\/$/, '') + '/', title, company, location: locationText, recency, searchLocation: context.city || '', source: clean(card.textContent).slice(0, 1200) });
  }
  return [...new Map(jobs.filter(job => fresh(job.recency)).map(job => [job.url, job])).values()].slice(0, 30);
}
const shown = element => element && element.getClientRects().length > 0;
const controls = () => [...document.querySelectorAll('button, [role="button"], a')].filter(shown);
const control = label => controls().find(element => clean(element.innerText) === label || element.getAttribute('aria-label') === `Filter by ${label}`);
async function until(read, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = read(); if (value) return value; await sleep(200); }
  return null;
}
function fullTimeSelected() {
  if (new URL(location.href).searchParams.get('f_JT') === 'F') return true;
  const toolbar = document.querySelector('[role="toolbar"]');
  if (toolbar) return [...toolbar.querySelectorAll('button, [role="button"]')].some(element => clean(element.innerText) === 'Full-time' || element.getAttribute('aria-label') === 'Filter by Full-time');
  return new URL(location.href).searchParams.get('f_JT') === 'F';
}
async function applyFilters(city) {
  const locationButton = controls().find(element => /^Location /.test(element.getAttribute('aria-label') || '') || element.querySelector('[aria-label^="Location "]'));
  const normalize = value => clean(value).toLowerCase().replace(/bangalore/g, 'bengaluru').replace(/gurgaon/g, 'gurugram').replace(/\s*\(.*$/, '');
  const expected = city === 'Remote' ? 'India' : city;
  const params = new URL(location.href).searchParams;
  const requestedLocation = normalize(params.get('location'));
  const locationAlreadyRequested = requestedLocation === normalize(expected) || (normalize(expected) === 'india' && params.get('geoId') === '102713980');
  if (!locationAlreadyRequested && locationButton && normalize(locationButton.innerText) !== normalize(expected)) {
    locationButton.click();
    const matchingOption = () => [...document.querySelectorAll('a[href*="geoId="]')].filter(shown).find(element => normalize(element.innerText).split(',')[0] === normalize(expected));
    let option = await until(matchingOption, 500);
    if (!option) {
    const field = await until(() => document.querySelector('[contenteditable="true"][aria-label="Location"], input[aria-label="Location"]'));
    if (!field) throw Error('LinkedIn location selector could not be opened.');
    field.focus();
    if (field instanceof HTMLInputElement) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, expected); }
    else { document.execCommand('selectAll', false); document.execCommand('insertText', false, expected); }
    field.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:expected}));
    option = await until(matchingOption);
    }
    if (!option) throw Error(`LinkedIn did not offer a matching location for ${expected}.`);
    option.click();
    if (!await until(() => controls().find(element => ((element.getAttribute('aria-label') || '').startsWith('Location ') || element.querySelector('[aria-label^="Location "]')) && normalize(element.innerText) === normalize(expected)))) throw Error('LinkedIn location selection was not confirmed.');
    await sleep(800);
  }
  if (!fullTimeSelected()) {
    let checkbox;
    const readOption = () => [...document.querySelectorAll('[role="checkbox"], label')].filter(shown).find(element => element.getAttribute('aria-label') === 'Full-time' || clean(element.innerText) === 'Full-time');
    for (let attempt = 0; attempt < 3 && !checkbox; attempt += 1) {
      const employment = await until(() => control('Employment type'));
      if (!employment) return false;
      checkbox = readOption();
      if (!checkbox && employment.getAttribute('aria-expanded') !== 'true') employment.click();
      checkbox = await until(readOption, 3000);
      if (!checkbox && [...document.querySelectorAll('[role="checkbox"]')].some(element => shown(element) && /^(?:Part-time|Contract)$/.test(clean(element.getAttribute('aria-label') || element.innerText)))) break;
    }
    if (!checkbox) {
      // Some LinkedIn variants omit Full-time from the menu. Verify each job instead.
      const employment = control('Employment type');
      if (employment) employment.click();
      return false;
    }
    if (checkbox.getAttribute('aria-checked') !== 'true' && !checkbox.querySelector?.('input:checked')) checkbox.click();
    await sleep(300);
    const show = control('Show results');
    if (!show) throw Error('LinkedIn employment filter could not be applied.');
    show.click();
    if (!await until(fullTimeSelected)) throw Error('LinkedIn did not confirm the Full-time filter.');
    await sleep(800);
  }
  return fullTimeSelected();
}
function jobDetail(job) {
  const id = job.url.match(/\/view\/(\d+)/)?.[1];
  const link = [...document.querySelectorAll('a[href*="/jobs/view/"]')].find(element => new URL(element.href, location.href).pathname === `/jobs/view/${id}/`);
  const about = document.querySelector(`[componentkey="JobDetails_AboutTheJob_${id}"]`);
  if (!link && !about) return null;
  let panel = link?.parentElement || about.parentElement;
  while (panel && panel !== document.body) {
    const hasEmployment = [...panel.querySelectorAll('a, button, span, p')].some(e => /^(?:full[ -]time|part[ -]time|contract|internship|temporary)$/i.test(clean(e.innerText)));
    if (panel.querySelector(`[componentkey="JobDetails_AboutTheJob_${id}"]`) || panel.matches('.jobs-search__job-details--container, .jobs-details') || (hasEmployment && !panel.querySelector('[componentkey^="job-card-component-ref-"]'))) break;
    panel = panel.parentElement;
  }
  if (!panel || panel === document.body) return null;
  const employment = [...panel.querySelectorAll('a, button, span, p, .job-details-jobs-unified-top-card__job-insight')].map(element => clean(element.innerText)).find(text => /^(?:full[ -]time|part[ -]time|contract|internship|temporary)$/i.test(text));
  if (!employment) return null;
  return { fullTime: /^full[ -]time$/i.test(employment), recency: postingAge(panel.innerText), employment };
}
async function verifyEmployment(jobs, context, partial) {
  const verified = [];
  const candidates = jobs.filter(job => designRole(job.title)).slice(0, 16);
  for (let index = 0; index < candidates.length; index += 1) {
    const job = candidates[index], id = job.url.match(/\/view\/(\d+)/)?.[1];
    let detail = jobDetail(job);
    if (!detail) {
      const card = document.querySelector(`[role="button"][componentkey="job-card-component-ref-${id}"], [data-occludable-job-id="${id}"]`) || [...document.querySelectorAll('a[href*="/jobs/view/"]')].find(link => new URL(link.href, location.href).pathname === `/jobs/view/${id}/`);
      if (!card) continue;
      card.click();
      detail = await until(() => jobDetail(job), 1800);
    }
    if (detail?.fullTime && (!detail.recency || fresh(detail.recency))) verified.push({ ...job, recency: detail.recency || job.recency, employmentType: 'Full-time', source: `${job.source}\nEmployment verified in job details: ${detail.employment}` });
    partial.jobs = verified;
    await chrome.runtime.sendMessage({ type: 'scan-page-heartbeat', stageId: context.stageId, detail: `Verifying full-time jobs ${index + 1}/${candidates.length} · ${verified.length} confirmed` }).catch(() => {});
  }
  return verified;
}
async function scanPage(context, partial) {
  if (document.readyState === 'loading') await Promise.race([new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })), sleep(5000)]);
  await until(() => collect(context).length || /no matching jobs|no results found/i.test(document.body.innerText), 12000);
  await applyFilters(context.city || 'India');
  // Applying a filter can replace the result list during LinkedIn hydration.
  await until(() => collect(context).length || /no matching jobs|no results found/i.test(document.body.innerText), 12000);
  const found = new Map();
  for (let step = 0; step < 4; step += 1) {
    const indiaSelected = controls().some(element => (element.getAttribute('aria-label') === 'Location India' || element.querySelector('[aria-label="Location India"]')));
    for (const job of collect(context)) found.set(job.url, { ...job, country: indiaSelected ? 'India' : '', employmentType: fullTimeSelected() ? 'Full-time' : '' });
    const list = document.querySelector('.jobs-search-results-list, .scaffold-layout__list');
    if (list) list.scrollTop = list.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(350);
  }
  const jobs = [...found.values()];
  const fullTimeFilter = fullTimeSelected() && jobs.every(job => job.employmentType === 'Full-time');
  const verified = fullTimeFilter ? jobs : await verifyEmployment(jobs, context, partial);
  return { jobs: verified.filter(job => job.employmentType === 'Full-time'), diagnostics: { cardsSeen: document.querySelectorAll(jobCards).length, recentCards: jobs.length, fullTimeJobs: verified.length, employmentCheck: fullTimeFilter ? 'search filter' : 'individual job details', url: location.href } };
}
async function run() {
  if (running) return;
  running = true;
  const context = await chrome.runtime.sendMessage({ type: 'scan-context' }).catch(() => ({}));
  if (!context?.stageId || context.stageId === completedStage) { running = false; return; }
  const heartbeat = setInterval(() => chrome.runtime.sendMessage({ type: 'scan-page-heartbeat', stageId: context.stageId }).catch(() => {}), 8000);
  let deadline;
  const partial = { jobs: [], diagnostics: {} };
  try {
    const result = await Promise.race([scanPage(context, partial), new Promise((resolve) => { deadline = setTimeout(() => resolve({ ...partial, error: `LinkedIn jobs page for ${context.city} timed out; kept ${partial.jobs.length} verified jobs and continued.` }), 60000); })]);
    await chrome.runtime.sendMessage({ type: 'jobs-scan-page', payload: { ...result, stageId: context.stageId } }).catch(() => {});
  } catch (error) {
    await chrome.runtime.sendMessage({ type: 'jobs-scan-page', payload: { jobs: [], error: error.message, stageId: context.stageId } }).catch(() => {});
  } finally { completedStage = context.stageId; running = false; clearInterval(heartbeat); clearTimeout(deadline); }
}
run();

})();
