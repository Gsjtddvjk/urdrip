/* ============================================================================
 * URDRIP — الخادم (Backend) — ملف واحد لكل المسارات
 * ----------------------------------------------------------------------------
 * كل نداءات قاعدة البيانات تمر من هنا، فلا يوجد أي مفتاح Supabase في كود
 * الواجهة (frontend). المسارات المتاحة:
 *
 *   GET  /api/products[?id=]   المنتجات النشطة (أو منتج واحد)
 *   GET  /api/categories        التصنيفات
 *   POST /api/order             إنشاء طلب (عبر place_order RPC)
 *   POST /api/auth              دخول الأدمن (Supabase Auth أو كلمة مرور)
 *   ALL  /api/db?table=...      عمليات لوحة التحكم (محمية بـ RLS)
 *   GET  /api/health            فحص الاتصال بقاعدة البيانات
 *
 * يعمل محلياً (server.js) وعلى Vercel (Serverless Function).
 * ========================================================================== */
import crypto from 'crypto';

/* ---------- 1. بيانات الاتصال ---------- */
const FALLBACK = {
  SUPABASE_URL: 'https://vmsrldkihpxkfbgvswnf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpczMiOiJzdXBhYmFzZSIsInJlZiI6InZtc3JsZGtpaHB4a2ZiZ3Zzd25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjM5MDIsImV4cCI6MjA5OTA5OTkwMn0.byh2My9XzGjLJjfEZw-EyGqPeCDefYPgTgsQavC9ALE'
};

function creds() {
  const url = process.env.SUPABASE_URL || FALLBACK.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || FALLBACK.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing_env');
  return { url: url.replace(/\/+$/, ''), key };
}

/* مفتاح service_role اختياري: مطلوب فقط للدخول بكلمة مرور. */
function serviceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }

/* سر توقيع جلسات الأدمن. إن لم يُضبط يُولَّد عشوائياً (الجلسات لا تنجو من
 * إعادة تشغيل الخادم) — اضبط SESSION_SECRET في الإنتاج. */
let _secret = null;
function sessionSecret() {
  if (!_secret) {
    _secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
    if (!process.env.SESSION_SECRET) {
      console.warn('[urdrip] SESSION_SECRET غير مضبوط — الجلسات لن تبقى صالحة بعد إعادة التشغيل.');
    }
  }
  return _secret;
}

/* ---------- 2. أدوات مساعدة ---------- */
function json(res, status, body, extraHeaders) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.status(status).end(JSON.stringify(body));
}
function fail(res, status, message) { json(res, status, { error: message || 'request_failed' }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) { reject(new Error('body_too_large')); req.destroy(); } });
    req.on('end', () => { if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('invalid_json')); } });
    req.on('error', reject);
  });
}

