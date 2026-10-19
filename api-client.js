/* URDRIP — frontend API client.
 *
 * Two transports, same interface:
 *   1. /api/*  — the server-side proxy (production + `npm run dev`).
 *                No Supabase key in the browser.
 *   2. direct  — used ONLY when the page is opened from the filesystem
 *                (file://) and no server exists. It reads the credentials
 *                from config.local.js, which is never deployed.
 */
(function (global) {
  'use strict';
  var BASE = (global.URDRIP && global.URDRIP.API_BASE) || '/api';

  /* ---------- local fallback (file:// only) ---------- */
  var LOCAL = null;
  var localReady = (function () {
    if (global.location && global.location.protocol !== 'file:') return Promise.resolve(null);
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'config.local.js';
      s.async = false;
      s.onload = function () { resolve(global.URDRIP_LOCAL || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  })();

  function localCfg() {
    return localReady.then(function (c) { LOCAL = c; return c; });
  }

  function url(path, params) {
    /* /products  ->  /api?r=products   (نقطة واحدة على Vercel: /api) */
    var clean = String(path).replace(/^\/+/, '');
    var q = 'r=' + encodeURIComponent(clean);
    if (params) {
      for (var k in params) {
        if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
        if (params[k] === undefined || params[k] === null || params[k] === '') continue;
        q += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }
    }
    return BASE + '?' + q;
  }

  function parse(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return { message: text }; }
  }

  /* The proxy paths are mapped onto the matching Supabase REST calls. */
  var LIST_SELECT = 'id,name,category,price,old_price,color,sizes,image,badge,description,stock,active,created_at';
  var FULL_SELECT = 'id,name,category,price,old_price,color,sizes,image,images,badge,description,stock,active,created_at';

  function toSupabase(path, opts) {
    var p = String(path);
    if (p === '/products') {
      var id = opts && opts.params && opts.params.id;
      if (id) return { path: 'products?select=' + FULL_SELECT + '&id=eq.' + encodeURIComponent(id) + '&active=eq.true' };
      return { path: 'products?select=' + LIST_SELECT + '&active=eq.true&order=created_at.desc' };
    }
    if (p === '/categories') {
      return { path: 'categories?select=id,name,description,sort_order,active&active=eq.true&order=sort_order.asc' };
    }
    if (p === '/order') return { path: 'rpc/place_order' };
    return null;   /* auth + admin need the server */
  }

  /* Calls Supabase REST directly with the local (anon) key. */
  function direct(path, opts) {
    opts = opts || {};
    var mapped = toSupabase(path, opts);
    if (!mapped) return Promise.resolve(null);
    return localCfg().then(function (cfg) {
      if (!cfg || !cfg.SUPABASE_ANON_KEY) return null;
      var target = cfg.SUPABASE_URL + '/rest/v1/' + mapped.path;
      var init = {
        method: opts.method || 'GET',
        headers: {
          apikey: cfg.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY
        },
        cache: 'no-store'
      };
      if (opts.body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }
      return fetch(target, init).then(function (r) {
        return r.text().then(function (t) {
          var data = parse(t);
          if (!r.ok) {
            var err = new Error((data && (data.message || data.error)) || ('http_' + r.status));
            err.status = r.status; err.data = data; throw err;
          }
          if (data && typeof data === 'object') data.__count = null;
          return data;
        });
      });
    });
  }

  function request(path, opts) {
    opts = opts || {};
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 20000);
    var init = { method: opts.method || 'GET', headers: {}, cache: 'no-store', signal: ctrl.signal };
    if (opts.token) init.headers.Authorization = 'Bearer ' + opts.token;
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url(path, opts.params), init).then(function (r) {
      clearTimeout(timer);
      var cr = r.headers.get('Content-Range');
      return r.text().then(function (t) {
        var data = parse(t);
        if (!r.ok) {
          var err = new Error((data && (data.message || data.error)) || ('http_' + r.status));
          err.status = r.status;
          err.data = data;
          throw err;
        }
        if (data && typeof data === 'object') {
          var m = cr && /\/(\d+)$/.exec(cr);
          data.__count = m ? parseInt(m[1], 10) : null;
        }
        return data;
      });
    }).catch(function (e) {
      clearTimeout(timer);
      if (e && e.status) throw e;
      /* The proxy is unreachable -> fall back to a direct call (file:// mode). */
      return direct(path, opts).then(function (data) {
        if (data === null) {
          var err2 = new Error((e && e.name === 'AbortError') ? 'timeout' : 'api_unavailable');
          err2.status = 0; throw err2;
        }
        return data;
      }).catch(function (e2) {
        if (e2 && e2.status) throw e2;
        var err3 = new Error('api_unavailable'); err3.status = 0; throw err3;
      });
    });
  }

  global.URDRIP_API = {
    base: BASE,
    url: url,
    request: request,

    /* ---------- public ---------- */
    products: function () { return request('/products'); },
    product: function (id) { return request('/products', { params: { id: id } }); },
    categories: function () { return request('/categories'); },
    placeOrder: function (body) { return request('/order', { method: 'POST', body: body }); },

    /* ---------- auth ---------- */
    login: function (email, password) { return request('/auth', { method: 'POST', body: { action: 'login', email: email, password: password } }); },
    refreshSession: function (refresh_token) { return request('/auth', { method: 'POST', body: { action: 'refresh', refresh_token: refresh_token } }); },
    logoutSession: function (access_token) { return request('/auth', { method: 'POST', body: { action: 'logout', access_token: access_token } }); },

    /* ---------- admin (authenticated) ---------- */
    db: function (opts) {
      opts = opts || {};
      var params = { table: opts.table };
      if (opts.action) params.action = opts.action;
      if (opts.id !== undefined && opts.id !== null && opts.id !== '') params.id = opts.id;
      if (opts.from) params.from = opts.from;
      if (opts.q) params.q = opts.q;
      if (opts.status) params.status = opts.status;
      if (opts.limit) params.limit = opts.limit;
      if (opts.offset) params.offset = opts.offset;
      return request('/db', { method: opts.method || 'GET', token: opts.token, body: opts.body, params: params });
    },
    rpc: function (fn, body, token) {
      return request('/db', { method: 'POST', token: token, body: body || {}, params: { fn: fn } });
    }
  };
})(window);
