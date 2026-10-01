// nyaaa.moe - JSON API (Netlify Functions / Cloudflare Workers / Vercel)
// GET /api/nya?min=1&max=10  → { nya, catgirl, mood }
// GET /api/quote             → { quote, author }
import { QUOTES } from './quotes.mjs';

const CATGIRLS = [
  { name: 'Чокола',   kaomoji: '(=^･ω･^=)', emoji: '🍫' },
  { name: 'Ванилла',  kaomoji: '(=ＴωＴ=)',  emoji: '❄️' },
  { name: 'Адзуки',   kaomoji: '(=☄ｪ☄=)',   emoji: '🌶️' },
  { name: 'Мэйпл',    kaomoji: '(=✧ω✧=)',   emoji: '🍁' },
  { name: 'Синамон',  kaomoji: '(=①ω①=)',   emoji: '🥐' },
  { name: 'Коконат',  kaomoji: '(=✪ω✪=)',   emoji: '🥥' },
];
const MOODS = ['сонная', 'игривая', 'голодная', 'величественная', 'мурчащая', 'загадочная', 'шалящая', 'философская'];

// Границы диапазона: защита от абсурдных min/max (например, ±10⁹).
export const NYA_MIN = -1000000;
export const NYA_MAX = 1000000;
export const NYA_MAX_SPAN = 1000000;

export function clampNyaRange(pMin, pMax) {
  let min = Number.isInteger(pMin) ? Math.min(NYA_MAX, Math.max(NYA_MIN, pMin)) : 1;
  let max = Number.isInteger(pMax) ? Math.min(NYA_MAX, Math.max(NYA_MIN, pMax)) : 10;
  if (min > max) [min, max] = [max, min];
  if (max - min > NYA_MAX_SPAN) max = min + NYA_MAX_SPAN;
  return [min, max];
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
});

export function handle(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/nya') {
    const [min, max] = clampNyaRange(
      parseInt(url.searchParams.get('min'), 10),
      parseInt(url.searchParams.get('max'), 10),
    );
    const g = CATGIRLS[Math.floor(Math.random() * CATGIRLS.length)];
    return json(200, {
      nya: min + Math.floor(Math.random() * (max - min + 1)),
      catgirl: g.name,
      kaomoji: g.kaomoji,
      emoji: g.emoji,
      mood: MOODS[Math.floor(Math.random() * MOODS.length)],
    });
  }
  if (url.pathname === '/api/quote') {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return json(200, { quote: q[0], author: q[1], from: 'Nekopara' });
  }
  return json(404, { error: 'мяу? такого эндпоинта нет', hint: 'попробуй /api/nya или /api/quote' });
}