function signSession(payload, ttlSeconds) {
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + (ttlSeconds || 28800) });
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(data).digest('base64url');
  return data + '.' + sig;
}
function verifySession(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expect = crypto.createHmac('sha256', sessionSecret()).update(parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!payload || payload.role !== 'admin') return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/* ---------- 3. نداء Supabase ---------- */
async function upstream({ url, method, headers, body, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout || 15000);
  try {
    const r = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await r.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    return { status: r.status, data, range: r.headers.get('Content-Range') };
  } finally { clearTimeout(timer); }
}

async function rest(req, res, { method, path, body, query, prefer, count, token }) {
  const { url, key } = creds();
  const headers = { apikey: key, Authorization: 'Bearer ' + (token || key) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const prefs = [];
  if (prefer) prefs.push(prefer);
  if (count) prefs.push('count=exact');
  if (prefs.length) headers.Prefer = prefs.join(',');
  try {
    const r = await upstream({ url: url + '/rest/v1/' + path + (query || ''), method: method || 'GET', headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.getHeader || !res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
    if (r.range) res.setHeader('Content-Range', r.range);
    res.status(r.status).end(typeof r.data === 'string' ? JSON.stringify({ error: r.data }) : JSON.stringify(r.data));
  } catch (e) {
    fail(res, 504, e && e.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable');
  }
}

async function supabaseGet(path, query, token, useService, count) {
  const { url, key } = creds();
  const k = useService ? (serviceKey() || key) : key;
  const headers = { apikey: k, Authorization: 'Bearer ' + (token || k) };
  if (count) headers.Prefer = 'count=exact';
  return upstream({ url: url + '/rest/v1/' + path + (query || ''), method: 'GET', headers });
}

async function supabasePost(path, body, token, prefer, useService) {
  const { url, key } = creds();
  const k = useService ? (serviceKey() || key) : key;
  const headers = { apikey: k, Authorization: 'Bearer ' + (token || k), 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  return upstream({ url: url + '/rest/v1/' + path, method: 'POST', headers, body: JSON.stringify(body) });
}

/* استدعاء REST بدون كتابة الاستجابة — يُستخدم لاكتشاف أعمدة ناقصة. */
async function restRaw(res, { method, path, query }) {
  const { url, key } = creds();
  try {
    const r = await upstream({
      url: url + '/rest/v1/' + path + (query || ''),
      method: method || 'GET',
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    const msg = String((r.data && (r.data.message || r.data.hint)) || '');
    const missingColumn = r.status >= 400 && /column|PGRST/i.test(msg);
    return {
      ok: r.status === 200 || r.status === 206,
      missingColumn: missingColumn,
      outcome: () => {
        if (!res.getHeader || !res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
        if (r.range) res.setHeader('Content-Range', r.range);
        res.status(r.status).end(typeof r.data === 'string' ? JSON.stringify({ error: r.data }) : JSON.stringify(r.data));
      }
    };
  } catch (e) {
    return { ok: false, missingColumn: false, outcome: () => fail(res, 504, 'upstream_unreachable') };
  }
}

/* ============================================================================
 * 4. المسارات
 * ========================================================================== */

/* ---- GET /api/products ---- */
const LIST_SELECT = 'id,name,category,price,old_price,color,sizes,image,badge,description,stock,active,created_at';
const FULL_SELECT = 'id,name,category,price,old_price,color,sizes,image,images,badge,description,stock,active,created_at';

/* هل يوجد عمود sort_order في القاعدة؟ يُكتشف تلقائياً: إن لم يوجد يُعاد
 * الترتيب بـ created_at (نفس السلوك السابق). */
let hasSortOrder = null;

async function products(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
  const id = (req.query && req.query.id) ? String(req.query.id) : '';
  if (id) {
    if (!/^\d{1,18}$/.test(id)) return fail(res, 400, 'bad_id');
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    return rest(req, res, { method: 'GET', path: 'products', query: '?select=' + FULL_SELECT + '&id=eq.' + id + '&active=eq.true' });
  }
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');

  /* الترتيب اليدوي (sort_order) إن كان متاحاً. */
  if (hasSortOrder !== false) {
    const r = await restRaw(res, {
      method: 'GET', path: 'products',
      query: '?select=' + LIST_SELECT + ',sort_order&active=eq.true&order=sort_order.asc,created_at.desc'
    });
    if (r.ok) { hasSortOrder = true; return r.outcome(); }
    hasSortOrder = false;
  }
  return rest(req, res, { method: 'GET', path: 'products', query: '?select=' + LIST_SELECT + '&active=eq.true&order=created_at.desc' });
}

/* ---- GET /api/categories ---- */
async function categories(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=900');
  return rest(req, res, { method: 'GET', path: 'categories', query: '?select=id,name,description,sort_order,active&active=eq.true&order=sort_order.asc' });
}

/* ---- POST /api/order ---- */
const HOME_SHIPPING = 700, OFFICE_SHIPPING = 600, MAX_QTY = 10, MAX_LINES = 20;

function normPhone(p) {
  p = String(p || '').replace(/[\s().-]/g, '');
  if (p.indexOf('+213') === 0) p = '0' + p.slice(4);
  else if (p.indexOf('00213') === 0) p = '0' + p.slice(5);
  return p;
}
function isUuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '')); }

async function order(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, 400, 'invalid_json'); }

  const customer = String(body.p_customer || '').trim();
  const phone = normPhone(body.p_phone);
  const wilaya = String(body.p_wilaya || '').trim();
  const commune = String(body.p_commune || '').trim();
  const delivery = String(body.p_delivery || '');
  const note = String(body.p_note || '').trim() || null;
  const items = Array.isArray(body.p_items) ? body.p_items : [];
  const key = body.p_idempotency_key;

  if (!isUuid(key)) return fail(res, 400, 'invalid_request');
  if (customer.length < 2 || customer.length > 80) return fail(res, 400, 'invalid_name');
  if (!/^0[5-7][0-9]{8}$/.test(phone)) return fail(res, 400, 'invalid_phone');
  if (wilaya.length < 2 || wilaya.length > 40) return fail(res, 400, 'invalid_wilaya');
  if (commune.length < 2 || commune.length > 60) return fail(res, 400, 'invalid_commune');
  if (delivery !== 'home' && delivery !== 'office') return fail(res, 400, 'invalid_delivery');
  if (note && note.length > 500) return fail(res, 400, 'invalid_note');
  if (!items.length || items.length > MAX_LINES) return fail(res, 400, 'invalid_items');

  const lines = [];
  for (const it of items) {
    const id = String((it && it.id) || '');
    const qty = parseInt(it && it.qty, 10);
    if (!/^\d{1,18}$/.test(id) || !Number.isFinite(qty)) return fail(res, 400, 'invalid_items');
    if (qty < 1 || qty > MAX_QTY) return fail(res, 400, 'invalid_items');
    const size = it.size ? String(it.size).trim().slice(0, 12) : null;
    lines.push({ id: id, qty: qty, size: size || null });
  }

  const rpcResult = await tryRpc(res, {
    p_customer: customer, p_phone: phone, p_wilaya: wilaya, p_commune: commune,
    p_delivery: delivery, p_note: note, p_items: lines, p_idempotency_key: key
  });
  if (rpcResult) return;

  try {
    const created = await insertOrder({ customer, phone, wilaya, commune, delivery, note, lines, key });
    json(res, 200, created);
  } catch (e) {
    fail(res, 400, e && e.code ? e.code : 'order_failed');
  }
}

async function tryRpc(res, args) {
  let r;
  try {
    const { url, key } = creds();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(url + '/rest/v1/rpc/place_order', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: controller.signal
    });
    clearTimeout(timer);
    const text = await resp.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = { message: text }; } }
    r = { status: resp.status, data };
  } catch (e) { return false; }

  const missing = r.status === 404 && r.data && r.data.code === 'PGRST202';
  if (missing) return false;

  if (r.status >= 400) {
    const msg = r.data && (r.data.message || r.data.error) ? String(r.data.message || r.data.error) : 'invalid_request';
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status >= 500 ? 500 : 400).end(JSON.stringify({ message: msg }));
    return true;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end(JSON.stringify(r.data));
  return true;
}

/* الإدراج المباشر (للتخطيط القديم) — الأسعار تُحسب هنا من قاعدة البيانات. */
async function insertOrder({ customer, phone, wilaya, commune, delivery, note, lines, key }) {
  const ids = lines.map(l => l.id).join(',');

  const existing = await supabaseGet('orders', '?select=id,status,subtotal,shipping,total&idempotency_key=eq.' + key);
  if (existing.status === 200 && Array.isArray(existing.data) && existing.data.length) {
    const o = existing.data[0];
    return { order_id: o.id, status: o.status, subtotal: o.subtotal, shipping: o.shipping, total: o.total, replayed: true };
  }

  const productsRes = await supabaseGet('products', '?select=id,name,price,stock,active,category,sizes&id=in.(' + ids + ')');
  if (productsRes.status !== 200) { const e = new Error('product_unavailable'); e.code = 'product_unavailable'; throw e; }
  const rows = Array.isArray(productsRes.data) ? productsRes.data : [];
  const byId = {};
  for (const p of rows) byId[String(p.id)] = p;

  let subtotal = 0;
  const items = [];
  const perProduct = {};
  for (const l of lines) {
    const p = byId[l.id];
    if (!p || p.active === false) { const e = new Error('product_unavailable'); e.code = 'product_unavailable'; throw e; }
    if (Number(p.stock || 0) < 1) { const e = new Error('out_of_stock'); e.code = 'out_of_stock'; throw e; }
    if (l.size && p.sizes && String(p.sizes).trim()) {
      const allowed = String(p.sizes).split(',').map(s => s.trim());
      if (allowed.indexOf(l.size) === -1) { const e = new Error('invalid_size'); e.code = 'invalid_size'; throw e; }
    }
    perProduct[l.id] = (perProduct[l.id] || 0) + l.qty;
    subtotal += Number(p.price || 0) * l.qty;
    items.push({ product_id: p.id, name: p.name, price: Number(p.price || 0), size: l.size, qty: l.qty, category: p.category });
  }
  for (const pid in perProduct) {
    const p = byId[pid];
    if (Number(p.stock || 0) < perProduct[pid]) { const e = new Error('out_of_stock'); e.code = 'out_of_stock'; throw e; }
  }

  const shipping = delivery === 'home' ? HOME_SHIPPING : OFFICE_SHIPPING;
  const total = subtotal + shipping;

  const full = { customer, phone, wilaya, commune, delivery, note, items, subtotal, shipping, total, status: 'pending', idempotency_key: key };
  let inserted = await supabasePost('orders', full, null, 'return=representation');
  if (inserted.status >= 400 && /column|schema cache|PGRST/i.test(String((inserted.data && (inserted.data.message || inserted.data.hint)) || ''))) {
    const legacy = { customer, phone, wilaya, commune, delivery, note, items, total, status: 'pending' };
    inserted = await supabasePost('orders', legacy, null, 'return=representation');
    if (inserted.status < 400) {
      const row = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
      return { order_id: row.id, status: row.status, subtotal, shipping, total, replayed: false };
    }
  }
  if (inserted.status >= 400) {
    const msg = String((inserted.data && (inserted.data.message || inserted.data.error)) || 'order_failed');
    const e = new Error(msg);
    e.code = /stock|product/i.test(msg) ? 'out_of_stock' : 'order_failed';
    throw e;
  }
  const row = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data;
  return { order_id: row.id, status: row.status || 'pending', subtotal, shipping, total, replayed: false };
}

/* ---- POST /api/auth ---- */
async function auth(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, 400, 'invalid_json'); }
  const action = String(body.action || 'login');

  if (action === 'refresh') return refreshSession(res, body);
  if (action === 'logout') return logoutSession(res, body);
  if (action !== 'login') return fail(res, 400, 'unknown_action');

  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  if (!email || !password) return fail(res, 400, 'invalid_credentials');

  const { url, key } = creds();

  /* 1) Supabase Auth أولاً (الوضع المُحصَّن). */
  const sb = await callAuth(url, key, '/auth/v1/token?grant_type=password', { email, password });
  if (sb.status >= 200 && sb.status < 300 && sb.data && sb.data.access_token) {
    return json(res, 200, {
      access_token: sb.data.access_token,
      refresh_token: sb.data.refresh_token,
      expires_in: sb.data.expires_in || 3600,
      user: sb.data.user || { email: email }
    });
  }

  /* 2) كلمة مرور على السيرفر (لا تُرى أبداً في المتصفح). */
  const expected = process.env.ADMIN_PASSWORD || await legacyAdminPassword(key);
  if (!expected) return fail(res, 401, 'invalid_credentials');
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail(res, 401, 'invalid_credentials');

  const access = signSession({ role: 'admin', mode: 'server', email: email || 'admin' }, 8 * 3600);
  const refresh = signSession({ role: 'admin', mode: 'server', rt: true }, 7 * 24 * 3600);
  return json(res, 200, { access_token: access, refresh_token: refresh, expires_in: 8 * 3600, user: { email: email || 'admin' } });
}

