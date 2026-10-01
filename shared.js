// nyaaa.moe - общие хелперы + Lucide-иконки
'use strict';
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const store = {
  get(key, def = null) {
    try { const v = localStorage.getItem('nyaaa:' + key); return v === null ? def : JSON.parse(v); }
    catch (e) { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('nyaaa:' + key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }
};

// каодзи кошкодевочек Nekopara (имена и хвостик - общие для сайта и API)
const CATGIRLS = [
  { name: 'Чокола',   kaomoji: '(=^･ω･^=)', emoji: '🍫' },
  { name: 'Ванилла',  kaomoji: '(=ＴωＴ=)',  emoji: '❄️' },
  { name: 'Адзуки',   kaomoji: '(=☄ｪ☄=)',   emoji: '🌶️' },
  { name: 'Мэйпл',    kaomoji: '(=✧ω✧=)',   emoji: '🍁' },
  { name: 'Синамон',  kaomoji: '(=①ω①=)',   emoji: '🥐' },
  { name: 'Коконат',  kaomoji: '(=✪ω✪=)',   emoji: '🥥' },
];

function randomKaomoji() {
  return CATGIRLS[Math.floor(Math.random() * CATGIRLS.length)].kaomoji;
}

// ---- Lucide: подмена <i data-lucide="cat"> на SVG ----
// Версия зафиксирована: unpkg lucide@latest может привезти breaking changes.
// Если сеть недоступна - остаётся запасной текст.
const LUCIDE_VERSION = '1.49.0';
const LUCIDE_URL = `https://unpkg.com/lucide@${LUCIDE_VERSION}/dist/umd/lucide.min.js`;
const LUCIDE_FALLBACK = {
  cat: '✿', scroll: '▤', activity: '⌁', 'cloud-sun': '☀', languages: '文',
  terminal: '⌘', trophy: '✧', award: '✦', heart: '♡', copy: '▣', 'arrow-right': '→',
  sparkle: '✧', sparkles: '✧', moon: '☾', zap: 'ϟ', check: '✓', quote: '❝',
  'heart-handshake': '♡', 'brain-circuit': '◇', puzzle: '◇', 'cat-face': '✿',
  crown: '♕', target: '◎', lightbulb: '☼', wind: '〰', ear: '◖', music: '♫',
  mic: '♪', ghost: '♟', 'cloud-rain': '☂', feather: '⌁', utensils: '♧',
  box: '□', users: '♧', clock: '◷', sun: '☀', gift: '◇', map: '⌖',
};

let lucideLoading = false;

function initLucide() {
  const nodes = $$('i[data-lucide]');
  if (!nodes.length) return;
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { class: 'lucide', 'stroke-width': 1.75 } });
    return;
  }
  // Значок виден сразу, даже если CDN недоступен.
  nodes.forEach(n => {
    n.textContent = LUCIDE_FALLBACK[n.getAttribute('data-lucide')] || '✦';
  });
  if (lucideLoading) return;
  lucideLoading = true;
  const s = document.createElement('script');
  s.src = LUCIDE_URL;
  s.onload = () => {
    lucideLoading = false;
    if (window.lucide) {
      window.lucide.createIcons({
        attrs: { class: 'lucide', 'stroke-width': 1.75 },
      });
    }
  };
  s.onerror = () => { lucideLoading = false; };
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  const el = $('#logo-cat');
  if (el) el.textContent = randomKaomoji();
  initLucide();
});
