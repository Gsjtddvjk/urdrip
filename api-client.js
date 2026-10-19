/* URDRIP — frontend API client.
 * All database traffic goes through the same-origin /api proxy, so no Supabase
 * key is ever present in the page source. */
(function (global) {
  'use strict';
  var BASE = (global.URDRIP && global.URDRIP.API_BASE) || '/api';

  function url(path, params) {
    var q = '';
    if (params) {
      var parts = [];
      for (var k in params) {
        if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
        if (params[k] === undefined || params[k] === null || params[k] === '') continue;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
      if (parts.length) q = '?' + parts.join('&');
    }
    return BASE + path + q;
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
        var data = null;
        if (t) { try { data = JSON.parse(t); } catch (e) { data = { message: t }; } }
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
      /* The API proxy is missing or unreachable (e.g. the page was opened as a
       * local file, or the site was deployed without the /api functions). */
      var msg = (e && e.name === 'AbortError') ? 'timeout' : 'api_unavailable';
      var err2 = new Error(msg); err2.status = 0; throw err2;
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
      var path = '/db?table=' + encodeURIComponent(opts.table);
      if (opts.id !== undefined && opts.id !== null && opts.id !== '') path += '&id=' + encodeURIComponent(opts.id);
      if (opts.from) path += '&from=' + encodeURIComponent(opts.from);
      if (opts.q) path += '&q=' + encodeURIComponent(opts.q);
      if (opts.status) path += '&status=' + encodeURIComponent(opts.status);
      if (opts.limit) path += '&limit=' + encodeURIComponent(opts.limit);
      if (opts.offset) path += '&offset=' + encodeURIComponent(opts.offset);
      return request(path, { method: opts.method || 'GET', token: opts.token, body: opts.body });
    },
    rpc: function (fn, body, token) {
      return request('/db?fn=' + encodeURIComponent(fn), { method: 'POST', token: token, body: body || {} });
    }
  };
})(window);