async function refreshSession(res, body) {
  const rt = String(body.refresh_token || '');
  if (!rt) return fail(res, 400, 'invalid_request');
  const payload = verifySession(rt);
  if (payload && payload.rt) {
    const access = signSession({ role: 'admin', mode: payload.mode || 'server', email: payload.email }, 8 * 3600);
    return json(res, 200, { access_token: access, refresh_token: rt, expires_in: 8 * 3600, user: { email: payload.email || 'admin' } });
  }
  const { url, key } = creds();
  const sb = await callAuth(url, key, '/auth/v1/token?grant_type=refresh_token', { refresh_token: rt });
  if (sb.status < 200 || sb.status >= 300) return fail(res, 401, 'invalid_credentials');
  return json(res, 200, {
    access_token: sb.data.access_token,
    refresh_token: sb.data.refresh_token || rt,
    expires_in: sb.data.expires_in || 3600,
    user: sb.data.user || {}
  });
}

async function logoutSession(res, body) {
  const at = String(body.access_token || '');
  if (at && verifySession(at)) return json(res, 200, { ok: true });
  if (!at) return fail(res, 400, 'invalid_request');
  const { url, key } = creds();
  await callAuth(url, key, '/auth/v1/logout', {}, at);
  return json(res, 200, { ok: true });
}

