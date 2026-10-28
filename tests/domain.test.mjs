import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, evaluateJob, validateExtraction, isDuplicate, trackerConfirmsDelivery, indiaDay, limitOutreachMessage } from '../server/domain.mjs';
const now = new Date('2026-10-23T10:00:00Z');
function facts(overrides = {}) {
  return Object.fromEntries(Object.entries({ title: 'Product Designer', company: 'Example', location: 'Bengaluru, India', postedAt: '2026-10-22T10:00:00Z', experienceMin: 4, experienceFlexible: null, salaryLpa: 18, saturdayWork: false, roleCategory: 'product', ...overrides }).map(([key, value]) => [key, { value, evidence: 'source' }]));
}
test('eligible requires all mandatory facts', () => { assert.equal(evaluateJob(facts(), now).status, 'Eligible'); });
test('connection notes are normalized and capped at 290 characters', () => {
  const note = limitOutreachMessage(`${'Relevant product design work '.repeat(20)} Thanks, Kartik`);
  assert.ok(note.length <= 290); assert.ok(note.endsWith('Thanks, Kartik')); assert.ok(!note.includes('  '));
});
test('tracker readback confirms only the matching delivered person', () => {
  const contact = { name: 'Asha Rao', profileUrl: 'https://www.linkedin.com/in/asha-rao/' };
  assert.equal(trackerConfirmsDelivery(contact, [{ name: 'Asha Rao', profileUrl: contact.profileUrl, status: 'Ready' }]), false);
  assert.equal(trackerConfirmsDelivery(contact, [{ name: 'Asha Rao', profileUrl: 'https://www.linkedin.com/in/different/', status: 'Sent' }]), false);
  assert.equal(trackerConfirmsDelivery(contact, [{ name: 'Asha Rao', profileUrl: contact.profileUrl, status: 'Invitation pending' }]), true);
});
test('72 hour boundary passes; one millisecond older is excluded', () => {
  assert.equal(evaluateJob(facts({ postedAt: '2026-10-20T10:00:00Z' }), now).status, 'Eligible');
  assert.equal(evaluateJob(facts({ postedAt: '2026-10-20T09:59:59.999Z' }), now).status, 'Excluded');
});
test('date-only, future, and unzoned dates stay unresolved', () => {
  for (const postedAt of ['2026-10-22', '2026-10-24T10:00:00Z', '2026-10-22T10:00:00']) assert.equal(evaluateJob(facts({ postedAt }), now).status, 'To verify');
});
test('missing salary and workweek are not verification', () => {
  const result = evaluateJob(facts({ salaryLpa: null, saturdayWork: null }), now);
  assert.equal(result.status, 'To verify'); assert.deepEqual(result.unresolved.map(r => r.rule), ['PAY', 'WORKWEEK']);
});
test('exclusions take precedence over unknown facts', () => {
  const result = evaluateJob(facts({ salaryLpa: 11.9, saturdayWork: true, experienceMin: 5, experienceFlexible: false, postedAt: null }), now);
  assert.equal(result.status, 'Excluded'); assert.equal(result.failures.length, 3); assert.equal(result.unresolved.length, 1);
});
test('ambiguous experience does not pass; excluded role title overrides category', () => {
  assert.equal(evaluateJob(facts({ experienceMin: 5 }), now).status, 'To verify');
  assert.equal(evaluateJob(facts({ title: 'Lead Product Designer' }), now).status, 'Excluded');
});
test('a listing that explicitly stopped accepting applications is excluded', () => {
  const result = evaluateJob(facts({ applicationOpen: false }), now);
  assert.equal(result.status, 'Excluded');
  assert.equal(result.failures.some(failure => failure.rule === 'APPLICATION'), true);
});
test('invented quotes and wrong types become null', () => {
  const result = validateExtraction({ company: { value: 'Example', evidence: 'Example' }, salaryLpa: { value: 20, evidence: 'invented salary' }, saturdayWork: { value: 'false', evidence: 'Example' } }, 'Example is hiring.');
  assert.equal(result.company.value, 'Example'); assert.equal(result.salaryLpa.value, null); assert.equal(result.saturdayWork.value, null);
});
test('dedupe finds either a matching name or slug in historical rows', () => {
  const rows = [{ name: '  Asha   Rao ', profileUrl: 'https://www.linkedin.com/in/asha-rao/?trk=abc', status: 'Skipped' }];
  assert.equal(isDuplicate({ name: 'Asha Rao', profileUrl: 'https://linkedin.com/in/other' }, rows), true);
  assert.equal(isDuplicate({ name: 'New Name', profileUrl: 'https://linkedin.com/in/ASHA-RAO' }, rows), true);
  assert.equal(isDuplicate({ name: 'New Name', profileUrl: 'https://linkedin.com/in/new' }, rows), false);
  assert.equal(isDuplicate({ name: '', profileUrl: '' }, [{ name: '', profileUrl: '' }]), false);
});
test('canonical URLs remove tracking but preserve listing identifiers', () => {
  assert.equal(canonicalUrl('https://example.com/jobs?id=123&utm_source=x#apply'), 'https://example.com/jobs?id=123');
  assert.throws(() => canonicalUrl('javascript:alert(1)'));
});
test('India date changes at 18:30 UTC', () => {
  assert.equal(indiaDay(new Date('2026-10-22T18:29:59Z')), '2026-10-22');
  assert.equal(indiaDay(new Date('2026-10-22T18:30:00Z')), '2026-10-23');
});
