// Checks the admin reorder panel: renders the list, arrows move items.
import puppeteer from 'puppeteer';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (c, n, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '  :: ' + extra)); };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE:', m.type(), m.text()); });
page.on('response', async r => {
  if (r.url().includes('/api/')) {
    let body = '';
    try { body = (await r.text()).slice(0, 120); } catch (e) {}
    console.log('  API', r.status(), r.url().replace('http://localhost:3000', ''), body);
  }
});

/* The dashboard-stats RPC needs a service_role key; mock it so the panel opens. */
await page.setRequestInterception(true);
page.on('request', r => {
  const u = new URL(r.url());
  if (u.searchParams.get('fn') === 'admin_dashboard_stats') {
    return r.respond({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ products_total: 22, products_active: 22, products_out_of_stock: 0, orders_total: 0, orders_last_24h: 0, orders_by_status: {}, revenue_products: 0 })
    });
  }
  r.continue();
});

await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle0' });
await page.type('#lockEmail', 'admin@urdrip.dz');
await page.type('#lockPass', 'urdrip2026');
await page.click('#loginBtn');
await new Promise(r => setTimeout(r, 4000));

// open the reorder panel
await page.evaluate(() => document.querySelector('[data-section="reorder"]').click());
await new Promise(r => setTimeout(r, 2500));

console.log('  DEBUG section active:', await page.evaluate(() => document.querySelector('#reorder').classList.contains('active')));
console.log('  DEBUG list html:', (await page.$eval('#reorderList', e => e.innerHTML)).slice(0, 200));
console.log('  DEBUG list html2:', (await page.evaluate(() => document.querySelector('#reorderList') ? document.querySelector('#reorderList').innerHTML.length : 'NO ELEMENT')));

const items = await page.$$('.reorder-item');
ok(items.length > 0, 'reorder: list rendered from the database (' + items.length + ' items)');

const firstBefore = await page.$eval('.reorder-item', e => e.getAttribute('data-id'));
const firstNameBefore = await page.$eval('.reorder-item .info strong', e => e.textContent);

// move the 2nd item up with the arrow button
await page.click('.reorder-item:nth-child(2) [data-move="up"]');
await new Promise(r => setTimeout(r, 400));
const firstAfter = await page.$eval('.reorder-item', e => e.getAttribute('data-id'));
const firstNameAfter = await page.$eval('.reorder-item .info strong', e => e.textContent);
ok(firstAfter !== firstBefore, 'reorder: arrow button swaps the order', firstBefore + ' -> ' + firstAfter);

// positions renumber
const positions = await page.$$eval('.reorder-item .pos', els => els.map(e => e.textContent));
ok(positions[0] === '1' && positions[1] === '2', 'reorder: position numbers renumber', positions.slice(0, 3).join(','));

// first arrow is disabled, last down arrow is disabled
const dis = await page.$$eval('.reorder-item [data-move]', els => els.map(e => e.disabled));
ok(dis[0] === true, 'reorder: the first item cannot move up');
ok(dis[dis.length - 1] === true, 'reorder: the last item cannot move down');

// saving without the DB column must show a clear Arabic message
await page.click('#saveOrderBtn');
await new Promise(r => setTimeout(r, 4000));
const msg = await page.$eval('#reorderMsg', e => e.style.display !== 'none' ? e.textContent : '');
ok(/sort_order|service_role/.test(msg), 'reorder: clear message when the column/key is missing', msg);

await page.screenshot({ path: path.join(os.tmpdir(), 'urdrip-admin-reorder.png') });
await browser.close();
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
