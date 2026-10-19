/* URDRIP — checkout (v10). Orders are created ONLY through /api/order, which
 * calls the place_order() RPC: prices/totals are computed on the server; the
 * browser sends product ids, sizes and qty only. No API key in the page. */
'use strict';
(function () {
  var API = window.URDRIP_API;
  var KEY_STORE = 'urdrip_order_attempt';
  var submitting = false;

  function esc(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function safeUrl(u) { u = String(u || ''); return /^https:\/\//i.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u) ? u : ''; }
  function price(n) { return (parseInt(n, 10) || 0).toLocaleString('en-US'); }
  function getCart() { try { var c = JSON.parse(localStorage.getItem('urdrip_cart') || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function saveCart(c) { localStorage.setItem('urdrip_cart', JSON.stringify(c)); }
  function getDelivery() { var r = document.querySelector('input[name="delivery"]:checked'); return r ? r.value : 'home'; }
  function shippingFor(d) { return d === 'home' ? 700 : 600; }   // display only; server is authoritative

  var ERR = {
    invalid_name: 'الرجاء إدخال اسم صحيح.', invalid_phone: 'رقم الهاتف غير صحيح (مثال: 0555 12 34 56).',
    invalid_wilaya: 'الرجاء اختيار الولاية.', invalid_commune: 'الرجاء إدخال البلدية.',
    invalid_delivery: 'طريقة التوصيل غير صحيحة.', invalid_note: 'الملاحظة طويلة جداً.',
    invalid_items: 'السلة غير صالحة. أعد إضافة المنتجات من المتجر.', invalid_size: 'المقاس المختار غير متوفر.',
    product_unavailable: 'أحد المنتجات لم يعد متوفراً. أعد إضافة المنتجات من المتجر.',
    out_of_stock: 'نفدت الكمية لأحد المنتجات. عدّل الكمية أو أزل المنتج.',
    rate_limited: 'تم إرسال عدد كبير من الطلبات بهذا الرقم. حاول لاحقاً أو تواصل معنا.',
    invalid_request: 'تعذر إرسال الطلب. أعد المحاولة.'
  };
  function showError(msg) {
    var el = document.getElementById('formError');
    if (!el) {
      el = document.createElement('div'); el.id = 'formError'; el.setAttribute('role', 'alert');
      el.style.cssText = 'margin:12px 0;padding:12px 14px;border-radius:14px;background:rgba(255,45,85,.08);color:#c7000f;border:1px solid rgba(255,45,85,.20);font-size:14px;line-height:1.6';
      var btn = document.getElementById('confirmBtn'); btn.parentNode.insertBefore(el, btn);
    }
    el.textContent = msg; el.style.display = 'block';
  }
  function clearError() { var el = document.getElementById('formError'); if (el) el.style.display = 'none'; }

  function renderCart() {
    var cart = getCart(), itemsEl = document.getElementById('cartItems'),
        summaryEl = document.getElementById('cartSummary'), formEl = document.getElementById('checkoutForm');
    if (!cart.length) {
      itemsEl.innerHTML = '<div class="cart-empty"><h3>سلتك فاضية</h3><p><a href="index.html#collection">ارجع للمتجر واختار منتجات</a></p></div>';
      summaryEl.style.display = 'none'; formEl.style.display = 'none'; return;
    }
    itemsEl.innerHTML = cart.map(function (item, i) {
      var img = safeUrl(item.image);
      return '<div class="cart-item"><div class="cart-item-img">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(item.name) + '" loading="lazy">' : '') + '</div>' +
        '<div class="cart-item-info"><div class="cart-item-name">' + esc(item.name) + '</div>' +
        '<div class="cart-item-meta">' + (item.size ? 'المقاس: ' + esc(item.size) : '') + '</div>' +
        '<div class="cart-item-qty"><button type="button" class="qty-btn" data-act="dec" data-i="' + i + '" aria-label="إنقاص">−</button>' +
        '<span class="qty-num">' + (parseInt(item.qty, 10) || 1) + '</span>' +
        '<button type="button" class="qty-btn" data-act="inc" data-i="' + i + '" aria-label="زيادة">+</button></div></div>' +
        '<div style="text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:8px"><div class="cart-item-price">' +
        price((parseInt(item.price, 10) || 0) * (parseInt(item.qty, 10) || 1)) + ' دج</div>' +
        '<button type="button" class="cart-item-remove" data-act="rm" data-i="' + i + '" aria-label="حذف">×</button></div></div>';
    }).join('');
    var sub = cart.reduce(function (s, it) { return s + (parseInt(it.price, 10) || 0) * (parseInt(it.qty, 10) || 1); }, 0);
    var ship = shippingFor(getDelivery());
    summaryEl.style.display = 'block'; formEl.style.display = 'block';
    summaryEl.innerHTML = '<div class="summary-row"><span>المجموع الفرعي (تقديري)</span><span>' + price(sub) + ' دج</span></div>' +
      '<div class="summary-row"><span>الشحن (' + (getDelivery() === 'home' ? 'للباب' : 'المكتب') + ')</span><span>' + price(ship) + ' دج</span></div>' +
      '<div class="summary-row total"><span>المجموع</span><span>' + price(sub + ship) + ' دج</span></div>';
  }

  function normPhone(p) {
    p = String(p || '').replace(/[\s().-]/g, '');
    if (p.indexOf('+213') === 0) p = '0' + p.slice(4); else if (p.indexOf('00213') === 0) p = '0' + p.slice(5);
    return p;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  /* One idempotency key per distinct payload: retries of the SAME order reuse it
   * (server returns the existing order); a changed cart/form gets a fresh key. */
  function keyFor(payload) {
    var sig = JSON.stringify(payload);
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY_STORE) || 'null');
      if (s && s.sig === sig && s.key) return s.key;
      var k = uuid(); sessionStorage.setItem(KEY_STORE, JSON.stringify({ sig: sig, key: k })); return k;
    } catch (e) { return uuid(); }
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Network/timeout/5xx => retry with the SAME key (safe thanks to idempotency).
   * 4xx business errors are final and shown to the customer. */
  async function callPlaceOrder(body) {
    var lastErr;
    for (var attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(attempt * 1200);
      try {
        var data = await API.placeOrder(body);
        return data;
      } catch (e) {
        var st = e && e.status;
        var msg = '';
        if (e && e.data && e.data.message) msg = String(e.data.message);
        if (st && st >= 400 && st < 500 && st !== 429) {
          throw { final: true, message: ERR[msg] || 'تعذر إرسال الطلب. تحقق من البيانات وأعد المحاولة.' };
        }
        lastErr = e;
      }
    }
    throw { final: false, message: 'تعذر الاتصال بالخادم. لم نتأكد من استلام طلبك — الرجاء الضغط على الزر مرة أخرى (لن يتكرر الطلب).' };
  }

  async function submitOrder() {
    if (submitting) return;
    clearError();
    var name = document.getElementById('cName').value.trim();
    var phone = normPhone(document.getElementById('cPhone').value);
    var wilaya = document.getElementById('cWilaya').value;
    var commune = document.getElementById('cCommune').value.trim();
    var note = document.getElementById('cNote').value.trim();
    var delivery = getDelivery();
    if (name.length < 2) return showError(ERR.invalid_name);
    if (!/^0[5-7][0-9]{8}$/.test(phone)) return showError(ERR.invalid_phone);
    if (!wilaya) return showError(ERR.invalid_wilaya);
    if (commune.length < 2) return showError(ERR.invalid_commune);
    if (note.length > 500) return showError(ERR.invalid_note);
    var cart = getCart();
    if (!cart.length) return showError(ERR.invalid_items);
    var items = [];
    for (var i = 0; i < cart.length; i++) {
      var id = parseInt(cart[i].id, 10), q = parseInt(cart[i].qty, 10) || 1;
      if (!id || q < 1 || q > 10) return showError(ERR.invalid_items);
      items.push({ id: id, size: cart[i].size || null, qty: q });
    }
    var body = { p_customer: name, p_phone: phone, p_wilaya: wilaya, p_commune: commune, p_delivery: delivery, p_note: note || null, p_items: items };
    body.p_idempotency_key = keyFor(body);

    var btn = document.getElementById('confirmBtn');
    submitting = true; btn.disabled = true; btn.textContent = 'جاري إرسال الطلب...';
    try {
      var res = await callPlaceOrder(body);
      try { sessionStorage.removeItem(KEY_STORE); } catch (e) {}
      localStorage.removeItem('urdrip_cart');
      showSuccess(cart, res);
    } catch (e) {
      showError((e && e.message) || 'حدث خطأ غير متوقع.');
      btn.disabled = false; btn.textContent = 'تأكيد الطلب';
    } finally { submitting = false; }
  }

  /* Honest wording: the order is RECEIVED and PENDING; it is confirmed only when staff confirm it. */
  function showSuccess(cart, res) {
    var box = document.querySelector('.success-box');
    box.querySelector('h2').textContent = 'تم استلام طلبك';
    box.querySelector('p').innerHTML = 'رقم الطلب: <strong>#' + esc(res.order_id) + '</strong><br>الحالة: <strong>قيد انتظار التأكيد</strong> — سنتصل بك هاتفياً لتأكيد الطلب قبل الشحن.';
    var d = getDelivery();
    var html = cart.map(function (it) { return '<div class="success-item"><span>' + esc(it.name) + (it.size ? ' (' + esc(it.size) + ')' : '') + ' × ' + (parseInt(it.qty, 10) || 1) + '</span></div>'; }).join('');
    html += '<div class="success-item"><span>' + (d === 'home' ? 'توصيل للباب' : 'استلام من المكتب') + '</span><span>' + price(res.shipping) + ' دج</span></div>';
    html += '<div class="success-total">المجموع: ' + price(res.total) + ' دج</div>';
    document.getElementById('successItems').innerHTML = html;
    document.getElementById('successOverlay').classList.add('open');
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
    var c = getCart(), i = parseInt(b.getAttribute('data-i'), 10); if (!c[i]) return;
    var a = b.getAttribute('data-act');
    if (a === 'rm') c.splice(i, 1);
    else { c[i].qty = Math.min(10, (parseInt(c[i].qty, 10) || 1) + (a === 'inc' ? 1 : -1)); if (c[i].qty <= 0) c.splice(i, 1); }
    saveCart(c); renderCart();
  });
  document.getElementById('confirmBtn').removeAttribute('onclick');
  document.getElementById('confirmBtn').addEventListener('click', submitOrder);
  document.querySelectorAll('input[name="delivery"]').forEach(function (r) { r.addEventListener('change', renderCart); });
  renderCart();
})();
