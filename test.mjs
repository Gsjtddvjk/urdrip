// Browser tests for storefront + checkout + admin.
// The /api proxy is MOCKED via request interception (no real backend is
// contacted, no Supabase key is ever present in the page).
// Run: node tests/e2e.mjs
//   npm i -D puppeteer
import puppeteer from 'puppeteer';
import http from 'http'; import fs from 'fs'; import os from 'os'; import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(os.tmpdir(), 'urdrip-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); }).listen(0);
const BASE = `http://localhost:${srv.address().port}`;
let pass = 0, fail = 0;
const ok = (c, n, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '  :: ' + extra)); };

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  // Use the locally installed Chrome/Edge when Puppeteer's own download is absent.
  executablePath: process.env.CHROME_PATH ||
    (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
        ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
        : undefined)
});
const XSS = '<img src=x onerror="window.__xss=1">';

/* Intercepts the same-origin /api/* endpoints plus the external CDNs. */
async function newPage(mock, viewport) {
  const page = await browser.newPage(); if (viewport) await page.setViewport(viewport);
  await page.setRequestInterception(true);
  const calls = [];
  page.on('request', r => {
    const u = new URL(r.url());
    const isApi = u.pathname.startsWith('/api/');
    const isCdn = u.host.includes('cloudinary') || u.host.includes('googleapis') || u.host.includes('gstatic') || u.host.includes('jsdelivr');
    if (isApi || isCdn) {
      const rec = { method: r.method(), path: u.pathname + u.search, headers: r.headers(), body: r.postData(), api: isApi };
      calls.push(rec);
      if (!isApi) return r.respond({ status: 200, contentType: 'text/css', body: '' });
      return mock(r, rec, calls);
    }
    r.continue();
  });
  page.on('dialog', d => d.accept());
  return { page, calls };
}
const json = (r, status, obj, extraHeaders) => r.respond({
  status, contentType: 'application/json',
  headers: Object.assign({ 'access-control-expose-headers': 'Content-Range' }, extraHeaders || {}),
  body: JSON.stringify(obj)
});

/* ================= NO SECRETS IN THE FRONTEND ================= */
{
  const t = await newPage((r) => json(r, 200, []));
  await t.page.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
  const html = await t.page.content();
  const files = ['config.js', 'api-client.js', 'checkout.js', 'admin.js'];
  let leaked = null;
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (/eyJhbGciOi[A-Za-z0-9_-]{10,}/.test(src)) leaked = f;
  }
  const pageSrc = await t.page.evaluate(() => document.documentElement.outerHTML);
  ok(!leaked && !/eyJhbGciOi[A-Za-z0-9_-]{10,}/.test(pageSrc), 'frontend: no Supabase JWT/anon key in any served file', leaked || '');
  ok(!/supabase\.co/.test(html) && !/SUPABASE_ANON_KEY/.test(html), 'frontend: no Supabase host or key name in the page');
  await t.page.close();
}

