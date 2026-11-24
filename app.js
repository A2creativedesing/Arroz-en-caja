/* Arroz en Caja — web pública, carta digital, pedido por WhatsApp y asistente.
   Esta web es solo pública. El panel del dueño vive aparte (carpeta panel/) y solo se descarga si quien entra es la cuenta propietaria. */
'use strict';
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  /* ep(): marca lo que el administrador puede editar tocándolo (solo se usa en modo edición). UI(): textos fijos de la web que ahora también se editan. */
  const ep = (p, t) => (S.tag ? ` data-ep="${p}" data-et="${t || 'text'}"` : '');
  const UI = (k, d) => { const u = (S.site && S.site.ui) || {}; return u[k] != null && String(u[k]).trim() !== '' ? u[k] : d; };
  const UIA = (k, d) => { const u = (S.site && S.site.ui) || {}; return Array.isArray(u[k]) && u[k].length ? u[k] : d; };
  const eur = (n) => Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function deepMerge(a, b) {
    for (const k of Object.keys(b || {})) {
      if (isObj(b[k]) && isObj(a[k])) deepMerge(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }

  const ALG = { gluten: 'gluten', lacteos: 'lácteos', huevos: 'huevos', pescado: 'pescado', crustaceos: 'crustáceos', moluscos: 'moluscos', soja: 'soja', sulfitos: 'sulfitos', apio: 'apio', mostaza: 'mostaza', cacahuetes: 'cacahuetes', frutos_con_cascara: 'frutos de cáscara', sesamo: 'sésamo' };
  const KIND = { menu: 'box', arroces: 'pan', delta: 'pan', fideuas: 'noodle', gourmet: 'bowl', asados: 'roast', extras: 'box', burgers: 'burger', lepain: 'sub', kajita: 'cutlet', empanadas: 'empanada', patatas: 'fries', postres: 'cake', bebidas: 'can', vinos: 'wine' };
  const NO_AL_NOTE = new Set(['bebidas', 'vinos', 'extras']);

  const S = {
    defSite: null, site: null, siteOver: {}, cats: [], def: [], over: {}, items: [], byId: {}, sitems: [], sById: {},
    cat: 'arroces', q: '', noAl: new Set(), fav: new Set(), qty: {}, cart: {}, store: null,
    ck: { mode: 'domicilio', date: '', time: '', name: '', surname: '', email: '', phone: '', street: '', zip: '', city: '', note: '', pay: 'card', remember: true, terms: false },
    lastOrder: null, statusMap: {}, sending: false, uid: null, msgs: {}, mine: {}, msgSeen: {}, msgsInit: false,
    cap: { db: null, user: null, sample: null, assets: null }, canEdit: false, isOwner: false, tag: false, unlocked: false, capsReady: false, chatHist: [], listeners: [], dbOk: false
  };
  window.AEC = { S, $, $$, esc, md, eur, norm, clone, deepMerge, ALG, KIND, art: null, toast: null, ask: null, onChange: (fn) => S.listeners.push(fn), refreshAll: null, computeItems: null };
  const emit = () => S.listeners.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); AEC.installEv = e; emit(); });
  window.addEventListener('appinstalled', () => { AEC.installEv = null; AEC.installed = true; emit(); });
  const STORE_KEY = 'aec-store', FAV_KEY = 'aec-fav', CONTACT_KEY = 'aec-contact', LAST_KEY = 'aec-last', MINE_KEY = 'aec-orders', SEEN_KEY = 'aec-msgseen';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

  /* ---------------- drawn fallback art (también se ve mientras cargan las fotos) ---------------- */
  const catTone = (id) => Math.max(0, S.cats.findIndex((c) => c.id === id)) % 4;
  const art = (kind, seed, tone) => (window.AECArt ? window.AECArt.dish(kind, seed, tone) : '');
  AEC.art = art;
  const pic = (src, alt, kind, seed, tone, extra, epath) => `<div class="pic${extra ? ' ' + extra : ''}"${epath ? ep(epath, 'img') : ''}>${art(kind, seed, tone)}${src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</div>`;
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG') { t.classList.add('bad'); const l = t.closest('.logo'); if (l) l.classList.add('noimg'); }
  }, true);

  /* ---------------- data ---------------- */
  async function loadJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); }
  /* Cada local tiene su propia carta: hay platos que solo existen en uno, nombres/precios distintos y platos agotados hoy.
     "it.st[local]" guarda esas diferencias. Los cambios del panel (menu/<id>) mandan sobre los datos base. */
  function storeLayer(it, k) {
    const has = it.st && Object.keys(it.st).length, d = has ? it.st[k] : null;
    if (has && !d) return null;
    const o = S.over[it.id] || {}, av = o.avail && o.avail[k];
    if (av === 'off') return null;
    let v = it;
    if (d) {
      v = Object.assign({}, it);
      if (d.n && !('name' in o)) v.name = d.n;
      if (d.p != null && !('price' in o)) v.price = d.p;
      if (d.pm != null && !('priceMax' in o)) v.priceMax = d.pm;
      if (d.o && !('soldOut' in o)) v.soldOut = true;
    }
    const sp = o.sp && o.sp[k];
    if (sp) { if (v === it) v = Object.assign({}, it); if (sp.p != null) v.price = sp.p; if ('pm' in sp) v.priceMax = sp.pm; if (sp.n) v.name = sp.n; }
    if (av === 'out' || av === 'ok') { if (v === it) v = Object.assign({}, it); v.soldOut = av === 'out'; }
    return v;
  }
  /* Estado de un plato en un local: ok (disponible), out (agotado temporalmente) u off (desactivado). Lo fijado en el panel manda sobre los datos de la web actual. */
  function stockState(it, k) {
    const o = S.over[it.id] || {}, av = o.avail && o.avail[k]; if (av === 'ok' || av === 'out' || av === 'off') return av;
    if (it.hidden) return 'off';
    const d = it.st && it.st[k]; return it.soldOut || (d && d.o && !('soldOut' in o)) ? 'out' : 'ok';
  }
  const inStore = (it, k) => !(it.st && Object.keys(it.st).length && !it.st[k]);
  AEC.stockState = stockState; AEC.inStore = inStore; AEC.storeLayer = storeLayer;
  function buildStoreView() {
    S.sitems = []; S.sById = {};
    if (!S.store) return;
    S.items.forEach((it) => { if (it.hidden) return; const v = storeLayer(it, S.store); if (v) { S.sitems.push(v); S.sById[v.id] = v; } });
  }
  const catalog = () => (S.store ? S.sitems : S.items.filter((i) => !i.hidden));
  function computeItems() {
    const out = [];
    for (const it of S.def) {
      const o = S.over[it.id];
      if (o && o.deleted) continue;
      out.push(o ? Object.assign({}, it, o) : it);
    }
    for (const id of Object.keys(S.over)) { const o = S.over[id]; if (o && o.custom && !o.deleted) out.push(Object.assign({ id }, o)); }
    const order = {}; S.cats.forEach((c, i) => { order[c.id] = i; });
    out.sort((a, b) => (order[a.cat] ?? 99) - (order[b.cat] ?? 99));
    S.byId = {}; out.forEach((i) => { S.byId[i.id] = i; });
    S.items = out;
    buildStoreView();
    return out;
  }
  AEC.computeItems = computeItems;
  function applyCats() {
    if (!S.catsBase) return;
    const ov = (S.site && S.site.catOver) || {}, ord = (S.site && S.site.catOrder) || [];
    let c = S.catsBase.map((x) => (ov[x.id] && ov[x.id].label ? Object.assign({}, x, { label: ov[x.id].label }) : x));
    if (ord.length) { const ix = (id) => { const i = ord.indexOf(id); return i < 0 ? 999 : i; }; c = c.slice().sort((a, b) => ix(a.id) - ix(b.id)); }
    S.cats = c;
  }
  function mergeSite() { S.site = deepMerge(clone(S.defSite), clone(S.siteOver || {})); applyCats(); }
  const storeOf = () => (S.store && S.site.stores[S.store]) || null;
  const ORD = () => S.site.order || {};
  const defQty = (it) => (ORD().defQty || {})[it.cat] || 1;
  const qtyOf = (it) => S.qty[it.id] || defQty(it);

  /* ---------------- time / status ---------------- */
  function parseHours(s) { return String(s || '').split(',').map((x) => x.trim().match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/)).filter(Boolean).map((m) => [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]); }
  function madridNow() {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), min: +g('hour') * 60 + +g('minute'), ymd: `${g('year')}-${g('month')}-${g('day')}` };
  }
  const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const DOWN = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const svcFor = (st, dow) => (st.svc ? (st.svc[String(dow)] || '') : (st.hours || ''));
  /* Cierres: festivos, vacaciones y cierres extraordinarios (rango de fechas) y cierre temporal con mensaje y hora estimada de reapertura. */
  const closureOn = (st, ymd) => (st.closures || []).find((c) => c.from && ymd >= c.from && ymd <= (c.to || c.from)) || null;
  function tempClosure(st) {
    const c = st && st.closure; if (!c || !c.on) return null;
    if (c.until) { const [d, t] = String(c.until).split(' '), m = t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : 0, n = madridNow(); if (n.ymd > d || (n.ymd === d && n.min >= m)) return null; }
    return c;
  }
  function untilText(u) { if (!u) return ''; const [d, t] = String(u).split(' '); return d === madridNow().ymd ? 'hoy a las ' + t : 'el ' + d.split('-').reverse().join('/') + ' a las ' + t; }
  function orderBlock(st) {
    if (!st) return null; const c = tempClosure(st);
    if (c) return { kind: 'temp', text: 'Cerrado temporalmente' + (c.msg ? ' · ' + c.msg : '') + (c.until ? ' · reabrimos ' + untilText(c.until) : '') };
    if (st.ordersOff || (st.pickupOff && st.deliveryOff)) return { kind: 'off', text: 'Pedidos online pausados en este local' };
    return null;
  }
  AEC.orderBlock = orderBlock; AEC.closureOn = closureOn; AEC.untilText = untilText;
  function status(st) {
    const bl = orderBlock(st); if (bl) return { open: false, text: bl.text };
    const cl = closureOn(st, madridNow().ymd); if (cl) return { open: false, text: 'Cerrado hoy' + (cl.label ? ' · ' + cl.label : '') };
    let any = false; for (let d = 0; d < 7; d++) if (parseHours(svcFor(st, d)).length) any = true;
    if (!any) return null;
    const n = madridNow(), today = parseHours(svcFor(st, n.dow));
    for (const [a, b] of today) if (n.min >= a && n.min < b) return { open: true, text: 'Abierto ahora · pedidos hasta las ' + hm(b) };
    const nx = today.find(([a]) => a > n.min);
    if (nx) return { open: false, text: 'Cerrado ahora · abre hoy a las ' + hm(nx[0]) };
    for (let d = 1; d <= 7; d++) { const r = parseHours(svcFor(st, (n.dow + d) % 7)); if (r.length) return { open: false, text: 'Cerrado · abre ' + (d === 1 ? 'mañana' : 'el ' + DOWN[(n.dow + d) % 7]) + ' a las ' + hm(r[0][0]) }; }
    return null;
  }
  const todayHours = (st) => { const r = parseHours(svcFor(st, madridNow().dow)); return r.length ? 'Hoy: ' + r.map(([a, b]) => hm(a) + '–' + hm(b)).join(' · ') : 'Hoy cerrado'; };
  const statusHTML = (st) => { const s = status(st); return s ? `<span class="dot${s.open ? '' : ' off'}"></span><span>${esc(s.text)}</span>` : ''; };
  const phoneLinks = (p) => String(p || '').split(/\s*[·,–]\s*/).filter(Boolean).map((n) => `<a href="tel:+34${n.replace(/\D/g, '')}">${esc(n)}</a>`).join(' · ');
  function openNowHTML() {
    const s = S.site; let pick = null;
    for (const k of (S.store ? [S.store] : s.storeOrder)) { const st = s.stores[k], x = status(st); if (!x) continue; if (!pick || (x.open && !pick.x.open)) pick = { st, x }; }
    return pick ? `<span class="dot${pick.x.open ? '' : ' off'}"></span><span><span class="st">${esc(pick.st.name)}: </span>${esc(pick.x.text)}</span>` : '';
  }
  const dateLabel = (ymd) => { const d = new Date(ymd + 'T12:00:00Z'); return `${DOWN[d.getUTCDay()]} ${d.getUTCDate()} de ${MES[d.getUTCMonth()]}`; };
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function slotsFor(st, ymd) {
    const o = ORD(), step = o.slotStep || 30, lead = o.leadMin || 0, n = madridNow();
    if (closureOn(st, ymd) || orderBlock(st)) return [];
    const dow = new Date(ymd + 'T12:00:00Z').getUTCDay(), out = [];
    parseHours(svcFor(st, dow)).forEach(([a, b]) => { for (let t = a; t < b; t += step) out.push(t); });
    return ymd === n.ymd ? out.filter((t) => t >= n.min + lead) : out;
  }
  function openDays(st) { const res = [], n = madridNow(); for (let i = 0; i <= (ORD().daysAhead || 14); i++) { const y = addDays(n.ymd, i); if (slotsFor(st, y).length) res.push(y); } return res; }
  function dayText(ymd) { const n = madridNow(), t = dateLabel(ymd); return ymd === n.ymd ? 'Hoy, ' + t : ymd === addDays(n.ymd, 1) ? 'Mañana, ' + t : t.charAt(0).toUpperCase() + t.slice(1); }

  /* ---------------- html builders ---------------- */
  const ICON = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.6c0 5.6-7.5 10.2-7.5 10.2Z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14M14 4l4 4-4 4M20 16H6m4-4-4 4 4 4"/></svg>',
    mark: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="9" width="34" height="24" rx="5" fill="#6B4325"/><rect x="3" y="9" width="34" height="8" rx="4" fill="#8D2937"/><circle cx="20" cy="26" r="6" fill="#E8D3BD"/></svg>'
  };
  function logoHTML(s) {
    return `<img src="${esc(s.brand.logo)}" alt="${esc(s.brand.name)}, inicio" width="54" height="54" decoding="async" referrerpolicy="no-referrer"><span class="logo-fb">${ICON.mark}<span>${esc(s.brand.name)}</span></span>`;
  }
  const words = (t, o) => String(t).trim().split(/\s+/).map((w, i) => `<span class="w" style="--i:${i + (o || 0)}">${esc(w)}</span>`).join(' ');

  const TRUST = ['Cocinado por encargo', 'Envío a domicilio desde 65 min', 'Envase 100% reciclable'];
  const MARQ = ['Cocinado por encargo', 'Hora de entrega marcada', 'Envase 100% reciclable', 'Arroces y fideuás', 'Es natural que te guste'];
  function heroHTML() {
    const s = S.site, h = s.hero, b = s.brand;
    const m = String(h.title).match(/^(.*?,)\s*(.+)$/);
    const title = m ? words(m[1]) + ' <span class="tag-label">' + words(m[2], m[1].trim().split(/\s+/).length) + '</span>' : words(h.title);
    return `<section class="hero" id="inicio"><div class="wrap hero-in">
      <div class="hero-copy"><p class="open-now" id="openNow">${openNowHTML()}</p><h1${ep('hero.title')}>${title}</h1><p class="lede"${ep('hero.sub', 'area')}>${esc(h.sub)}</p>
        <div class="hero-actions"><a class="btn xl" href="#carta"${ep('hero.cta')}>${esc(h.cta)} ${ICON.arrow}</a><a class="tlink" href="#locales"${ep('ui.heroLink')}>${esc(UI('heroLink', 'Ver locales y horarios'))}</a></div>
        <ul class="trust">${UIA('trust', TRUST).map((t, i) => `<li${ep('ui.trust.' + i)}>${ICON.check}${esc(t)}</li>`).join('')}</ul></div>
      <div class="hero-media">
        <div class="hm hm-a">${pic(h.image2, h.image2Alt || 'Arroz en su caja', 'box', 'hero-a', 0, '', 'hero.image2')}</div>
        <div class="hm hm-b">${pic(h.image, h.imageAlt || 'Arroces recién cocinados', 'pan', 'hero-b', 1, '', 'hero.image')}</div>
        <div class="float seal" data-depth=".05" data-rot="-8"><img src="${esc(b.seal)}" alt="${esc(b.sealAlt || '')}" width="132" height="200" decoding="async"${ep('brand.seal', 'logo')}></div>
        <div class="float hero-logo" data-depth="-.04" data-rot="4"><img src="${esc(b.logo)}" alt="${esc(b.name)}" width="136" height="136" decoding="async"${ep('brand.logo', 'logo')}></div>
      </div></div>
    <div class="marquee" aria-hidden="true"><div class="marquee-track">${(() => { const m = UIA('marquee', MARQ); return m.concat(m, m, m); })().map((t) => `<span>${t}</span>`).join('')}</div></div></section>`;
  }
  function whyHTML() {
    const w = S.site.why;
    return `<section class="sec rice" id="nosotros"><div class="wrap"><div class="split">
      <div class="split-copy"><h2 class="h2 rv"${ep('why.title')}>${esc(w.title)}</h2><p class="big rv" style="--d:1"${ep('why.p1', 'md')}>${md(w.p1)}</p><p class="big rv" style="--d:2"${ep('why.p2', 'md')}>${md(w.p2)}</p></div>
      <div class="split-media arch rv" style="--d:1">${pic(w.image, 'Arroz en Caja', 'pan', 'why', 0, '', 'why.image')}</div></div>
      <div class="two-col rv" style="margin-top:clamp(56px,8vw,112px)"><p class="statement"${ep('why.callout', 'md')}>${md(w.callout)}</p><p class="big"${ep('why.p3', 'md')}>${md(w.p3)}</p></div></div></section>`;
  }
  function statsHTML() {
    return `<section class="sec sand" aria-label="Datos"><div class="wrap"><div class="stats">${S.site.stats.map((x, i) => `<div class="stat rv" style="--d:${i}"><b data-to="${+x.value}" data-suf="${esc(x.suffix)}"${ep('stats.' + i + '.value', 'num')}>${+x.value}${esc(x.suffix)}</b><span${ep('stats.' + i + '.label')}>${esc(x.label)}</span></div>`).join('')}</div></div></section>`;
  }
  function innovHTML() {
    const n = S.site.innovation;
    return `<section class="sec rice"><div class="wrap"><div class="split rev">
      <div class="split-copy"><h2 class="h2 rv"${ep('innovation.title')}>${esc(n.title)}</h2><p class="big rv" style="--d:1"${ep('innovation.p1', 'md')}>${md(n.p1)}</p><p class="big rv" style="--d:2"${ep('innovation.p2', 'md')}>${md(n.p2)}</p></div>
      <div class="split-media wide rv" style="--d:1">${pic(n.image, 'Cocina de Arroz en Caja', 'noodle', 'innov', 1, '', 'innovation.image')}</div></div></div></section>`;
  }
  function qualityHTML() {
    const q = S.site.quality;
    return `<section class="sec paprika"><div class="wrap"><div class="wideimg rv">${pic(q.image, 'Arroz en Caja', 'pan', 'quality', 0, '', 'quality.image')}</div>
      <div class="two-col"><h2 class="h2 rv"${ep('quality.title')}>${esc(q.title)}</h2><p class="big rv" style="--d:1"${ep('quality.p1', 'md')}>${md(q.p1)}</p></div></div></section>`;
  }
  const BADGE = '<div class="badge" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><path id="bdg" d="M60 60m-45 0a45 45 0 1 1 90 0a45 45 0 1 1-90 0"/></defs><circle cx="60" cy="60" r="59" fill="#E8D3BD"/><text font-family="Source Sans 3,Arial,sans-serif" font-weight="800" font-size="12.6" fill="#38271E"><textPath href="#bdg" textLength="278" lengthAdjust="spacing">ENVASE 100% RECICLABLE · ENVASE ·</textPath></text></svg><b>100%</b></div>';
  function ecoHTML() {
    const e = S.site.eco;
    return `<section class="sec green"><div class="wrap"><div class="split">
      <div class="split-copy"><h2 class="h2 rv"${ep('eco.title')}>${esc(e.title)}</h2><p class="big rv" style="--d:1"${ep('eco.p1', 'md')}>${md(e.p1)}</p><p class="big rv" style="--d:2"${ep('eco.p2', 'md')}>${md(e.p2)}</p></div>
      <div class="split-media wide rel" style="--d:1"><div class="rv">${pic(e.image, 'Cajas de aluminio de Arroz en Caja', 'box', 'eco', 0, '', 'eco.image')}</div>${BADGE}</div></div></div></section>`;
  }
  function cartaHTML() {
    return `<section class="sec rice" id="carta" style="padding-bottom:clamp(56px,8vw,120px)"><div class="wrap">
      <div class="carta-head"><h2 class="h2 rv"${ep('ui.cartaTitle')}>${esc(UI('cartaTitle', 'Haz tu pedido'))}</h2><p class="rv" style="--d:1"${ep('ui.cartaSub', 'area')}>${esc(UI('cartaSub', 'Elige tu local, añade tus platos y finaliza en un minuto. Precios con IVA incluido.'))}</p></div>
      <div id="pickWrap" class="shop-empty"></div>
      <div id="shopWrap" hidden>
        <div class="shopbar" id="shopbar"></div>
        <div class="tools"><label class="search"><span class="sr">Buscar en la carta</span>${ICON.search}<input id="q" type="search" placeholder="Buscar un plato" autocomplete="off" enterkeyhint="search"></label>
          <div class="chips" id="chips" role="tablist" aria-label="Categorías"></div>
          <details class="allerg" id="allerg"><summary>Filtrar por alérgenos</summary><div class="chips" id="alChips"></div><p>Marca lo que quieres evitar. Solo mostramos platos con alérgenos confirmados en nuestra ficha; del resto, pregunta en tu local.</p></details></div>
        <div class="grid" id="grid"></div></div></div></section>`;
  }
  const pickCards = (sel) => S.site.storeOrder.map((k) => {
    const st = S.site.stores[k], on = k === sel;
    return `<button class="pick-card${on ? ' on' : ''}" type="button" data-pick="${k}" aria-pressed="${on}"><h3>${esc(st.name)}</h3><p class="sub">${statusHTML(st)}</p><p class="sub" style="font-weight:600;color:var(--muted)">${esc(todayHours(st))}</p><address>${esc(st.address || '')}</address><span class="go">${on ? 'Seguir en ' : 'Pedir en '}${esc(st.name)} ${ICON.arrow}</span></button>`;
  }).join('');
  function renderShop() {
    const pw = $('#pickWrap'), sw = $('#shopWrap'); if (!pw || !sw) return;
    const st = storeOf();
    pw.hidden = !!st; sw.hidden = !st;
    if (!st) { pw.innerHTML = `<div class="pick">${pickCards(null)}</div><p class="pick-note">Cada local tiene su propia carta, horario y plazos. Puedes cambiar de local cuando quieras.</p>`; return; }
    const sx = status(st), lo = S.lastOrder, rep = lo && !cartCount() && lo.lines && lo.lines.length;
    const trk = lo && lo.store && Date.now() - lo.ts < 864e5 ? stepLabel(stepOf(lo.id), lo.mode) : '';
    $('#shopbar').innerHTML = `<div><small>Estás comprando en:</small><b>${esc(st.name)}</b><p class="sub">${statusHTML(st)}</p>${rep ? '<p class="sub"><button class="tlink" type="button" data-repeat style="color:var(--crema)">Repetir mi último pedido</button></p>' : ''}${trk ? `<p class="sub"><button class="tlink${newFromLocal(lo.id) ? ' has-new' : ''}" type="button" data-track style="color:var(--crema)">Pedido ${esc(lo.id)} · ${esc(trk)}${newFromLocal(lo.id) ? ' · mensaje nuevo' : ' · ver'}</button></p>` : ''}</div><button class="btn" type="button" data-store-change>${ICON.swap} Cambiar</button>`;
  }
  const waLocal = (k) => String(((S.site.comms || {}).perStore || {})[k] || S.site.contact.whatsapp || '').replace(/\D/g, '');
  function storeHTML(k, i) {
    const st = S.site.stores[k];
    const s = status(st);
    return `<article class="store rv" style="--d:${i}"><h3${ep('stores.' + k + '.name')}>${esc(st.name)}</h3>
      ${s ? `<p class="sub">${statusHTML(st)}</p>` : ''}
      <ul>${st.address ? `<li${ep('stores.' + k + '.address')}><small>Dirección</small>${esc(st.address)}</li>` : ''}${st.phone ? `<li${ep('stores.' + k + '.phone')}><small>Teléfono</small><span>${phoneLinks(st.phone)}</span></li>` : ''}${st.hours ? `<li${ep('stores.' + k + '.hours')}><small>Horario en local</small>${esc(st.hours.replace(/,\s*/g, ' · ').replace(/-/g, ' a '))}${st.closedDays ? ' · ' + esc(st.closedDays) : ''}</li>` : ''}${st.hoursNote ? `<li${ep('stores.' + k + '.hoursNote', 'area')}><small>Más información</small><span style="font-size:15px">${esc(st.hoursNote)}</span></li>` : ''}</ul>
      <div class="btns"><button class="btn sm" type="button" data-pick="${k}" data-go="1">Pedir aquí</button>${st.mapsUrl ? `<a class="btn sm ghost" href="${esc(st.mapsUrl)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}${waLocal(k) ? `<a class="btn sm ghost" href="https://wa.me/${esc(waLocal(k))}?text=${encodeURIComponent('Hola, quería hacer una consulta a Arroz en Caja ' + st.name + '.')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></article>`;
  }
  function footHTML() {
    const s = S.site, c = s.contact;
    return `<footer class="foot"><div class="wrap"><div class="foot-cols">
      <div><div class="foot-brand"><img class="logo-f" src="${esc(s.brand.logo)}" alt="${esc(s.brand.name)}" width="84" height="84" loading="lazy" decoding="async"${ep('brand.logo', 'logo')}><img src="${esc(s.brand.seal)}" alt="${esc(s.brand.sealAlt || '')}" height="84" width="55" loading="lazy" decoding="async"${ep('brand.seal', 'logo')}></div><p class="tag"${ep('brand.tagline')}>${esc(s.brand.tagline)}.</p><p style="margin-top:14px"${ep('brand.hashtag')}>${esc(s.brand.hashtag)} #AlGrano</p></div>
      <div><h4>Locales</h4><ul>${s.storeOrder.map((k) => `<li><a href="#locales">${esc(s.stores[k].name)}</a></li>`).join('')}</ul></div>
      <div><h4>Información</h4><ul>${c.legal.map((l, i) => `<li><a class="tl" href="${esc(l.url)}" target="_blank" rel="noopener"${ep('contact.legal.' + i + '.label')}>${esc(l.label)}</a></li>`).join('')}</ul></div>
      <div><h4>Síguenos</h4><ul><li><a class="tl" href="${esc(c.instagram)}" target="_blank" rel="noopener"${ep('contact.instagram', 'url')}>Instagram</a></li><li><a class="tl" href="${esc(c.facebook)}" target="_blank" rel="noopener"${ep('contact.facebook', 'url')}>Facebook</a></li>${c.whatsapp ? `<li><a class="tl" href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noopener"${ep('contact.whatsapp', 'tel')}>WhatsApp</a></li>` : ''}</ul></div></div>
      <div class="foot-wm"><div class="foot-word" aria-hidden="true">${esc(s.brand.name)}</div></div></div>
      <div class="foot-bot"><div class="wrap"><span${ep('brand.name')}>© ${esc(s.brand.name)}</span><span${ep('ui.footNote', 'area')}>${esc(UI('footNote', 'Precios con IVA incluido. Los alérgenos se indican solo donde tenemos la ficha confirmada.'))}</span>${window.claude ? '<a class="foot-acc" href="#acceso">Acceso</a>' : ''}</div></div></footer>`;
  }
  function pedirHTML() {
    const h = S.site.how;
    return `<section class="sec deep" id="pedir"><div class="wrap"><h2 class="h2 rv"${ep('how.title')}>${esc(h.title)}</h2>
      <div class="steps">${h.steps.map((s, i) => `<div class="step rv" style="--d:${i + 1}"><b${ep('how.steps.' + i + '.verb')}>${esc(s.verb)}.</b><p${ep('how.steps.' + i + '.text', 'area')}>${esc(s.text)}</p></div>`).join('')}</div>
      <div class="deliver rv"><p${ep('how.delivery', 'area')}>${esc(h.delivery)}</p><a class="btn" href="#locales"${ep('ui.howCta')}>${esc(UI('howCta', 'Elegir mi local'))} ${ICON.arrow}</a></div></div></section>`;
  }
  function localesHTML() {
    return `<section class="sec sun" id="locales"><div class="wrap"><h2 class="h2 rv"${ep('ui.storesTitle')}>${esc(UI('storesTitle', 'Dónde estamos'))}</h2><div class="stores">${S.site.storeOrder.map(storeHTML).join('')}</div></div></section>`;
  }
  function franqHTML() {
    const f = S.site.franchise;
    return `<section class="sec rice" id="franquicia"><div class="wrap">
      <div class="split"><div class="split-copy"><h2 class="h2 rv"${ep('franchise.title')}>${esc(f.title)}</h2><p class="big rv" style="--d:1"${ep('franchise.lead', 'md')}>${md(f.lead)}</p><p class="big rv" style="--d:2"${ep('franchise.sub', 'area')}>${esc(f.sub)}</p><a class="btn rv" style="--d:3;align-self:flex-start" href="#frForm"${ep('ui.franchiseCta')}>${esc(UI('franchiseCta', 'Quiero más información'))} ${ICON.arrow}</a></div>
        <div class="split-media wide rv" style="--d:1">${pic(f.image, 'Franquicia Arroz en Caja', 'pan', 'franq', 2, '', 'franchise.image')}</div></div>
      <div class="two-col" style="margin-top:clamp(56px,8vw,120px)"><div class="rv"><h3 style="font-size:clamp(1.7rem,3.4vw,2.6rem);margin-bottom:20px"${ep('franchise.stepsTitle')}>${esc(f.stepsTitle)}</h3><ol class="fr-steps">${f.steps.map((x, i) => `<li${ep('franchise.steps.' + i, 'md')}>${md(x)}</li>`).join('')}</ol></div>
        <div class="rv" style="--d:1"><h3 style="font-size:clamp(1.7rem,3.4vw,2.6rem);margin-bottom:20px"${ep('ui.faqTitle')}>${esc(UI('faqTitle', 'Preguntas y respuestas'))}</h3><div class="faq">${f.faq.map((x, i) => `<details><summary${ep('franchise.faq.' + i + '.q')}>${esc(x.q)}</summary><p${ep('franchise.faq.' + i + '.a', 'area')}>${esc(x.a)}</p></details>`).join('')}</div></div></div>
      <form class="form rv" id="frForm" style="margin-top:clamp(40px,6vw,88px);scroll-margin-top:90px" novalidate><h3 style="font-size:clamp(1.7rem,3.4vw,2.6rem)"${ep('ui.contactTitle')}>${esc(UI('contactTitle', 'Contacta con nosotros'))}</h3>
        <div class="row"><label class="field" for="frName">Nombre<input id="frName" name="name" autocomplete="given-name" required></label><label class="field" for="frSurname">Apellidos<input id="frSurname" name="surname" autocomplete="family-name"></label></div>
        <div class="row"><label class="field" for="frEmail">Email<input id="frEmail" name="email" type="email" inputmode="email" autocomplete="email" required></label><label class="field" for="frPhone">Teléfono de contacto<input id="frPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel"></label></div>
        <label class="field" for="frPlace">Lugar de interés<input id="frPlace" name="place"></label>
        <label class="field" for="frMsg">Mensaje<textarea id="frMsg" name="msg"></textarea></label>
        <label class="consent" for="frOkc"><input id="frOkc" type="checkbox" required><span>Acepto los <a href="https://arrozencaja.com/politica-privacidad/" target="_blank" rel="noopener">términos y condiciones</a></span></label>
        <div id="frOut" role="status"></div><button class="btn" type="submit" style="align-self:flex-start">Enviar solicitud</button></form></div></section>`;
  }

  /* ---------------- carta ---------------- */
  function visibleItems() {
    const q = norm(S.q);
    let list = S.sitems.slice();
    if (q) list = list.filter((i) => norm(i.name + ' ' + (i.desc || '')).includes(q));
    else if (S.cat === 'fav') list = list.filter((i) => S.fav.has(i.id));
    else if (S.cat !== 'all') list = list.filter((i) => i.cat === S.cat);
    if (S.noAl.size) list = list.filter((i) => i.allergens && ![...S.noAl].some((a) => i.allergens.includes(a)));
    return list;
  }
  function dishHTML(it, i, still) {
    const tone = catTone(it.cat);
    const src = it.asset ? '/_blob/' + it.asset : (it.img || it.image);
    const al = it.allergens ? (it.allergens.length ? 'Contiene: ' + it.allergens.map((a) => ALG[a] || a).join(' · ') : 'Sin alérgenos declarados') : (NO_AL_NOTE.has(it.cat) ? '' : 'Alérgenos: consúltalos en tu local');
    const range = it.priceMax && it.priceMax > it.price;
    const fav = S.fav.has(it.id);
    const q = qtyOf(it), min = defQty(it) > 1 ? 1 : 1;
    const blk = orderBlock(storeOf());
    const buy = it.soldOut ? '<div class="buy"><span class="sold">No disponible hoy</span></div>'
      : blk ? '<div class="buy"><span class="sold">Pedidos pausados</span></div>'
      : range ? `<div class="buy"><a class="add alt" href="${esc(it.url || '#')}" target="_blank" rel="noopener" aria-label="Ver opciones de ${esc(it.name)}">Ver opciones</a></div>`
        : `<div class="buy"><div class="sq" role="group" aria-label="Cantidad de ${esc(it.name)}"><button type="button" data-sq="-1" data-id="${esc(it.id)}" aria-label="Menos"${q <= min ? ' disabled' : ''}>−</button><output data-qout="${esc(it.id)}" aria-live="polite">${q}</output><button type="button" data-sq="1" data-id="${esc(it.id)}" aria-label="Más">+</button></div><button class="add txt" type="button" data-add="${esc(it.id)}" aria-label="Añadir ${esc(it.name)} al pedido">${ICON.plus}Añadir</button></div>`;
    const favBtn = `<button class="fav" type="button" data-fav="${esc(it.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}: ${esc(it.name)}">${ICON.heart}</button>`;
    const p = pic(src, it.name, KIND[it.cat] || 'pan', it.id, tone).replace(/<\/div>$/, favBtn + '</div>');
    return `<article class="dish${still ? ' still' : ''}${it.soldOut ? ' out' : ''}" data-id="${esc(it.id)}" style="--i:${i}">${p}
      <div class="dish-b"><h3>${esc(it.name)}${it.featured ? ' <span class="feat">Destacado</span>' : ''}</h3>${it.desc ? `<p class="desc">${esc(it.desc)}</p>` : ''}${it.ing ? `<p class="al ing">Ingredientes: ${esc(it.ing)}</p>` : ''}${al ? `<p class="al">${esc(al)}</p>` : ''}
      <div class="dish-f"><span class="price">${range ? '<small>desde</small>' : ''}${eur(it.price)}<small style="display:inline;margin-left:6px">IVA incl.</small></span>${buy}</div></div></article>`;
  }
  function renderMenu(anim) {
    const grid = $('#grid'); if (!grid || !S.store) return;
    const vis = S.sitems;
    const counts = {}; vis.forEach((i) => { counts[i.cat] = (counts[i.cat] || 0) + 1; });
    const cats = S.cats.filter((c) => counts[c.id]);
    const favN = vis.filter((i) => S.fav.has(i.id)).length;
    if (S.cat === 'fav' && !favN) S.cat = cats[0] ? cats[0].id : 'all';
    if (S.cat !== 'all' && S.cat !== 'fav' && !counts[S.cat]) S.cat = cats[0] ? cats[0].id : 'all';
    $('#chips').innerHTML = `<button class="chip${S.cat === 'all' && !S.q ? ' on' : ''}" data-cat="all" role="tab">Todo<small>${vis.length}</small></button>` + (favN ? `<button class="chip fav-chip${S.cat === 'fav' && !S.q ? ' on' : ''}" data-cat="fav" role="tab">${ICON.heart.replace('<svg ', '<svg fill="currentColor" ')}Favoritos<small>${favN}</small></button>` : '') + cats.map((c) => `<button class="chip${S.cat === c.id && !S.q ? ' on' : ''}" data-cat="${c.id}" role="tab">${esc(c.label)}<small>${counts[c.id]}</small></button>`).join('');
    const used = new Set(); vis.forEach((i) => (i.allergens || []).forEach((a) => used.add(a)));
    $('#alChips').innerHTML = Object.keys(ALG).filter((a) => used.has(a)).map((a) => `<button class="chip al${S.noAl.has(a) ? ' on' : ''}" data-al="${a}" aria-pressed="${S.noAl.has(a)}">Sin ${ALG[a]}</button>`).join('');
    const list = visibleItems();
    let html = '';
    if (!list.length) html = `<p class="empty">${S.q ? 'No encontramos ese plato en este local.' : 'No hay platos con estos filtros.'} Prueba con otra búsqueda o pregúntanos.</p>`;
    else if (S.cat === 'all' && !S.q) {
      let last = '';
      const cnt = {}; list.forEach((x) => { cnt[x.cat] = (cnt[x.cat] || 0) + 1; });
      list.forEach((it, i) => {
        if (it.cat !== last) { last = it.cat; const c = S.cats.find((x) => x.id === it.cat); html += `<h3 class="cat-h"${S.tag ? ` data-ecat="${esc(it.cat)}"` : ''}>${esc(c ? c.label : '')}<small>${cnt[it.cat]}</small></h3>`; }
        html += dishHTML(it, i % 8, !anim);
      });
    } else html = list.map((it, i) => dishHTML(it, i, !anim)).join('');
    grid.innerHTML = html;
  }
  AEC.renderMenu = renderMenu;

  /* ---------------- cart ---------------- */
  const CART_KEY = 'aec-cart';
  function loadCart() { try { S.cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {}; } catch (e) { S.cart = {}; } }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(S.cart)); } catch (e) { /* sin almacenamiento */ } }
  const cartLines = () => Object.keys(S.cart).map((id) => ({ it: S.sById[id], q: S.cart[id] })).filter((l) => l.it && l.q > 0 && !l.it.soldOut);
  const cartTotal = () => cartLines().reduce((s, l) => s + l.it.price * l.q, 0);
  const cartCount = () => cartLines().reduce((s, l) => s + l.q, 0);
  function updateCartBar(bump) {
    const n = cartCount();
    $('#cartN').textContent = n; $('#cartTotal').textContent = eur(cartTotal());
    document.body.classList.toggle('has-cart', n > 0);
    if (bump && !reduce) { const b = $('#cartbar'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    if ($('#cartSheet').classList.contains('on')) { renderCartLines(); }
  }
  function addToCart(id, q) {
    const it = S.sById[id]; if (!it || it.soldOut) return;
    S.cart[id] = (S.cart[id] || 0) + (q || qtyOf(it)); S.qty[id] = defQty(it); saveCart(); updateCartBar(true);
  }
  function setQtyUI(id) {
    const it = S.sById[id]; if (!it) return;
    const o = document.querySelector(`[data-qout="${CSS.escape(id)}"]`); if (!o) return;
    o.textContent = qtyOf(it);
    const m = o.parentElement.querySelector('[data-sq="-1"]'); if (m) m.disabled = qtyOf(it) <= 1;
  }
  /* Quita del carrito lo que deja de estar disponible (agotado o desactivado desde el panel). */
  function pruneCart() {
    if (!S.store) return [];
    const gone = [];
    Object.keys(S.cart).forEach((id) => { const it = S.sById[id]; if (!it || it.soldOut) { gone.push((S.byId[id] || {}).name || id); delete S.cart[id]; } });
    if (gone.length) { saveCart(); updateCartBar(false); if ($('#cartSheet') && $('#cartSheet').classList.contains('on')) renderCartSheet(); }
    return gone;
  }
  const goneMsg = (g) => (g.length === 1 ? `${g[0]} se ha agotado y se ha quitado de tu pedido.` : `${g.length} platos se han agotado y se han quitado de tu pedido.`);
  function setStore(k, opt) {
    opt = opt || {};
    if (!S.site.stores[k]) return;
    const prev = S.store; S.store = k; lsSet(STORE_KEY, k);
    buildStoreView();
    const gone = [];
    Object.keys(S.cart).forEach((id) => { if (!S.sById[id] || S.sById[id].soldOut) { gone.push((S.byId[id] || {}).name || id); delete S.cart[id]; } });
    saveCart(); S.qty = {};
    renderShop(); renderMenu(false); updateStoreChip(); updateCartBar(false);
    const n = $('#openNow'); if (n) n.innerHTML = openNowHTML();
    if (prev && prev !== k && gone.length) toast(gone.length === 1 ? `${gone[0]} no está disponible en ${S.site.stores[k].name} y se ha quitado.` : `${gone.length} platos no están disponibles en ${S.site.stores[k].name} y se han quitado.`);
    if (opt.go) { const t = $('#shopWrap'); if (t) requestAnimationFrame(() => t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })); }
  }
  function updateStoreChip() {
    const c = $('#storeChip'), st = storeOf(); if (!c) return;
    c.classList.toggle('empty', !st); $('#storeChipName').textContent = st ? st.name : 'Elige local';
    c.setAttribute('aria-label', st ? 'Local: ' + st.name + '. Cambiar' : 'Elegir local');
  }
  const waMsg = () => {
    const st = storeOf() || {}, lines = cartLines().map((l) => `• ${l.q} × ${l.it.name} (${eur(l.it.price * l.q)})`);
    return `Hola, quiero hacer un pedido en Arroz en Caja ${st.name || ''}.\n\n${lines.join('\n')}\n\nTotal de platos (IVA incl.): ${eur(cartTotal())}`;
  };
  function renderCartSheet() {
    const st = storeOf();
    $('#cartBody').innerHTML = `${st ? `<div class="cart-shop"><span>Pedido en <b>${esc(st.name)}</b></span><button type="button" data-store-change>Cambiar</button></div>` : ''}<ul class="lines" id="cartLines"></ul><div class="upsell" id="upsell"></div>`;
    renderCartLines();
  }
  function upsellItems() {
    const have = new Set(cartLines().map((l) => l.it.id)), out = [];
    ['bebidas', 'postres', 'patatas', 'vinos', 'extras'].forEach((c) => { const x = S.sitems.find((i) => i.cat === c && !have.has(i.id) && !i.soldOut && !(i.priceMax && i.priceMax > i.price)); if (x) out.push(x); });
    return out.slice(0, 4);
  }
  function renderCartLines() {
    const ul = $('#cartLines'); if (!ul) return;
    const lines = cartLines(), st = storeOf() || {}, o = ORD();
    const lo = S.lastOrder;
    ul.innerHTML = lines.length ? lines.map((l) => `<li class="line"><b>${esc(l.it.name)}</b><span class="p">${eur(l.it.price * l.q)}</span><span class="qty"><button data-q="-1" data-id="${esc(l.it.id)}" aria-label="Quitar uno de ${esc(l.it.name)}">−</button><output>${l.q}</output><button data-q="1" data-id="${esc(l.it.id)}" aria-label="Añadir uno de ${esc(l.it.name)}">+</button></span></li>`).join('') : `<li class="empty-cart">Tu pedido está vacío. Elige algo de la carta.${lo && lo.lines && lo.lines.length ? '<br><button class="tlink" type="button" data-repeat style="margin-top:10px">Repetir mi último pedido</button>' : ''}</li>`;
    const up = upsellItems(), us = $('#upsell');
    if (us) us.innerHTML = lines.length && up.length ? `<h3>Completa tu pedido</h3><div class="up-row">${up.map((i) => `<div class="up"><div><b>${esc(i.name)}</b><small>${eur(i.price)}</small></div><button type="button" data-upadd="${esc(i.id)}" aria-label="Añadir ${esc(i.name)}">${ICON.plus}</button></div>`).join('')}</div>` : '';
    const wa = S.site.contact.whatsapp, bl = orderBlock(st), can = lines.length > 0 && !bl;
    const ship = (o.shipping && o.shipping.label) || '';
    $('#cartFoot').innerHTML = `<div class="sum-rows"><div><span>Platos (IVA incluido)</span><span class="tot" style="font-size:1.35rem">${eur(cartTotal())}</span></div>${ship ? `<div class="mut"><span>Envío a domicilio</span><span>${esc(ship)}</span></div>` : ''}</div>
      ${bl ? `<p class="note warn" style="margin:0">${esc(bl.text)}</p>` : ''}<button class="btn xl" type="button" data-checkout ${can ? '' : 'disabled'}>Finalizar pedido ${ICON.arrow}</button>
      ${wa ? `<div class="row-links"><a class="tlink" style="${can ? '' : 'pointer-events:none;opacity:.4'}" href="${can ? `https://wa.me/${encodeURIComponent(wa)}?text=${encodeURIComponent(waMsg())}` : '#'}" target="_blank" rel="noopener">Prefiero enviarlo por WhatsApp</a></div>` : ''}
      <p class="note">${esc(o.shipping && o.shipping.note || '')}</p>`;
  }
  function repeatLast() {
    const lo = S.lastOrder; if (!lo || !lo.lines || !lo.lines.length) return;
    if (lo.store && lo.store !== S.store && S.site.stores[lo.store]) setStore(lo.store);
    let n = 0, miss = 0;
    lo.lines.forEach((l) => { const it = S.sById[l.id]; if (it && !it.soldOut) { S.cart[l.id] = (S.cart[l.id] || 0) + l.q; n++; } else miss++; });
    saveCart(); updateCartBar(true); renderShop();
    toast(miss ? `Añadidos ${n} platos. ${miss} ya no están disponibles hoy.` : `Añadidos los ${n} platos de tu último pedido.`);
    if (!$('#cartSheet').classList.contains('on')) openSheet('cartSheet');
  }

  /* ---------------- finalizar compra ---------------- */
  /* Estados del pedido: Recibido, Confirmado, En preparación, Listo para recoger / En camino, Entregado y Cancelado (el estado del mensaje al cliente va aparte, en el panel). */
  const ST_LABEL = { nuevo: 'Recibido', confirmado: 'Confirmado', preparando: 'En preparación', listo: 'Listo para recoger', encamino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };
  const ST_SHORT = { nuevo: 'Recibido', confirmado: 'Confirmado', preparando: 'Preparando', listo: 'Listo', encamino: 'En camino', entregado: 'Entregado' };
  const stFlow = (mode) => (mode === 'recoger' ? ['nuevo', 'confirmado', 'preparando', 'listo', 'entregado'] : ['nuevo', 'confirmado', 'preparando', 'encamino', 'entregado']);
  AEC.ST = { all: ['nuevo', 'confirmado', 'preparando', 'listo', 'encamino', 'entregado', 'cancelado'], flow: stFlow, label: null };
  const stepOf = (id) => (S.statusMap && S.statusMap[id]) || 'nuevo';
  const stepLabel = (k, mode) => (k === 'entregado' && mode === 'recoger' ? 'Recogido' : (ST_LABEL[k] || k));
  AEC.ST.label = stepLabel;
  const okPhone = (v) => { let d = String(v || '').replace(/[^\d+]/g, ''); d = d.replace(/^(\+34|0034|34)(?=\d{9}$)/, ''); return /^[6-9]\d{8}$/.test(d); };
  const okMail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
  const ZIPS = { avila: ['05'], colmenar: ['28'], trescantos: ['28'] };
  const FIELD_MAP = { coName: 'name', coSurname: 'surname', coEmail: 'email', coPhone: 'phone', coStreet: 'street', coZip: 'zip', coCity: 'city', coNote: 'note' };

  function openCheckout() {
    if (!cartCount()) return;
    const bl = orderBlock(storeOf()); if (bl) { toast(bl.text); return; }
    openSheet('coSheet');
  }
  function renderCheckout() {
    $('#coTitle').textContent = 'Finalizar compra'; doneOrder = null;
    const st = storeOf(), ck = S.ck, lines = cartLines(), o = ORD();
    if (!st) { $('#coBody').innerHTML = '<p class="empty-co">Elige primero un local.</p>'; $('#coFoot').innerHTML = ''; return; }
    if (!lines.length) { $('#coBody').innerHTML = '<p class="empty-co">Tu pedido está vacío.</p>'; $('#coFoot').innerHTML = ''; return; }
    const saved = lsGet(CONTACT_KEY, null);
    if (saved && !ck._loaded) { Object.keys(saved).forEach((k) => { if (!ck[k]) ck[k] = saved[k]; }); ck._loaded = true; }
    if (ck.mode === 'domicilio' && st.deliveryOff) ck.mode = 'recoger'; else if (ck.mode !== 'domicilio' && st.pickupOff) ck.mode = 'domicilio';
    const days = openDays(st);
    if (!days.includes(ck.date)) ck.date = days[0] || '';
    const dom = ck.mode === 'domicilio';
    const ship = (o.shipping && o.shipping.label) || '';
    const f = (id, label, val, attrs, extra) => `<label class="field" data-f="${id}" for="${id}">${label}<input id="${id}" name="${id}" value="${esc(val || '')}" ${attrs || ''}><span class="err" id="${id}-e" role="alert"></span>${extra || ''}</label>`;
    $('#coBody').innerHTML = `<form class="co" id="coForm" novalidate autocomplete="on">
      <details class="co-sum" open><summary><span>Tu pedido · ${cartCount()} ${cartCount() === 1 ? 'plato' : 'platos'}</span><span>${eur(cartTotal())}</span></summary><div class="in"><ul class="lines">${lines.map((l) => `<li class="line"><b>${l.q} × ${esc(l.it.name)}</b><span class="p">${eur(l.it.price * l.q)}</span></li>`).join('')}</ul>
        <div class="sum-rows"><div><span>Platos (IVA incluido)</span><span>${eur(cartTotal())}</span></div>${dom && ship ? `<div class="mut"><span>Envío a domicilio</span><span>${esc(ship)}</span></div>` : ''}</div></div></details>
      <fieldset><legend>Método de entrega</legend><div class="seg" role="radiogroup" aria-label="Método de entrega"><label><input type="radio" name="coMode" value="domicilio"${dom ? ' checked' : ''}${st.deliveryOff ? ' disabled' : ''}><span>${st.deliveryOff ? 'Entrega a domicilio (no disponible ahora)' : 'Entrega a domicilio'}</span></label><label><input type="radio" name="coMode" value="recoger"${dom ? '' : ' checked'}${st.pickupOff ? ' disabled' : ''}><span>${st.pickupOff ? 'Recogida (no disponible ahora)' : 'Recogida en el local de ' + esc(st.name)}</span></label></div></fieldset>
      <div class="grid2"><label class="field" data-f="coDate" for="coDate">Fecha<select id="coDate" name="coDate">${days.map((d) => `<option value="${d}"${d === ck.date ? ' selected' : ''}>${esc(dayText(d))}</option>`).join('')}</select><span class="err" id="coDate-e" role="alert"></span></label>
        <label class="field" data-f="coTime" for="coTime">Hora<select id="coTime" name="coTime"></select><span class="err" id="coTime-e" role="alert"></span></label></div>
      <p class="co-note">${dom ? 'Entrega a domicilio' : 'Recogida'} · ${esc(o.leadNote || '')} Solo mostramos las horas en las que ${esc(st.name)} sirve pedidos.</p>
      <fieldset><legend>Tus datos</legend><div class="grid2" style="gap:12px">
        ${f('coName', 'Nombre', ck.name, 'autocomplete="given-name" autocapitalize="words" enterkeyhint="next" required')}${f('coSurname', 'Apellidos', ck.surname, 'autocomplete="family-name" autocapitalize="words" enterkeyhint="next" required')}
        ${f('coEmail', 'Email', ck.email, 'type="email" inputmode="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" required')}${f('coPhone', 'Teléfono', ck.phone, 'type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" required')}</div></fieldset>
      ${dom ? `<fieldset><legend>Dirección de entrega</legend><div style="display:grid;gap:12px">${f('coStreet', 'Calle, número, piso', ck.street, 'autocomplete="address-line1" enterkeyhint="next" required')}
        <div class="grid-zip">${f('coZip', 'C. postal', ck.zip, 'inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code" enterkeyhint="next" required')}${f('coCity', 'Población', ck.city, 'autocomplete="address-level2" enterkeyhint="next" required')}</div>
        <p class="co-note warn" id="zipWarn" hidden></p></div></fieldset>`
    : `<div class="co-note"><b>Recoges en:</b> ${esc(st.address || st.name)}${st.phone ? '<br>Tel. ' + esc(st.phone) : ''}</div>`}
      <label class="field" for="coNote">Notas para el local (opcional)<textarea id="coNote" name="coNote" rows="2" placeholder="Alergias, portal, timbre…">${esc(ck.note || '')}</textarea></label>
      <fieldset><legend>Método de pago</legend><div class="pay" role="radiogroup">${(o.payments || []).map((p) => `<label><input type="radio" name="coPay" value="${esc(p.id)}"${ck.pay === p.id ? ' checked' : ''}>${esc(p.label)}</label>`).join('')}</div>
        <p class="demo-note" style="margin-top:10px"><span><b>Modo demostración.</b> Esta página no cobra ni envía el pedido al local: el pago real lo hace la pasarela de la web actual.</span></p></fieldset>
      <label class="consent" for="coTerms"><input id="coTerms" type="checkbox"${ck.terms ? ' checked' : ''}><span>He leído y acepto la <a href="${esc(o.privacyUrl || '#')}" target="_blank" rel="noopener">política de privacidad</a> y las <a href="${esc(o.termsUrl || '#')}" target="_blank" rel="noopener">condiciones de compra y devolución</a>.</span></label><span class="err" id="coTerms-e" role="alert" style="color:var(--granate);font-weight:600;font-size:14.5px"></span>
      <label class="consent" for="coRem"><input id="coRem" type="checkbox"${ck.remember ? ' checked' : ''}><span>Recordar mis datos en este dispositivo para el próximo pedido</span></label>
    </form>`;
    fillTimes();
    $('#coFoot').innerHTML = `<button class="btn xl" id="coSubmit" type="button">Realizar el pedido · ${eur(cartTotal())}</button><p class="note" style="text-align:center">${dom && ship ? 'Más envío: ' + esc(ship) + '. ' : ''}Precios con IVA incluido.</p>`;
  }
  function fillTimes() {
    const st = storeOf(), sel = $('#coTime'); if (!sel || !st) return;
    const slots = S.ck.date ? slotsFor(st, S.ck.date).map(hm) : [];
    if (!slots.includes(S.ck.time)) S.ck.time = '';
    sel.innerHTML = `<option value="">Elige una hora</option>` + slots.map((t) => `<option value="${t}"${t === S.ck.time ? ' selected' : ''}>${t}</option>`).join('');
  }
  function zipWarn() {
    const w = $('#zipWarn'); if (!w) return;
    const z = S.ck.zip, pre = ZIPS[S.store] || [];
    const bad = /^\d{5}$/.test(z) && pre.length && !pre.some((p) => z.startsWith(p));
    w.hidden = !bad; if (bad) w.textContent = `Este código postal no parece de la zona de ${storeOf().name}. Revisa la dirección o elige otro local; el reparto se confirma según la zona.`;
  }
  function fieldErr(id, msg) {
    const e = $('#' + id + '-e'), wrap = e && e.closest('.field'); if (e) e.textContent = msg || '';
    const inp = $('#' + id); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    if (wrap) wrap.classList.toggle('bad', !!msg);
  }
  function validateCheckout() {
    const ck = S.ck, dom = ck.mode === 'domicilio', er = {};
    if (!ck.date) er.coDate = 'Elige una fecha'; if (!ck.time) er.coTime = 'Elige una hora';
    if ((ck.name || '').trim().length < 2) er.coName = 'Escribe tu nombre';
    if ((ck.surname || '').trim().length < 2) er.coSurname = 'Escribe tus apellidos';
    if (!okMail(ck.email)) er.coEmail = 'Escribe un email válido, por ejemplo nombre@correo.es';
    if (!okPhone(ck.phone)) er.coPhone = 'Escribe un teléfono de 9 cifras';
    if (dom) { if ((ck.street || '').trim().length < 5) er.coStreet = 'Escribe calle, número y piso'; if (!/^\d{5}$/.test(ck.zip || '')) er.coZip = '5 cifras'; if ((ck.city || '').trim().length < 2) er.coCity = 'Escribe la población'; }
    if (!ck.terms) er.coTerms = 'Debes aceptar las condiciones para continuar';
    return er;
  }
  const ORDER_FIELDS = ['coDate', 'coTime', 'coName', 'coSurname', 'coEmail', 'coPhone', 'coStreet', 'coZip', 'coCity', 'coTerms'];
  function orderId() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = ''; for (let i = 0; i < 4; i++) r += a[Math.floor(Math.random() * a.length)]; return 'AEC-' + madridNow().ymd.slice(2).replace(/-/g, '') + '-' + r; }
  function buildOrder() {
    const ck = S.ck, st = storeOf(), dom = ck.mode === 'domicilio';
    return { id: orderId(), ts: Date.now(), store: S.store, storeName: st.name, mode: ck.mode, date: ck.date, time: ck.time,
      customer: { name: ck.name.trim(), surname: ck.surname.trim(), email: ck.email.trim(), phone: ck.phone.trim() },
      address: dom ? { street: ck.street.trim(), zip: ck.zip, city: ck.city.trim() } : null, note: (ck.note || '').trim(), pay: 'demo',
      lines: cartLines().map((l) => ({ id: l.it.id, name: l.it.name, q: l.q, price: l.it.price })), subtotal: Math.round(cartTotal() * 100) / 100, shipping: dom ? ((ORD().shipping || {}).label || '') : '', demo: true };
  }
  async function saveOrder(o) {
    const { db, user } = S.cap; if (!db || !user) return false;
    const id = await Promise.race([user.id(), new Promise((r) => setTimeout(() => r(null), 6000))]); if (!id) return false;
    const ref = db.doc('orders/' + id), snap = await ref.get();
    const items = (snap.exists && (snap.data().items || [])) || []; items.push(o);
    await ref.set({ items: items.slice(-30) }); return true;
  }
  async function placeOrder() {
    if (S.sending) return;
    const er = validateCheckout();
    ORDER_FIELDS.forEach((id) => fieldErr(id, er[id]));
    const first = ORDER_FIELDS.find((id) => er[id]);
    if (first) { const el = $('#' + first); if (el) { el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); try { el.focus({ preventScroll: true }); } catch (e) { /* noop */ } } return; }
    { const bl = orderBlock(storeOf()); if (bl) { toast(bl.text); return; } const g = pruneCart(); if (g.length) { toast(goneMsg(g)); if (!cartCount()) closeSheet(); else renderCheckout(); return; } }
    S.sending = true; const b = $('#coSubmit'); b.disabled = true; b.textContent = 'Enviando pedido…';
    const o = buildOrder(); let saved = false;
    try { saved = await saveOrder(o); } catch (e) { saved = false; }
    if (S.ck.remember) lsSet(CONTACT_KEY, { name: S.ck.name, surname: S.ck.surname, email: S.ck.email, phone: S.ck.phone, street: S.ck.street, zip: S.ck.zip, city: S.ck.city }); else { try { localStorage.removeItem(CONTACT_KEY); } catch (e) { /* noop */ } }
    S.lastOrder = { id: o.id, ts: o.ts, store: o.store, mode: o.mode, lines: o.lines.map((l) => ({ id: l.id, q: l.q })) }; lsSet(LAST_KEY, S.lastOrder);
    S.cart = {}; saveCart(); S.qty = {}; S.sending = false;
    showDone(o, saved); updateCartBar(false); renderShop(); renderMenu(false);
  }
  /* mensajes con el local: los del local viven en msgs/<uid> (solo los escribe el administrador); las respuestas del cliente, en su propio pedido */
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
  const threadOf = (id) => (S.msgs[id] || []).map((m) => Object.assign({}, m, { t: 'l' })).concat((((S.mine[id] || {}).msgs) || []).map((m) => Object.assign({}, m, { t: 'c' }))).sort((a, b) => a.ts - b.ts);
  const newFromLocal = (id) => (S.msgs[id] || []).filter((m) => m.ts > (S.msgSeen[id] || 0)).length;
  function markSeen(id) { const l = (S.msgs[id] || []); if (!l.length) return; S.msgSeen[id] = l[l.length - 1].ts; lsSet(SEEN_KEY, S.msgSeen); }
  function threadHTML(id) {
    const th = threadOf(id);
    return th.length ? th.map((m) => `<li class="bub ${m.t}${m.k === 'delay' ? ' delay' : ''}"><span>${m.k === 'delay' ? '<b>Retraso' + (m.min ? ' · unos ' + m.min + ' min' : '') + '.</b> ' : ''}${esc(m.txt)}</span><time>${m.t === 'c' ? 'Tú' : 'Local'} · ${hhmm(m.ts)}</time></li>`).join('') : '';
  }
  function msgSection(o, st) {
    const t = threadHTML(o.id);
    return `<section class="msgs" aria-label="Mensajes con el local"><h4>Mensajes con ${esc(st.name || 'el local')}</h4><ul class="thread" id="thread" aria-live="polite">${t}</ul><p class="thread-empty" id="threadEmpty"${t ? ' hidden' : ''}>Aquí verás los avisos del local (retrasos, dudas sobre tu dirección…). También puedes escribirles.</p>
      <form id="msgForm" class="msg-form" autocomplete="off"><input id="msgIn" type="text" maxlength="240" placeholder="Escribe al local…" enterkeyhint="send" aria-label="Mensaje para el local"><button class="btn sm" type="submit">Enviar</button></form></section>`;
  }
  async function sendReply() {
    const inp = $('#msgIn'), id = doneOrder && doneOrder.id, txt = inp ? inp.value.trim().slice(0, 240) : ''; if (!txt || !id) return;
    const { db } = S.cap; if (!db || !S.uid) { toast('No se puede enviar desde esta vista.'); return; }
    inp.value = '';
    try {
      const ref = db.doc('orders/' + S.uid), snap = await ref.get(), items = (snap.exists && snap.data().items) || [], o = items.find((x) => x.id === id); if (!o) throw new Error('no order');
      o.msgs = (o.msgs || []).concat([{ k: 'msg', txt, ts: Date.now() }]).slice(-30); await ref.set({ items });
    } catch (e) { inp.value = txt; toast('No se ha podido enviar. Inténtalo de nuevo.'); }
  }
  function openTracking() {
    const lo = S.lastOrder, o = lo && S.mine[lo.id];
    if (!o) { toast(S.cap.db ? 'Estamos cargando tu pedido. Inténtalo en un momento.' : 'El seguimiento no está disponible en esta vista.'); return; }
    openSheet('coSheet', o);
  }
  function trackHTML(o) {
    const st = stepOf(o.id);
    if (st === 'cancelado') return '<p class="track-cancel" role="status"><b>Pedido cancelado.</b> Si tienes dudas, escríbenos aquí abajo.</p>';
    const flow = stFlow(o.mode); let cur = flow.indexOf(st);
    if (cur < 0) cur = st === 'listo' ? flow.indexOf('encamino') : st === 'encamino' ? flow.indexOf('listo') : 0;
    return `<ol class="track" style="grid-template-columns:repeat(${flow.length},1fr)" aria-label="Estado del pedido">${flow.map((k, i) => `<li class="${i <= cur ? 'on' : ''}${i === cur ? ' cur' : ''}"${i === cur ? ' aria-current="step"' : ''}><i></i>${esc(k === 'entregado' && o.mode === 'recoger' ? 'Recogido' : ST_SHORT[k])}</li>`).join('')}</ol>`;
  }
  let doneOrder = null;
  function showDone(o, saved) {
    doneOrder = o;
    const st = S.site.stores[o.store] || {}, dom = o.mode === 'domicilio';
    $('#coTitle').textContent = 'Pedido recibido';
    $('#coBody').innerHTML = `<div class="ok-wrap"><div class="ok-ring"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h3>¡Gracias, ${esc(o.customer.name)}!</h3><span class="ok-num">${esc(o.id)}</span>
      <div id="trackWrap" style="width:100%">${trackHTML(o)}</div>${saved ? msgSection(o, st) : ''}
      <div class="ok-card"><div><b>${dom ? 'Entrega a domicilio' : 'Recogida'}</b> · ${esc(dayText(o.date))} a las ${esc(o.time)}</div><div>${dom ? esc(o.address.street) + ', ' + esc(o.address.zip) + ' ' + esc(o.address.city) : esc(st.address || st.name)}</div>
        <div>${o.lines.map((l) => `${l.q} × ${esc(l.name)}`).join('<br>')}</div><div><b>Platos: ${eur(o.subtotal)}</b> (IVA incl.)${dom && o.shipping ? ' · envío ' + esc(o.shipping) : ''}</div></div>
      <p class="demo-note" style="text-align:left"><span><b>Modo demostración.</b> ${saved ? 'El pedido se ha guardado en el panel de administración de esta página, pero no se ha enviado al local ni se ha cobrado nada.' : 'No se ha podido guardar en el panel desde esta vista; no se ha enviado al local ni se ha cobrado nada.'}</span></p></div>`;
    $('#coFoot').innerHTML = `<button class="btn xl" type="button" data-close>Volver a la carta</button>`;
    markSeen(o.id); renderShop();
    /* iOS restaura el scroll previo (y el teclado reajusta la vista) tras sustituir el contenido: se reinicia varias veces */
    const b = $('#coBody'), top = () => { if (b && b.scrollTop) b.scrollTop = 0; };
    if (b) { b.scrollTop = 0; requestAnimationFrame(top); [90, 260, 600].forEach((ms) => setTimeout(top, ms)); }
  }
  function refreshTrack() {
    const w = $('#trackWrap'); if (w && doneOrder) w.innerHTML = trackHTML(doneOrder);
    renderShop();
  }
  function refreshThread() {
    const th = $('#thread'); if (th && doneOrder) {
      const h = threadHTML(doneOrder.id); if (th.innerHTML !== h) th.innerHTML = h;
      const em = $('#threadEmpty'); if (em) em.hidden = !!h;
      if (openEl && openEl.id === 'coSheet') markSeen(doneOrder.id);
    }
    renderShop();
  }
  function renderStoreSheet() { $('#storeBody').innerHTML = `<div class="pick-sheet"><div class="pick">${pickCards(S.store)}</div><p class="pick-note">Al cambiar de local se actualiza la carta y los platos de tu pedido que no estén disponibles allí.</p></div>`; }

  /* ---------------- sheets ---------------- */
  let openEl = null, lastFocus = null;
  function openSheet(id, track) {
    closeMenu(); if (openEl) closeSheet(true);
    const el = $('#' + id); if (!el) return;
    lastFocus = document.activeElement; openEl = el;
    if (id === 'cartSheet') renderCartSheet();
    else if (id === 'storeSheet') renderStoreSheet();
    else if (id === 'coSheet') { if (track) showDone(track, true); else renderCheckout(); }
    el.classList.add('on'); el.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); document.body.style.overflow = 'hidden';
    setTimeout(() => { const f = el.querySelector(id === 'chatSheet' ? 'input,button.x' : 'button.x'); if (f) f.focus({ preventScroll: true }); }, 60);
    if (id === 'chatSheet') initChat();
  }
  function closeSheet(keepScrim) {
    if (!openEl) return;
    openEl.style.transform = ''; openEl.classList.remove('on', 'drag'); openEl.setAttribute('aria-hidden', 'true'); openEl = null;
    if (!keepScrim) { $('#scrim').classList.remove('on'); document.body.style.overflow = ''; }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* Hojas: arrastrar hacia abajo para cerrar. Sigue al dedo 1:1, resiste hacia arriba y un gesto rápido basta (velocidad > 0,11 px/ms). */
  const rubber = (o, d) => (o * d * 0.55) / (d + 0.55 * Math.abs(o));
  function sheetDrag() {
    $$('.sheet').forEach((sh) => {
      let id = null, y0 = 0, dy = 0, hist = [];
      sh.addEventListener('pointerdown', (e) => {
        if (id !== null || window.innerWidth >= 760 || !e.target.closest('.grab, .sheet-h') || e.target.closest('.x') || (e.pointerType === 'mouse' && e.button !== 0)) return;
        id = e.pointerId; y0 = e.clientY; dy = 0; hist = [[e.timeStamp, e.clientY]];
        sh.classList.add('drag');
        try { sh.setPointerCapture(id); } catch (err) { /* noop */ }
      });
      sh.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        const raw = e.clientY - y0;
        dy = raw >= 0 ? raw : -rubber(-raw, sh.offsetHeight);
        sh.style.transform = `translateY(${dy.toFixed(1)}px)`;
        hist.push([e.timeStamp, e.clientY]); if (hist.length > 6) hist.shift();
      });
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null; sh.classList.remove('drag');
        hist.push([e.timeStamp, e.clientY]);
        const last = hist[hist.length - 1], ref = hist.find((h) => last[0] - h[0] < 120) || hist[0];
        const v = (last[1] - ref[1]) / Math.max(1, last[0] - ref[0]);
        if (e.type === 'pointerup' && (dy > sh.offsetHeight * 0.3 || v > 0.11)) closeSheet();
        else sh.style.transform = '';
      };
      sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
    });
  }
  function closeMenu() { $('#menu').classList.remove('on'); const b = $('#burger'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Abrir menú'); }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2800); }
  AEC.toast = toast;

  /* ---------------- assistant ---------------- */
  function menuContext() {
    const lines = [];
    S.cats.forEach((c) => {
      const its = catalog().filter((i) => i.cat === c.id);
      if (!its.length) return;
      lines.push('## ' + c.label);
      its.forEach((i) => lines.push(`- ${i.name}: ${i.priceMax && i.priceMax > i.price ? 'desde ' : ''}${eur(i.price)}${i.soldOut ? ' (agotado)' : ''}${i.desc ? ' — ' + i.desc : ''} | alérgenos: ${i.allergens ? i.allergens.map((a) => ALG[a] || a).join(', ') : 'SIN DATOS'}`));
    });
    return lines.join('\n');
  }
  function storesContext() {
    const s = S.site;
    return s.storeOrder.map((k) => { const t = s.stores[k]; return `- ${t.name}: ${t.address || 'dirección no disponible'}; teléfono: ${t.phone || 'no disponible'}; horario: ${t.hours || 'no disponible'}${t.hoursNote ? ' (' + t.hoursNote + ')' : ''}; pedido web: ${t.orderUrl}`; }).join('\n');
  }
  function buildSystem() {
    const s = S.site;
    return `Eres el asistente web de Arroz en Caja, un negocio de arroces y fideuás cocinados por encargo en Madrid (Colmenar Viejo, Tres Cantos) y Ávila. Responde en español, con tono cercano, en un máximo de 4 frases cortas, sin markdown.
Reglas: usa solo los datos de abajo. Si algo no está, dilo y sugiere llamar al local. Nunca inventes precios, alérgenos, tamaños de ración ni horarios. Si un plato figura "SIN DATOS" de alérgenos, no afirmes que esté libre de ninguno: recomienda confirmarlo en el local. Cuando recomiendes platos, cita el nombre exacto y el precio.
Para pedir: por la web del local, por teléfono o por WhatsApp; también se puede armar el pedido en esta página (elige primero el local) y finalizarlo con el botón «Finalizar pedido».
Envíos: ${s.how.delivery}
Cocina: ${s.why.p1.replace(/\*\*/g, '')} ${s.why.p3.replace(/\*\*/g, '')} ${s.eco.p1.replace(/\*\*/g, '')}
Franquicia: ${s.franchise.faq.map((f) => f.q + ' ' + f.a).join(' ')}
${s.assistant.notes ? 'Información adicional del negocio: ' + s.assistant.notes + '\n' : ''}LOCALES:\n${storesContext()}\nCARTA ${storeOf() ? 'de ' + storeOf().name : '(precios de Colmenar Viejo; el cliente aún no ha elegido local)'}, IVA incluido:\n${menuContext()}`;
  }
  function localAnswer(q) {
    const t = norm(q), s = S.site;
    const stores = s.storeOrder.map((k) => s.stores[k]);
    const hasWord = (re) => re.test(t);
    const algKeys = { gluten: /gluten|celiac/, lacteos: /lactosa|lacteo|leche/, huevos: /huevo/, pescado: /pescado/, crustaceos: /marisco|crustace|gamba/, moluscos: /molusco/, soja: /soja/, sulfitos: /sulfito/, apio: /apio/, mostaza: /mostaza/, cacahuetes: /cacahuete|frutos secos/, frutos_con_cascara: /frutos secos|cascara|nueces|almendra/, sesamo: /sesamo/ };
    const hit = Object.keys(algKeys).filter((a) => algKeys[a].test(t));
    if (hit.length || hasWord(/alergen|alergi|intolera|celiac/)) {
      if (hit.length) {
        const ok = catalog().filter((i) => i.allergens && !hit.some((a) => i.allergens.includes(a))).slice(0, 8);
        return (ok.length ? `Con alérgenos confirmados y sin ${hit.map((a) => ALG[a]).join(' ni ')}: ${ok.map((i) => i.name).join(', ')}.` : 'No tengo platos confirmados sin esos alérgenos.') + ' De las demás elaboraciones no tengo la ficha de alérgenos: confírmalo siempre en tu local.';
      }
      return 'Indica el alérgeno (por ejemplo gluten o lácteos) y te digo qué platos lo evitan. También puedes usar el filtro de alérgenos de la carta.';
    }
    if (hasWord(/horari|abiert|cierr|abre|hora(s)? de/)) { const l = stores.filter((x) => x.hours).map((x) => `${x.name}: ${x.hours.replace(/,\s*/g, ' y ').replace(/-/g, ' a ')}${x.hoursNote ? '. ' + x.hoursNote : ''}`); return l.length ? l.join('\n') : 'Ahora mismo no tengo el horario. Llama a tu local para confirmarlo.'; }
    if (hasWord(/donde|direccion|ubicacion|llegar|local(es)?|tienda/)) return stores.map((x) => `${x.name}${x.address ? ': ' + x.address : ''}`).join('\n');
    if (hasWord(/telefon|llamar|whatsapp|contact/)) { const l = stores.filter((x) => x.phone).map((x) => `${x.name}: ${x.phone}`); return l.length ? l.join('\n') : 'Escríbenos por WhatsApp o pide desde la web de tu local.'; }
    if (hasWord(/envio|domicilio|reparto|entreg|cuanto tarda|tardan|portes/)) return s.how.delivery;
    if (hasWord(/franquicia|franquiciar|abrir (una )?tienda/)) return s.franchise.faq.map((f) => f.a).join(' ') + ' Rellena el formulario de franquicia al final de la página.';
    if (hasWord(/recicl|envase|medio ambiente|aluminio|embalaje/)) return s.eco.p1.replace(/\*\*/g, '') + ' ' + s.eco.p2.replace(/\*\*/g, '');
    if (hasWord(/pagar|pago|tarjeta|efectivo|bizum/)) return 'Los gastos de envío se pagan al hacer el pedido. Para otras formas de pago, consulta con tu local.';
    if (hasWord(/vegetarian|vegano|vegana|verdura/)) { const v = catalog().filter((i) => /verdura|huerta|vegana|risotto|setas|pinicola/.test(norm(i.name))).map((i) => `${i.name} (${eur(i.price)})`); return (v.length ? 'Por su nombre, estas opciones llevan verduras o setas: ' + v.join(', ') + '. ' : '') + 'Confirma en tu local los caldos y sofritos.'; }
    const toks = t.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/que|cual|como|cuanto|cuesta|precio|vale|tienen|hay|para|los|las|del|con|una|uno/.test(w));
    if (toks.length) {
      let m = catalog().filter((i) => toks.every((w) => norm(i.name).includes(w)));
      if (!m.length) m = catalog().filter((i) => toks.some((w) => w.length > 4 && norm(i.name).includes(w)));
      m = m.slice(0, 6);
      if (m.length) return m.map((i) => `${i.name}: ${i.priceMax && i.priceMax > i.price ? 'desde ' : ''}${eur(i.price)}${i.soldOut ? ' (agotado)' : ''}`).join('\n');
    }
    return 'Con eso no puedo ayudarte desde aquí. Prueba a preguntar por un plato, los alérgenos, horarios, envíos o cómo pedir, o llama a tu local.';
  }
  function chatMsg(role, text) {
    const d = document.createElement('div'); d.className = 'm ' + (role === 'me' ? 'me' : 'bot'); d.textContent = text;
    $('#chatLog').appendChild(d); $('#chatBody').scrollTop = $('#chatBody').scrollHeight; return d;
  }
  function initChat() {
    const log = $('#chatLog');
    if (!log.childElementCount) {
      chatMsg('bot', S.site.assistant.welcome);
      $('#chatSugg').innerHTML = ['¿Qué platos no llevan gluten?', '¿Cuánto tarda el envío a domicilio?', '¿A qué hora abre Colmenar Viejo?', '¿Cuánto cuesta la fideuá marinera?'].map((q) => `<button type="button" data-sugg="${esc(q)}">${esc(q)}</button>`).join('');
    }
  }
  async function ask(q) {
    const sample = S.cap.sample;
    if (!sample) return localAnswer(q);
    let hist = S.chatHist.slice(-6); while (hist.length && hist[0].role !== 'user') hist.shift();
    const msgs = hist.concat([{ role: 'user', content: q }]);
    msgs[0] = { role: 'user', content: buildSystem() + '\n\nPregunta del cliente: ' + msgs[0].content };
    const r = await sample(msgs, { modelTier: 'quick', cache: false, onText: ask.onText });
    return (r && r.text ? r.text : '').trim() || localAnswer(q);
  }
  AEC.ask = async (q) => { try { return await ask(q); } catch (e) { return localAnswer(q); } };
  async function submitAsk(q) {
    q = q.trim(); if (!q) return;
    $('#chatSugg').innerHTML = '';
    chatMsg('me', q);
    const typing = document.createElement('div'); typing.className = 'm bot typing'; typing.innerHTML = '<i></i><i></i><i></i>'; $('#chatLog').appendChild(typing);
    $('#chatBody').scrollTop = $('#chatBody').scrollHeight;
    let bubble = null;
    ask.onText = ({ text }) => { if (!bubble) { typing.remove(); bubble = chatMsg('bot', ''); } bubble.textContent = text; $('#chatBody').scrollTop = $('#chatBody').scrollHeight; };
    let out;
    try { out = await ask(q); } catch (e) { out = localAnswer(q); }
    if (!bubble) { typing.remove(); bubble = chatMsg('bot', out); } else bubble.textContent = out;
    S.chatHist.push({ role: 'user', content: q }, { role: 'assistant', content: out });
    $('#chatBody').scrollTop = $('#chatBody').scrollHeight;
  }

  /* ---------------- franquicia form ---------------- */
  async function submitLead(form) {
    const out = $('#frOut'); out.className = ''; out.textContent = '';
    const v = (id) => ($('#' + id).value || '').trim();
    if (!v('frName') || !/^\S+@\S+\.\S+$/.test(v('frEmail')) || !$('#frOkc').checked) { out.className = 'msg-err'; out.textContent = 'Revisa tu nombre, un email válido y acepta los términos.'; return; }
    const lead = { name: v('frName'), surname: v('frSurname'), email: v('frEmail'), phone: v('frPhone'), place: v('frPlace'), msg: v('frMsg'), ts: Date.now() };
    const { db, user } = S.cap;
    try {
      if (!db || !user) throw new Error('nodb');
      const id = await user.id(); if (!id) throw new Error('noid');
      const ref = db.doc('leads/' + id); const snap = await ref.get();
      const items = (snap.exists && (snap.data().items || [])) || [];
      items.push(lead); await ref.set({ items: items.slice(-30) });
      out.className = 'msg-ok'; out.textContent = 'Solicitud guardada. Nos pondremos en contacto contigo.'; form.reset();
    } catch (e) {
      out.className = 'msg-err'; out.textContent = 'No hemos podido guardar la solicitud desde esta página. Llama al 917 82 35 38 o escríbenos por WhatsApp.';
    }
  }

  /* ---------------- render + bind ---------------- */
  let io = null, cio = null;
  function setupMotion() {
    if (io) io.disconnect(); if (cio) cio.disconnect();
    const root = document.documentElement;
    if (!('IntersectionObserver' in window) || reduce) { root.classList.remove('rv-on'); } else {
      root.classList.add('rv-on');
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const t = e.target; t.classList.add('in'); io.unobserve(t); setTimeout(() => t.classList.remove('rv', 'in'), 1900); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
      $$('.rv').forEach((el) => io.observe(el));
    }
    if ('IntersectionObserver' in window && !reduce) {
      cio = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return; cio.unobserve(e.target);
        const el = e.target, to = +el.dataset.to, suf = el.dataset.suf || '', t0 = performance.now();
        const step = (t) => { const p = Math.min(1, (t - t0) / 1300); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }), { threshold: 0.6 });
      $$('.stat b').forEach((el) => cio.observe(el));
    }
  }
  function renderAll() {
    const s = S.site;
    $('#notice').textContent = s.banner || '';
    S.nh = s.banner ? $('#notice').offsetHeight : 0; $('#bar').style.top = S.nh + 'px';
    $('#logo').innerHTML = logoHTML(s);
    $('#app').innerHTML = heroHTML() + whyHTML() + statsHTML() + innovHTML() + qualityHTML() + ecoHTML() + cartaHTML() + pedirHTML() + localesHTML() + franqHTML() + footHTML();
    $('#q').value = S.q;
    renderShop(); renderMenu(false); updateStoreChip(); updateCartBar(false); setupMotion();
  }
  AEC.refreshAll = () => { mergeSite(); computeItems(); renderAll(); };
  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-add],[data-cat],[data-al],[data-q],[data-close],[data-sugg],[data-pick],[data-sq],[data-fav],[data-upadd],[data-checkout],[data-store-change],[data-repeat],[data-track]'); if (!t) return;
      const d = t.dataset;
      if (d.add) { const b = t; addToCart(d.add); b.classList.remove('pop'); b.classList.add('done'); b.innerHTML = ICON.check + 'Añadido'; setQtyUI(d.add); clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('done'); b.innerHTML = ICON.plus + 'Añadir'; }, 1100); }
      else if (d.sq) { const it = S.sById[d.id]; if (!it) return; S.qty[d.id] = Math.min(20, Math.max(1, qtyOf(it) + +d.sq)); setQtyUI(d.id); }
      else if (d.fav) { const id = d.fav; S.fav.has(id) ? S.fav.delete(id) : S.fav.add(id); lsSet(FAV_KEY, [...S.fav]); t.setAttribute('aria-pressed', String(S.fav.has(id))); renderMenu(false); }
      else if (d.cat) { S.cat = d.cat; S.q = ''; $('#q').value = ''; renderMenu(true); t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
      else if (d.al) { const a = d.al; S.noAl.has(a) ? S.noAl.delete(a) : S.noAl.add(a); renderMenu(true); }
      else if (d.q) { const id = d.id; S.cart[id] = Math.max(0, (S.cart[id] || 0) + +d.q); if (!S.cart[id]) delete S.cart[id]; saveCart(); updateCartBar(false); }
      else if (d.upadd) { addToCart(d.upadd, 1); }
      else if (d.pick) { if (openEl && openEl.id === 'storeSheet') closeSheet(); setStore(d.pick, { go: true }); }
      else if (t.hasAttribute('data-store-change')) { openSheet('storeSheet'); }
      else if (t.hasAttribute('data-repeat')) { repeatLast(); }
      else if (t.hasAttribute('data-track')) { openTracking(); }
      else if (t.hasAttribute('data-checkout')) { openCheckout(); }
      else if (d.close !== undefined) closeSheet();
      else if (d.sugg) submitAsk(d.sugg);
    });
    document.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'q') { S.q = e.target.value; renderMenu(false); }
      else if (FIELD_MAP[id]) { S.ck[FIELD_MAP[id]] = e.target.value; if (id !== 'coNote') fieldErr(id, ''); if (id === 'coZip') zipWarn(); }
    });
    document.addEventListener('change', (e) => {
      const id = e.target.id, nm = e.target.name;
      if (nm === 'coMode') { S.ck.mode = e.target.value; renderCheckout(); }
      else if (nm === 'coPay') S.ck.pay = e.target.value;
      else if (id === 'coDate') { S.ck.date = e.target.value; S.ck.time = ''; fillTimes(); fieldErr('coDate', ''); }
      else if (id === 'coTime') { S.ck.time = e.target.value; fieldErr('coTime', ''); }
      else if (id === 'coTerms') { S.ck.terms = e.target.checked; if (e.target.checked) { const x = $('#coTerms-e'); if (x) x.textContent = ''; } }
      else if (id === 'coRem') S.ck.remember = e.target.checked;
    });
    document.addEventListener('click', (e) => { if (e.target.closest('#coSubmit')) placeOrder(); });
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'frForm') { e.preventDefault(); submitLead(e.target); }
      if (e.target.id === 'askForm') { e.preventDefault(); const i = $('#askInput'); const q = i.value; i.value = ''; submitAsk(q); }
      if (e.target.id === 'coForm') { e.preventDefault(); placeOrder(); }
      if (e.target.id === 'msgForm') { e.preventDefault(); sendReply(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); closeMenu(); } });
    sheetDrag();
    $('#cartbar').addEventListener('click', () => openSheet('cartSheet'));
    $('#fab').addEventListener('click', () => openSheet('chatSheet'));
    $('#storeChip').addEventListener('click', () => openSheet('storeSheet'));
    $('#scrim').addEventListener('click', () => closeSheet());
    $('#burger').addEventListener('click', () => { const m = $('#menu'), on = !m.classList.contains('on'); m.classList.toggle('on', on); $('#burger').setAttribute('aria-expanded', String(on)); $('#burger').setAttribute('aria-label', on ? 'Cerrar menú' : 'Abrir menú'); document.body.style.overflow = on ? 'hidden' : ''; });
    $('#menu').addEventListener('click', (e) => { if (e.target.closest('a')) { closeMenu(); document.body.style.overflow = ''; } });
    window.addEventListener('hashchange', route);
    // header + parallax
    let last = 0, tick = false;
    window.addEventListener('scroll', () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, bar = $('#bar');
        const dy = y - last;
        if (!openEl && !$('#menu').classList.contains('on')) { if (y < 160 || dy < -6) bar.classList.remove('hide'); else if (dy > 6) bar.classList.add('hide'); }
        document.body.classList.toggle('fab-hide', bar.classList.contains('hide'));
        last = y;
        if (S.nh) bar.style.top = Math.max(0, S.nh - y) + 'px';
        if (!reduce && y < 1100) $$('.float').forEach((el) => { el.style.transform = `translate3d(0,${(y * (+el.dataset.depth || 0)).toFixed(1)}px,0) rotate(${+el.dataset.rot || 0}deg)`; });
        tick = false;
      });
    }, { passive: true });
    setInterval(() => { const n = $('#openNow'); if (n) n.innerHTML = openNowHTML(); if (S.store && !$('#shopWrap').hidden) renderShop(); }, 60000);
  }

  /* ---------------- router ---------------- */
  /* La web no sabe nada del panel hasta que entra la cuenta propietaria con la dirección privada. Los demás visitantes
     no descargan ni ven nada del panel: aquí no hay botón, enlace, aviso ni modo edición. */
  let panelQ = null;
  function loadPanel(cb, onFail) {
    if (window.ArrozPanel) { cb(); return; }
    if (panelQ) { panelQ.push(cb); return; }
    panelQ = [cb];
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'panel/panel.css'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = 'panel/panel.js';
    js.onload = () => { const q = panelQ; panelQ = null; q.forEach((f) => f()); };
    js.onerror = () => { panelQ = null; if (onFail) onFail(); };
    document.body.appendChild(js);
  }
  /* ---------------- acceso del dueño ---------------- */
  /* Quién es el dueño lo decide la cuenta de Claude (isOwner) y las reglas del servidor. La clave es un candado extra y opcional
     para este teléfono: se guarda con sal y PBKDF2 en access/pin, que solo el propietario puede leer. */
  const PIN_RE = /^\d{4,6}$/;
  const REM = 'aec_acc_v1', REM_DAYS = 14;
  const hex = (buf) => Array.prototype.map.call(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  async function pinHash(pin, saltHex) {
    const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256));
  }
  const pinDoc = () => (S.cap && S.cap.db ? S.cap.db.doc('access/pin') : null);
  async function pinState() {
    const d = pinDoc(); if (!d) return { has: false, ver: '' };
    try { const s = await d.get(); const v = s.exists ? s.data() : null; return v && v.hash && v.salt ? { has: true, ver: String(v.hash).slice(0, 12), v } : { has: false, ver: '' }; } catch (e) { return { has: false, ver: '' }; }
  }
  function remembered(ver) { try { const o = JSON.parse(localStorage.getItem(REM) || 'null'); return !!(o && o.ver === ver && o.until > Date.now()); } catch (e) { return false; } }
  function remember(ver, on) { try { if (on) localStorage.setItem(REM, JSON.stringify({ ver, until: Date.now() + REM_DAYS * 864e5 })); else localStorage.removeItem(REM); } catch (e) { /* sin almacenamiento: pedirá la clave cada vez */ } }
  async function savePin(pin) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16))), hash = await pinHash(pin, salt);
    await pinDoc().set({ salt, hash, ts: Date.now() });
    return hash.slice(0, 12);
  }
  function accRoot() {
    let r = $('#accessRoot');
    if (!r) { r = document.createElement('div'); r.id = 'accessRoot'; r.setAttribute('data-keep', ''); document.body.appendChild(r); }
    return r;
  }
  function accShell(inner) {
    const logo = (S.site && S.site.brand && S.site.brand.logo) || 'img/logo.png';
    return `<main class="acc" aria-labelledby="accT"><div class="acc-card"><img class="acc-logo" src="${esc(logo)}" alt="Arroz en Caja" width="72" height="72" draggable="false"><p class="acc-eyebrow">ARROZ EN CAJA ADMIN</p>${inner}<a class="acc-back" href="#inicio">← Volver a la web</a></div></main>`;
  }
  const ACC_LEAD = '<p class="acc-lead">Entra para cambiar horarios, precios, textos, fotos y pedidos. Los cambios se ven en la web al momento.</p>';
  let accTok = 0, gateTok = 0, accBad = 0, accLock = 0;
  function showWait() { const r = accRoot(); r.hidden = false; r.innerHTML = accShell('<h1 id="accT">Comprobando tu cuenta…</h1>'); }
  function hideAccess() { const r = $('#accessRoot'); if (r) r.hidden = true; }
  async function showAccess() {
    const r = accRoot(), tok = ++accTok; r.hidden = false;
    if (!S.capsReady) { showWait(); return; }
    if (!S.isOwner) {
      r.innerHTML = accShell('<h1 id="accT">Acceso del dueño</h1><p class="acc-lead">Esta zona es solo para el dueño del restaurante. Si eres tú, abre esta página con la cuenta de Claude propietaria.</p>');
      return;
    }
    const p = await pinState();
    if (tok !== accTok || location.hash !== '#acceso') return;
    if (S.unlocked || (p.has && remembered(p.ver))) { S.unlocked = true; location.hash = '#panel'; return; }
    const say = (m) => { const e = $('#accErr'); if (e) { e.textContent = m; e.hidden = !m; } };
    if (p.has) {
      r.innerHTML = accShell(`<h1 id="accT">Acceso del dueño</h1>${ACC_LEAD}
        <form class="acc-form" id="accForm" novalidate><label class="field"><span>Clave</span><input id="accPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" enterkeyhint="go" autofocus></label>
        <p class="acc-err" id="accErr" role="alert" hidden></p>
        <label class="acc-chk"><input type="checkbox" id="accRem" checked> Mantener este teléfono entrado ${REM_DAYS} días</label>
        <button class="btn" type="submit">Entrar</button></form>
        <button class="acc-lnk" id="accForgot" type="button">Olvidé mi clave</button>`);
      $('#accForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const inp = $('#accPin'), pin = inp.value.trim();
        if (Date.now() < accLock) { say('Demasiados intentos. Espera ' + Math.ceil((accLock - Date.now()) / 1000) + ' s.'); return; }
        if (!PIN_RE.test(pin)) { say('La clave son de 4 a 6 números.'); return; }
        let ok = false;
        try { ok = (await pinHash(pin, p.v.salt)) === p.v.hash; } catch (x) { say('Este navegador no puede comprobar la clave.'); return; }
        if (!ok) { accBad++; if (accBad >= 5) { accBad = 0; accLock = Date.now() + 30000; say('Demasiados intentos. Espera 30 s.'); } else say('Clave incorrecta.'); inp.value = ''; inp.focus(); return; }
        accBad = 0; S.unlocked = true; remember(p.ver, $('#accRem').checked); location.hash = '#panel';
      });
      let armed = false;
      const fg = $('#accForgot');
      fg.addEventListener('click', async () => {
        if (!armed) { armed = true; fg.textContent = 'Pulsa otra vez para borrar la clave'; setTimeout(() => { armed = false; if (fg.isConnected) fg.textContent = 'Olvidé mi clave'; }, 5000); return; }
        try { await pinDoc().delete(); } catch (x) { /* si falla, la clave sigue */ }
        remember('', false); showAccess();
      });
      return;
    }
    r.innerHTML = accShell(`<h1 id="accT">Acceso del dueño</h1>${ACC_LEAD}
      <button class="btn" id="accEnter" type="button">Entrar</button>
      <details class="acc-det"><summary>Proteger con una clave (recomendado)</summary>
      <form class="acc-form" id="accNew" novalidate><label class="field"><span>Clave nueva (4 a 6 números)</span><input id="accP1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
      <label class="field"><span>Repite la clave</span><input id="accP2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
      <p class="acc-err" id="accErr" role="alert" hidden></p>
      <label class="acc-chk"><input type="checkbox" id="accRem" checked> Mantener este teléfono entrado ${REM_DAYS} días</label>
      <button class="btn dark" type="submit">Crear clave y entrar</button></form></details>
      <p class="acc-note">Tu cuenta de Claude ya identifica al dueño. La clave es un candado extra por si alguien usa tu móvil.</p>`);
    $('#accEnter').addEventListener('click', () => { S.unlocked = true; location.hash = '#panel'; });
    $('#accNew').addEventListener('submit', async (e) => {
      e.preventDefault();
      const x = $('#accP1').value.trim(), y = $('#accP2').value.trim();
      if (!PIN_RE.test(x)) { say('La clave son de 4 a 6 números.'); return; }
      if (x !== y) { say('Las dos claves no coinciden.'); return; }
      if (!(window.crypto && crypto.subtle)) { say('Este navegador no permite crear una clave.'); return; }
      try { const ver = await savePin(x); S.unlocked = true; remember(ver, $('#accRem').checked); location.hash = '#panel'; } catch (err) { say('No se pudo guardar la clave. Inténtalo otra vez.'); }
    });
  }
  window.AEC.access = {
    has: async () => (await pinState()).has,
    setPin: async (pin) => { if (!PIN_RE.test(pin)) throw new Error('clave'); const ver = await savePin(pin); remember('', false); return ver; },
    clearPin: async () => { await pinDoc().delete(); remember('', false); },
    signOut: () => { S.unlocked = false; remember('', false); location.hash = '#inicio'; },
  };

  function route() {
    const h = location.hash, tok = ++gateTok;
    const wantPanel = h === '#panel', wantAcc = h === '#acceso';
    let on = wantPanel && S.capsReady && S.isOwner;
    const waiting = wantPanel && (!S.capsReady || (S.isOwner && !S.unlocked));
    if (on && !S.unlocked) {
      on = false;
      pinState().then((p) => { if (tok !== gateTok) return; if (!p.has || remembered(p.ver)) { S.unlocked = true; route(); } else location.hash = '#acceso'; });
    }
    document.body.classList.toggle('mode-access', wantAcc || waiting);
    if (wantAcc) showAccess(); else if (waiting) showWait(); else hideAccess();
    document.body.classList.toggle('mode-panel', on);
    const cur = $('#panelRoot');
    if (cur) cur.hidden = !on;
    if (!on) { document.body.style.overflow = ''; return; }
    closeSheet(); closeMenu();
    let root = cur;
    if (!root) { root = document.createElement('div'); root.id = 'panelRoot'; root.setAttribute('data-keep', ''); document.body.appendChild(root); }
    loadPanel(() => window.ArrozPanel.mount(root), () => { root.innerHTML = '<p class="fatal">No se pudo cargar el panel. Recarga la página.</p>'; });
  }

  /* ---------------- capabilities (guardado, permisos, IA, fotos) ---------------- */
  async function initCaps() {
    const c = window.claude;
    if (!c || !c.use) { S.capsReady = true; emit(); return; }
    const get = (n) => c.use(n).catch(() => null);
    const [db, user, sample, assets] = await Promise.all([get('db'), get('user'), get('sample'), get('assets')]);
    S.cap = { db, user, sample, assets };
    try { if (user) { S.isOwner = !!(await user.isOwner()); S.canEdit = S.isOwner; } } catch (e) { S.canEdit = false; S.isOwner = false; }
    S.capsReady = true;
    if (db) {
      const timer = setTimeout(() => { S.dbSlow = true; emit(); }, 10000);
      db.doc('site/config').onSnapshot((snap) => { clearTimeout(timer); S.dbOk = true; S.siteOver = snap.exists ? snap.data() : {}; mergeSite(); computeItems(); renderAll(); emit(); }, () => { S.dbOk = false; emit(); });
      db.collection('menu').onSnapshot((snap) => { S.over = {}; snap.docs.forEach((d) => { S.over[d.id] = d.data(); }); computeItems(); { const g = S.capsReady ? pruneCart() : []; if (g.length) toast(goneMsg(g)); } renderShop(); renderMenu(false); updateCartBar(false); emit(); }, () => { /* sin permisos de lectura: carta original */ });
      try {
        const uid = await Promise.race([user && user.id(), new Promise((r) => setTimeout(() => r(null), 6000))]);
        if (uid) {
          S.uid = uid; S.msgSeen = lsGet(SEEN_KEY, {});
          db.doc('msgs/' + uid).onSnapshot((snap) => {
            const prev = S.msgs; S.msgs = (snap.exists && snap.data().o) || {};
            const id = S.lastOrder && S.lastOrder.id, n = id ? (S.msgs[id] || []).length : 0, pn = id ? (prev[id] || []).length : 0;
            if (S.msgsInit && id && n > pn) { const m = S.msgs[id][n - 1]; toast('El local te ha escrito: ' + String(m.txt).slice(0, 80)); try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch (e) { /* noop */ } }
            S.msgsInit = true; refreshThread();
          }, () => { /* sin lectura */ });
          db.doc('orders/' + uid).onSnapshot((snap) => { S.mine = {}; ((snap.exists && snap.data().items) || []).forEach((x) => { S.mine[x.id] = x; }); refreshThread(); }, () => { /* sin lectura */ });
        }
      } catch (e) { /* sin sesión */ }
      db.doc('site/order-status').onSnapshot((snap) => { S.statusMap = (snap.exists && snap.data().map) || {}; refreshTrack(); emit(); }, () => { /* sin lectura */ });
    }
    emit(); route();
  }

  async function boot() {
    try { const [site, menu] = await Promise.all([loadJSON('data/site.json'), loadJSON('data/menu.json')]); S.defSite = site; S.catsBase = menu.categories; S.cats = menu.categories; S.def = menu.items; }
    catch (e) { $('#app').innerHTML = '<p class="fatal">No se pudo cargar la carta. Recarga la página.</p>'; return; }
    mergeSite();
    const sk = lsGet(STORE_KEY, null); if (sk && S.site.stores[sk]) S.store = sk;
    S.fav = new Set(lsGet(FAV_KEY, [])); S.lastOrder = lsGet(LAST_KEY, null);
    computeItems(); loadCart(); renderAll(); bind(); route(); initCaps();
  }
  boot();
})();
