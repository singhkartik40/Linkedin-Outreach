import test from 'node:test';
import assert from 'node:assert/strict';
import { recentFundingFromArticles, findRecentFunding } from '../server/funding.mjs';
import { buildOutreachMessage } from '../server/outreach-message.mjs';
import { isIndianMetroLocation } from '../server/locations.mjs';

test('founder funding requires a recent sourced report with a meaningful disclosed amount', () => {
  const now = Date.parse('2026-10-26T00:00:00Z');
  const articles = [
    { title: 'Acme Design raises $4 million Series A', url: 'https://news.example/acme', seendate: '20261024T120000Z' },
    { title: 'Acme Design raises $1 million', url: 'https://news.example/small', seendate: '20261025T120000Z' },
    { title: 'Other Company raises ₹20 crore', url: 'https://news.example/other', seendate: '20261025T120000Z' },
    { title: 'Acme Design raises $8 million', url: 'https://news.example/old', seendate: '20260125T120000Z' },
  ];
  const result = recentFundingFromArticles(['Acme Design'], articles, now);
  assert.equal(result.get('Acme Design')?.url, 'https://news.example/acme');
  assert.equal(result.size, 1);
});

test('founder funding lookup uses a fixed HTTPS endpoint and pitch is distinct from referral', async () => {
  const fetcher = async url => {
    assert.equal(url.hostname, 'api.gdeltproject.org');
    assert.equal(url.protocol, 'https:');
    return { ok: true, json: async () => ({ articles: [{ title: 'Acme Design raises ₹25 crore funding', url: 'https://news.example/acme', seendate: new Date().toISOString() }] }) };
  };
  const funding = await findRecentFunding(['Acme Design'], fetcher);
  const message = buildOutreachMessage({ name: 'Asha Rao', company: 'Acme Design', jobTitle: 'UX Designer', headline: 'Founder', funding: funding.get('Acme Design') });
  assert.match(message, /pitch/i);
  assert.doesNotMatch(message, /refer/i);
  assert.ok(message.length <= 290);
  assert.equal(isIndianMetroLocation('Bengaluru, Karnataka, India'), true);
  assert.equal(isIndianMetroLocation('Jaipur, India'), false);
});