/* ================= STOREFRONT ================= */
{
  const PRODUCTS = [
    { id: 1, name: 'Hoodie', category: 'clothes', price: 4500, old_price: 6000, stock: 5, badge: 'new', image: 'https://res.cloudinary.com/qqftt7fm/image/upload/x.jpg', sizes: 'S,M,L' },
    { id: 2, name: 'Cap', category: 'accessories', price: 1500, stock: 0, image: 'https://res.cloudinary.com/qqftt7fm/image/upload/y.jpg', sizes: '' },
    { id: 3, name: 'Sneaker', category: 'gang', price: 12000, stock: 3, image: 'https://res.cloudinary.com/qqftt7fm/image/upload/z.jpg', sizes: '40,41' }
  ];
  const t = await newPage((r, rec) => {
    if (rec.path.startsWith('/api/products')) return json(r, 200, PRODUCTS);
    if (rec.path.startsWith('/api/categories')) return json(r, 200, [{ id: 1, name: 'ستريت وير' }]);
    return json(r, 200, []);
  });
  await t.page.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
  await t.page.waitForSelector('.product-card', { timeout: 5000 });
  ok((await t.page.$$('.product-card')).length === 3, 'storefront: 3 products rendered from the API');
  ok(t.calls.some(c => c.path.startsWith('/api/products')), 'storefront: products fetched through the /api proxy');
  const filters = await t.page.$$eval('#filters .filter-btn', b => b.map(x => x.textContent.trim()).join('|'));
  ok(filters.includes('الكل') && filters.includes('ستريت وير'), 'storefront: category filters built from the database', filters);
  /* no moving imagery: no infinite CSS animations on the page */
  const anim = await t.page.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll('*')) {
      const a = getComputedStyle(el).animationName;
      if (a && a !== 'none' && !el.classList.contains('page-loader')) n++;
    }
    return n;
  });
  ok(anim === 0, 'storefront: no looping animations (static, Apple-like)', String(anim));
  const theme = await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(theme === 'rgb(251, 251, 253)', 'storefront: light glow-iOS background', theme);
  const glass = await t.page.evaluate(() => {
    const c = document.querySelector('.product-card');
    return c ? getComputedStyle(c).backdropFilter : '';
  });
  ok(/blur/.test(glass), 'storefront: glassmorphism active on the product cards', glass);
  await t.page.close();
}

