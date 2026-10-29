(() => {
if (globalThis.outreachDiscoveryLoaded) return;
globalThis.outreachDiscoveryLoaded = true;
let running = false, completed = '';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const matchesCompany = (value, company) => {
  const words = clean(company).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 2 && !['private','limited','technologies','india'].includes(word));
  return words.length && words.every(word => clean(value).toLowerCase().includes(word));
};
function googleResults() {
  return [...document.querySelectorAll('h3')].flatMap(heading => {
    const anchor = heading.closest('a') || heading.parentElement?.closest('a');
    if (!anchor) return [];
    let url; try { url = new URL(anchor.href); if (url.hostname === 'www.google.com' && url.pathname === '/url') url = new URL(url.searchParams.get('q') || url.searchParams.get('url')); } catch { return []; }
    const card = heading.closest('.MjjYud, .g, [data-snhf]') || anchor.parentElement?.parentElement;
    return [{ url: url.href, title: clean(heading.innerText), text: clean(card?.innerText) }];
  });
}
async function collectStage(context) {
    if (context.phase === 'startups') {
      const companies = googleResults().flatMap(result => {
        if (!/^https:\/\/(?:[a-z]+\.)?linkedin\.com\/company\//.test(result.url) || !/startup|start-up/i.test(result.text)) return [];
        const title = result.title.split('LinkedIn')[0];
        const company = clean(title.slice(0, Math.min(...['|','–',' - ',':'].map(separator => { const index = title.indexOf(separator); return index < 0 ? title.length : index; }))));
        const source = new URL(result.url); source.hostname = 'www.linkedin.com'; source.search = ''; source.hash = '';
        return company && company.length < 120 ? [{ company, startupSourceUrl: source.href }] : [];
      });
      await chrome.runtime.sendMessage({ type: 'startup-scan-page', payload: { stageId: context.stageId, companies, error: companies.length ? '' : 'Google returned no readable startup company results.' } });
    } else if (context.phase === 'google-founders') {
      const people = googleResults().flatMap(result => {
        if (!/^https:\/\/(?:[a-z]+\.)?linkedin\.com\/in\//.test(result.url) || !/\b(?:co[ -]?)?founder\b/i.test(result.text) || !matchesCompany(result.text, context.company)) return [];
        const profile = new URL(result.url); profile.hostname = 'www.linkedin.com'; profile.search = ''; profile.hash = '';
        return [{ profileUrl: profile.href, name: result.title.split(' - ')[0].split(' | ')[0].split(' – ')[0], googleUrl: location.href, startupSourceUrl: context.startupSourceUrl, company: context.company }];
      });
      await chrome.runtime.sendMessage({ type: 'google-founders-page', payload: { stageId: context.stageId, people } });
    } else {
      const main = document.querySelector('main');
      const name = clean(main?.querySelector('h1')?.innerText);
      const lines = (main?.innerText || '').slice(0, 2500).split('\n').map(clean).filter(Boolean);
      const topHeadline = clean(main?.querySelector('.text-body-medium.break-words')?.innerText);
      const headline = (topHeadline ? [topHeadline] : lines.slice(0, 18)).find(line => /\b(?:co[ -]?)?founder\b/i.test(line) && matchesCompany(line, context.company) && line.length < 600) || '';
      const location = clean(main?.querySelector('.text-body-small.inline.t-black--light, .pv-text-details__left-panel .text-body-small')?.innerText) || lines.slice(0, 18).find(line => /\b(?:India|Bengaluru|Bangalore|Mumbai|Delhi|Gurugram|Noida|Hyderabad|Pune|Chennai|Kolkata|Indore|Jaipur)\b/i.test(line) && !/founder/i.test(line)) || '';
      await chrome.runtime.sendMessage({ type: 'founder-profile-page', payload: { stageId: context.stageId, person: { name, headline, location, evidence: headline } } });
    }
}
async function run() {
  if (running) return;
  running = true;
  const context = await chrome.runtime.sendMessage({ type: 'scan-context' }).catch(() => null);
  if (!context?.stageId || context.stageId === completed || !['startups', 'google-founders', 'founder-profile'].includes(context.phase)) { running = false; return; }
  try {
    for (let i = 0; i < 40; i++) {
      if (document.querySelector(context.phase === 'founder-profile' ? 'main h1' : 'h3')) break;
      if (/unusual traffic|verify you are human/i.test(document.body?.innerText || '')) throw Error('Google asks for verification. Complete it yourself in the scan tab, then retry.');
      await sleep(250);
    }
    await collectStage(context);
  } catch (error) {
    let type = 'founder-profile-page';
    if (context.phase === 'startups') type = 'startup-scan-page';
    if (context.phase === 'google-founders') type = 'google-founders-page';
    await chrome.runtime.sendMessage({ type, payload: { stageId: context.stageId, error: error.message } }).catch(() => {});
  } finally { completed = context.stageId; running = false; }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => { if (message?.type === 'scan-probe') { respond({ ok: true, page: location.hostname === 'www.google.com' ? 'google' : 'founder' }); void run(); } });
void run();
})();
