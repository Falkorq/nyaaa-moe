import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function mockApi(window, certificate) {
  const session = { id: '20632dae-5707-41f6-9225-7d0c9fc27704', steps: [] };
  window.fetch = async (path, options = {}) => {
    if (path === '/api/certificates/progress' && options.method === 'POST') return Response.json(session, { status: 201 });
    if (path === `/api/certificates/progress/${session.id}`) {
      if (options.method === 'PUT') {
        const { step, checked } = JSON.parse(options.body);
        session.steps = session.steps.filter(item => item.i !== step);
        if (checked) session.steps.push({ i: step, t: new Date().toISOString() });
      }
      return Response.json(session);
    }
    if (path === '/api/certificates' && options.method === 'POST') return Response.json(certificate, { status: 201 });
    return Response.json({ error: 'missing' }, { status: 404 });
  };
}

test('ten guide steps reveal the nickname form', async () => {
  const html = await readFile(new URL('guide.html', root), 'utf8');
  const shared = await readFile(new URL('shared.js', root), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const dom = new JSDOM(html, { url: 'https://nyaaa.moe/guide.html', runScripts: 'outside-only' });
  const { window } = dom;
  const certificate = { id: '1790856000000-20632dae-5707-41f6-9225-7d0c9fc27704', nickname: 'Лунная Мурка', issuedAt: '2026-10-01T12:00:00.000Z' };
  mockApi(window, certificate);
  const context = dom.getInternalVMContext();
  runInContext(shared, context);
  runInContext(inline, context);
  await tick();
  assert.equal(window.document.querySelector('#cert-card').hidden, true);
  for (let i = 0; i < 10; i++) {
    window.document.querySelector(`#guide-step-${i}`).click();
    await tick();
    assert.equal(window.document.querySelector(`#guide-step-${i}`).checked, true);
    assert.equal(window.document.querySelector(`#guide-step-${i}`).parentElement.classList.contains('done'), true);
  }
  assert.equal(window.document.querySelector('#progress-label').textContent, '10 / 10');
  assert.equal(window.document.querySelector('#cert-card').hidden, false);
  assert.equal(window.document.querySelector('#cert-form').hidden, false);
  window.document.querySelector('#cert-nickname').value = certificate.nickname;
  window.document.querySelector('#cert-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(window.document.querySelector('#cert-issued').hidden, false);
  assert.equal(window.document.querySelector('#cert-person').textContent, certificate.nickname);
  assert.match(window.document.querySelector('#cert-link').href, /certificate\.html\?id=/);
  dom.window.close();
});

test('old guide progress stays visible and asks for fresh confirmations', async () => {
  const html = await readFile(new URL('guide.html', root), 'utf8');
  const shared = await readFile(new URL('shared.js', root), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const dom = new JSDOM(html, { url: 'https://nyaaa.moe/guide.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.localStorage.setItem('nyaaa:guide', JSON.stringify([0, 1]));
  mockApi(window, { id: '1790856000000-20632dae-5707-41f6-9225-7d0c9fc27704', nickname: 'Няша' });
  const context = dom.getInternalVMContext();
  runInContext(shared, context);
  runInContext(inline, context);
  await tick();
  assert.equal(window.document.querySelector('#guide-step-0').checked, true);
  assert.equal(window.document.querySelector('#guide-migration-note').hidden, false);
  assert.equal(window.document.querySelector('#cert-card').hidden, true);
  window.document.querySelector('#guide-step-0').click();
  window.document.querySelector('#guide-step-0').click();
  await tick();
  assert.equal(window.document.querySelector('#guide-step-0').checked, true);
  dom.window.close();
});
