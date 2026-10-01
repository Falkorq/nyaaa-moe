import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import translate, { config } from '../netlify/functions/translate/translate.mjs';

test('translator page has one path and no model or mode selector', async () => {
  const html = await readFile(new URL('../translator.html', import.meta.url), 'utf8');
  const shared = await readFile(new URL('../shared.js', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const dom = new JSDOM(html, { url: 'https://nyaaa.moe/translator.html', runScripts: 'outside-only' });
  const { window } = dom;
  let requested;
  window.fetch = async (url, options) => {
    requested = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ text: 'мяу' }) };
  };
  const context = dom.getInternalVMContext();
  runInContext(shared, context);
  runInContext(inline, context);
  assert.equal(window.document.querySelector('[name="mode"]'), null);
  assert.equal(window.document.querySelector('#groq-model'), null);
  window.document.querySelector('#src').value = 'привет';
  window.document.querySelector('#btn-tr').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requested.url, '/api/translate');
  assert.equal(requested.body.model, undefined);
  assert.equal(window.document.querySelector('#out').textContent, 'мяу');
  dom.window.close();
});

test('translator uses the single server model and rejects cross-site calls', async () => {
  const oldKey = process.env.GROQ_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = 'test-key';
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = options;
    return Response.json({ choices: [{ message: { content: 'мяу' } }] });
  };
  try {
    const foreign = await translate(new Request('https://nyaaa.moe/api/translate', {
      method: 'POST', headers: { origin: 'https://other.example' }, body: JSON.stringify({ text: 'привет' }),
    }));
    assert.equal(foreign.status, 403);
    assert.equal(sent, undefined);

    const result = await translate(new Request('https://nyaaa.moe/api/translate', {
      method: 'POST', headers: { origin: 'https://nyaaa.moe' },
      body: JSON.stringify({ text: 'привет', model: 'openai/gpt-oss-120b' }),
    }));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).text, 'мяу');
    assert.equal(JSON.parse(sent.body).model, 'openai/gpt-oss-20b');
    assert.equal(config.rateLimit.windowLimit, 6);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = oldKey;
  }
});
