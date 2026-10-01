// nyaaa.moe - движок кошачьих тестов.
// Правила выборки и подсчёта - из README пакета catgirl-questionnaires.
'use strict';

// ===== утилиты =====
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// поровну из каждой группы, перемешать итог
function sampleEven(groups, per) {
  return shuffle(groups.map(g => shuffle(g).slice(0, per)).flat());
}
// безопасная вставка текста в innerHTML и в атрибуты (кавычки тоже экранируем)
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML.replace(/"/g, '&quot;');
}
// с покрытием разных уровней сложности: round-robin по уровням
function sampleDifficultyAware(list, n) {
  const byDiff = {};
  list.forEach(q => { (byDiff[q.difficulty] = byDiff[q.difficulty] || []).push(q); });
  Object.keys(byDiff).forEach(k => byDiff[k] = shuffle(byDiff[k]));
  const levels = shuffle(Object.keys(byDiff).map(Number).sort((a, b) => a - b));
  const picked = [];
  while (picked.length < n && levels.some(l => byDiff[l].length)) {
    for (const l of levels) {
      if (byDiff[l].length && picked.length < n) picked.push(byDiff[l].pop());
    }
  }
  return shuffle(picked);
}

const MAIN_KEY = '04_main_catgirl';
const SCALES_KEY = '01_scales';
const AXES_KEY = '02_four_axes';
const PUZZLE_KEY = '03_iq_puzzle';
const COMPAT_KEY = 'mini_compatibility';

// архетипы - художественные прототипы из README (порядок: meow, fluff, care, mischief, sleep, tsundere)
const ARCHETYPES = [
  { name: 'Домашняя', vector: [-0.2, 0.9, 0.7, -0.3, 0.8, -0.2], desc: 'твой идеал - плед, тёплое окно и гарантированный уют. мир большой, но дом лучше.' },
  { name: 'Уличная', vector: [0.5, -0.3, 0.0, 0.8, -0.5, 0.1], desc: 'свобода и приключения важнее мягкой лежанки. ты знаешь себе цену и дорогу.' },
  { name: 'Королевская', vector: [0.3, 0.5, 0.1, -0.2, 0.0, 0.6], desc: 'величество и осанка. мир - твой трон, остальные - свита.' },
  { name: 'Ведьмочка', vector: [-0.2, 0.2, 0.5, 0.4, 0.1, 0.2], desc: 'тихое волшебство: тепло, чуть магии и тайна за дверью.' },
  { name: 'Соня', vector: [-0.5, 0.8, 0.1, -0.6, 1.0, -0.1], desc: 'сон - искусство, и ты его виртуоз. мир подождёт, а подушка - нет.' },
  { name: 'Гиперактивная', vector: [0.9, -0.2, 0.1, 0.9, -0.9, -0.2], desc: 'движение - жизнь. с тобой никто не успевает заскучать.' },
  { name: 'Цундэрэ', vector: [-0.2, -0.1, 0.5, 0.2, 0.0, 1.0], desc: 'н-не думай, что я старалась ради тебя! но... спасибо, что заметил.' },
  { name: 'Заботливая', vector: [0.2, 0.8, 1.0, -0.2, 0.3, -0.4], desc: 'твоё призвание - согревать. рядом с тобой тепло и спокойно.' },
];

const PUZZLE_TIERS = [
  { min: 0, max: 24, title: 'Клубок в коробке' },
  { min: 25, max: 44, title: 'Любопытная кошка' },
  { min: 45, max: 64, title: 'Умная кошка' },
  { min: 65, max: 84, title: 'Кошачий стратег' },
  { min: 85, max: 100, title: 'Профессор Мяу' },
];
const PUZZLE_CAT_RU = { logic: 'логика', numbers: 'числа', verbal: 'слова', spatial: 'пространство', attention: 'внимание', memory: 'память' };

