/* URDRIP — Admin dashboard (v10)
 * Auth: Supabase Auth (email + password, hashed server-side) through the
 * same-origin /api proxy. Authorization: RLS + the admin_users allowlist in
 * the database. This file holds NO secrets: no Supabase key, no password —
 * only the signed-in admin's short-lived session token.
 * Every write is verified against the rows the server actually changed. */
'use strict';
(function () {
  var C = window.URDRIP, API = window.URDRIP_API;
  var SESSION_KEY = 'urdrip_admin_session';       // sessionStorage: cleared when the tab closes
  var session = null, products = [], categories = [], catCols = ['name', 'description'];
  var orderState = { page: 0, size: 20, status: '', q: '', total: 0, loading: false };
  var pollTimer = null, busy = {};

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function safeImg(u) { u = String(u || ''); return (/^https:\/\//i.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u)) ? u : ''; }
  function num(n) { return (parseInt(n, 10) || 0).toLocaleString('en-US'); }
  function fdate(d) { try { return new Date(d).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
  function toast(msg, bad) {
    var t = $('toast'); $('toastMessage').textContent = msg; t.style.background = bad ? '#b42318' : ''; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, bad ? 4500 : 2500);
  }
  var STATUS = { pending: 'قيد انتظار التأكيد', confirmed: 'مؤكد', shipped: 'تم الشحن', delivered: 'تم التوصيل', cancelled: 'ملغي' };
  var COLORS = { pending: '#ff9f43', confirmed: '#4dabf7', shipped: '#9775fa', delivered: '#37b24d', cancelled: '#f03e3e' };
  var NEXT = { pending: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered', 'cancelled'], delivered: [], cancelled: [] };
  var ACTION = { confirmed: 'تأكيد الطلب', shipped: 'تم الشحن', delivered: 'تم التوصيل', cancelled: 'إلغاء الطلب' };
  var CAT = { clothes: 'ستريت وير', accessories: 'إكسسوارات', gang: 'سنيكرز' };
  var BADGE = { new: 'جديد', hot: 'رائج', sale: 'عرض', best: 'الأكثر مبيعاً' };

  /* ---------- session / API ---------- */
  function loadSession() { try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; } }
  function storeSession(s) { session = s; try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function toSession(j) { return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: (j.user && j.user.email) || '' }; }

  async function rawFetch(url, opts, timeout) {
    var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, timeout || 15000);
    try { opts.signal = ctrl.signal; opts.cache = 'no-store'; return await fetch(url, opts); } finally { clearTimeout(t); }
  }
  async function refresh() {
    if (!session || !session.refresh_token) return false;
    try {
      var j = await API.refreshSession(session.refresh_token);
      if (!j || !j.access_token) return false;
      storeSession(toSession(j)); return true;
    } catch (e) { return false; }
  }
  /* api(): authenticated call through the /api proxy. The path may be written
   * in PostgREST style ("products?select=..&id=eq.3") — it is parsed and mapped
   * onto the proxy's allow-listed parameters.
   * Returns {data,count}. Throws Error(safeMessage). */
  async function api(method, path, o) {
    o = o || {};
    if (!session) throw new Error('انتهت الجلسة. سجّل الدخول من جديد.');
    if (session.expires_at - 60 < Date.now() / 1000) await refresh();

    var rpcName = null, table = path, params = {};
    if (path.indexOf('rpc/') === 0) rpcName = path.slice(4);
    else {
      var qi = path.indexOf('?');
      if (qi !== -1) {
        table = path.slice(0, qi);
        path.slice(qi + 1).split('&').forEach(function (kv) {
          if (!kv) return;
          var eq = kv.indexOf('=');
          if (eq === -1) return;
          var k = kv.slice(0, eq), v = decodeURIComponent(kv.slice(eq + 1));
          if (k === 'id') params.id = v.replace(/^eq\./, '');
          else if (k === 'status') params.status = v.replace(/^eq\./, '');
          else if (k === 'limit') params.limit = v;
          else if (k === 'offset') params.offset = v;
          else if (k === 'or') {
            var m = /customer\.ilike\.\*(.*?)\*,phone\.ilike\.\*/.exec(v);
            params.q = m ? m[1] : v.replace(/[()]/g, '');
          }
        });
      }
    }
    if (o.id !== undefined) params.id = o.id;
    if (o.from !== undefined) params.from = o.from;
    if (o.q !== undefined) params.q = o.q;
    if (o.status !== undefined) params.status = o.status;

    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var data;
        if (rpcName) {
          data = await API.rpc(rpcName, o.body || {}, session.access_token);
        } else {
          data = await API.db({
            method: method, table: table, id: params.id, from: params.from,
            q: params.q, status: params.status, limit: params.limit, offset: params.offset,
            body: o.body, token: session.access_token
          });
        }
        var cr = data && data.__count;
        if (data && typeof data === 'object') delete data.__count;
        return { data: data, count: cr ? parseInt(cr, 10) : null };
      } catch (e) {
        var st = e && e.status;
        if (st === 401 && attempt === 0 && await refresh()) continue;
        if (st === 401) { logout(true); throw new Error('انتهت الجلسة. سجّل الدخول من جديد.'); }
        var msg = '';
        if (e && e.data && e.data.message) msg = String(e.data.message);
        if (e && e.data && e.data.error) msg = String(e.data.error);
        if (/admin_service_key_missing/.test(msg)) {
          throw new Error('ناقص مفتاح service_role. أضف SUPABASE_SERVICE_ROLE_KEY إلى متغيّرات البيئة (أو استخدم حساب Supabase Auth مضافاً إلى admin_users).');
        }
        if (/sort_order_column_missing/.test(msg)) {
          throw new Error('عمود sort_order غير موجود في القاعدة. نفّذ db-add-sort-order.sql في Supabase ثم أعد المحاولة.');
        }
        if (st === 403) throw new Error('ليس لديك صلاحية لهذه العملية.');
        if (/invalid_status_transition/.test(msg)) throw new Error('انتقال الحالة غير مسموح.');
        if (/order_immutable/.test(msg)) throw new Error('لا يمكن تعديل بيانات الزبون أو المبلغ بعد إنشاء الطلب.');
        if (st === 409) throw new Error('تعارض في البيانات (قيد مكرر أو مرتبط).');
        if (st === 0) throw new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت.');
        throw new Error('فشلت العملية (' + (st || '?') + ').');
      }
    }
  }

  /* ---------- auth UI ---------- */
  async function login() {
    var email = $('lockEmail').value.trim(), pass = $('lockPass').value, err = $('lockErr'), btn = $('loginBtn');
    err.style.display = 'none';
    if (!email || !pass) { err.textContent = 'أدخل البريد وكلمة المرور'; err.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'جاري الدخول...';
    try {
      var j = await API.login(email, pass);
      if (!j || !j.access_token) throw new Error('بيانات الدخول غير صحيحة');
      storeSession(toSession(j));
      await api('POST', 'rpc/admin_dashboard_stats', { body: {} });     // 42501/forbidden => not an admin
      $('lockPass').value = ''; await enter();
    } catch (e) {
      var notAdmin = /صلاحية/.test(e.message); if (notAdmin) logout(true);
      err.textContent = notAdmin ? 'هذا الحساب ليس مشرفاً.' : e.message; err.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'دخول'; }
  }
  function logout(silent) {
    if (session) { API.logoutSession(session.access_token).catch(function () {}); }
    storeSession(null); products = []; categories = []; clearInterval(pollTimer);
    $('adminContent').style.display = 'none'; $('lockScreen').style.display = '';
    $('ordersList').innerHTML = ''; $('productsTableBody').innerHTML = '';
    if (!silent) toast('تم تسجيل الخروج');
  }
  async function enter() {
    $('lockScreen').style.display = 'none'; $('adminContent').style.display = '';
    var em = $('accountEmail'); if (em) em.textContent = session.email;
    await refreshAll();
    clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (!document.hidden && session) { loadDashboard(); if ($('orders').classList.contains('active')) loadOrders(); } }, 30000);
  }

  /* ---------- dashboard ---------- */
  async function loadDashboard() {
    try {
      var s = (await api('POST', 'rpc/admin_dashboard_stats', { body: {} })).data || {};
      $('statProducts').textContent = num(s.products_active) + ' / ' + num(s.products_total);
      $('statOrders').textContent = num(s.orders_total);
      $('statRevenue').textContent = num(s.revenue_products) + ' دج';
      var by = s.orders_by_status || {}, cards = Object.keys(STATUS).map(function (k) {
        return '<div class="stat-card glass"><div class="stat-info"><h3 style="color:' + COLORS[k] + '">' + num(by[k] || 0) + '</h3><p>' + STATUS[k] + '</p></div></div>';
      });
      cards.push('<div class="stat-card glass"><div class="stat-info"><h3>' + num(s.orders_last_24h) + '</h3><p>طلبات آخر 24 ساعة</p></div></div>');
      cards.push('<div class="stat-card glass"><div class="stat-info"><h3 style="color:' + (s.products_out_of_stock ? '#f03e3e' : 'inherit') + '">' + num(s.products_out_of_stock) + '</h3><p>منتجات نفد مخزونها</p></div></div>');
      $('statusStats').innerHTML = cards.join('');
      var recent = (await api('GET', 'orders?select=id,customer,status,total,created_at&order=created_at.desc&limit=8')).data || [];
      $('recentActivity').innerHTML = recent.length ? recent.map(function (o) {
        return '<div class="recent-item"><div><h4>#' + esc(o.id) + ' — ' + esc(o.customer) + '</h4><p><span style="color:' + (COLORS[o.status] || '#999') + '">' + esc(STATUS[o.status] || o.status) + '</span> · ' + num(o.total) + ' دج · ' + esc(fdate(o.created_at)) + '</p></div></div>';
      }).join('') : '<div class="empty-state"><p>لا توجد طلبات بعد</p></div>';
    } catch (e) { toast(e.message, true); }
    var rp = $('recentProducts');
    if (rp) rp.innerHTML = products.slice(0, 5).map(function (p) {
      var img = safeImg(p.image);
      return '<div class="recent-item">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '<div><h4>' + esc(p.name) + '</h4><p>' + num(p.price) + ' دج</p></div></div>';
    }).join('');
  }

  /* ---------- products ---------- */
  async function loadProducts() {
    try {
      products = (await api('GET', 'products?select=id,name,category,price,old_price,color,sizes,image,badge,description,stock,active,created_at,sort_order&order=created_at.desc&limit=500')).data || [];
      renderProducts($('searchProducts').value);
      /* قائمة الترتيب تُحدَّث تلقائياً عند وصول المنتجات */
      if ($('reorder') && $('reorder').classList.contains('active')) { orderList = products.slice(); renderOrder(); }
    } catch (e) { toast(e.message, true); $('productsTableBody').innerHTML = '<tr><td colspan="6" class="empty-state">تعذر تحميل المنتجات</td></tr>'; }
  }
  function renderProducts(q) {
    q = (q || '').trim().toLowerCase();
    var list = q ? products.filter(function (p) { return String(p.name).toLowerCase().indexOf(q) !== -1 || String(p.category).toLowerCase().indexOf(q) !== -1; }) : products;
    $('productsTableBody').innerHTML = list.length ? list.map(function (p, i) {
      var img = safeImg(p.image), b = p.badge ? '<span class="badge ' + esc(p.badge) + '" style="margin-inline-start:8px">' + esc(BADGE[p.badge] || p.badge) + '</span>' : '';
      var pos = (p.sort_order != null && p.sort_order > 0) ? '<span class="badge" style="background:rgba(255,255,255,.08);color:var(--td)">#' + num(p.sort_order) + '</span>' : '';
      return '<tr><td>' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '</td><td><strong>' + esc(p.name) + '</strong>' + b + pos + '</td><td>' + esc(CAT[p.category] || p.category) + '</td><td>' + num(p.price) + ' دج<br><small>المخزون: ' + num(p.stock) + '</small></td>' +
        '<td><span class="' + (p.active ? 'status-active' : 'status-inactive') + '">' + (p.active ? 'نشط' : 'غير نشط') + '</span></td>' +
        '<td><div class="table-actions"><button type="button" class="btn-edit" data-act="edit-product" data-id="' + p.id + '">تعديل</button>' +
        '<button type="button" class="btn-edit" data-act="toggle-product" data-id="' + p.id + '">' + (p.active ? 'تعطيل' : 'تفعيل') + '</button>' +
        '<button type="button" class="btn-danger" data-act="delete-product" data-id="' + p.id + '">حذف</button></div></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty-state"><p>لا توجد منتجات</p></div></td></tr>';
  }
  function readProduct(prefix, images) {
    var g = function (n) { return $(prefix + n).value.trim(); };
    var name = g('Name'), price = parseInt(g('Price'), 10), old = g('OldPrice') ? parseInt(g('OldPrice'), 10) : null, stock = parseInt($(prefix + 'Stock').value, 10);
    var cat = $(prefix + 'Category').value, badge = $(prefix + 'Badge').value || null, sizes = g('Sizes') || null, desc = $(prefix + 'Description').value.trim();
    if (name.length < 2 || name.length > 120) throw new Error('اسم المنتج يجب أن يكون بين 2 و120 حرفاً.');
    if (!CAT[cat]) throw new Error('اختر قسماً صحيحاً.');
    if (!(price >= 0 && price <= 10000000)) throw new Error('السعر غير صحيح.');
    if (old !== null && !(old >= 0 && old <= 10000000)) throw new Error('السعر القديم غير صحيح.');
    if (!(stock >= 0 && stock <= 32767)) throw new Error('المخزون يجب أن يكون بين 0 و32767.');
    if (badge && !BADGE[badge]) throw new Error('شارة غير صحيحة.');
    if (sizes && sizes.length > 100) throw new Error('المقاسات طويلة جداً.');
    if (desc.length > 2000) throw new Error('الوصف طويل جداً (الحد 2000).');
    images = images.filter(safeImg).slice(0, 3);
    return { name: name, category: cat, price: price, old_price: old, color: g('Color') || null, sizes: sizes, badge: badge, description: desc, image: images[0] || null, images: images, stock: stock, active: $(prefix + 'Active').checked };
  }
  function addFormImages() { var a = []; for (var i = 1; i <= 3; i++) { var im = $('previewImg' + i); if (im && im.getAttribute('src')) a.push(im.src); } return a; }
  function setBusy(btn, on, label) { if (!btn) return; btn.disabled = on; if (label) btn.textContent = label; }

  /* ---------- ترتيب المنتجات (سحب وإفلات) ---------- */
  var orderList = [], dragId = null;

  function renderOrder() {
    var box = $('reorderList');
    if (!box) return;
    if (!orderList.length) {
      box.innerHTML = '<div class="reorder-empty">لا توجد منتجات لترتيبها.</div>';
      return;
    }
    box.innerHTML = orderList.map(function (p, i) {
      var img = safeImg(p.image);
      return '<div class="reorder-item" draggable="true" data-id="' + esc(p.id) + '">' +
        '<span class="pos">' + (i + 1) + '</span>' +
        '<span class="grip">⠿</span>' +
        (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="ph"></span>') +
        '<div class="info"><strong>' + esc(p.name) + '</strong>' +
        '<small>' + esc(CAT[p.category] || p.category) + ' · ' + num(p.price) + ' دج' +
        (p.active ? '' : ' · مخفي') + '</small></div>' +
        '<div class="moves">' +
        '<button type="button" data-move="up" data-id="' + esc(p.id) + '" title="لأعلى"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" data-move="down" data-id="' + esc(p.id) + '" title="لأسفل"' + (i === orderList.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '</div></div>';
    }).join('');
  }

  function moveItem(id, dir) {
    var i = orderList.findIndex(function (p) { return String(p.id) === String(id); });
    if (i === -1) return;
    var j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= orderList.length) return;
    var tmp = orderList[i]; orderList[i] = orderList[j]; orderList[j] = tmp;
    renderOrder();
  }

  function initReorder() {
    var box = $('reorderList');
    if (!box) return;

    box.addEventListener('dragstart', function (e) {
      var it = e.target.closest && e.target.closest('.reorder-item');
      if (!it) return;
      dragId = it.getAttribute('data-id');
      it.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch (err) {}
    });
    box.addEventListener('dragend', function () {
      dragId = null;
      box.querySelectorAll('.reorder-item').forEach(function (n) { n.classList.remove('dragging', 'drag-over'); });
    });
    box.addEventListener('dragover', function (e) {
      e.preventDefault();
      var it = e.target.closest && e.target.closest('.reorder-item');
      if (!it) return;
      box.querySelectorAll('.reorder-item.drag-over').forEach(function (n) { n.classList.remove('drag-over'); });
      it.classList.add('drag-over');
    });
    box.addEventListener('drop', function (e) {
      e.preventDefault();
      var it = e.target.closest && e.target.closest('.reorder-item');
      if (!it || !dragId) return;
      var targetId = it.getAttribute('data-id');
      if (targetId === dragId) return;
      var from = orderList.findIndex(function (p) { return String(p.id) === String(dragId); });
      var to = orderList.findIndex(function (p) { return String(p.id) === String(targetId); });
      if (from === -1 || to === -1) return;
      var moved = orderList.splice(from, 1)[0];
      orderList.splice(to, 0, moved);
      renderOrder();
    });
    /* أسهم التحريك (للمستخدمين على الجوال) */
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-move]');
      if (!b) return;
      moveItem(b.getAttribute('data-id'), b.getAttribute('data-move'));
    });
  }

  async function saveOrder() {
    var btn = $('saveOrderBtn'), msg = $('reorderMsg');
    if (!orderList.length) return;
    setBusy(btn, true, 'جاري الحفظ...');
    if (msg) msg.style.display = 'none';
    try {
      var res = await API.db({
        method: 'POST', table: 'products', action: 'reorder',
        body: { order: orderList.map(function (p) { return p.id; }) },
        token: session.access_token
      });
      if (msg) {
        msg.textContent = '✅ تم حفظ الترتيب (' + (res.updated || orderList.length) + ' منتج).';
        msg.style.color = '#28c850';
        msg.style.display = 'block';
      }
      toast('تم حفظ ترتيب المنتجات');
      await loadProducts();
    } catch (e) {
      var text = (e && e.data && (e.data.message || e.data.error)) ? String(e.data.message || e.data.error) : (e && e.message) || '';
      if (/sort_order_column_missing/.test(text)) {
        text = 'عمود sort_order غير موجود في القاعدة. نفّذ db-add-sort-order.sql في Supabase ثم أعد المحاولة.';
      } else if (/admin_service_key_missing/.test(text)) {
        text = 'ناقص مفتاح service_role. أضف SUPABASE_SERVICE_ROLE_KEY إلى متغيّرات البيئة، أو استخدم حساب Supabase Auth مضافاً إلى admin_users.';
      }
      if (msg) { msg.textContent = '❌ ' + text; msg.style.color = '#f03e3e'; msg.style.display = 'block'; }
      toast(text || 'تعذر حفظ الترتيب', true);
    } finally { setBusy(btn, false, 'حفظ الترتيب'); }
  }

  async function openReorder() {
    if (!products.length) await loadProducts();
    orderList = products.slice();
    renderOrder();
    showSection('reorder', 'ترتيب المنتجات');
  }

  async function createProduct(e) {
    e.preventDefault(); if (uploading > 0) return toast('جاري رفع الصور... انتظر قليلاً', true);
    var form = e.target, btn = form.querySelector('[type="submit"]'); if (busy.create) return; busy.create = true;
    setBusy(btn, true, 'جاري الحفظ...');
    try {
      var body = readProduct('p', addFormImages());           // ids: pName, pPrice, pCategory ...
      var row = (await api('POST', 'products', { body: body, returning: true })).data;
      if (!row || !row.length) throw new Error('لم يتم حفظ المنتج.');
      toast('تمت إضافة المنتج'); form.reset(); resetUploads(); showSection('products', 'إدارة المنتجات'); await loadProducts(); loadDashboard();
    } catch (err) { toast(err.message, true); } finally { busy.create = false; setBusy(btn, false, 'حفظ المنتج'); }
  }
  async function openEdit(id) {
    var p = products.find(function (x) { return x.id === id; }); if (!p) return;
    try { var f = (await api('GET', 'products?select=image,images&id=eq.' + id)).data; if (f && f[0]) { p.image = f[0].image; p.images = f[0].images; } } catch (e) { toast(e.message, true); return; }
    $('editProductId').value = id; $('editName').value = p.name; $('editCategory').value = p.category; $('editPrice').value = p.price;
    $('editOldPrice').value = p.old_price || ''; $('editColor').value = p.color || ''; $('editSizes').value = p.sizes || ''; $('editBadge').value = p.badge || '';
    $('editDescription').value = p.description || ''; $('editStock').value = p.stock == null ? 0 : p.stock; $('editActive').checked = !!p.active;
    var imgs = (Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : [])).filter(safeImg);
    $('editImagesCurrent').innerHTML = imgs.length ? '<div style="display:flex;gap:8px;margin-bottom:12px">' + imgs.map(function (u) { return '<img src="' + esc(u) + '" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px">'; }).join('') + '</div>' : '';
    showSection('edit-product', 'تعديل المنتج');
  }
  async function saveEdit(e) {
    e.preventDefault(); if (uploading > 0) return toast('جاري رفع الصور... انتظر قليلاً', true);
    var id = parseInt($('editProductId').value, 10), p = products.find(function (x) { return x.id === id; }); if (!p) return;
    var btn = e.target.querySelector('[type="submit"]'); if (busy.edit) return; busy.edit = true; setBusy(btn, true, 'جاري الحفظ...');
    try {
      var imgs = [];
      for (var i = 1; i <= 3; i++) { var pv = $('editPreview' + i), im = pv && pv.querySelector('img'); if (pv && pv.style.display !== 'none' && im && im.getAttribute('src')) imgs.push(im.src); else if (p.images && p.images[i - 1]) imgs.push(p.images[i - 1]); }
      if (!imgs.length && p.image) imgs.push(p.image);
      var rows = (await api('PATCH', 'products', { id: id, body: readProduct('edit', imgs), returning: true })).data;
      if (!rows || !rows.length) throw new Error('لم يتم تعديل المنتج (غير موجود أو غير مصرح).');
      toast('تم تعديل المنتج'); showSection('products', 'إدارة المنتجات'); await loadProducts(); loadDashboard();
    } catch (err) { toast(err.message, true); } finally { busy.edit = false; setBusy(btn, false, 'حفظ التعديلات'); }
  }
  async function toggleProduct(id) {
    var p = products.find(function (x) { return x.id === id; }); if (!p || busy['t' + id]) return; busy['t' + id] = true;
    try { var r = (await api('PATCH', 'products', { id: id, body: { active: !p.active }, returning: true })).data; if (!r || !r.length) throw new Error('لم يتم التحديث.'); toast(p.active ? 'تم تعطيل المنتج' : 'تم تفعيل المنتج'); await loadProducts(); loadDashboard(); }
    catch (e) { toast(e.message, true); } finally { busy['t' + id] = false; }
  }
  async function deleteProduct(id) {
    var p = products.find(function (x) { return x.id === id; }); if (!p || busy['d' + id]) return;
    if (!confirm('حذف المنتج «' + p.name + '» نهائياً؟\nالطلبات السابقة تحتفظ بنسخة من بياناته. (للإخفاء المؤقت استخدم «تعطيل».)')) return;
    busy['d' + id] = true;
    try { var r = (await api('DELETE', 'products', { id: id, returning: true })).data; if (!r || !r.length) throw new Error('لم يتم الحذف.'); toast('تم حذف المنتج'); await loadProducts(); loadDashboard(); }
    catch (e) { toast(e.message, true); } finally { busy['d' + id] = false; }
  }

  /* ---------- categories ---------- */
  async function loadCategories() {
    try {
      categories = (await api('GET', 'categories?select=*&order=sort_order.asc')).data || [];
      if (categories[0]) catCols = Object.keys(categories[0]);
      var grid = $('categoriesGrid');
      grid.innerHTML = categories.length ? categories.map(function (c) {
        var img = safeImg(c.image);
        return '<div class="category-card glass">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<div style="height:120px;background:var(--gb);border-radius:12px"></div>') +
          '<div class="cat-card-info"><h3>' + esc(c.name) + ' <small style="color:var(--ts)">' + esc(c.name_en || '') + '</small></h3><p style="font-size:13px;color:var(--td)">' + esc(c.description || '') + '</p></div>' +
          '<div style="display:flex;gap:8px;padding:0 16px 16px"><button type="button" class="btn-edit" data-act="edit-cat" data-id="' + c.id + '">تعديل</button><button type="button" class="btn-danger" data-act="delete-cat" data-id="' + c.id + '">حذف</button></div></div>';
      }).join('') : '<div class="empty-state"><p>لا توجد تصنيفات</p></div>';
    } catch (e) { toast(e.message, true); }
  }
  function editCategory(id) {
    var c = categories.find(function (x) { return x.id === id; }); if (!c) return;
    $('catEditId').value = id; $('catName').value = c.name; $('catNameEn').value = c.name_en || ''; $('catDescription').value = c.description || '';
    var u = safeImg(c.image); $('catPreviewImg').src = u; $('catPlaceholder').style.display = u ? 'none' : ''; $('catPreview').style.display = u ? 'block' : 'none';
    $('categoryFormWrapper').style.display = '';
  }
  async function saveCategory(e) {
    e.preventDefault(); if (busy.cat) return; busy.cat = true;
    try {
      var editId = $('catEditId').value, img = $('catPreviewImg').getAttribute('src');
      var data = { name: $('catName').value.trim(), name_en: $('catNameEn').value.trim(), description: $('catDescription').value.trim(), image: safeImg(img) || null };
      if (!data.name || data.name.length > 80) throw new Error('اسم التصنيف غير صحيح.');
      Object.keys(data).forEach(function (k) { if (catCols.indexOf(k) === -1) delete data[k]; });   // only columns that exist
      var res;
      if (editId) res = (await api('PATCH', 'categories', { id: parseInt(editId, 10), body: data, returning: true })).data;
      else { data.sort_order = categories.length + 1; data.active = true; res = (await api('POST', 'categories', { body: data, returning: true })).data; }
      if (!res || !res.length) throw new Error('لم يتم الحفظ.');
      toast('تم الحفظ'); $('categoryFormWrapper').style.display = 'none'; e.target.reset(); await loadCategories();
    } catch (err) { toast(err.message, true); } finally { busy.cat = false; }
  }
  async function deleteCategory(id) {
    var c = categories.find(function (x) { return x.id === id; }); if (!c || !confirm('حذف التصنيف «' + c.name + '»؟')) return;
      try { var r = (await api('DELETE', 'categories', { id: id, returning: true })).data; if (!r || !r.length) throw new Error('لم يتم الحذف.'); toast('تم الحذف'); await loadCategories(); } catch (e) { toast(e.message, true); }
  }

  /* ---------- orders ---------- */
  function cleanQ(q) { return String(q || '').replace(/[^\p{L}\p{N}\s+]/gu, '').trim().slice(0, 40); }
  async function loadOrders() {
    if (orderState.loading) return; orderState.loading = true;
    var el = $('ordersList');
    try {
      var q = cleanQ(orderState.q), path = 'orders?select=id,customer,phone,wilaya,commune,delivery,note,items,subtotal,shipping,total,status,created_at,status_changed_at&order=created_at.desc&limit=' + orderState.size + '&offset=' + (orderState.page * orderState.size);
      if (orderState.status) path += '&status=eq.' + encodeURIComponent(orderState.status);
      if (q) path += /^[0-9]+$/.test(q) && q.length < 9 ? '&id=eq.' + q : '&or=(' + 'customer.ilike.*' + encodeURIComponent(q) + '*,phone.ilike.*' + encodeURIComponent(q) + '*)';
      var res = await api('GET', path, { count: true });
      orderState.total = res.count || 0;
      var orders = res.data || [];
      el.innerHTML = orders.length ? orders.map(orderCard).join('') : '<div class="empty-state"><p>لا توجد طلبات مطابقة</p></div>';
      var pages = Math.max(1, Math.ceil(orderState.total / orderState.size));
      $('ordersPager').innerHTML = '<button type="button" class="btn-cancel" data-act="orders-prev"' + (orderState.page === 0 ? ' disabled' : '') + '>السابق</button><span style="margin:0 14px">' + (orderState.page + 1) + ' / ' + pages + ' (' + num(orderState.total) + ')</span><button type="button" class="btn-cancel" data-act="orders-next"' + (orderState.page + 1 >= pages ? ' disabled' : '') + '>التالي</button>';
    } catch (e) { toast(e.message, true); el.innerHTML = '<div class="empty-state"><p>تعذر تحميل الطلبات</p></div>'; }
    finally { orderState.loading = false; }
  }
  function orderCard(o) {
    var items = Array.isArray(o.items) ? o.items : [];
    var itemsHtml = items.map(function (it) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(128,128,128,.15)"><div style="flex:1"><div style="font-weight:600;font-size:14px">' + esc(it.name || 'منتج') + '</div><div style="font-size:12px;color:var(--ts)">' + (it.size ? 'المقاس: ' + esc(it.size) + ' · ' : '') + 'الكمية: ' + esc(parseInt(it.qty, 10) || 1) + '</div></div><div style="font-weight:600">' + num(it.price) + ' دج</div></div>';
    }).join('');
    var acts = (NEXT[o.status] || []).map(function (s) {
      return '<button type="button" class="' + (s === 'cancelled' ? 'btn-danger' : 'btn-save') + '" style="padding:6px 12px;font-size:12px" data-act="order-status" data-id="' + o.id + '" data-from="' + esc(o.status) + '" data-to="' + s + '">' + ACTION[s] + '</button>';
    }).join('');
    if (o.status === 'cancelled') acts += '<button type="button" class="btn-danger" style="padding:6px 12px;font-size:12px" data-act="order-delete" data-id="' + o.id + '">حذف</button>';
    return '<div class="order-card" style="margin-bottom:16px;padding:20px;border-radius:16px;background:rgba(128,128,128,.07);border:1px solid rgba(128,128,128,.18)">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px"><div>' +
      '<h4 style="font-size:16px;margin-bottom:4px">#' + esc(o.id) + ' — ' + esc(o.customer) + '</h4>' +
      '<p style="font-size:13px;color:var(--ts)"><a href="tel:' + esc(o.phone) + '" style="color:inherit">' + esc(o.phone) + '</a> · ' + esc(o.wilaya) + (o.commune ? ' · ' + esc(o.commune) : '') + '</p>' +
      '<p style="font-size:12px;color:var(--ts);margin-top:2px">' + (o.delivery === 'home' ? 'توصيل للباب' : 'استلام من المكتب') + ' (+' + num(o.shipping != null ? o.shipping : (o.delivery === 'home' ? 700 : 600)) + ' دج)</p>' +
      '<p style="font-size:11px;color:var(--ts);margin-top:4px">أُنشئ: ' + esc(fdate(o.created_at)) + (o.status_changed_at ? ' · آخر تغيير حالة: ' + esc(fdate(o.status_changed_at)) : '') + '</p></div>' +
      '<div style="text-align:end"><div style="font-size:20px;font-weight:700">' + num(o.total) + ' دج</div>' +
      '<div style="margin-top:6px"><span style="padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;color:#fff;background:' + (COLORS[o.status] || '#888') + '">' + esc(STATUS[o.status] || o.status) + '</span></div></div></div>' +
      (itemsHtml ? '<div style="margin-bottom:10px">' + itemsHtml + '</div>' : '') +
      (o.note ? '<div style="font-size:12px;color:var(--ts);padding:8px 12px;background:rgba(128,128,128,.08);border-radius:8px;margin-bottom:10px">ملاحظة: ' + esc(o.note) + '</div>' : '') +
      (acts ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' + acts + '</div>' : '') + '</div>';
  }
  async function changeStatus(id, from, to, btn) {
    var key = 's' + id; if (busy[key]) return;
    if (!NEXT[from] || NEXT[from].indexOf(to) === -1) return toast('انتقال الحالة غير مسموح.', true);
    var msg = to === 'cancelled' ? 'إلغاء الطلب #' + id + '؟ لا يمكن التراجع.' : (to === 'confirmed' ? 'تأكيد الطلب #' + id + ' بعد التواصل مع الزبون؟' : 'تغيير حالة الطلب #' + id + ' إلى «' + STATUS[to] + '»؟');
    if (!confirm(msg)) return;
    busy[key] = true; if (btn) btn.disabled = true;
    try {
      // Only applies if the order is STILL in `from` (protects against two admins / stale screens).
      var rows = (await api('PATCH', 'orders?id=eq.' + id, { body: { status: to }, from: from, returning: true })).data;
      if (!rows || !rows.length) toast('الحالة تغيّرت من مكان آخر — تم تحديث القائمة.', true); else toast('تم تحديث حالة الطلب');
    } catch (e) { toast(e.message, true); } finally { busy[key] = false; await loadOrders(); loadDashboard(); }
  }
  async function deleteOrder(id) {
    if (busy['od' + id] || !confirm('حذف الطلب الملغي #' + id + ' نهائياً؟')) return; busy['od' + id] = true;
    try { var r = (await api('DELETE', 'orders', { id: id, returning: true })).data; if (!r || !r.length) throw new Error('يمكن حذف الطلبات الملغاة فقط.'); toast('تم حذف الطلب'); }
    catch (e) { toast(e.message, true); } finally { busy['od' + id] = false; await loadOrders(); loadDashboard(); }
  }

  /* ---------- Cloudinary upload (validated) ---------- */
  var uploading = 0, MAX_UPLOAD = 8 * 1024 * 1024, OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  function resizeForUpload(file, maxW, q) {
    return new Promise(function (resolve) {
      if (file.size <= 800 * 1024) return resolve(file);
      var rd = new FileReader();
      rd.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var s = Math.min(1, maxW / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) { resolve(b ? new File([b], 'upload.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', q);
        };
        img.onerror = function () { resolve(file); }; img.src = ev.target.result;
      };
      rd.onerror = function () { resolve(file); }; rd.readAsDataURL(file);
    });
  }
  async function uploadImage(file) {
    if (OK_TYPES.indexOf(file.type) === -1) throw new Error('نوع الملف غير مسموح (JPG أو PNG أو WebP فقط).');
    if (file.size > MAX_UPLOAD) throw new Error('حجم الصورة كبير (الحد 8 ميغابايت).');
    var fd = new FormData(); fd.append('file', await resizeForUpload(file, 1800, 0.82)); fd.append('upload_preset', C.CLOUDINARY_PRESET); fd.append('folder', 'urdrip');
    var r = await rawFetch('https://api.cloudinary.com/v1_1/' + C.CLOUDINARY_CLOUD + '/image/upload', { method: 'POST', body: fd }, 60000);
    var d = await r.json().catch(function () { return {}; });
    if (!d.secure_url) throw new Error('فشل رفع الصورة.');
    return d.secure_url;
  }
  function initUpload(areaId, fileId, previewId, placeholderId) {
    var area = $(areaId), input = $(fileId), prev = $(previewId), ph = $(placeholderId); if (!area || !input) return;
    area.addEventListener('click', function () { input.click(); });
    area.addEventListener('dragover', function (e) { e.preventDefault(); });
    area.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) go(e.dataTransfer.files[0]); });
    input.addEventListener('change', function () { if (input.files[0]) go(input.files[0]); input.value = ''; });
    async function go(file) {
      uploading++; area.style.opacity = '.5';
      try { var url = await uploadImage(file); var im = prev.querySelector('img'); if (im) im.src = url; ph.style.display = 'none'; prev.style.display = 'block'; }
      catch (e) { toast(e.message, true); } finally { uploading--; area.style.opacity = '1'; }
    }
  }
  function resetUploads() { for (var i = 1; i <= 3; i++) { var ph = $('uploadPlaceholder' + i), pv = $('uploadPreview' + i), im = $('previewImg' + i); if (ph) ph.style.display = ''; if (pv) pv.style.display = 'none'; if (im) im.removeAttribute('src'); } }

  /* ---------- navigation / wiring ---------- */
  function showSection(id, title) {
    document.querySelectorAll('.admin-section').forEach(function (s) { s.classList.remove('active'); }); $(id).classList.add('active'); $('pageTitle').textContent = title;
    document.querySelectorAll('.sidebar-link[data-section]').forEach(function (l) { l.classList.toggle('active', l.dataset.section === id); });
    $('sidebar').classList.remove('active');
    if (id === 'orders') loadOrders(); if (id === 'dashboard') loadDashboard();
    if (id === 'reorder') { if (!orderList.length) orderList = products.slice(); renderOrder(); }
  }
  async function refreshAll() { await Promise.all([loadProducts(), loadCategories()]); await loadDashboard(); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act'), id = parseInt(b.getAttribute('data-id'), 10);
    if (a === 'edit-product') openEdit(id); else if (a === 'toggle-product') toggleProduct(id); else if (a === 'delete-product') deleteProduct(id);
    else if (a === 'edit-cat') editCategory(id); else if (a === 'delete-cat') deleteCategory(id);
    else if (a === 'order-status') changeStatus(id, b.getAttribute('data-from'), b.getAttribute('data-to'), b);
    else if (a === 'order-delete') deleteOrder(id);
    else if (a === 'orders-prev') { orderState.page = Math.max(0, orderState.page - 1); loadOrders(); }
    else if (a === 'orders-next') { orderState.page++; loadOrders(); }
  });
  document.addEventListener('DOMContentLoaded', function () {
    var titles = { dashboard: 'لوحة التحكم', products: 'إدارة المنتجات', 'add-product': 'إضافة منتج جديد', 'edit-product': 'تعديل المنتج', categories: 'التصنيفات', orders: 'الطلبات', settings: 'الإعدادات', reorder: 'ترتيب المنتجات' };
    document.querySelectorAll('.sidebar-link[data-section]').forEach(function (l) { l.addEventListener('click', function (e) { e.preventDefault(); showSection(l.dataset.section, titles[l.dataset.section]); }); });
    $('sidebarToggle').addEventListener('click', function () { $('sidebar').classList.toggle('active'); });
    $('loginBtn').addEventListener('click', login);
    $('reorderBtn').addEventListener('click', openReorder);
    $('saveOrderBtn').addEventListener('click', saveOrder);
    $('cancelOrderBtn').addEventListener('click', function () { showSection('products', 'إدارة المنتجات'); });
    initReorder();
    ['lockEmail', 'lockPass'].forEach(function (i) { $(i).addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); }); });
    document.querySelectorAll('[data-logout]').forEach(function (b) { b.addEventListener('click', function () { logout(); }); });
    $('searchProducts').addEventListener('input', function () { renderProducts(this.value); });
    var t; $('orderSearch').addEventListener('input', function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { orderState.q = v; orderState.page = 0; loadOrders(); }, 350); });
    $('orderStatusFilter').addEventListener('change', function () { orderState.status = this.value; orderState.page = 0; loadOrders(); });
    $('addProductBtn').addEventListener('click', function () { showSection('add-product', titles['add-product']); });
    $('cancelProduct').addEventListener('click', function () { $('productForm').reset(); resetUploads(); showSection('products', titles.products); });
    $('cancelEdit').addEventListener('click', function () { showSection('products', titles.products); });
    $('productForm').addEventListener('submit', createProduct); $('editProductForm').addEventListener('submit', saveEdit); $('categoryForm').addEventListener('submit', saveCategory);
    $('addCategoryBtn').addEventListener('click', function () { $('catEditId').value = ''; $('categoryForm').reset(); $('catPlaceholder').style.display = ''; $('catPreview').style.display = 'none'; $('categoryFormWrapper').style.display = ''; });
    $('cancelCategory').addEventListener('click', function () { $('categoryFormWrapper').style.display = 'none'; $('categoryForm').reset(); });
    [['imageUpload1', 'pImage1', 'uploadPreview1', 'uploadPlaceholder1'], ['imageUpload2', 'pImage2', 'uploadPreview2', 'uploadPlaceholder2'], ['imageUpload3', 'pImage3', 'uploadPreview3', 'uploadPlaceholder3'],
     ['editImageUpload1', 'editImage1', 'editPreview1', 'editPlaceholder1'], ['editImageUpload2', 'editImage2', 'editPreview2', 'editPlaceholder2'], ['editImageUpload3', 'editImage3', 'editPreview3', 'editPlaceholder3'],
     ['catImageUpload', 'catImage', 'catPreview', 'catPlaceholder']].forEach(function (a) { initUpload.apply(null, a); });
    document.querySelectorAll('.remove-img').forEach(function (btn) { btn.addEventListener('click', function (e) { e.stopPropagation(); $(btn.dataset.preview).style.display = 'none'; $(btn.dataset.placeholder).style.display = ''; var im = $(btn.dataset.preview).querySelector('img'); if (im) im.removeAttribute('src'); }); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && session) loadDashboard(); });
    loadSession();
    if (session) { api('POST', 'rpc/admin_dashboard_stats', { body: {} }).then(enter).catch(function () { logout(true); }); }
  });
})();
