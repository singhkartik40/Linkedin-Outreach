import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

async function collectProfile(headingTag) {
  const messages = [];
  const main = {
    innerText: 'Asha Rao\nCo-founder at Acme\nBengaluru, Karnataka, India',
    querySelector(selector) {
      if (selector === headingTag) return { innerText: 'Asha Rao' };
      return null;
    },
  };
  const source = readFileSync(new URL('../chrome-extension/discovery.js', import.meta.url), 'utf8')
    .replace(/\s*void run\(\);\s*\}\)\(\);\s*$/, '\nglobalThis.collectProfileForTest = collectStage;\n})();');
  const context = {
    document: { querySelector: selector => selector === 'main' ? main : null },
    chrome: { runtime: { onMessage: { addListener() {} }, async sendMessage(message) { messages.push(message); } } },
    URL, location: { href: 'https://www.linkedin.com/in/asha/' },
  };
  runInNewContext(source, context);
  await context.collectProfileForTest({ phase: 'founder-profile', company: 'Acme', stageId: 'founder-profile:0:0' });
  return messages[0].payload.person;
}

test('founder profile collector reads the current LinkedIn h2 profile name', async () => {
  const person = await collectProfile('h2');
  assert.equal(person.name, 'Asha Rao');
  assert.equal(person.headline, 'Co-founder at Acme');
  assert.equal(person.location, 'Bengaluru, Karnataka, India');
});

test('founder profile collector still reads the legacy h1 profile name', async () => {
  assert.equal((await collectProfile('h1')).name, 'Asha Rao');
});

test('startup discovery accepts product-company search results without the literal word startup', async () => {
  const messages = [];
  const anchor = { href: 'https://www.linkedin.com/company/cunomial/' };
  const heading = { innerText: 'Cunomial | LinkedIn', closest: selector => selector === 'a' ? anchor : { innerText: 'Cunomial builds a SaaS platform in Bengaluru, India.' } };
  const source = readFileSync(new URL('../chrome-extension/discovery.js', import.meta.url), 'utf8')
    .replace(/\s*void run\(\);\s*\}\)\(\);\s*$/, '\nglobalThis.collectForTest = collectStage;\n})();');
  const context = { document: { querySelectorAll: () => [heading] }, URL, chrome: { runtime: { onMessage: { addListener() {} }, async sendMessage(message) { messages.push(message); } } } };
  runInNewContext(source, context);
  await context.collectForTest({ phase: 'startups', stageId: 'startups:0:0' });
  assert.equal(messages[0].payload.companies.length, 1);
  assert.equal(messages[0].payload.companies[0].company, 'Cunomial');
});