const TEST_INFO = {
  [MAIN_KEY]: { icon: 'crown', label: 'главный тест', desc: 'шесть сторон твоего кошачьего характера. короткий режим - 24 вопроса.' },
  [SCALES_KEY]: { icon: 'activity', label: 'шкалы + архетип', desc: 'шесть шкал и архетип: от Сони до Цундэрэ.' },
  [AXES_KEY]: { icon: 'target', label: '4 оси', desc: 'парные выборы и тип из четырёх букв.' },
  [PUZZLE_KEY]: { icon: 'lightbulb', label: 'головоломка', desc: 'логика, слова, внимание и память.' },
};
const FEATURED = [MAIN_KEY, SCALES_KEY, AXES_KEY, PUZZLE_KEY];
const MINI_ICONS = {
  tail: 'wind', ears: 'ear', breed: 'cat', club: 'music', motto: 'quote', voice: 'mic',
  dream: 'moon', mischief_test: 'ghost', weather: 'cloud-rain', fluff_test: 'feather',
  care_test: 'heart', food: 'utensils', box: 'box', aura: 'sparkles', companion: 'users',
  compatibility: 'heart-handshake', witch: 'sparkle', royal: 'crown', night: 'clock',
  window: 'sun', gift: 'gift', adventure: 'map',
};

// ===== состояние =====
const state = {
  key: null, mode: 'short',
  questions: [], answers: [],
  idx: 0,
  compatPlayer: 1, compatP1: null,
  stimulusTimer: null,
};

// ===== хранилище результатов =====
function loadResults() {
  try { return JSON.parse(localStorage.getItem('nyaaa:quizResults') || '{}'); } catch (e) { return {}; }
}
function saveResult(key, text) {
  const r = loadResults();
  r[key] = { date: new Date().toISOString().slice(0, 10), text };
  try { localStorage.setItem('nyaaa:quizResults', JSON.stringify(r)); } catch (e) { /* private mode */ }
}
function sendToTranslator(text) {
  try { sessionStorage.setItem('nyaaa:translator-prefill', text); } catch (e) { /* no session storage */ }
  location.href = 'translator.html';
}

// ===== подготовка вопросов =====
function prepareQuestions(key, mode) {
  const bank = QUIZZES[key];
  if (key === MAIN_KEY) {
    const n = mode === 'full' ? 72 : 24;
    const dims = Object.keys(bank.dimensions);
    return sampleEven(dims.map(d => bank.questions.filter(q => q.dimension === d)), n / dims.length);
  }
  if (key === SCALES_KEY) {
    const n = mode === 'full' ? 36 : 18;
    const names = Object.keys(bank.scales);
    return sampleEven(names.map(s => bank.questions.filter(q => q.scale === s)), n / names.length);
  }
  if (key === AXES_KEY) {
    const n = mode === 'full' ? 48 : 24;
    const axes = Object.keys(bank.axes);
    return sampleEven(axes.map(a => bank.questions.filter(q => q.axis === a)), n / axes.length);
  }
  if (key === PUZZLE_KEY) {
    const plan = mode === 'full'
      ? { logic: 5, numbers: 5, verbal: 5, spatial: 5, attention: 5, memory: 5 }
      : { logic: 2, numbers: 2, verbal: 2, spatial: 2, attention: 1, memory: 1 };
    const cats = Object.keys(bank.categories);
    return shuffle(cats.map(c => sampleDifficultyAware(bank.questions.filter(q => q.category === c), plan[c])).flat());
  }
  // мини-тесты
  const qs = shuffle(bank.questions);
  return mode === 'full' ? qs : qs.slice(0, 8);
}

// варианты показа (перемешанные, связь с исходом сохранена)
function displayOptions(q, key) {
  if (key === AXES_KEY) return shuffle(q.options.map(o => ({ text: o.text, value: o.value })));
  if (key === PUZZLE_KEY) return shuffle(q.options.map((text, i) => ({ text, correct: i === q.correct_index })));
  if (key === MAIN_KEY || key === SCALES_KEY) return null; // фиксированная шкала 0-3
  return shuffle(q.options.map(o => ({ text: o.text, result: o.result }))); // мини
}

// ===== маршрутизация экранов =====
const app = () => document.getElementById('app');

function goHub() {
  clearStimulus();
  state.key = null;
  const params = new URLSearchParams(location.search);
  params.delete('test');
  history.replaceState(null, '', location.pathname);
  renderHub();
}

function startQuiz(key, mode) {
  clearStimulus();
  state.key = key;
  state.mode = mode;
  state.questions = prepareQuestions(key, mode).map(q => ({ ...q, display: displayOptions(q, key) }));
  state.answers = new Array(state.questions.length).fill(null);
  state.idx = 0;
  state.compatPlayer = 1;
  state.compatP1 = null;
  renderQuestion();
}

