import test from 'node:test';
import assert from 'node:assert/strict';
import { requestFor, generate, parseJson, validateProvider } from '../server/providers.mjs';
test('each protocol sends the right authentication and payload', () => {
  for (const provider of ['openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'nvidia', 'chutes', 'compatible']) {
    const req = requestFor({ provider, model: 'test-model', baseUrl: 'https://example.com/v1' }, 'test-key', 'hello');
    assert.ok(!req.url.includes('test-key'));
    if (provider === 'gemini') { assert.equal(req.headers['x-goog-api-key'], 'test-key'); assert.equal(req.body.contents[0].parts[0].text, 'hello'); }
    else if (provider === 'anthropic') { assert.equal(req.headers['x-api-key'], 'test-key'); assert.equal(req.body.max_tokens, 3000); }
    else { assert.equal(req.headers.Authorization, 'Bearer test-key'); assert.ok(req.url.endsWith('/chat/completions')); }
  }
});
test('native provider keys cannot be redirected by a custom base URL', () => {
  assert.ok(requestFor({ provider: 'openai', model: 'test', baseUrl: 'https://untrusted.example' }, 'key', 'hello').url.startsWith('https://api.openai.com/'));
  assert.ok(requestFor({ provider: 'groq', model: 'test', baseUrl: 'https://untrusted.example' }, 'key', 'hello').url.startsWith('https://api.groq.com/openai/v1/'));
  assert.ok(requestFor({ provider: 'openrouter', model: 'test', baseUrl: 'https://untrusted.example' }, 'key', 'hello').url.startsWith('https://openrouter.ai/api/v1/'));
  assert.ok(requestFor({ provider: 'nvidia', model: 'test', baseUrl: 'https://untrusted.example' }, 'key', 'hello').url.startsWith('https://integrate.api.nvidia.com/v1/'));
  assert.ok(requestFor({ provider: 'chutes', model: 'test', baseUrl: 'https://untrusted.example' }, 'key', 'hello').url.startsWith('https://llm.chutes.ai/v1/'));
});
test('named providers choose a default model when only a key is supplied', () => {
  assert.equal(validateProvider({ provider: 'nvidia' }).model, 'nvidia/nemotron-3.5-lightning-30b-a3b');
  assert.equal(validateProvider({ provider: 'groq' }).model, 'openai/gpt-oss-20b');
  assert.throws(() => validateProvider({ provider: 'compatible', baseUrl: 'https://example.com/v1' }));
});
test('custom endpoints require HTTPS except local models', () => {
  assert.throws(() => validateProvider({ provider: 'compatible', model: 'test', baseUrl: 'http://external.example/v1' }));
  assert.throws(() => validateProvider({ provider: 'compatible', model: 'test', baseUrl: 'https://user:key@external.example/v1' }));
  assert.equal(validateProvider({ provider: 'compatible', model: 'test', baseUrl: 'http://127.0.0.1:11434/v1' }).baseUrl, 'http://127.0.0.1:11434/v1');
});
test('provider outputs normalize to text for all protocols', async () => {
  for (const [provider, payload] of Object.entries({ openai: { choices: [{ message: { content: '{"ok":true}' } }] }, anthropic: { content: [{ type: 'text', text: '{"ok":true}' }] }, gemini: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] } })) {
    const output = await generate({ provider, model: 'test' }, 'key', 'hello', async () => new Response(JSON.stringify(payload)));
    assert.deepEqual(parseJson(output), { ok: true });
  }
});
test('upstream error bodies containing secrets never escape', async () => {
  await assert.rejects(() => generate({ provider: 'openai', model: 'test' }, 'secret', 'hello', async () => new Response('secret internal debug', { status: 401 })), error => !error.message.includes('secret') && error.message.includes('401'));
  assert.throws(() => parseJson('bad JSON'));
  await assert.rejects(() => generate({ provider: 'openai', model: 'test' }, 'secret', 'hello', async () => new Response('secret internal debug', { status: 200 })), error => !error.message.includes('secret') && /invalid JSON/.test(error.message));
  assert.deepEqual(parseJson('```json\n{"ok":true}\n```'), { ok: true });
});
