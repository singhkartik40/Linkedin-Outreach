const fundingWords = /\b(?:raises?|raised|funding|funded|series [a-z]|investment|secures?)\b/i;
const usd = /(?:\$|usd\s*)(\d+(?:\.\d+)?)\s*(?:m|million|b|billion)\b/i;
const inr = /(?:₹|rs\.?\s*|inr\s*)(\d+(?:\.\d+)?)\s*(?:cr|crore)\b/i;

export function recentFundingFromArticles(companies, articles, now = Date.now()) {
  const found = new Map();
  for (const article of Array.isArray(articles) ? articles : []) {
    const title = String(article?.title || '').trim();
    const stamp = String(article?.seendate || '');
    const iso = stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6Z');
    const seen = Date.parse(iso);
    const url = String(article?.url || '');
    if (!fundingWords.test(title) || !Number.isFinite(seen) || seen < now - 90 * 86400000 || seen > now + 86400000 || !/^https:\/\//i.test(url)) continue;
    const dollars = title.match(usd), rupees = title.match(inr);
    const sizable = dollars ? Number(dollars[1]) * (/b(?:illion)?$/i.test(dollars[0]) ? 1000 : 1) >= 2 : rupees ? Number(rupees[1]) >= 10 : false;
    if (!sizable) continue;
    for (const company of companies) {
      const name = String(company || '').trim();
      if (name.length < 4 || !title.toLowerCase().includes(name.toLowerCase())) continue;
      if (!found.has(name) || seen > Date.parse(found.get(name).reportedAt)) found.set(name, { title: title.slice(0, 240), url, reportedAt: new Date(seen).toISOString() });
    }
  }
  return found;
}

export async function findRecentFunding(companies, fetchImpl = fetch) {
  const names = [...new Set(companies.map(value => String(value || '').trim()).filter(value => value.length >= 4 && value.length <= 80))].slice(0, 20);
  if (!names.length) return new Map();
  const query = `(${names.map(value => `"${value.replaceAll('"', '')}"`).join(' OR ')}) (raised OR funding OR "series A" OR "series B")`;
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search = new URLSearchParams({ query, mode: 'artlist', format: 'json', timespan: '3months', maxrecords: '250' }).toString();
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Recent funding news could not be checked. Try the founder scan again later.');
  const data = await response.json();
  return recentFundingFromArticles(names, data.articles);
}
