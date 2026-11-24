/* Arroz en Caja · conexión con el servidor (Supabase) para la versión de GitHub Pages.
   - Solo actúa fuera de Claude y si config.js trae la dirección del servidor y la clave pública.
   - Sin dependencias: habla con la API de Supabase con fetch.
   - Ofrece a la web y al panel la misma interfaz de datos que dentro de Claude (window.claude: db y user),
     más window.AEC_AUTH para entrar con correo + contraseña + código del autenticador.
   - La clave que lleva esta web es PÚBLICA por diseño. Lo que protege los datos son las reglas del servidor
     (backend/001_arroz_en_caja.sql): solo el administrador con segundo factor lee pedidos y cambia contenido. */
(function () {
  'use strict';
  if (window.claude) return;
  var C = window.AEC_BACKEND || {};
  if (!C.url || !C.key || /^PEGA|^TU-|example/i.test(C.url + C.key)) return;
  var BASE = String(C.url).replace(/\/+$/, ''), KEY = String(C.key);
  var SKEY = 'aec_sb_v1', VKEY = 'aec_vid', REM_DAYS = 14;

  /* ---------- almacenamiento (puede no existir: se degrada sin romper) ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* noop */ } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* noop */ } }

  /* ---------- identificador del visitante (largo y aleatorio: es su "llave" de pedidos) ---------- */
  var memVid = null;
  function visitorId() {
    var v = lsGet(VKEY) || memVid;
    if (!v || !/^[A-Za-z0-9_-]{16,64}$/.test(v)) {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      v = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      lsSet(VKEY, v); memVid = v;
    }
    return v;
  }

  /* ---------- HTTP ---------- */
  function http(path, o) {
    o = o || {};
    var h = { apikey: KEY };
    if (o.body !== undefined) h['Content-Type'] = 'application/json';
    if (o.token) h.Authorization = 'Bearer ' + o.token;
    if (o.prefer) h.Prefer = o.prefer;
    return fetch(BASE + path, { method: o.method || 'GET', headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body), cache: 'no-store' })
      .catch(function () { var e = new Error('sin conexión'); e.status = 0; throw e; })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (x) { j = null; }
          if (!r.ok) {
            var e = new Error((j && (j.msg || j.message || j.error_description)) || ('HTTP ' + r.status));
            e.status = r.status; e.code = j && (j.error_code || j.code); throw e;
          }
          return j;
        });
      });
  }

  /* ---------- sesión (solo se guarda cuando ya pasó el segundo factor) ---------- */
  function jwt(t) {
    try { var p = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); p += '='.repeat((4 - p.length % 4) % 4); return JSON.parse(decodeURIComponent(escape(atob(p)))); } catch (e) { return {}; }
  }
  function readSession() {
    var raw = ssGet(SKEY) || lsGet(SKEY); if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || !s.refresh_token || !s.access_token) return null;
      if (s.until && s.until < Date.now()) { ssDel(SKEY); lsDel(SKEY); return null; }
      return s;
    } catch (e) { return null; }
  }
  var SES = readSession();
  function persist() {
    if (!SES) { ssDel(SKEY); lsDel(SKEY); return; }
    if (SES.remember) { lsSet(SKEY, JSON.stringify(SES)); ssDel(SKEY); } else { ssSet(SKEY, JSON.stringify(SES)); lsDel(SKEY); }
  }
  var refreshing = null;
  function accessToken() {
    if (!SES) return Promise.resolve(null);
    if (SES.expires_at * 1000 - Date.now() > 60000) return Promise.resolve(SES.access_token);
    if (!refreshing) {
      var rt = SES.refresh_token;
      refreshing = http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: rt } })
        .then(function (j) { SES = Object.assign({}, SES, { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, user: j.user || SES.user }); persist(); return SES.access_token; })
        .catch(function (e) { if (e.status >= 400 && e.status < 500) { SES = null; OWNER = false; persist(); return null; } return SES ? SES.access_token : null; })
        .then(function (t) { refreshing = null; return t; });
    }
    return refreshing;
  }

  /* ---------- administrador: sesión aal2 (con código) y fila en admins ---------- */
  var OWNER = false, READY = null;
  function ready() {
    if (!READY) {
      READY = (SES ? accessToken() : Promise.resolve(null)).then(function (t) {
        if (!t || jwt(t).aal !== 'aal2') return;
        return http('/rest/v1/admins?select=user_id', { token: t }).then(function (rows) { OWNER = !!(rows && rows.length); });
      }).catch(function () { OWNER = false; });
    }
    return READY;
  }

  /* ---------- documentos ---------- */
  var PRIV = { orders: 1, msgs: 1, leads: 1 };
  function rest(path, o) { o = o || {}; return accessToken().then(function (t) { o.token = t; return http('/rest/v1/' + path, o); }); }
  function getDoc(path) {
    return ready().then(function () {
      var k = path.split('/');
      if (PRIV[k[0]] && k.length === 2 && !OWNER) return http('/rest/v1/rpc/visitor_get', { method: 'POST', body: { p_kind: k[0], p_uid: k[1] } }).then(function (d) { return d == null ? null : d; });
      return rest('docs?select=data&path=eq.' + encodeURIComponent(path)).then(function (rows) { return rows && rows[0] ? rows[0].data : null; });
    });
  }
  function setDoc(path, data) {
    return ready().then(function () {
      var k = path.split('/'), p;
      if ((k[0] === 'orders' || k[0] === 'leads') && k.length === 2 && !OWNER) p = http('/rest/v1/rpc/visitor_save', { method: 'POST', body: { p_kind: k[0], p_uid: k[1], p_data: data } });
      else p = rest('docs?on_conflict=path', { method: 'POST', body: { path: path, data: data }, prefer: 'resolution=merge-duplicates,return=minimal' });
      return p.then(function () { pollNow(path); pollNow(k[0] + '/*'); });
    });
  }
  function delDoc(path) {
    return ready().then(function () {
      return rest('docs?path=eq.' + encodeURIComponent(path), { method: 'DELETE', prefer: 'return=minimal' }).then(function () { pollNow(path); pollNow(path.split('/')[0] + '/*'); });
    });
  }
  function listCol(name) {
    return ready().then(function () {
      return rest('docs?select=path,data&path=like.' + encodeURIComponent(name + '/*')).then(function (rows) {
        return (rows || []).filter(function (r) { return r.path.split('/').length === 2; }).map(function (r) { return { id: r.path.split('/')[1], data: r.data }; });
      });
    });
  }
  function docSnap(id, data) { return { id: id, exists: data != null, data: function () { return data == null ? undefined : data; } }; }
  function colSnap(list) {
    var docs = list.map(function (d) { return { id: d.id, exists: true, data: function () { return d.data; } }; });
    return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } };
  }

  /* ---------- "tiempo real" por consulta periódica (se pausa con la pestaña oculta) ---------- */
  var subs = [];
  function run(s) {
    if (s.busy || s.dead) return; s.busy = true;
    s.fetch().then(function (v) {
      var sig = JSON.stringify(v);
      if (sig !== s.sig) { s.sig = sig; s.cb(s.build(v)); }
    }).catch(function (e) {
      if (!s.errd && s.err && (!s.sig || e.status === 401 || e.status === 403)) { s.errd = true; try { s.err(e); } catch (x) { /* noop */ } }
    }).then(function () { s.busy = false; s.next = Date.now() + s.every; });
  }
  function tick() { if (document.hidden) return; var now = Date.now(); subs.slice().forEach(function (s) { if (now >= s.next) run(s); }); }
  function pollNow(key) {
    subs.forEach(function (s) { if (s.key === key) s.next = 0; });
    tick();
  }
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { subs.forEach(function (s) { s.next = 0; }); tick(); } });
  function subscribe(key, kind, fetchFn, build, cb, err) {
    var every = kind === 'priv' ? (OWNER ? 5000 : 8000) : (OWNER ? 10000 : 20000);
    var s = { key: key, every: every, fetch: fetchFn, build: build, cb: cb, err: err, next: 0, sig: null, busy: false };
    subs.push(s);
    setTimeout(function () { run(s); }, 0);
    return function () { s.dead = true; subs = subs.filter(function (x) { return x !== s; }); };
  }
  var db = {
    doc: function (path) {
      var id = path.split('/').pop(), col = path.split('/')[0];
      return {
        id: id,
        get: function () { return getDoc(path).then(function (d) { return docSnap(id, d); }); },
        set: function (data) { return setDoc(path, data); },
        delete: function () { return delDoc(path); },
        onSnapshot: function (cb, err) {
          return subscribe(path, PRIV[col] ? 'priv' : 'pub', function () { return getDoc(path); }, function (d) { return docSnap(id, d); }, cb, err);
        }
      };
    },
    collection: function (name) {
      return {
        onSnapshot: function (cb, err) {
          return subscribe(name + '/*', PRIV[name] ? 'priv' : 'pub', function () { return listCol(name); }, colSnap, cb, err);
        }
      };
    }
  };
  var user = {
    id: function () { return Promise.resolve(visitorId()); },
    isOwner: function () { return ready().then(function () { return OWNER; }); }
  };

  /* ---------- entrar: correo + contraseña + código del autenticador ---------- */
  var PEND = null;
  function codeOf(e) {
    if (e.status === 0) return 'net';
    if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return 'limit';
    if (e.code === 'invalid_credentials' || e.code === 'user_not_found') return 'bad';
    if (e.code === 'email_not_confirmed') return 'unconfirmed';
    if (/^mfa_/.test(e.code || '')) return 'code';
    return 'other';
  }
  function fail(e, code) { var x = new Error(e && e.message || 'error'); x.code = code || codeOf(e); x.own = true; return x; }
  function qrUrl(v) {
    v = String(v || '');
    var i = v.indexOf('<svg');
    return i >= 0 ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(v.slice(i)) : v;
  }
  var AUTH = {
    enabled: true,
    isOwner: function () { return OWNER; },
    email: function () { return (SES && SES.user && SES.user.email) || ''; },
    signIn: function (email, password) {
      PEND = null;
      return http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: String(email).trim(), password: password } }).then(function (j) {
        return http('/rest/v1/admins?select=user_id', { token: j.access_token }).then(function (rows) {
          if (!rows || !rows.length) {
            http('/auth/v1/logout?scope=local', { method: 'POST', token: j.access_token }).catch(function () { /* noop */ });
            throw fail(null, 'bad'); /* mismo mensaje que una contraseña mala: no revela si la cuenta existe */
          }
          var f = ((j.user && j.user.factors) || []).filter(function (x) { return x.factor_type === 'totp' && x.status === 'verified'; })[0];
          PEND = { j: j, factor: f ? f.id : null };
          return { stage: f ? 'code' : 'enroll' };
        });
      }).catch(function (e) { throw e.own ? e : fail(e); });
    },
    enroll: function () {
      if (!PEND) return Promise.reject(fail(null, 'other'));
      var t = PEND.j.access_token;
      ((PEND.j.user && PEND.j.user.factors) || []).filter(function (f) { return f.status !== 'verified'; }).forEach(function (f) {
        http('/auth/v1/factors/' + f.id, { method: 'DELETE', token: t }).catch(function () { /* noop */ });
      });
      return http('/auth/v1/factors', { method: 'POST', token: t, body: { factor_type: 'totp', issuer: 'Arroz en Caja', friendly_name: 'Arroz en Caja ' + Date.now().toString(36) } }).then(function (j) {
        PEND.factor = j.id; return { qr: qrUrl(j.totp && j.totp.qr_code), secret: (j.totp && j.totp.secret) || '' };
      }).catch(function (e) { throw e.own ? e : fail(e); });
    },
    verify: function (code, remember) {
      if (!PEND || !PEND.factor) return Promise.reject(fail(null, 'other'));
      var t = PEND.j.access_token, fid = PEND.factor;
      return http('/auth/v1/factors/' + fid + '/challenge', { method: 'POST', token: t, body: {} }).then(function (ch) {
        return http('/auth/v1/factors/' + fid + '/verify', { method: 'POST', token: t, body: { challenge_id: ch.id, code: String(code).replace(/\s+/g, '') } });
      }).then(function (j) {
        if (jwt(j.access_token).aal !== 'aal2') throw fail(null, 'other');
        SES = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)), user: j.user || PEND.j.user, remember: !!remember, until: remember ? Date.now() + REM_DAYS * 864e5 : 0 };
        persist(); PEND = null; OWNER = true; READY = Promise.resolve();
        return true;
      }).catch(function (e) { throw e.own ? e : fail(e); });
    },
    signOut: function () {
      var t = SES && SES.access_token; SES = null; OWNER = false; PEND = null; READY = null; persist();
      return t ? http('/auth/v1/logout?scope=local', { method: 'POST', token: t }).catch(function () { /* noop */ }) : Promise.resolve();
    },
    changePassword: function (pw) {
      return accessToken().then(function (t) { return http('/auth/v1/user', { method: 'PUT', token: t, body: { password: pw } }); }).catch(function (e) { throw fail(e, e.code === 'weak_password' ? 'weak' : e.code === 'same_password' ? 'same' : undefined); });
    }
  };

  window.AEC_AUTH = AUTH;
  window.claude = {
    use: function (n) {
      if (n === 'db') return ready().then(function () { return db; });
      if (n === 'user') return Promise.resolve(user);
      return Promise.reject(new Error('no disponible'));
    }
  };
})();