// ===== экран-хаб =====
function renderHub() {
  const saved = loadResults();
  const minis = QUIZZES.index.mini_quizzes.filter(m => m.id !== 'compatibility');
  const compat = QUIZZES.index.mini_quizzes.find(m => m.id === 'compatibility');
  const savedChips = FEATURED.concat(QUIZZES.index.mini_quizzes.map(m => 'mini_' + m.id))
    .filter(k => saved[k])
    .map(k => `<span class="chip" title="${esc(saved[k].date)}">${esc(shortTitle(k))}: ${esc(saved[k].text)}</span>`)
    .join('');

  app().innerHTML = `
    <p class="kicker">игровая полка / 01</p>
    <h1>кошачьи тесты</h1>
    <p class="subtitle">найди свой кошачий характер, реши головоломку или выбери короткий тест.</p>
    ${savedChips ? `<div class="chips">${savedChips}</div>` : ''}
    <div class="quiz-featured">
      ${FEATURED.map(k => {
        const b = QUIZZES[k], info = TEST_INFO[k];
        const last = saved[k] ? `<div class="quiz-last">последний: ${esc(saved[k].text)}</div>` : '';
        return `<a class="quiz-feat" href="#" data-test="${k}">
          <span class="ico"><i data-lucide="${info.icon}"></i></span>
          <span class="quiz-feat-body">
            <span class="quiz-tag">${esc(info.label)}</span>
            <span class="name">${esc(b.title)}</span>
            <span class="desc">${esc(info.desc)}</span>
            ${last}
          </span>
          <span class="arrow"><i data-lucide="arrow-right"></i></span>
        </a>`;
      }).join('')}
    </div>
    <h2>мини-тесты <span class="mini-count">на 8 вопросов каждый</span></h2>
    <div class="mini-grid">
      ${minis.map(m => {
        const k = 'mini_' + m.id;
        const last = saved[k] ? `<span class="quiz-last-inline">${esc(saved[k].text)}</span>` : '';
        return `<a class="mini-card" href="#" data-test="${k}">
          <span class="ico"><i data-lucide="${MINI_ICONS[m.id] || 'cat'}"></i></span>
          <span class="mini-name">${esc(m.title)}</span>
          ${last}
        </a>`;
      }).join('')}
    </div>
    <h2>на двоих</h2>
    <a class="quiz-feat" href="#" data-test="${COMPAT_KEY}">
      <span class="ico"><i data-lucide="heart-handshake"></i></span>
      <span class="quiz-feat-body">
        <span class="quiz-tag">два игрока на одном устройстве</span>
        <span class="name">${esc(compat.title)}</span>
        <span class="desc">каждый отвечает отдельно - потом процент совпадений и ведущие темы пары.</span>
      </span>
      <span class="arrow"><i data-lucide="arrow-right"></i></span>
    </a>
  `;
  app().querySelectorAll('[data-test]').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); openIntro(a.dataset.test); }));
  initLucide();
}

function shortTitle(key) {
  const b = QUIZZES[key];
  return b && b.title ? b.title : key;
}

// ===== интро =====
function openIntro(key) {
  state.key = key;
  const params = new URLSearchParams(location.search);
  params.set('test', key);
  history.replaceState(null, '', location.pathname + '?' + params);
  renderIntro();
}

