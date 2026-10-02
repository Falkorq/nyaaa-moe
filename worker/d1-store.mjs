// The certificate API expects the small Netlify Blobs storage interface.
// Keep its keys and JSON values unchanged so existing certificates can move intact.
export function d1Store(db) {
  return {
    async get(key) {
      const row = await db.prepare('SELECT value FROM entries WHERE key = ?').bind(key).first();
      return row ? JSON.parse(row.value) : null;
    },
    async setJSON(key, value, { onlyIfNew = false } = {}) {
      const sql = onlyIfNew
        ? 'INSERT OR IGNORE INTO entries (key, value) VALUES (?, ?)'
        : 'INSERT INTO entries (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
      const result = await db.prepare(sql).bind(key, JSON.stringify(value)).run();
      return { modified: result.meta.changes > 0 };
    },
    async delete(key) {
      await db.prepare('DELETE FROM entries WHERE key = ?').bind(key).run();
    },
    async list({ prefix }) {
      const { results } = await db.prepare('SELECT key FROM entries WHERE key >= ? AND key < ? ORDER BY key DESC LIMIT 20000')
        .bind(prefix, `${prefix}\uffff`).all();
      return { blobs: results.map(({ key }) => ({ key })) };
    },
  };
}
