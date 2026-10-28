(() => {
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === 'scan-probe') { sendResponse({ ok: true, page: 'people' }); void run(); return; }
});
let running = false, completedStage = '';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const absoluteProfile = href => {
  try {
    const url = new URL(href, location.href);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || !url.pathname.startsWith('/in/')) return '';
    url.search = ''; url.hash = '';
    return url.href.replace(/\/$/, '') + '/';
  } catch { return ''; }
};
const companyOptionName = item => clean(item.querySelector('p')?.innerText || item.innerText.split('\n')[0]);
function visible(element) { return !!element && element.getClientRects().length > 0; }
const degreeFrom = value => String(value || '').match(/\b([123])(?:st|nd|rd)(?:\+)?\b/i)?.[1] || 'Unknown';
const degreeLine = value => String(value || '').length < 16 && /\b[123](?:st|nd|rd)(?:\+)?$/i.test(value);
function companyWords(value) { return clean(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !['private','limited','technologies','technology','solutions','india'].includes(word)); }
function mentionsCompany(value, company) {
  const text = clean(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const words = companyWords(company);
  return words.length > 0 && words.every(word => text.includes(word));
}
function collect(company, pageFiltered) {
  const modern = [...document.querySelectorAll('a[componentkey^="auto-component-"][href*="/in/"]')];
  const cards = [...document.querySelectorAll('li.reusable-search__result-container, li.artdeco-list__item, [data-view-name="search-entity-result-universal-template"]'), ...modern];
  const people = [];
  for (const card of cards) {
    const link = card.matches?.('a[href*="/in/"]') ? card : [...card.querySelectorAll('a[href*="/in/"]')].find(visible);
    const profileUrl = absoluteProfile(link?.href);
    if (!profileUrl) continue;
    const lines = (card.innerText || '').split('\n').map(clean).filter(Boolean);
    const isModern = modern.includes(card);
    const name = clean(isModern ? lines[0]?.replace(/\s*•\s*[123](?:st|nd|rd)\+?\s*$/i, '') : card.querySelector('.entity-result__title-text span[aria-hidden="true"], a[href*="/in/"] span[aria-hidden="true"]')?.textContent || link?.textContent);
    if (!name || /linkedin member/i.test(name)) continue;
    const headline = clean(isModern ? lines.find((line, index) => index > 0 && !degreeLine(line)) : card.querySelector('.entity-result__primary-subtitle, [data-view-name="search-entity-result-universal-template"] p')?.textContent);
    const location = clean(isModern ? lines[lines.findIndex(line => line === headline) + 1] : card.querySelector('.entity-result__secondary-subtitle')?.textContent);
    const degree = degreeFrom(isModern ? lines.slice(0, 2).join(' ') : card.querySelector('.entity-result__badge-text')?.textContent);
    if (!/founder|recruit|talent|human resources|\bhr\b|design|user experience/i.test(headline)) continue;
    const companyVerified = pageFiltered || mentionsCompany(card.innerText, company);
    if (!companyVerified) continue;
    people.push({ name, headline, location, degree, profileUrl, companyVerified });
  }
  return [...new Map(people.map(person => [person.profileUrl.toLowerCase(), person])).values()];
}
async function waitFor(selector, timeout = 2500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await sleep(200);
  }
  return null;
}
function enter(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function applyCompanyFilter(company) {
  const button = await waitFor('[role="button"]:has([aria-label="Filter by Current companies"]), button[aria-label*="Current companies"], button[aria-label*="Current company"]');
  if (!button) return false;
  button.click();
  const input = await waitFor('input[placeholder="Add a company"]');
  if (!input) return false;
  enter(input, company);
  const started = Date.now();
  let option;
  while (Date.now() - started < 6000) {
    option = [...document.querySelectorAll('[role="listbox"] [role="option"]')].find(item => companyOptionName(item).toLowerCase() === company.toLowerCase());
    if (option) break;
    await sleep(200);
  }
  if (!option) return false;
  option.click();
  const show = [...document.querySelectorAll('a, button')].find(item => clean(item.innerText) === 'Show results');
  if (!show) return false;
  show.click();
  return true;
}
async function run() {
  if (running) return;
  running = true;
  if (document.readyState === 'loading') await Promise.race([new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })), sleep(5000)]);
  const context = await chrome.runtime.sendMessage({ type: 'scan-context' }).catch(() => null);
  if (!context?.company || context.stageId === completedStage) { running = false; return; }
  const heartbeat = setInterval(() => chrome.runtime.sendMessage({ type: 'scan-page-heartbeat', stageId: context.stageId }).catch(() => {}), 8000);
  try {
  let pageFiltered = new URL(location.href).searchParams.has('currentCompany');
  if (!pageFiltered) {
    const applied = await applyCompanyFilter(context.company);
    if (applied) {
      for (let attempt = 0; attempt < 40 && !new URL(location.href).searchParams.has('currentCompany'); attempt += 1) await sleep(200);
      pageFiltered = new URL(location.href).searchParams.has('currentCompany');
      if (pageFiltered) await sleep(1000);
    }
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (document.querySelector('a[componentkey^="auto-component-"][href*="/in/"], li.reusable-search__result-container') || document.body.innerText.includes('No results found')) break;
    await sleep(200);
  }
  for (let i = 0; i < 2; i += 1) { window.scrollTo(0, document.body.scrollHeight); await sleep(400); }
  const hasNextPage = [...document.querySelectorAll('button, a')].some(element => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true' && /^(?:next|next page)$/i.test(clean(element.getAttribute('aria-label') || element.innerText)));
  const people = collect(context.company, pageFiltered);
  chrome.runtime.sendMessage({ type: 'people-scan-page', payload: { people, verifiedCompany: pageFiltered || people.length > 0, hasNextPage, stageId: context.stageId } });
  } catch (error) {
    chrome.runtime.sendMessage({ type: 'people-scan-page', payload: { people: [], verifiedCompany: false, error: error.message, stageId: context.stageId } }).catch(() => {});
  } finally { completedStage = context.stageId; running = false; clearInterval(heartbeat); }
}
run();

})();