function renderIntro() {
  const key = state.key, b = QUIZZES[key];
  const info = TEST_INFO[key];
  const isCompat = key === COMPAT_KEY;
  const isPuzzle = key === PUZZLE_KEY;
  const disclaimer = isPuzzle
    ? 'игровой квиз без нормирования: числовой IQ не показываем и не считаем.'
    : 'это развлекательный тест, а не психологическая диагностика.';
  app().innerHTML = `
    <a href="#" id="back-hub" class="back-link">← ко всем тестам</a>
    <p class="kicker">${esc(info ? info.label : 'мини-тест')}</p>
    <h1>${esc(b.title)}</h1>
    <p class="subtitle">${esc(info ? info.desc : '12 вопросов, 4 варианта, один типаж на выходе. короткий режим - 8 вопросов.')}</p>
    <div class="card">
      <strong>режим</strong>
      <div class="quiz-modes">
        <label><input type="radio" name="qmode" value="short" ${state.mode === 'short' ? 'checked' : ''}> короткий</label>
        <label><input type="radio" name="qmode" value="full" ${state.mode === 'full' ? 'checked' : ''}> полный</label>
      </div>
      <p class="quiz-disclaimer">${esc(disclaimer)}</p>
      ${isCompat ? '<p class="quiz-disclaimer">играют двое на одном устройстве: первый отвечает, передаёт второму, затем - результат пары.</p>' : ''}
      <button id="btn-start" style="margin-top:10px">начать <i data-lucide="sparkles"></i></button>
    </div>
  `;
  $('#back-hub').addEventListener('click', e => { e.preventDefault(); goHub(); });
  $('#btn-start').addEventListener('click', () => {
    state.mode = document.querySelector('input[name=qmode]:checked').value;
    startQuiz(state.key, state.mode);
  });
  initLucide();
}

// ===== вопросы =====
function likertLabels() {
  return QUIZZES[state.key].answer_labels;
}

function renderQuestion() {
  // таймер стимула гасим, но флаг «уже показан» не трогаем
  stopStimulusTimer();
  const q = state.questions[state.idx];
  const total = state.questions.length;
  const pct = Math.round(state.idx / total * 100);

  if (state.key === PUZZLE_KEY && q.stimulus && !state.stimulusSeen) {
    return renderStimulus(q);
  }

  let optsHtml;
  if (state.key === MAIN_KEY || state.key === SCALES_KEY) {
    const labels = likertLabels();
    optsHtml = labels.map((l, v) => `<button class="qopt qopt-scale" data-v="${v}">${esc(l)}</button>`).join('');
  } else {
    optsHtml = q.display.map((o, i) => {
      // головоломка: в data-v кладём индекс показанного варианта, а не текст.
      // тексты могут дублироваться или содержать кавычки - сравнение по тексту неверно.
      const val = state.key === AXES_KEY ? o.value : state.key === PUZZLE_KEY ? String(i) : o.result;
      return `<button class="qopt" data-v="${esc(val)}">${esc(o.text)}</button>`;
    }).join('');
  }

  app().innerHTML = `
    <a href="#" id="back-hub" class="back-link">← выйти из теста</a>
    <div class="qprogress"><div style="width:${pct}%"></div></div>
    <p class="qcounter">вопрос ${state.idx + 1} из ${total}</p>
    <h2 class="qtext">${esc(q.text)}</h2>
    <div class="qopts">${optsHtml}</div>
    ${state.idx > 0 ? '<button class="ghost qprev" id="btn-prev">← назад</button>' : ''}
  `;

  app().querySelectorAll('.qopt').forEach(btn =>
    btn.addEventListener('click', () => pickAnswer(btn.dataset.v)));
  const prev = $('#btn-prev');
  if (prev) prev.addEventListener('click', () => { state.idx--; renderQuestion(); });
  $('#back-hub').addEventListener('click', e => { e.preventDefault(); goHub(); });
}

// двухэтапный показ заданий на память
function renderStimulus(q) {
  let left = 5;
  app().innerHTML = `
    <div class="qprogress"><div style="width:${Math.round(state.idx / state.questions.length * 100)}%"></div></div>
    <p class="qcounter">вопрос ${state.idx + 1} из ${state.questions.length} · запомни!</p>
    <div class="stimulus-card">
      <div class="stimulus-text">${esc(q.stimulus)}</div>
      <div class="stimulus-timer" id="stim-timer">${left}</div>
    </div>
  `;
  state.stimulusTimer = setInterval(() => {
    left--;
    const t = $('#stim-timer');
    if (t) t.textContent = left;
    if (left <= 0) {
      stopStimulusTimer();
      state.stimulusSeen = true;
      renderQuestion();
    }
  }, 1000);
}
// останавливает таймер, НЕ сбрасывая флаг «стимул уже показан»
function stopStimulusTimer() {
  if (state.stimulusTimer) { clearInterval(state.stimulusTimer); state.stimulusTimer = null; }
}
// полный сброс - при старте теста или выходе из него
function clearStimulus() {
  stopStimulusTimer();
  state.stimulusSeen = false;
}

