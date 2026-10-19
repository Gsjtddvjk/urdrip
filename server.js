/* URDRIP — local development server (zero dependencies).
 *
 * Serves the static site AND mounts the same /api handlers that Vercel runs
 * in production, so `npm run dev` behaves exactly like the deployed site:
 * the browser still never sees a Supabase key.
 *
 *   node server.js            -> http://localhost:3000
 *   PORT=4000 node server.js
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 3000;

/* Tiny .env loader (no dependencies) so `npm run dev` can be configured
 * without installing anything. Existing environment variables win. */
(function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
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

/* The API routes, exactly the ones Vercel will run. */
const ROUTES = {
  '/api/products': './api/products.js',
  '/api/categories': './api/categories.js',
  '/api/order': './api/order.js',
  '/api/auth': './api/auth.js',
  '/api/db': './api/db.js',
  '/api/health': './api/health.js'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

/* Minimal shim of the Vercel req/res objects. */
function makeRes(res) {
  const out = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { out.headers[k] = v; return out; },
    getHeader(k) { return out.headers[k]; },
    removeHeader(k) { delete out.headers[k]; },
    status(code) { out.statusCode = code; return out; },
    end(body) {
      const h = Object.assign({}, out.headers);
      for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
      res.statusCode = out.statusCode;
      res.end(body === undefined ? '' : body);
      return out;
    }
  };
  return out;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  /* ---- API routes ---- */
  if (pathname.startsWith('/api/')) {
    const file = ROUTES[pathname];
    if (!file) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not_found' })); return; }
    try {
      const mod = await import(pathToFileURL(path.join(ROOT, file)).href);
      const query = {};
      for (const [k, v] of url.searchParams) query[k] = v;
      /* The request body is NOT read here: each handler reads it itself
       * (readBody), exactly like a Vercel function does. Reading it twice
       * would leave the second reader waiting on an already-ended stream. */
      const vreq = Object.assign(req, { query });
      await mod.default(vreq, makeRes(res));
    } catch (e) {
      console.error('API error on', pathname, e);
      if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); }
      res.end(JSON.stringify({ error: 'server_error', detail: String(e && e.message || e) }));
    }
    return;
  }

  /* ---- static files ---- */
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('URDRIP dev server  ->  http://localhost:' + PORT);
  console.log('API proxy          ->  http://localhost:' + PORT + '/api');
});
