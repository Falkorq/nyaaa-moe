import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCertificates, validateNickname } from '../certificates-api.mjs';

function memoryStore() {
  const entries = new Map();
  return {
    async setJSON(key, value) { entries.set(key, value); return { modified: true }; },
    async get(key) { return entries.get(key) ?? null; },
    async list({ prefix }) { return { blobs: [...entries.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; },
    async delete(key) { entries.delete(key); },
  };
}

const api = (path, init) => new Request(`https://nyaaa.moe${path}`, init);

async function completeSession(store, now = () => new Date()) {
  const started = await handleCertificates(api('/api/certificates/progress', { method: 'POST' }), store, now);
  assert.equal(started.status, 201);
  const session = await started.json();
  for (let step = 0; step < 10; step++) {
    const marked = await handleCertificates(api(`/api/certificates/progress/${session.id}`, {
      method: 'PUT', body: JSON.stringify({ step, checked: true }),
    }), store, now);
    assert.equal(marked.status, 200);
  }
  return session.id;
}

test('validates public nicknames', () => {
  assert.equal(validateNickname('  Лунная   Мурка  '), 'Лунная Мурка');
  assert.equal(validateNickname('<script>'), null);
  assert.equal(validateNickname('a'), null);
  assert.equal(validateNickname('https://bad.test'), null);
});

test('issues a certificate, retrieves it and lists the public nickname', async () => {
  const store = memoryStore();
  const issuedAt = new Date('2026-10-01T12:00:00.000Z');
  const sessionId = await completeSession(store, () => issuedAt);
  const created = await handleCertificates(api('/api/certificates', {
    method: 'POST', body: JSON.stringify({ nickname: 'Лунная Мурка', sessionId }),
  }), store, () => issuedAt);
  assert.equal(created.status, 201);
  const cert = await created.json();
  assert.equal(cert.nickname, 'Лунная Мурка');
  assert.equal(cert.issuedAt, issuedAt.toISOString());

  const detail = await handleCertificates(api(`/api/certificates/${cert.id}`), store);
  assert.deepEqual(await detail.json(), cert);
  const list = await handleCertificates(api('/api/certificates?page=1'), store);
  assert.deepEqual((await list.json()).items, [cert]);
  const used = await handleCertificates(api(`/api/certificates/progress/${sessionId}`), store, () => issuedAt);
  assert.equal(used.status, 404);
});

test('rejects incomplete or malformed guide progress', async () => {
  const store = memoryStore();
  const now = () => new Date('2026-10-01T12:00:00.000Z');

  // Без серверной сессии сертификат не выдаётся.
  const noGuide = await handleCertificates(api('/api/certificates', {
    method: 'POST', body: JSON.stringify({ nickname: 'Няша' }),
  }), store, now);
  assert.equal(noGuide.status, 403);

  // Подставленные клиентом отметки времени больше не принимаются.
  const fakeSteps = Array.from({ length: 10 }, (_, i) => ({ i, t: '2026-10-01T11:59:59.000Z' }));
  const fake = await handleCertificates(api('/api/certificates', {
    method: 'POST', body: JSON.stringify({ nickname: 'Няша', guide: { steps: fakeSteps } }),
  }), store, now);
  assert.equal(fake.status, 403);

  const started = await handleCertificates(api('/api/certificates/progress', { method: 'POST' }), store, now);
  const { id: sessionId } = await started.json();
  const invalidStep = await handleCertificates(api(`/api/certificates/progress/${sessionId}`, {
    method: 'PUT', body: JSON.stringify({ step: 10, checked: true }),
  }), store, now);
  assert.equal(invalidStep.status, 400);
  for (let i = 0; i < 10; i++) {
    await handleCertificates(api(`/api/certificates/progress/${sessionId}`, {
      method: 'PUT', body: JSON.stringify({ step: 0, checked: true }),
    }), store, now);
  }
  const tooFew = await handleCertificates(api('/api/certificates', {
    method: 'POST', body: JSON.stringify({ nickname: 'Няша', sessionId }),
  }), store, now);
  assert.equal(tooFew.status, 403);
});

test('rejects invalid input and paginates the gallery', async () => {
  const store = memoryStore();
  const invalid = await handleCertificates(api('/api/certificates', {
    method: 'POST', body: JSON.stringify({ nickname: '<img src=x>' }),
  }), store);
  assert.equal(invalid.status, 400);
  for (let i = 0; i < 25; i++) {
    const clock = () => new Date(1760000000000 + i);
    const sessionId = await completeSession(store, clock);
    const created = await handleCertificates(api('/api/certificates', {
      method: 'POST', body: JSON.stringify({ nickname: `Няша ${i}`, sessionId }),
    }), store, clock);
    assert.equal(created.status, 201);
  }
  const first = await (await handleCertificates(api('/api/certificates?page=1'), store)).json();
  const second = await (await handleCertificates(api('/api/certificates?page=2'), store)).json();
  assert.equal(first.total, 25);
  assert.equal(first.items.length, 24);
  assert.equal(second.items.length, 1);
  assert.equal(first.items[0].nickname, 'Няша 24');
});

test('admin token is required to remove a public nickname', async () => {
  const store = memoryStore();
  const clock = () => new Date();
  const sessionId = await completeSession(store, clock);
  const created = await handleCertificates(api('/api/certificates', {
    method: 'POST', body: JSON.stringify({ nickname: 'Няша', sessionId }),
  }), store, clock);
  const cert = await created.json();
  const denied = await handleCertificates(api(`/api/certificates/${cert.id}`, { method: 'DELETE' }), store);
  assert.equal(denied.status, 403);
  const previous = process.env.CERT_ADMIN_TOKEN;
  process.env.CERT_ADMIN_TOKEN = 'test-secret';
  try {
    const deleted = await handleCertificates(api(`/api/certificates/${cert.id}`, {
      method: 'DELETE', headers: { authorization: 'Bearer test-secret' },
    }), store);
    assert.equal(deleted.status, 200);
    const missing = await handleCertificates(api(`/api/certificates/${cert.id}`), store);
    assert.equal(missing.status, 404);
  } finally {
    if (previous === undefined) delete process.env.CERT_ADMIN_TOKEN;
    else process.env.CERT_ADMIN_TOKEN = previous;
  }
});
