// Zero-dependency static server for SQL Mastery. Usage: node server.js [port]
// Serves this folder on http://localhost:5173 (keep the same port — your data is tied to it).
import http from 'node:http';
import { readFile, writeFile, rename, copyFile, readdir, unlink, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || process.env.PORT || 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.data': 'application/octet-stream',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };

// ---- File backup API: a second copy of the learner's data, kept OUTSIDE git (user-data/ is in .gitignore). ----
// IndexedDB in the browser stays the source of truth; the app PUTs its export here after changes and can restore from it.
const DATA_DIR = process.env.SQLM_DATA_DIR ? resolve(process.env.SQLM_DATA_DIR) : join(ROOT, 'user-data');
const BACKUP = join(DATA_DIR, 'backup.json');
const MAX_BODY = 100 * 1024 * 1024, KEEP_SNAPSHOTS = 14, APP_ID = 'sql-mastery-platform';
const exists = (f) => stat(f).then(() => true, () => false);
const json = (res, code, obj) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
const localHost = (req) => /^(localhost|127\.0\.0\.1)$/.test((req.headers.host || '').replace(/:\d+$/, ''));
async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}
async function backupInfo() {
  if (!(await exists(BACKUP))) return { exists: false };
  const raw = await readFile(BACKUP, 'utf8'); const j = JSON.parse(raw);
  return { exists: true, savedAt: j.exportedAt, bytes: raw.length, attempts: j.data?.problem_attempts?.length || 0 };
}
async function listBackups() {
  if (!(await exists(DATA_DIR))) return [];
  const out = [];
  for (const f of await readdir(DATA_DIR)) {
    if (!/^backup(-\d{4}-\d\d-\d\d)?\.json$/.test(f)) continue;
    try {
      const raw = await readFile(join(DATA_DIR, f), 'utf8'), j = JSON.parse(raw);
      out.push({ file: f, latest: f === 'backup.json', savedAt: j.exportedAt, bytes: raw.length, attempts: j.data?.problem_attempts?.length || 0 });
    } catch { /* unreadable file: skip */ }
  }
  return out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}
async function api(req, res, path) {
  // Only the local machine may use it: the Host check blocks DNS-rebinding, the custom header blocks cross-site form posts.
  if (!localHost(req) || req.headers['x-sqlm'] !== '1') return json(res, 403, { error: 'forbidden' });
  try {
    if (path === '/api/backup/info' && req.method === 'GET') return json(res, 200, await backupInfo());
    if (path === '/api/backup/list' && req.method === 'GET') return json(res, 200, await listBackups());
    if (path === '/api/backup' && req.method === 'GET') {
      const want = new URL(req.url, 'http://x').searchParams.get('file');
      if (want && !/^backup(-\d{4}-\d\d-\d\d)?\.json$/.test(want)) return json(res, 400, { error: 'bad file name' });
      const file = want ? join(DATA_DIR, want) : BACKUP;
      if (!(await exists(file))) return json(res, 404, { error: 'no backup' });
      return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(await readFile(file));
    }
    if (path === '/api/backup' && req.method === 'PUT') {
      const body = await readBody(req); let j;
      try { j = JSON.parse(body.toString('utf8')); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (j?.app !== APP_ID || typeof j.schemaVersion !== 'number' || typeof j.data !== 'object') return json(res, 400, { error: 'not a SQL Mastery backup' });
      await mkdir(DATA_DIR, { recursive: true });
      // Keep the final state of each earlier day as backup-<that day>.json (the name is the day the data represents),
      // written when the first save of a new day arrives. Newest 14 kept.
      if (await exists(BACKUP)) {
        const day = (await stat(BACKUP)).mtime.toISOString().slice(0, 10), snap = join(DATA_DIR, `backup-${day}.json`);
        if (day !== new Date().toISOString().slice(0, 10) && !(await exists(snap))) await copyFile(BACKUP, snap);
      }
      const old = (await readdir(DATA_DIR)).filter(f => /^backup-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
      for (const f of old.slice(0, Math.max(0, old.length - KEEP_SNAPSHOTS))) await unlink(join(DATA_DIR, f)).catch(() => {});
      const tmp = BACKUP + '.tmp'; await writeFile(tmp, body); await rename(tmp, BACKUP);
      return json(res, 200, { savedAt: j.exportedAt, bytes: body.length });
    }
    return json(res, 404, { error: 'unknown endpoint' });
  } catch (e) { return json(res, e.code === 413 ? 413 : 500, { error: String(e.message || e) }); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (new URL(req.url, 'http://x').pathname.startsWith('/api/')) return await api(req, res, new URL(req.url, 'http://x').pathname);
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT) || /node_modules|\.git|user-data/.test(file)) { res.writeHead(403).end('Forbidden'); return; }
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
      'Cross-Origin-Opener-Policy': 'same-origin' });
    res.end(await readFile(file));
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  SQL Mastery is running at ${url}\n  Keep this window open while you practise. Press Ctrl+C to stop.\n`);
  if (!process.argv.includes('--no-open')) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} is busy. Is SQL Mastery already running? Open http://localhost:${PORT}\n  (Avoid switching ports: your data is stored per address.)\n`);
  else console.error(e);
  process.exit(1);
});
