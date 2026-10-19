/* URDRIP — سيرفر التطوير المحلي (بدون أي تبعيات).
 *
 * يقدّم الملفات الساكنة + نفس مسارات /api التي تعمل على Vercel.
 *   node server.js          ->  http://localhost:3000
 *   PORT=4000 node server.js
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import api from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 3000;

/* قارئ .env صغير (بدون تبعيات). متغيّرات البيئة القائمة لها الأولوية. */
(function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/* شيم الـ req/res كما في Vercel. */
function makeRes(res) {
  const out = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { out.headers[k] = v; return out; },
    getHeader(k) { return out.headers[k]; },
    removeHeader(k) { delete out.headers[k]; },
    status(code) { out.statusCode = code; return out; },
    end(body) {
      for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
      res.statusCode = out.statusCode;
      res.end(body === undefined ? '' : body);
      return out;
    }
  };
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  /* ---- /api ---- */
  if (url.pathname.startsWith('/api/')) {
    try {
      const query = {};
      for (const [k, v] of url.searchParams) query[k] = v;
      /* لا نقرأ الـ body هنا: كل handler يقرأه بنفسه (readBody). */
      await api(Object.assign(req, { query }), makeRes(res));
    } catch (e) {
      console.error('API error on', url.pathname, e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'server_error', detail: String((e && e.message) || e) }));
    }
    return;
  }

  /* ---- ملفات ساكنة ---- */
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  /* ملفات الخادم لا تُقدَّم أبداً. */
  const base = rel.replace(/^\/+/, '').toLowerCase();
  if (base === 'api.js' || base === 'server.js' || base === 'config.local.js' || base.startsWith('.env')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — not found');
    return;
  }

  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 — not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('URDRIP dev server  ->  http://localhost:' + PORT);
  console.log('API                ->  http://localhost:' + PORT + '/api');
});
