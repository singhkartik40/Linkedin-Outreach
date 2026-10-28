import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutreachMessage, refreshDraftMessages, portfolioUrl, resumeUrl, requiredPhrase } from '../server/outreach-message.mjs';

test('full invitation includes intact portfolio and resume links within 290 characters', () => {
  for (const contact of [
    { name: "God's Sheril", company: 'ServiceNow', jobTitle: 'Senior Product Designer, dCX Design' },
    { name: 'Longname'.repeat(40), company: 'Company'.repeat(50), jobTitle: 'Designer'.repeat(60) },
  ]) {
    const message = buildOutreachMessage(contact);
    assert.ok(message.length <= 290);
    assert.ok(message.includes(portfolioUrl));
    assert.ok(message.includes(resumeUrl));
    assert.ok(message.includes(requiredPhrase));
    assert.ok(message.includes('Could you refer me?'));
  }
});

test('founders receive a pitch without needing funding evidence', () => {
  for (const headline of ['Co-Founder', 'Cofounder', 'Founder']) {
    const input = { name: 'Asha', company: 'Acme', jobTitle: 'UX Designer', headline };
    const message = buildOutreachMessage(input);
    assert.match(message, /pitch/);
    assert.ok(!message.includes('refer me'));
    assert.doesNotMatch(message, /funding|raised/);
    const pitch = buildOutreachMessage({ ...input, funding: { url: 'https://example.com/funding' } });
    assert.match(pitch, /pitch/);
    assert.ok(pitch.length <= 290);
  }
});

test('draft upgrade preserves old messages and leaves completed and skipped records untouched', () => {
  const draft = { name: 'Asha', company: 'Acme', jobTitle: 'UX Designer', status: 'Draft ready', message: 'Old draft' };
  const sent = { ...draft, status: 'Sent' }, confirmed = { ...draft, status: 'Send confirmed' }, skipped = { ...draft, status: 'Skipped' };
  const result = refreshDraftMessages([draft, sent, confirmed, skipped]);
  assert.equal(result[0].messageVersions[0].message, 'Old draft');
  assert.equal(result[1], sent);
  assert.equal(result[2], confirmed);
  assert.equal(result[3], skipped);
  assert.deepEqual(refreshDraftMessages(result), result);
});