function pickAnswer(v) {
  const q = state.questions[state.idx];
  if (state.key === MAIN_KEY || state.key === SCALES_KEY) {
    const val = parseInt(v, 10);
    state.answers[state.idx] = q.reverse ? 3 - val : val;
  } else if (state.key === AXES_KEY) {
    state.answers[state.idx] = v;
  } else if (state.key === PUZZLE_KEY) {
    const chosen = q.display[Number.parseInt(v, 10)];
    state.answers[state.idx] = { text: chosen ? chosen.text : '', correct: !!(chosen && chosen.correct) };
  } else {
    state.answers[state.idx] = v;
  }
  state.stimulusSeen = false;
  state.idx++;
  if (state.idx >= state.questions.length) {
    if (state.key === COMPAT_KEY && state.compatPlayer === 1) {
      state.compatP1 = state.answers.slice();
      renderHandoff();
    } else {
      renderResults();
    }
  } else {
    renderQuestion();
  }
}

// ===== совместимость: передача устройства =====
function renderHandoff() {
  app().innerHTML = `
    <div class="card" style="text-align:center">
      <p class="kicker">ход передан</p>
      <h2>теперь второй игрок</h2>
      <p style="color:var(--ink-soft)">передай устройство второму кошку. вопросы те же - отвечай честно, результат пары считается по совпадениям.</p>
      <button id="btn-p2" style="margin-top:12px">я второй игрок <i data-lucide="users"></i></button>
    </div>
  `;
  $('#btn-p2').addEventListener('click', () => {
    state.compatPlayer = 2;
    state.answers = new Array(state.questions.length).fill(null);
    state.idx = 0;
    renderQuestion();
  });
  initLucide();
}

// ===== подсчёт результатов =====
function computeMain() {
  const bank = QUIZZES[MAIN_KEY];
  const per = {};
  Object.keys(bank.dimensions).forEach(d => per[d] = { s: 0, n: 0 });
  state.answers.forEach((a, i) => { const d = state.questions[i].dimension; per[d].s += a; per[d].n++; });
  const profile = Object.keys(bank.dimensions)
    .map(d => ({ name: bank.dimensions[d], pct: per[d].n ? Math.round(per[d].s / (3 * per[d].n) * 100) : 0 }));
  const overall = Math.round(profile.reduce((s, p) => s + p.pct, 0) / profile.length);
  const tier = bank.tiers.find(t => overall >= t.min && overall <= t.max) || bank.tiers[bank.tiers.length - 1];
  return { profile, overall, tier };
}

function computeScales() {
  const bank = QUIZZES[SCALES_KEY];
  const names = Object.keys(bank.scales); // порядок = порядок координат архетипов
  const per = {};
  names.forEach(s => per[s] = { s: 0, n: 0 });
  state.answers.forEach((a, i) => { const s = state.questions[i].scale; per[s].s += a; per[s].n++; });
  const profile = names.map(s => ({
    name: bank.scales[s],
    pct: per[s].n ? Math.round(per[s].s / (3 * per[s].n) * 100) : 0,
  }));
  const overall = Math.round(profile.reduce((s, p) => s + p.pct, 0) / profile.length);
  const flat = Math.max(...profile.map(p => p.pct)) - Math.min(...profile.map(p => p.pct));
  const vec = names.map(s => 2 * (per[s].n ? per[s].s / (3 * per[s].n) : 0) - 1);
  const vlen = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  const ranked = ARCHETYPES.map(a => ({ ...a, cos: cosSim(vec, a.vector) })).sort((a, b) => b.cos - a.cos);
  let archetype, alt = null;
  // «загадочная кошка»: почти нулевой вектор ИЛИ почти плоский профиль (разброс < 8 п.п., как в README шкал)
  if (vlen < 0.15 || flat < 8) {
    archetype = { name: 'Загадочная кошка', desc: 'профиль почти плоский - все грани няшности в равновесии. это не ошибка заполнения, это редкость.' };
  } else {
    archetype = ranked[0];
    if (ranked[0].cos - ranked[1].cos < 0.08) alt = ranked[1];
  }
  return { profile, overall, flat, archetype, alt };
}

function cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function computeAxes() {
  const bank = QUIZZES[AXES_KEY];
  const counts = {};
  Object.keys(bank.axes).forEach(a => counts[a] = {});
  state.answers.forEach((v, i) => {
    const ax = state.questions[i].axis;
    counts[ax][v] = (counts[ax][v] || 0) + 1;
  });
  const axes = Object.keys(bank.axes).map(ax => {
    const [b1, b2] = bank.axes[ax];
    const c1 = counts[ax][b1] || 0, c2 = counts[ax][b2] || 0;
    const total = c1 + c2;
    if (c1 === c2) return { ax, letter: b1 + '/' + b2, conf: 0, tie: true };
    const letter = c1 > c2 ? b1 : b2;
    const conf = total ? Math.round(Math.abs(c1 - c2) / total * 100) : 0;
    return { ax, letter, conf, tie: false };
  });
  const typeName = axes.map(a => a.letter).join('');
  return { axes, typeName };
}

function computePuzzle() {
  let gotW = 0, allW = 0;
  const byCat = {};
  state.answers.forEach((a, i) => {
    const q = state.questions[i];
    allW += q.weight;
    byCat[q.category] = byCat[q.category] || { got: 0, all: 0 };
    byCat[q.category].all += q.weight;
    if (a.correct) { gotW += q.weight; byCat[q.category].got += q.weight; }
  });
  const pct = allW ? Math.round(gotW / allW * 100) : 0;
  const tier = PUZZLE_TIERS.find(t => pct >= t.min && pct <= t.max) || PUZZLE_TIERS[0];
  const cats = Object.keys(byCat).map(c => ({
    name: PUZZLE_CAT_RU[c] || c,
    pct: byCat[c].all ? Math.round(byCat[c].got / byCat[c].all * 100) : 0,
  }));
  return { pct, tier, cats };
}

function computeMini() {
  const bank = QUIZZES[state.key];
  const counts = {};
  Object.keys(bank.results).forEach(r => counts[r] = 0);
  state.answers.forEach(r => { if (counts[r] !== undefined) counts[r]++; });
  const max = Math.max(...Object.values(counts));
  const winners = Object.keys(counts).filter(r => counts[r] === max);
  return { titles: winners.map(r => bank.results[r]), counts };
}

function computeCompat() {
  const bank = QUIZZES[COMPAT_KEY];
  const a1 = state.compatP1, a2 = state.answers;
  let match = 0;
  a1.forEach((v, i) => { if (v === a2[i]) match++; });
  const matchPct = Math.round(match / a1.length * 100);
  const counts = {};
  Object.keys(bank.results).forEach(r => counts[r] = 0);
  a1.concat(a2).forEach(r => { if (counts[r] !== undefined) counts[r]++; });
  const top = Object.keys(counts).sort((x, y) => counts[y] - counts[x]).slice(0, 2)
    .map(r => bank.results[r]);
  return { matchPct, themes: top };
}

// ===== экран результатов =====
function barRow(label, pct) {
  return `<div class="qbar-row"><span class="qbar-label">${esc(label)}</span>
    <div class="qbar"><div style="width:${pct}%"></div></div>
    <span class="qbar-val">${pct}%</span></div>`;
}

