import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);

function makeSandbox() {
  return readFile(new URL('quiz.html', root), 'utf8').then(async quizHtml => {
    const dom = new JSDOM(quizHtml, { url: 'https://nyaaa.moe/quiz.html', runScripts: 'outside-only' });
    const { window } = dom;
    const context = dom.getInternalVMContext();
    const script = async name => runInContext(await readFile(new URL(name, root), 'utf8'), context);
    return { dom, window, context, script };
  });
}

// quiz.js вешает запуск на DOMContentLoaded, который в JSDOM к этому моменту уже стрелял.
// подменяем addEventListener, чтобы поймать подписку и вызвать её вручную.
function captureReady(window) {
  const original = window.document.addEventListener.bind(window.document);
  let ready = null;
  window.document.addEventListener = (type, fn) => {
    if (type === 'DOMContentLoaded') ready = fn;
    else original(type, fn);
  };
  return () => {
    window.document.addEventListener = original;
    if (ready) ready();
  };
}

test('quiz page opens: hub renders after scripts load', async () => {
  const { dom, window, script } = await makeSandbox();
  const fireReady = captureReady(window);
  await script('questions-data.js');
  await script('shared.js');
  await script('quiz.js');
  fireReady();
  // если esc() не определён или данные не подгрузились — останется экран загрузки
  const hubTitle = [...window.document.querySelectorAll('h1')].map(h => h.textContent).join();
  assert.match(hubTitle, /кошачьи тесты/);
  assert.ok(window.document.querySelector('.quiz-featured'), 'нет карточек главных тестов');
  assert.equal(window.document.querySelectorAll('.mini-card').length, 21, 'мини-тестов кроме совместимости');
  dom.window.close();
});

test('memory puzzles: stimulus shows once, then the answer options appear', async () => {
  const { dom, window, script } = await makeSandbox();
  const fireReady = captureReady(window);
  await script('questions-data.js');
  await script('shared.js');
  await script('quiz.js');
  fireReady();

  // начинаем полный режим головоломки (там гарантированно есть задания на память)
  const doc = window.document;
  doc.querySelector('[data-test="03_iq_puzzle"]').click();
  doc.querySelector('input[name="qmode"][value="full"]').checked = true;
  doc.querySelector('#btn-start').click();

  // прокликиваем все вопросы. на заданиях памяти сначала стимул с таймером,
  // затем варианты. если цикл воспроизвёлся — стимул появится повторно и тест свалится.
  for (let guard = 0; guard < 80; guard++) {
    if (doc.querySelector('.stimulus-card')) {
      await new Promise(resolve => setTimeout(resolve, 5300)); // ждём таймер стимула (5с)
      if (doc.querySelector('.stimulus-card')) assert.fail('стимул показывается повторно — цикл на месте');
      continue;
    }
    const opts = [...doc.querySelectorAll('.qopt')];
    if (opts.length) {
      opts[opts.length - 1].click();
      continue;
    }
    if (doc.querySelector('.result-big')) break; // дошли до результатов
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(doc.querySelector('.result-big'), 'не дошли до результатов головоломки');
  dom.window.close();
});