/* ================= CHECKOUT ================= */
async function fillCheckout(page, phone = '0550123456') {
  await page.type('#cName', 'Ali Ben'); await page.type('#cPhone', phone);
  await page.select('#cWilaya', await page.$eval('#cWilaya option:nth-child(2)', o => o.value));
  await page.type('#cCommune', 'Bab Ezzouar');
}
const CART = [{ id: 1, name: XSS, price: 1, size: 'M', qty: 2, image: 'javascript:alert(1)', category: 'clothes' }];
async function openCheckout(mock, viewport) {
  const t = await newPage(mock, viewport);
  await t.page.goto(BASE + '/checkout.html'); await t.page.evaluate(c => { localStorage.setItem('urdrip_cart', JSON.stringify(c)); sessionStorage.clear(); }, CART);
  await t.page.reload({ waitUntil: 'networkidle0' }); return t;
}
{ // happy path + tamper resistance + honest status
  const t = await openCheckout((r) => json(r, 200, { order_id: 7, status: 'pending', subtotal: 9000, shipping: 700, total: 9700, replayed: false }));
  ok(await t.page.evaluate(() => window.__xss === undefined), 'checkout: malicious product name does not execute (XSS)');
  ok(await t.page.evaluate(() => !document.querySelector('.cart-item-img img')), 'checkout: javascript: image URL dropped');
  await fillCheckout(t.page); await t.page.click('#confirmBtn');
  await t.page.waitForSelector('#successOverlay.open', { timeout: 5000 });
  const rpc = t.calls.filter(c => c.path.startsWith('/api/order')); const b = JSON.parse(rpc[0].body);
  ok(rpc.length === 1, 'checkout: exactly one order call');
  ok(!('total' in b) && !('p_total' in b) && b.p_items.every(i => Object.keys(i).sort().join() === 'id,qty,size'), 'checkout: no price/total sent to server (server computes)', rpc[0].body);
  ok(/^[0-9a-f-]{36}$/.test(b.p_idempotency_key), 'checkout: idempotency key present');
  const txt = await t.page.$eval('.success-box', e => e.innerText);
  ok(txt.includes('تم استلام طلبك') && txt.includes('قيد انتظار التأكيد') && !txt.includes('تم تأكيد'), 'checkout: says RECEIVED/PENDING, never "confirmed"', txt);
  ok(txt.includes('#7') && txt.includes('9,700'), 'checkout: shows server order id + server total');
  ok(await t.page.evaluate(() => localStorage.getItem('urdrip_cart') === null), 'checkout: cart cleared only after success');
  await t.page.close();
}
{ // client validation: no request
  const t = await openCheckout((r) => json(r, 200, {}));
  await fillCheckout(t.page, '123'); await t.page.click('#confirmBtn');
  ok(!t.calls.some(c => c.path.startsWith('/api/order')) && (await t.page.$eval('#formError', e => e.innerText)).includes('رقم الهاتف'), 'checkout: invalid phone blocked client-side with message');
  await t.page.close();
}
{ // business error: single call, Arabic message, cart kept
  const t = await openCheckout((r) => json(r, 400, { code: 'P0001', message: 'out_of_stock' }));
  await fillCheckout(t.page); await t.page.click('#confirmBtn'); await t.page.waitForFunction(() => document.getElementById('formError') && document.getElementById('formError').style.display === 'block');
  ok(t.calls.filter(c => c.path.startsWith('/api/order')).length === 1, 'checkout: business error is NOT retried');
  ok((await t.page.$eval('#formError', e => e.innerText)).includes('نفدت'), 'checkout: out_of_stock shown in Arabic (no internals leaked)');
  ok(await t.page.evaluate(() => localStorage.getItem('urdrip_cart') !== null && !document.getElementById('confirmBtn').disabled), 'checkout: cart kept + button re-enabled');
  await t.page.close();
}
{ // network failure: retries same key, no silent loss, user retry reuses key, then success => one logical order
  let n = 0; const t = await openCheckout((r) => { n++; if (n <= 3) return r.abort('failed'); json(r, 200, { order_id: 9, status: 'pending', subtotal: 9000, shipping: 700, total: 9700, replayed: true }); });
  await fillCheckout(t.page); await t.page.click('#confirmBtn');
  await t.page.waitForFunction(() => document.getElementById('formError') && document.getElementById('formError').style.display === 'block', { timeout: 20000 });
  const keys1 = t.calls.filter(c => c.path.startsWith('/api/order')).map(c => JSON.parse(c.body).p_idempotency_key);
  ok(keys1.length === 3 && new Set(keys1).size === 1, 'checkout: 3 automatic retries all reuse the SAME idempotency key', keys1.length + ' calls');
  ok(await t.page.evaluate(() => localStorage.getItem('urdrip_cart') !== null), 'checkout: network failure does not lose cart/order');
  await t.page.click('#confirmBtn'); await t.page.waitForSelector('#successOverlay.open', { timeout: 10000 });
  const keys2 = t.calls.filter(c => c.path.startsWith('/api/order')).map(c => JSON.parse(c.body).p_idempotency_key);
  ok(new Set(keys2).size === 1, 'checkout: manual retry after failure still same key (no duplicate order possible)');
  await t.page.close();
}
{ // double submit
  const t = await openCheckout(async (r) => { await new Promise(s => setTimeout(s, 600)); json(r, 200, { order_id: 3, status: 'pending', subtotal: 9000, shipping: 700, total: 9700, replayed: false }); });
  await fillCheckout(t.page); await t.page.evaluate(() => { const b = document.getElementById('confirmBtn'); b.click(); b.click(); b.click(); });
  await t.page.waitForSelector('#successOverlay.open', { timeout: 8000 });
  ok(t.calls.filter(c => c.path.startsWith('/api/order')).length === 1, 'checkout: triple-click sends ONE request');
  await t.page.close();
}

