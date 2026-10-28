import test from 'node:test';
import assert from 'node:assert/strict';
import { isLatestJob, recentJobMinutes } from '../server/recent-jobs.mjs';

test('latest-job gate admits only visible ages under 24 hours', () => {
  assert.equal(recentJobMinutes('Posted 2 hours ago'), 120);
  assert.equal(isLatestJob({ recency: 'Reposted 23 hours ago' }), true);
  assert.equal(isLatestJob({ recency: '5 minutes ago' }), true);
  assert.equal(isLatestJob({ recency: 'Posted 24 hours ago' }), false);
  assert.equal(isLatestJob({ recency: '1 day ago' }), false);
  assert.equal(isLatestJob({ recency: 'Viewed' }), false);
  assert.equal(isLatestJob({ recency: '' }), false);
});

test('latest-job gate accepts LinkedIn past-day filter evidence', () => {
  assert.equal(isLatestJob({ recency: 'Past 24 hours (LinkedIn filter)' }), true);
});
