import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesCity, matchesContactToJobLocation } from '../server/locations.mjs';

test('India jobs match people visibly located in India', () => {
  assert.equal(matchesCity('Bengaluru, Karnataka, India', ['India']), true);
  assert.equal(matchesCity('London, England, United Kingdom', ['India']), false);
  assert.equal(matchesCity('Gurugram (Hybrid)', ['Delhi'], '', 'Delhi'), true);
  assert.equal(matchesContactToJobLocation('India', 'Mumbai, Maharashtra'), true);
  assert.equal(matchesContactToJobLocation('Bengaluru, Karnataka, India', 'San Francisco Bay Area'), false);
  assert.equal(matchesContactToJobLocation('Remote', 'Pune, India'), true);
  assert.equal(matchesContactToJobLocation('Remote', 'New York, United States'), false);
});

test('jobs explicitly outside India may match people at that company abroad', () => {
  assert.equal(matchesContactToJobLocation('London, United Kingdom', 'London, United Kingdom'), true);
  assert.equal(matchesContactToJobLocation('Tokyo, Japan', 'Tokyo, Japan'), true);
});
