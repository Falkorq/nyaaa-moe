// Local preview with an in-memory certificate store. Nothing here reaches Netlify.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { handleCertificates } from './certificates-api.mjs';
import { handle } from './api.js';
import translate from './netlify/functions/translate/translate.mjs';

const root = resolve(import.meta.dirname, 'dist');
const records = new Map();
const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const store = {
  // Поддерживаем onlyIfNew и клонируем значения, как настоящий Blobs:
  // иначе локально не воспроизводятся гонки и мутации через ссылки.
  async setJSON(key, value, options) {
    if (options?.onlyIfNew && records.has(key)) return { modified: false };
    records.set(key, clone(value));
    return { modified: true };
  },
  async get(key, options) {
    const value = records.get(key) ?? null;
    if (value === null) return null;
    return options?.type === 'json' ? clone(value) : value;
  },
  async list({ prefix }) { return { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; },
  async delete(key) { records.delete(key); },
};
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://${incoming.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      const response = url.pathname.startsWith('/api/certificates') ? await handleCertificates(request, store)
        : url.pathname === '/api/translate' ? await translate(request) : await handle(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const target = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!target.startsWith(root + sep)) { outgoing.writeHead(403); outgoing.end(); return; }
    const file = await readFile(target);
    outgoing.writeHead(200, { 'content-type': types[extname(target)] || 'application/octet-stream' });
    outgoing.end(file);
  } catch (error) {
    outgoing.writeHead(error.code === 'ENOENT' ? 404 : 500);
    outgoing.end(error.code === 'ENOENT' ? 'not found' : 'server error');
  }
}).listen(8766, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:8766'));