/* ================= ADMIN ================= */
const SESSION = { access_token: 'USER-JWT-TEST', refresh_token: 'r', expires_in: 3600, user: { email: 'boss@shop.dz' } };
const ORDERS = [{ id: 5, customer: XSS, phone: '0550123456', wilaya: 'Alger', commune: '<b>x</b>', delivery: 'home', note: '<script>window.__xss=1</script>', items: [{ name: XSS, price: 4500, qty: 2, size: 'M' }], subtotal: 9000, shipping: 700, total: 9700, status: 'pending', created_at: new Date().toISOString() }];
function adminMock({ admin = true } = {}) {
  return (r, rec) => {
    const p = rec.path;
    if (p.startsWith('/api/auth')) return json(r, 200, SESSION);
    if (p.includes('fn=admin_dashboard_stats')) return admin ? json(r, 200, { products_total: 4, products_active: 3, products_out_of_stock: 1, orders_total: 1, orders_last_24h: 1, orders_by_status: { pending: 1 }, revenue_products: 0 }) : json(r, 403, { message: 'forbidden', code: '42501' });
    if (rec.method === 'PATCH' && p.includes('table=orders')) return json(r, 200, [{ ...ORDERS[0], status: 'confirmed' }]);
    if (p.includes('table=orders')) return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-expose-headers': 'Content-Range', 'content-range': '0-0/1' }, body: JSON.stringify(ORDERS) });
    return json(r, 200, []);
  };
}
{
  const t = await newPage(adminMock());
  await t.page.goto(BASE + '/admin.html', { waitUntil: 'networkidle0' });
  ok(await t.page.evaluate(() => getComputedStyle(document.getElementById('adminContent')).display === 'none' && getComputedStyle(document.getElementById('lockScreen')).display !== 'none'), 'admin: locked by default');
  ok(!t.calls.some(c => c.path.startsWith('/api/db')), 'admin: ZERO data requests before login');
  ok(!(await t.page.content()).includes('admin_pass') && !t.calls.some(c => c.path.includes('settings')), 'admin: no password/settings access from page');
  await t.page.type('#lockEmail', 'boss@shop.dz'); await t.page.type('#lockPass', 'whatever'); await t.page.click('#loginBtn');
  await t.page.waitForFunction(() => document.getElementById('adminContent').style.display !== 'none', { timeout: 8000 });
  await t.page.evaluate(() => document.querySelector('[data-section="orders"]').click());
  await t.page.waitForSelector('.order-card', { timeout: 5000 });
  ok(await t.page.evaluate(() => window.__xss === undefined), 'admin: XSS payloads in customer name/note/items do NOT execute');
  ok((await t.page.$eval('.order-card', e => e.innerText)).includes('<img src=x'), 'admin: payload rendered as inert text');
  const dataCalls = t.calls.filter(c => c.path.startsWith('/api/db'));
  ok(dataCalls.length > 0 && dataCalls.every(c => c.headers.authorization === 'Bearer USER-JWT-TEST'), 'admin: every data call uses the signed-in user token (no service key)');
  ok(await t.page.evaluate(() => Object.keys(localStorage).every(k => !/order|admin|phone|customer/i.test(k + localStorage.getItem(k)))), 'admin: no orders/PII in localStorage');
  const btns = await t.page.$$eval('[data-act="order-status"]', b => b.map(x => x.dataset.to).sort().join());
  ok(btns === 'cancelled,confirmed', 'admin: pending order offers only valid transitions', btns);
  await t.page.click('[data-act="order-status"][data-to="confirmed"]');
  await t.page.waitForFunction(() => document.getElementById('toastMessage').textContent.includes('تم تحديث'), { timeout: 5000 });
  const patch = t.calls.find(c => c.method === 'PATCH' && c.path.includes('table=orders'));
  ok(patch && patch.path.includes('from=pending') && JSON.parse(patch.body).status === 'confirmed', 'admin: status change guarded by optimistic check (from=pending)', patch && patch.path);
  await t.page.screenshot({ path: path.join(SHOTS, 'admin_orders.png') });
  await t.page.close();
}
{
  const t = await newPage(adminMock({ admin: false }));
  await t.page.goto(BASE + '/admin.html'); await t.page.type('#lockEmail', 'user@x.dz'); await t.page.type('#lockPass', 'pw'); await t.page.click('#loginBtn');
  await t.page.waitForFunction(() => document.getElementById('lockErr').style.display === 'block', { timeout: 8000 });
  ok(await t.page.evaluate(() => document.getElementById('adminContent').style.display === 'none' && document.getElementById('lockErr').textContent.includes('ليس مشرفاً')), 'admin: valid account that is NOT an admin is rejected and stays locked');
  ok(await t.page.evaluate(() => sessionStorage.getItem('urdrip_admin_session') === null), 'admin: rejected session not kept');
  await t.page.close();
}
{ // mobile screenshots
  const t = await openCheckout((r) => json(r, 200, {}), { width: 390, height: 844, isMobile: true });
  await t.page.screenshot({ path: path.join(SHOTS, 'checkout_mobile.png') }); await t.page.close();
}
await browser.close(); srv.close();
console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