async function legacyAdminPassword(key) {
  try {
    const r = await supabaseGet('settings', '?key=eq.admin_pass&select=value');
    if (r.status === 200 && Array.isArray(r.data) && r.data.length) return r.data[0].value;
  } catch (e) { /* ignore */ }
  return null;
}

async function callAuth(url, key, path, payload, bearer) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url + path, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
    const text = await r.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = { message: text }; } }
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: { message: 'upstream_unreachable' } };
  } finally { clearTimeout(timer); }
}

/* ---- /api/db — لوحة التحكم ---- */
const ALLOWED = {
  products: {
    read: ['id', 'name', 'category', 'price', 'old_price', 'color', 'sizes', 'image', 'images', 'badge', 'description', 'stock', 'active', 'created_at', 'sort_order'],
    write: ['name', 'category', 'price', 'old_price', 'color', 'sizes', 'image', 'images', 'badge', 'description', 'stock', 'active', 'sort_order']
  },
  categories: {
    read: ['id', 'name', 'description', 'sort_order', 'active', 'created_at'],
    write: ['name', 'description', 'sort_order', 'active']
  },
  orders: {
    read: ['id', 'customer', 'phone', 'wilaya', 'commune', 'delivery', 'note', 'items', 'subtotal', 'shipping', 'total', 'status', 'created_at', 'status_changed_at'],
    write: ['status']
  }
};
const ALLOWED_FUNCS = ['admin_dashboard_stats'];
const MAX_LIMIT = 500;
function okStr(v) { return typeof v === 'string' && v.length > 0; }

