import { handle } from '../api.js';
import { handleCertificates } from '../certificates-api.mjs';
import translate from '../netlify/functions/translate/translate.mjs';
import { d1Store } from './d1-store.mjs';

const tooMany = () => Response.json({ error: 'слишком много запросов, попробуй через минуту' }, {
  status: 429,
  headers: { 'cache-control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (path === '/api/nya' || path === '/api/quote') {
      if (!(await env.API_LIMIT.limit({ key: ip })).success) return tooMany();
      return handle(request);
    }
    if (path === '/api/translate') {
      if (!(await env.TRANSLATE_LIMIT.limit({ key: ip })).success) return tooMany();
      return translate(request, env);
    }
    if (path === '/api/certificates' || path.startsWith('/api/certificates/')) {
      if (!(await env.CERTIFICATE_LIMIT.limit({ key: ip })).success) return tooMany();
      return handleCertificates(request, d1Store(env.DB), () => new Date(), env.CERT_ADMIN_TOKEN);
    }
    if (path.startsWith('/api/')) return Response.json({ error: 'мяу? такого API нет' }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