function renderResults() {
  const key = state.key;
  let html = '', summaryText = '', savedText = '';

  if (key === MAIN_KEY) {
    const r = computeMain();
    savedText = `${r.overall}% - «${r.tier.title}»`;
    summaryText = `Мой результат теста «${QUIZZES[MAIN_KEY].title}» - ${r.overall}% («${r.tier.title}»).`;
    html = `
      <p class="kicker">результат</p>
      <div class="result-big">${r.overall}%</div>
      <h2 class="result-tier">${esc(r.tier.title)}</h2>
      <p style="color:var(--ink-soft)">${esc(r.tier.description)}</p>
      <div class="card">${r.profile.map(p => barRow(p.name, p.pct)).join('')}</div>`;
  } else if (key === SCALES_KEY) {
    const r = computeScales();
    const tierLetter = r.overall >= 80 ? 'S' : r.overall >= 60 ? 'A' : r.overall >= 40 ? 'B' : r.overall >= 20 ? 'C' : 'D';
    savedText = `${r.archetype.name} (${tierLetter})`;
    summaryText = `Мой архетип кошкодевочки - «${r.archetype.name}». Общий уровень: ${tierLetter}.`;
    html = `
      <p class="kicker">твой архетип</p>
      <div class="result-big">${esc(r.archetype.name)}</div>
      <p style="color:var(--ink-soft)">${esc(r.archetype.desc)}</p>
      ${r.alt ? `<div class="note">близкий второй типаж: <strong>${esc(r.alt.name)}</strong> - ${esc(r.alt.desc)}</div>` : ''}
      <div class="card">
        <strong>общий уровень: <span class="mono">${tierLetter}</span> (${r.overall}%)</strong>
        <div style="margin-top:10px">${r.profile.map(p => barRow(p.name, p.pct)).join('')}</div>
      </div>`;
  } else if (key === AXES_KEY) {
    const r = computeAxes();
    savedText = r.typeName;
    summaryText = `Мой кошачий тип по 4 осям - ${r.typeName}.`;
    html = `
      <p class="kicker">твой кошачий тип</p>
      <div class="result-big">${esc(r.typeName)}</div>
      <p style="color:var(--ink-soft)">уверенность показывает перевес ответов внутри каждой оси - не «научность» типа.</p>
      <div class="card">${r.axes.map(a => barRow(a.ax + ' → ' + a.letter + (a.tie ? ' (пограничный)' : ''), a.conf)).join('')}</div>`;
  } else if (key === PUZZLE_KEY) {
    const r = computePuzzle();
    savedText = `«${r.tier.title}»`;
    summaryText = `Кошачья головоломка - «${r.tier.title}» (${r.pct}% весов).`;
    html = `
      <p class="kicker">результат</p>
      <div class="result-big">${esc(r.tier.title)}</div>
      <p style="color:var(--ink-soft)">набрано ${r.pct}% весов заданий. это игровой тир, а не IQ.</p>
      <div class="card">${r.cats.map(c => barRow(c.name, c.pct)).join('')}</div>`;
  } else if (key === COMPAT_KEY) {
    const r = computeCompat();
    savedText = `${r.matchPct}% · ${r.themes.join(' + ')}`;
    summaryText = `Наша совместимость - ${r.matchPct}%. Ведущие темы пары: ${r.themes.join(', ')}.`;
    html = `
      <p class="kicker">результат пары</p>
      <div class="result-big">${r.matchPct}%</div>
      <p style="color:var(--ink-soft)">совпадений в ответах. это игровой показатель сходства, не оценка отношений.</p>
      <div class="card"><strong>ведущие темы пары</strong>
        <p style="margin:8px 0 0">${r.themes.map(esc).join(' · ')}</p>
      </div>`;
  } else {
    const r = computeMini();
    savedText = r.titles.join(' × ');
    summaryText = `${QUIZZES[key].title}: «${r.titles.join(' × ')}».`;
    const mixed = r.titles.length > 1;
    html = `
      <p class="kicker">${mixed ? 'смешанный типаж' : 'твой типаж'}</p>
      <div class="result-big result-big-sm">${r.titles.map(esc).join(' <span class="x">×</span> ')}</div>
      <div class="card">${Object.entries(QUIZZES[key].results).map(([rk, title]) =>
        barRow(title, Math.round(r.counts[rk] / state.answers.length * 100))).join('')}
      </div>`;
  }

  saveResult(key, savedText);
  const again = () => startQuiz(key, state.mode);

  app().innerHTML = `
    <a href="#" id="back-hub" class="back-link">← ко всем тестам</a>
    ${html}
    <div class="result-actions">
      <button id="btn-again">ещё раз</button>
      <button class="ghost" id="btn-translate">перевести у кошкодевочек <i data-lucide="sparkles"></i></button>
    </div>
    <p class="quiz-disclaimer">развлекательный тест: результат - игровой образ, а не диагностика личности.</p>
  `;
  $('#back-hub').addEventListener('click', e => { e.preventDefault(); goHub(); });
  $('#btn-again').addEventListener('click', again);
  $('#btn-translate').addEventListener('click', () => sendToTranslator(summaryText));
  initLucide();
}

// ===== запуск =====
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const t = params.get('test');
  if (t && QUIZZES[t]) {
    state.mode = params.get('mode') === 'full' ? 'full' : 'short';
    startQuiz(t, state.mode);
  } else {
    renderHub();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.key) goHub();
});