async function db(req, res) {
  const { url } = creds();
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer) return fail(res, 401, 'unauthenticated');

  const signed = verifySession(bearer);
  const token = signed ? null : bearer;
  const svc = serviceKey();
  if (signed && !svc) {
    const q0 = req.query || {};
    if (q0.fn) return fail(res, 503, 'admin_service_key_missing');
    if (q0.table !== 'products' && q0.table !== 'categories') return fail(res, 503, 'admin_service_key_missing');
  }

  const method = (req.method || 'GET').toUpperCase();
  const q = req.query || {};

  /* ---- RPC ---- */
  if (method === 'POST' && q.fn) {
    const fn = String(q.fn);
    if (ALLOWED_FUNCS.indexOf(fn) === -1) return fail(res, 400, 'bad_function');
    let body;
    try { body = await readBody(req); } catch (e) { return fail(res, 400, 'invalid_json'); }
    if (signed) {
      if (fn === 'admin_dashboard_stats') {
        try { return json(res, 200, await legacyStats()); }
        catch (e) { return fail(res, 500, 'stats_failed'); }
      }
      return fail(res, 400, 'unknown_action');
    }
    return forward(res, { url: url + '/rest/v1/rpc/' + fn, method: 'POST', token, body: body && typeof body === 'object' ? body : {} });
  }

  /* ---- جدول ---- */
  const table = q.table ? String(q.table) : '';
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, table)) return fail(res, 400, 'bad_table');
  const spec = ALLOWED[table];

  /* ---- إعادة ترتيب المنتجات (عملية واحدة) ---- */
  if (table === 'products' && method === 'POST' && q.action === 'reorder') {
    let body;
    try { body = await readBody(req); } catch (e) { return fail(res, 400, 'invalid_json'); }
    const order = Array.isArray(body && body.order) ? body.order : null;
    if (!order || !order.length) return fail(res, 400, 'invalid_order');
    if (order.length > 500) return fail(res, 400, 'invalid_order');
    const ids = order.map(v => String(v));
    if (ids.some(v => !/^\d{1,18}$/.test(v))) return fail(res, 400, 'invalid_order');
    if (new Set(ids).size !== ids.length) return fail(res, 400, 'invalid_order');

    const authKey = token || serviceKey() || creds().key;
    const { url: base } = creds();
    const results = [];
    for (let i = 0; i < ids.length; i++) {
      const r = await upstream({
        url: base + '/rest/v1/products?id=eq.' + ids[i],
        method: 'PATCH',
        headers: { apikey: authKey, Authorization: 'Bearer ' + authKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i + 1 })
      });
      if (r.status >= 400) {
        const msg = String((r.data && (r.data.message || r.data.hint)) || '');
        if (/column|PGRST/i.test(msg)) return fail(res, 400, 'sort_order_column_missing');
        if (/permission|not authorized|42501/i.test(msg)) return fail(res, 403, 'admin_service_key_missing');
        return fail(res, r.status, 'reorder_failed');
      }
      results.push({ id: ids[i], sort_order: i + 1 });
    }
    return json(res, 200, { ok: true, updated: results.length });
  }

  const filters = [];
  if (q.id && /^\d{1,18}$/.test(String(q.id))) filters.push('id=eq.' + String(q.id));
  if (q.status && /^[a-z_]{1,20}$/.test(String(q.status))) filters.push('status=eq.' + String(q.status));
  if (q.q) {
    const clean = String(q.q).replace(/[^\p{L}\p{N}\s+]/gu, '').trim().slice(0, 40);
    if (clean) {
      const enc = encodeURIComponent(clean);
      if (/^\d+$/.test(clean) && clean.length < 9) filters.push('id=eq.' + clean);
      else filters.push('or=(customer.ilike.*' + enc + '*,phone.ilike.*' + enc + '*)');
    }
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.limit, 10) || 20));
  const offset = Math.max(0, parseInt(q.offset, 10) || 0);

  if (method === 'GET') {
    const order = table === 'categories' ? 'sort_order.asc' : 'created_at.desc';
    const build = (cols) => table + '?select=' + cols.join(',') + (filters.length ? '&' + filters.join('&') : '') +
      '&order=' + order + '&limit=' + limit + '&offset=' + offset;

    /* عمود sort_order قد لا يكون موجوداً بعد -> يُكتشف تلقائياً. */
    if (table === 'products' && hasSortOrder !== false && spec.read.indexOf('sort_order') !== -1) {
      const r = await restRaw(res, { method: 'GET', path: 'products', query: build(spec.read) });
      if (r.ok) { hasSortOrder = true; return r.outcome(); }
      hasSortOrder = false;
      const cols = spec.read.filter(c => c !== 'sort_order');
      return forward(res, { url: url + '/rest/v1/' + build(cols), method: 'GET', token, count: true });
    }
    return forward(res, { url: url + '/rest/v1/' + build(spec.read), method: 'GET', token, count: true });
  }

  if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') return fail(res, 405, 'method_not_allowed');

  if (method === 'DELETE') {
    const id = q.id ? String(q.id) : '';
    if (!/^\d{1,18}$/.test(id)) return fail(res, 400, 'bad_id');
    let target = url + '/rest/v1/' + table + '?id=eq.' + id;
    if (table === 'orders') target += '&status=eq.cancelled';
    return forward(res, { url: target, method: 'DELETE', token, prefer: 'return=representation' });
  }

  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, 400, 'invalid_json'); }
  if (!body || typeof body !== 'object') return fail(res, 400, 'invalid_json');
  const clean = {};
  for (const k of spec.write) if (Object.prototype.hasOwnProperty.call(body, k)) clean[k] = body[k];

  if (method === 'POST') {
    if (!Object.keys(clean).length) return fail(res, 400, 'nothing_to_write');
    return forward(res, { url: url + '/rest/v1/' + table, method: 'POST', token, body: clean, prefer: 'return=representation' });
  }
  const id = q.id ? String(q.id) : '';
  if (!/^\d{1,18}$/.test(id)) return fail(res, 400, 'bad_id');
  if (!Object.keys(clean).length) return fail(res, 400, 'nothing_to_write');
  if (table === 'orders') {
    if (!okStr(clean.status) || !/^[a-z_]{1,20}$/.test(clean.status)) return fail(res, 400, 'bad_status');
    const from = q.from ? String(q.from) : '';
    if (!/^[a-z_]{1,20}$/.test(from)) return fail(res, 400, 'bad_from');
    return forward(res, { url: url + '/rest/v1/orders?id=eq.' + id + '&status=eq.' + from, method: 'PATCH', token, body: clean, prefer: 'return=representation' });
  }
  return forward(res, { url: url + '/rest/v1/' + table + '?id=eq.' + id, method: 'PATCH', token, body: clean, prefer: 'return=representation' });
}

