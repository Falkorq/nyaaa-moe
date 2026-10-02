const PAGE_SIZE = 24;
const MAX_BODY_BYTES = 1024;
const ID_PATTERN = /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const NAME_PATTERN = /^[\p{L}\p{N} _.'’\-]{2,24}$/u;
const GUIDE_STEPS = 10;
const SESSION_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// Незавершённые сессии живут 30 дней, а не год: меньше мусора в Blobs.
// Просрочка удаляется при первом обращении (см. ниже); фонового GC у Blobs нет.
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// Кеш отсортированных ключей галереи: каждый GET?page= иначе сканирует весь стор (O(n)).
// Инвалидируется при выдаче/удалении сертификата.
const GALLERY_CACHE_TTL_MS = 30_000;
const MAX_LIST_KEYS = 20000;
let galleryCache = { at: 0, keys: [] };
export function _invalidateGalleryCache() { galleryCache.at = 0; }

function isExpired(createdAt, nowMs) {
  const t = Date.parse(createdAt);
  return Number.isNaN(t) || nowMs - t > SESSION_LIFETIME_MS;
}

async function listCertificateKeys(store) {
  const nowMs = Date.now();
  if (galleryCache.keys.length && nowMs - galleryCache.at < GALLERY_CACHE_TTL_MS) return galleryCache.keys;
  const keys = [];
  // У настоящего Blobs list({ paginate: true }) возвращает AsyncIterable страниц,
  // у тестовых моков - обычный объект { blobs }. Поддерживаем оба варианта.
  const raw = await store.list({ prefix: 'cert/', paginate: true });
  const pages = raw && typeof raw[Symbol.asyncIterator] === 'function' ? raw : [raw];
  for await (const page of pages) {
    for (const blob of page?.blobs ?? []) {
      const key = blob?.key;
      if (typeof key === 'string' && key.startsWith('cert/') && ID_PATTERN.test(key.slice(5))) keys.push(key);
      if (keys.length >= MAX_LIST_KEYS) break;
    }
    if (keys.length >= MAX_LIST_KEYS) break;
  }
  keys.sort().reverse(); // id начинается с timestamp выдачи - сортировка = от новых к старым
  galleryCache = { at: nowMs, keys };
  return keys;
}

function adminAuthorized(request, token) {
  if (!token) return false;
  const a = new TextEncoder().encode(request.headers.get('authorization') ?? '');
  const b = new TextEncoder().encode(`Bearer ${token}`);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function validateNickname(value) {
  if (typeof value !== 'string') return null;
  const nickname = value.trim().replace(/\s+/g, ' ');
  return NAME_PATTERN.test(nickname) && /[\p{L}\p{N}]/u.test(nickname) ? nickname : null;
}

export async function handleCertificates(request, store, now = () => new Date(), adminToken = globalThis.process?.env?.CERT_ADMIN_TOKEN) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/api\/certificates\/?/, '');

  if (request.method === 'POST' && suffix === 'progress') {
    const session = { id: crypto.randomUUID(), createdAt: now().toISOString(), steps: [] };
    await store.setJSON(`progress/${session.id}`, session, { onlyIfNew: true });
    return reply(201, session);
  }

  const sessionId = suffix.startsWith('progress/') ? suffix.slice('progress/'.length) : null;
  if (sessionId !== null && SESSION_PATTERN.test(sessionId)) {
    const session = await store.get(`progress/${sessionId}`, { type: 'json' });
    if (!session || isExpired(session?.createdAt, Date.parse(now().toISOString()))) {
      // Просрочка/мусор не копим: удаляем при первом обращении.
      if (session) await store.delete(`progress/${sessionId}`).catch(() => {});
      return reply(404, { error: 'прогресс не найден или устарел' });
    }
    if (request.method === 'GET') return reply(200, session);
    if (request.method === 'PUT') {
      let data;
      try {
        const body = await request.text();
        if (body.length > MAX_BODY_BYTES) return reply(413, { error: 'слишком длинный запрос' });
        data = JSON.parse(body);
      } catch {
        return reply(400, { error: 'нужен JSON с номером шага' });
      }
      if (!Number.isInteger(data?.step) || data.step < 0 || data.step >= GUIDE_STEPS || typeof data.checked !== 'boolean') {
        return reply(400, { error: 'неверный шаг' });
      }
      session.steps = session.steps.filter(item => item.i !== data.step);
      if (data.checked) session.steps.push({ i: data.step, t: now().toISOString() });
      await store.setJSON(`progress/${sessionId}`, session);
      return reply(200, session);
    }
    return reply(405, { error: 'нужен GET или PUT' });
  }

  if (request.method === 'POST' && suffix === '') {
    let data;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return reply(413, { error: 'слишком длинный запрос' });
      data = JSON.parse(raw);
    } catch {
      return reply(400, { error: 'нужен JSON с ником' });
    }
    if (data?.website) return reply(400, { error: 'не удалось выдать сертификат' });
    const nickname = validateNickname(data?.nickname);
    if (!nickname) return reply(400, { error: 'ник: 2-24 символа, буквы, цифры, пробел, _ . или -' });
    const session = SESSION_PATTERN.test(data?.sessionId) ? await store.get(`progress/${data.sessionId}`, { type: 'json' }) : null;
    const issuedAt = now().toISOString();
    const steps = session?.steps;
    const unique = new Set(steps?.map(item => item.i));
    const expired = session && isExpired(session.createdAt, Date.parse(issuedAt));
    if (expired && SESSION_PATTERN.test(data?.sessionId)) {
      await store.delete(`progress/${data.sessionId}`).catch(() => {});
    }
    if (!session || expired ||
        !Array.isArray(steps) || steps.length !== GUIDE_STEPS || unique.size !== GUIDE_STEPS) {
      return reply(403, { error: 'сначала пройди все 10 шагов гайда - сертификат выдаётся только после них' });
    }
    const times = steps.map(item => Date.parse(item.t)).sort((a, b) => a - b);
    const progress = { startedAt: new Date(times[0]).toISOString(), finishedAt: new Date(times.at(-1)).toISOString(), spanMs: times.at(-1) - times[0] };
    const id = `${Date.parse(issuedAt)}-${crypto.randomUUID()}`;
    const certificate = { id, nickname, issuedAt, guide: progress };
    await store.setJSON(`cert/${id}`, certificate, { onlyIfNew: true });
    await store.delete(`progress/${session.id}`);
    _invalidateGalleryCache();
    return reply(201, certificate);
  }

  if (request.method === 'GET' && suffix === '') {
    const page = Number(url.searchParams.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000) return reply(400, { error: 'неверная страница' });
    const keys = await listCertificateKeys(store);
    const selected = keys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const items = (await Promise.all(selected.map(key => store.get(key, { type: 'json' })))).filter(Boolean);
    return reply(200, { items, total: keys.length, page, pageSize: PAGE_SIZE });
  }

  if (request.method === 'GET' && ID_PATTERN.test(suffix)) {
    const certificate = await store.get(`cert/${suffix}`, { type: 'json' });
    return certificate ? reply(200, certificate) : reply(404, { error: 'сертификат не найден' });
  }

  if (request.method === 'DELETE' && ID_PATTERN.test(suffix)) {
    if (!adminAuthorized(request, adminToken)) {
      return reply(403, { error: 'доступ запрещён' });
    }
    await store.delete(`cert/${suffix}`);
    _invalidateGalleryCache();
    return reply(200, { deleted: true });
  }

  return reply(request.method === 'GET' ? 404 : 405, { error: 'мяу? такого сертификата нет' });
}
