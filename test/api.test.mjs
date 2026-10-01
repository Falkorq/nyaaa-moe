import test from 'node:test';
import assert from 'node:assert/strict';
import { clampNyaRange, handle } from '../api.js';
import { config } from '../netlify/functions/api/api.mjs';

test('clamps the nya range to sane bounds', () => {
  assert.deepEqual(clampNyaRange(1, 10), [1, 10]);
  assert.deepEqual(clampNyaRange(10, 1), [1, 10]); // swap
  assert.deepEqual(clampNyaRange(-999999999, 999999999), [-1000000, 0]); // границы + срез размаха
  assert.deepEqual(clampNyaRange(NaN, NaN), [1, 10]); // missing params
  const [min, max] = clampNyaRange(-1000000, 1000000);
  assert.deepEqual([min, max], [-1000000, 0], 'span is capped at NYA_MAX_SPAN');
});

test('/api/nya stays within bounds even with absurd params', async () => {
  const res = await handle(new Request('https://nyaaa.moe/api/nya?min=-999999999&max=999999999'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.nya >= -1000000 && body.nya <= 1000000);
});

test('nya api has a rate limit configured', () => {
  assert.ok(config.rateLimit.windowLimit > 0);
});