async function forward(res, { url, method, token, body, prefer, count }) {
  const { key } = creds();
  const authKey = token || serviceKey() || key;
  const headers = { apikey: authKey, Authorization: 'Bearer ' + authKey };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const prefs = [];
  if (prefer) prefs.push(prefer);
  if (count) prefs.push('count=exact');
  if (prefs.length) headers.Prefer = prefs.join(',');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const upstreamRes = await fetch(url, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await upstreamRes.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    res.setHeader('Cache-Control', 'no-store');
    const range = upstreamRes.headers.get('Content-Range');
    if (range) res.setHeader('Content-Range', range);
    res.status(upstreamRes.status).end(typeof data === 'string' ? JSON.stringify({ error: data }) : JSON.stringify(data));
  } catch (e) {
    fail(res, 504, e && e.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable');
  } finally { clearTimeout(timer); }
}

async function legacyStats() {
  const p = await supabaseGet('products', '?select=id,active,stock', null, true);
  const rows = (p.status === 200 && Array.isArray(p.data)) ? p.data : [];
  const o = await supabaseGet('orders', '?select=id,status,subtotal,shipping,total,delivery,created_at', null, true);
  const orders = (o.status === 200 && Array.isArray(o.data)) ? o.data : [];

  const byStatus = {};
  let last24 = 0, revenue = 0;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const ord of orders) {
    byStatus[ord.status] = (byStatus[ord.status] || 0) + 1;
    if (ord.created_at && new Date(ord.created_at).getTime() > dayAgo) last24++;
    if (ord.status === 'confirmed' || ord.status === 'shipped' || ord.status === 'delivered') {
      const sub = (ord.subtotal != null)
        ? Number(ord.subtotal)
        : Number(ord.total || 0) - (ord.delivery === 'home' ? 700 : ord.delivery === 'office' ? 600 : 0);
      revenue += sub || 0;
    }
  }
  return {
    products_total: rows.length,
    products_active: rows.filter(x => x.active).length,
    products_out_of_stock: rows.filter(x => x.active && Number(x.stock || 0) <= 0).length,
    orders_total: orders.length,
    orders_last_24h: last24,
    orders_by_status: byStatus,
    revenue_products: revenue
  };
}

