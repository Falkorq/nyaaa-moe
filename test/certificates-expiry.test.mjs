import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCertificates } from '../certificates-api.mjs';

function memoryStore() {
  const entries = new Map();
  return {
    async setJSON(key, value) { entries.set(key, value); return { modified: true }; },
    async get(key) { return entries.get(key) ?? null; },
    async list({ prefix }) { return { blobs: [...entries.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; },
    async delete(key) { entries.delete(key); },
    has(key) { return entries.has(key); },
  };
}

const api = (path, init) => new Request(`https://nyaaa.moe${path}`, init);

test('expired progress sessions are removed on read and cannot issue certificates', async () => {
  const store = memoryStore();
  const created = await handleCertificates(
    api('/api/certificates/progress', { method: 'POST' }), store,
    () => new Date('2026-01-01T00:00:00.000Z'),
  );
  const { id } = await created.json();
  // 60 дней спустя: срок сессии (30 дней) истёк.
  const late = () => new Date('2026-03-02T00:00:00.000Z');
  const read = await handleCertificates(api(`/api/certificates/progress/${id}`), store, late);
  assert.equal(read.status, 404);
  assert.equal(store.has(`progress/${id}`), false);

  const issue = await handleCertificates(api('/api/certificates', {
    method: 'POST', body: JSON.stringify({ nickname: 'Няша', sessionId: id }),
  }), store, late);
  assert.equal(issue.status, 403);
});
