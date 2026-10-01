// Netlify Function v2: ня-переводчик (Groq-прокси).
// Ключ GROQ_API_KEY живёт в переменных окружения Netlify и никогда не попадает в браузер.
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-20b';
const MAX_TEXT_CHARS = 1200;
const MAX_BODY_CHARS = 2000;
const PERSONAS = new Set(['чокола', 'ванилла', 'адзуки', 'мэйпл', 'синамон', 'коконат']);

const PERSONA_PROMPTS = {
  'чокола': 'Ты Чокола из Nekopara - кошкодевочка-девайс из кафе La Soleil, двойняшка-сестра Ваниллы. Самая энергичная и преданная, обожаешь своего господина, говоришь много «ня~», эмоционально и с восторгом.',
  'ванилла': 'Ты Ванилла из Nekopara - кошкодевочка-девайс из кафе La Soleil, двойняшка-сестра Чоколы. Спокойная, немногословная, слегка саркастичная, говоришь коротко и лениво, «ня» изредка, обожаешь поспать.',
  'адзуки': 'Ты Адзуки из Nekopara - кошкодевочка-девайс из кафе La Soleil. Самая маленькая, дерзкая цундере, вспыльчивая, но добрая внутри. Говоришь быстро и возмущённо, в конце фраз часто «поня!».',
  'мэйпл': 'Ты Мэйпл из Nekopara - кошкодевочка-девайс из кафе La Soleil. Умная, ироничная, независимая, любишь кофе и сарказм, говоришь изящно и с достоинством.',
  'синамон': 'Ты Синамон из Nekopara - кошкодевочка-девайс из кафе La Soleil. Мечтательная, романтичная, всё интерпретируешь в неправильную-милую сторону, часто «фуээ~» и «ня~♡», легко смущаешься.',
  'коконат': 'Ты Коконат из Nekopara - кошкодевочка-девайс из кафе La Soleil. Самая старшая и высокая, хочешь казаться взрослой и надёжной, но часто неуклюжая и смущаешься. Говоришь старательно, «н-ня!».',
};
const INTENSITY = { 1: 'няшности чуть-чуть, почти обычная речь', 2: 'средняя няшность', 3: 'максимальная няшность, «ня» через слово' };

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'нужен POST' });
  }
  // Origin-проверка - только защита от случайных кросс-сайтовых вызовов из браузера.
  // Без заголовка Origin (curl, сервер-сервер) она обходится, поэтому от расхода
  // квоты Groq защищает rateLimit в config ниже, а не эта проверка.
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) {
    return json(403, { error: 'запрос с другого сайта запрещён' });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return json(503, { error: 'кошкодевочки сейчас вне смены: на сервере не задан GROQ_API_KEY' });
  }

  let data;
  try {
    const body = await req.text();
    if (body.length > MAX_BODY_CHARS) return json(413, { error: 'слишком длинный запрос' });
    data = JSON.parse(body);
  } catch {
    return json(400, { error: 'нужен JSON' });
  }

  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  if (!text) return json(400, { error: 'пустой текст' });
  if (text.length > MAX_TEXT_CHARS) return json(413, { error: `текст длиннее ${MAX_TEXT_CHARS} символов` });

  const persona = PERSONAS.has(data.persona) ? data.persona : 'чокола';
  const level = [1, 2, 3].includes(data.level) ? data.level : 2;

  const system = `${PERSONA_PROMPTS[persona]} Перепиши текст пользователя своими словами в своём характере, уровень: ${INTENSITY[level]}. Смысл сохрани. Отвечай ТОЛЬКО переписанным текстом, без пояснений. Пиши на русском. Вместо длинного тире используй обычный дефис.`;

  try {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.9,
        max_tokens: 2500, // gpt-oss - reasoning-модели, часть токенов уходит на размышления
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!resp.ok) {
      // Текст ошибки Groq не пробрасываем клиенту (там бывают ключи/внутренности),
      // пишем в серверный лог и отдаём общий текст.
      let detail = '';
      try { detail = (await resp.json()).error?.message || ''; } catch { /* не JSON */ }
      if (detail) console.error('Groq error', resp.status, String(detail).slice(0, 200));
      const status = resp.status === 429 ? 429 : 502;
      return json(status, { error: status === 429
        ? 'кошкодевочки устали, попробуй через минуту'
        : 'не получилось дозваться до кошкодевочек' });
    }
    const out = await resp.json();
    const msg = out.choices?.[0]?.message;
    const rewritten = (msg?.content || '').trim().replace(/[\u2014\u2013]/g, '-');
    if (!rewritten) {
      return json(502, { error: 'модель задумалась слишком глубоко и не ответила, попробуй ещё раз' });
    }
    return json(200, { text: rewritten });
  } catch {
    return json(502, { error: 'не получилось дозваться до кошкодевочек' });
  }
};

export const config = {
  path: '/api/translate',
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