/* ---- GET /api/health ---- */
async function health(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
  let dbState = 'down', count = null;
  try {
    const r = await supabaseGet('products', '?select=id&active=eq.true&limit=1', null, false, true);
    if (r.status === 200 || r.status === 206) {
      dbState = 'up';
      const cr = r.range && /\/(\d+)$/.exec(r.range);
      count = cr ? parseInt(cr[1], 10) : (Array.isArray(r.data) ? r.data.length : null);
    }
  } catch (e) { dbState = 'down'; }
  json(res, 200, { ok: dbState === 'up', database: dbState, products: count });
}

/* ============================================================================
 * 5. المُوجِّه — نقطة الدخول الوحيدة
 * ========================================================================== */
const ROUTES = {
  '/api/products': products,
  '/api/categories': categories,
  '/api/order': order,
  '/api/auth': auth,
  '/api/db': db,
  '/api/health': health
};

export default async function handler(req, res) {
  let path = (req.url || '').split('?')[0];
  if (path.length > 1) path = path.replace(/\/+$/, '');
  const fn = ROUTES[path];
  if (!fn) return fail(res, 404, 'not_found');
  try {
    await fn(req, res);
  } catch (e) {
    console.error('[urdrip] API error on', path, e);
    if (!res.headersSent) fail(res, 500, 'server_error');
  }
}
