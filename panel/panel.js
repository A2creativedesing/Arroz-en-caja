/* ARROZ EN CAJA ADMIN · panel privado del dueño (se abre en #panel y solo si entra la cuenta propietaria; en producción, un sitio aparte).
   Datos: textos y horarios en "site/config", platos en "menu/<id>" (incluye disponibilidad por local en "avail"),
   pedidos en "orders/*", estado de pedido en "site/order-status", registros en "log/comms" y "log/activity".
   Solo entra la cuenta propietaria. */
'use strict';
(function () {
  const A = window.AEC, S = A.S;
  const { $, $$, esc, eur, clone, ALG, KIND } = A;
  const IC = {
    pedidos: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    productos: '<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8"/>',
    inventario: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    horarios: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    whatsapp: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
    config: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };
  const TABS = [['pedidos', 'Pedidos', 'Pedidos'], ['productos', 'Productos', 'Productos'], ['inventario', 'Inventario', 'Inventario'], ['horarios', 'Horarios', 'Horarios'], ['whatsapp', 'WhatsApp', 'WhatsApp'], ['config', 'Config.', 'Configuración']];
  const MANAGER_TABS = ['pedidos', 'inventario', 'horarios', 'whatsapp', 'config'];
  const DEFAULT_WA = '34660969330';
  const isAdm = () => !!S.isOwner;
  const tabsFor = () => (isAdm() ? TABS : TABS.filter((t) => MANAGER_TABS.includes(t[0])));
  const lsg = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lss = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* noop */ } };
  let root, mounted = false, tab = lsg('aec-adm-tab', 'pedidos'), flt = { q: '', cat: 'all', ost: 'activos' }, edit = null, armed = null, preview = null;
  let leads = [], leadsErr = false, leadsSub = false, seen = new Set(), seenSub = false, orders = [], ordersErr = false, ordersSub = false, lastSync = 0;
  let msgsAll = {}, msgsSub = false, knownIds = null, replySig = {}, drafts = {}, delayMin = {}, cmp = {}, pendingDraw = false, ac = null, wake = null, baseTitle = document.title;
  let commLog = [], actLog = [], logSub = false, cflt = 'todos', inv = { k: null, q: '', f: 'todos' }, hor = { k: null }, openG = new Set(lsg('aec-adm-open', ['pwa', 'avisos']));
  let alertsOn = !!lsg('aec-adm-alerts', false), admSeen = lsg('aec-adm-seen', {}), swReg = null, swState = 'sin comprobar', updReq = false, cancelArmed = null;

  /* ---------- helpers ---------- */
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'); let c = o; ks.slice(0, -1).forEach((k) => { if (typeof c[k] !== 'object' || c[k] == null) c[k] = {}; c = c[k]; }); c[ks[ks.length - 1]] = v; }
  function delPath(o, p) { const ks = p.split('.'); let c = o; for (const k of ks.slice(0, -1)) { if (!c || typeof c[k] !== 'object') return; c = c[k]; } delete c[ks[ks.length - 1]]; }
  /* Edición de una sola hoja: las listas (pasos, preguntas, cifras…) se guardan enteras, copiando antes lo que ya había para no perder nada. */
  function setLeaf(o, p, v) {
    const ks = p.split('.'); let c = o, e = S.site;
    for (let i = 0; i < ks.length - 1; i++) {
      const k = ks[i], ev = e == null ? null : e[k];
      if (c[k] == null || typeof c[k] !== 'object') c[k] = Array.isArray(ev) ? clone(ev) : {};
      c = c[k]; e = ev;
    }
    c[ks[ks.length - 1]] = v;
  }
  function pruneEmpty(o, ks) {
    for (let i = ks.length - 1; i >= 1; i--) {
      const q = ks.slice(0, i).join('.'), par = getPath(o, q);
      if (par && typeof par === 'object' && !Array.isArray(par) && !Object.keys(par).length) delPath(o, q); else break;
    }
  }
  /* «Volver al original»: quita lo guardado de esa hoja y la web vuelve a usar el texto o la imagen de origen. */
  function resetLeaf(o, p) {
    const ks = p.split('.'); let d = S.defSite, ai = -1;
    for (let i = 0; i < ks.length - 1; i++) { d = d == null ? null : d[ks[i]]; if (Array.isArray(d)) { ai = i; break; } }
    if (ai < 0) { delPath(o, p); pruneEmpty(o, ks); return; }
    const ap = ks.slice(0, ai + 1).join('.');
    if (!Array.isArray(getPath(o, ap))) return;
    setLeaf(o, p, getPath(S.defSite, p));
    if (JSON.stringify(getPath(o, ap)) === JSON.stringify(getPath(S.defSite, ap))) { delPath(o, ap); pruneEmpty(o, ap.split('.')); }
  }
  const db = () => S.cap.db;
  const canWrite = () => !!db() && S.canEdit;
  const online = () => navigator.onLine !== false;
  async function guard(fn, okMsg) {
    if (!online()) { A.toast('Sin conexión: no se guardó. Inténtalo cuando vuelva la señal.'); return false; }
    if (!canWrite()) { A.toast('El guardado no está disponible en esta vista.'); return false; }
    try { await fn(); if (okMsg) A.toast(okMsg); return true; } catch (e) { A.toast('No se pudo guardar. Inténtalo de nuevo.'); return false; }
  }
  async function saveSite(mut, msg) { const over = clone(S.siteOver || {}); mut(over); const ok = await guard(() => db().doc('site/config').set(over), msg || 'Guardado'); if (ok) S.siteOver = over; return ok; }
  const tz = 'Europe/Madrid';
  const fmtDate = (ts) => new Date(ts).toLocaleString('es-ES', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const ymdOf = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  const catLabel = (id) => (S.cats.find((c) => c.id === id) || {}).label || id;
  const toneOf = (id) => Math.max(0, S.cats.findIndex((c) => c.id === id)) % 4;
  const defIds = () => new Set(S.def.map((i) => i.id));
  const isEdited = (id) => !!S.over[id];
  const isNew = (it) => !defIds().has(it.id);
  const stOf = (o) => S.statusMap[o.id] || 'nuevo';
  const stLabel = (k, mode) => A.ST.label(k, mode);
  const stores = () => S.site.storeOrder.map((k) => [k, S.site.stores[k]]);
  const COMMS = () => S.site.comms || {};
  const lastTs = (a) => (a && a.length ? a[a.length - 1].ts : 0);
  const ico = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
  function copyText(t) {
    const done = () => A.toast('Copiado');
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, fb); return; } } catch (e) { /* sigue */ }
    fb();
    function fb() { try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) { A.toast('No se pudo copiar.'); } }
  }

  /* ---------- registros: actividad y comunicaciones ---------- */
  function logAct(t) {
    const e = { ts: Date.now(), t }; actLog = [e].concat(actLog).slice(0, 150);
    if (db() && canWrite() && online()) db().doc('log/activity').set({ items: actLog }).catch(() => { /* registro opcional */ });
  }
  function saveComms(mut) {
    commLog = mut(commLog.slice()).slice(0, 200);
    if (!db() || !canWrite() || !online()) return Promise.resolve(false);
    return db().doc('log/comms').set({ items: commLog }).then(() => true, () => { A.toast('No se pudo guardar el registro de mensajes.'); return false; });
  }
  const cid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const TPL_KEYS = ['confirmar', 'preparacion', 'listo', 'encamino', 'entregado'];
  const TPL_LABEL = { confirmar: 'Confirmar pedido', preparacion: 'En preparación', listo: 'Listo para recoger', encamino: 'En camino', entregado: 'Entregado', libre: 'Mensaje libre' };
  const TPL_SHORT = { confirmar: 'Confirmar', preparacion: 'Preparando', listo: 'Listo', encamino: 'En camino', entregado: 'Entregado' };
  const STATE_TPL = { confirmado: 'confirmar', preparando: 'preparacion', listo: 'listo', encamino: 'encamino', entregado: 'entregado' };
  const MSG_ST = { pendiente: 'Pendiente', enlace_abierto: 'Enlace abierto', enviado: 'Enviado manualmente', error: 'Error' };
  const fill = (t, o) => String(t || '').replace(/\{nombre\}/g, o.customer.name).replace(/\{pedido\}/g, o.id);
  const tplText = (k) => (COMMS().templates || {})[k] || '';
  const pref = () => (COMMS().preferred === 'sms' ? 'sms' : 'wa');
  function phoneFor(o) {
    let d = String(o.customer.phone || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 9) d = String(COMMS().prefix || '34').replace(/\D/g, '') + d;
    return d.length >= 10 ? d : '';
  }
  const waLink = (o, txt) => { const p = phoneFor(o); return p ? 'https://wa.me/' + p + '?text=' + encodeURIComponent(txt) : ''; };
  const smsLink = (o, txt) => { const p = phoneFor(o); return p ? 'sms:+' + p + '?&body=' + encodeURIComponent(txt) : ''; };
  const linkFor = (o, txt, ch) => (ch === 'sms' ? smsLink(o, txt) : waLink(o, txt));
  function commTouch(o, tpl, ch, txt, st) {
    return saveComms((a) => {
      const i = tpl === 'libre' ? -1 : a.findIndex((c) => c.o === o.id && c.tpl === tpl && (c.st === 'pendiente' || c.st === 'enlace_abierto'));
      if (i >= 0) a[i] = Object.assign({}, a[i], { ch, txt, st, ts: Date.now() }); else a.unshift({ id: cid(), ts: Date.now(), o: o.id, ch, tpl, txt, st });
      return a;
    });
  }
  function ensurePending(o, tpl) {
    return saveComms((a) => { if (a.some((c) => c.o === o.id && c.tpl === tpl && c.st !== 'error')) return a; a.unshift({ id: cid(), ts: Date.now(), o: o.id, ch: pref(), tpl, txt: fill(tplText(tpl), o), st: 'pendiente' }); return a; });
  }
  const commsOf = (id) => commLog.filter((c) => c.o === id);

  /* ---------- marco, navegación inferior ---------- */
  /* Acceso: cerrar sesión y clave opcional (la lógica vive en la web: AEC.access) */
  let accHas = null, accBusy = false;
  function accCard() {
    if (accHas === null && !accBusy) {
      accBusy = true;
      A.access.has().then((v) => { accHas = !!v; accBusy = false; if (tab === 'config') drawPanel(true); }).catch(() => { accHas = false; accBusy = false; });
    }
    const st = accHas === null ? 'Comprobando…' : accHas ? 'Este panel pide la clave en un teléfono nuevo o pasados 14 días.' : 'Ahora entras sin clave. Puedes crear una para que nadie use tu móvil por ti.';
    return `<section class="card"><h2>Acceso</h2><p class="muted sm">Solo entra la cuenta propietaria. ${st}</p>
      <div class="acts"><button class="btn ghost" type="button" data-act="signout">CERRAR SESIÓN</button></div>
      <details class="sub"><summary>${accHas ? 'Cambiar o quitar la clave' : 'Crear una clave'}</summary>
        <label class="f"><span>Clave nueva (4 a 6 números)</span><input id="pn1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
        <label class="f"><span>Repite la clave</span><input id="pn2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
        <div class="acts"><button class="btn" type="button" data-act="pinSave">GUARDAR CLAVE</button>${accHas ? '<button class="btn ghost" type="button" data-act="pinClear">QUITAR CLAVE</button>' : ''}</div></details></section>`;
  }
  function frame() {
    root.innerHTML = `<div class="adm" id="admApp"><div class="adm-sticky"><div class="adm-banner off" id="admOff" role="status" hidden></div><div class="adm-banner upd" id="admUpd" hidden>Hay una versión nueva de la app. <button class="lnk" data-act="upd" type="button">Actualizar ahora</button></div>
      <header class="adm-top"><img class="adm-logo" src="img/logo.png" alt="Arroz en Caja" width="40" height="40" draggable="false"><div class="adm-brand"><b>ARROZ EN CAJA ADMIN</b><span id="admState"></span></div><div class="adm-acts"><a class="btn sm adm-shop" href="#inicio" data-act="shop">Ver mi tienda</a><button class="btn sm ghost adm-edit" type="button" data-act="editPage" aria-label="Editar la página tocando" title="Editar la página tocando"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button></div></header></div>
      <main class="adm-main" id="admMain"></main>
      <nav class="adm-nav" id="admNav" style="--n:${tabsFor().length}" aria-label="Secciones del panel">${tabsFor().map(([k, l, full]) => `<button type="button" data-act="tab" data-v="${k}" class="${k === tab ? 'on' : ''}" aria-label="${full}"${k === tab ? ' aria-current="page"' : ''}>${ico(k)}<span>${l}</span><i id="bd-${k}"></i></button>`).join('')}</nav>
      </div>`;
    setOffline();
  }
  function setOffline() {
    const off = !online(), b = $('#admOff'), app = $('#admApp'); if (!app) return;
    app.classList.toggle('is-off', off);
    if (b) { b.hidden = !off; b.textContent = off ? 'Sin conexión. Lo que ves puede no estar al día' + (lastSync ? ' (datos de las ' + hhmm(lastSync) + ')' : '') + '. Los cambios y los avisos al cliente quedan bloqueados hasta reconectar.' : ''; }
  }
  function pendingCount() { return orders.filter((o) => stOf(o) === 'nuevo').length + orders.filter((o) => unreadReplies(o) > 0).length; }
  function stateLine() {
    const bits = [isAdm() ? 'Administrador principal' : 'Encargado', db() ? 'Guardado activo' : 'Sin guardado'];
    const el = $('#admState'); if (el) el.textContent = bits.join(' · ');
    const set = (k, n) => { const b = $('#bd-' + k); if (b) b.textContent = n ? String(n) : ''; };
    const np = pendingCount(); set('pedidos', np); set('whatsapp', commLog.filter((c) => c.st === 'pendiente').length); set('config', isAdm() ? leads.filter((l) => !seen.has(l.key)).length : 0);
    document.title = (np ? '(' + np + ') ' : '') + baseTitle;
    try { if (navigator.setAppBadge) { if (np) navigator.setAppBadge(np); else navigator.clearAppBadge(); } } catch (e) { /* sin badge */ }
  }

  /* ---------- PEDIDOS: resumen del día y pedidos ---------- */
  const replyTs = (o) => (o.msgs || []).reduce((m, x) => Math.max(m, x.ts), 0);
  const unreadReplies = (o) => (o.msgs || []).filter((m) => m.ts > (admSeen[o.id] || 0)).length;
  function threadOf(o) {
    const loc = (((msgsAll[o.uid] || {}).o || {})[o.id] || []).map((m) => Object.assign({}, m, { t: 'l' }));
    return loc.concat((o.msgs || []).map((m) => Object.assign({}, m, { t: 'c' }))).sort((a, b) => a.ts - b.ts);
  }
  const QUICK_APP = (o) => [
    ['delay', 10, '+10 min'], ['delay', 15, '+15 min'], ['delay', 20, '+20 min'], ['delay', 30, '+30 min'],
    ['txt', '¿Nos confirmas tu dirección completa (piso, puerta y timbre)?', 'Pedir dirección'], ['txt', 'Falta un detalle de tu pedido: ', 'Pedir un detalle']];
  function outPairs() { let n = 0; stores().forEach(([k]) => { S.items.forEach((it) => { if (!it.hidden && A.inStore(it, k) && A.stockState(it, k) !== 'ok') n += 1; }); }); return n; }
  function stats() {
    const td = ymdOf(Date.now()), today = orders.filter((o) => ymdOf(o.ts) === td), c = (k) => orders.filter((o) => stOf(o) === k).length;
    return { recib: today.length, pend: c('nuevo') + c('confirmado'), prep: c('preparando'), listo: c('listo'), cam: c('encamino'), ent: today.filter((o) => stOf(o) === 'entregado').length, ventas: today.filter((o) => stOf(o) !== 'cancelado').reduce((a, o) => a + (o.subtotal || 0), 0), out: outPairs() };
  }
  function storeChip(k, st) {
    const td = ymdOf(Date.now()), bl = A.orderBlock(st), cl = A.closureOn(st, td);
    const [cls, txt0] = bl ? ['bad', bl.kind === 'temp' ? 'Cerrado temporalmente' : 'Pedidos pausados'] : cl ? ['warn', 'Cerrado hoy' + (cl.label ? ' · ' + cl.label : '')] : ['ok', 'Pedidos activos'];
    const nOut = S.items.filter((it) => !it.hidden && A.inStore(it, k) && A.stockState(it, k) !== 'ok').length, txt = txt0 + (nOut ? ' · ' + nOut + ' sin stock' : '');
    return `<button type="button" class="schip ${cls}" data-act="tab" data-v="horarios" data-id="${k}"><b>${esc(st.name)}</b><small>${esc(txt)}</small></button>`;
  }
  function alertsList() {
    const al = [];
    if (!canWrite()) al.push('El guardado no está activo en esta vista: los cambios no se conservarán.');
    const old = orders.filter((o) => stOf(o) === 'nuevo' && Date.now() - o.ts > 10 * 60000).length;
    if (old) al.push(`${old} pedido${old > 1 ? 's' : ''} sin confirmar desde hace más de 10 minutos. <button class="lnk" data-act="ofilter" data-v="pend" type="button">Ver</button>`);
    const pc = commLog.filter((c) => c.st === 'pendiente').length;
    if (pc) al.push(`${pc} aviso${pc > 1 ? 's' : ''} al cliente sin enviar. <button class="lnk" data-act="tab" data-v="whatsapp" type="button">Ver registro</button>`);
    if (isAdm()) {
      stores().forEach(([k, st]) => { const miss = ['address', 'phone', 'hours'].filter((f) => !st[f]); if (miss.length) al.push(`${esc(st.name)}: faltan ${miss.map((m) => ({ address: 'dirección', phone: 'teléfono', hours: 'horario' }[m])).join(', ')}. <button class="lnk" data-act="tab" data-v="config" type="button">Completar</button>`); });
      if (S.site.contact.whatsapp === DEFAULT_WA && !Object.values(COMMS().perStore || {}).some(Boolean)) al.push('Confirma que el 660 96 93 30 es el WhatsApp oficial. <button class="lnk" data-act="tab" data-v="whatsapp" type="button">Revisar</button>');
    }
    return al;
  }
  function panelPedidos() {
    if (ordersErr) return '<h1>Pedidos</h1><p class="muted">No se pueden leer los pedidos en esta vista.</p>';
    const s = stats(), f = flt.ost || 'activos';
    const T = [['recib', 'Recibidos hoy', null], ['pend', 'Pendientes', 'pend'], ['prep', 'Preparando', 'preparando'], ['listo', 'Listos', 'listo'], ['cam', 'En camino', 'encamino'], ['ent', 'Entregados hoy', 'entregado'], ['ventas', 'Ventas de hoy', null], ['out', 'Agotados', 'inv']];
    const tiles = T.map(([k, l, a]) => { const v = k === 'ventas' ? eur(s[k]) : s[k]; return a ? `<button type="button" class="tile${f === a ? ' on' : ''}" data-act="${a === 'inv' ? 'tab' : 'ofilter'}" data-v="${a === 'inv' ? 'inventario' : a}"><b>${v}</b><span>${l}</span></button>` : `<div class="tile"><b>${v}</b><span>${l}</span></div>`; }).join('');
    const al = alertsList();
    const list = orders.slice().sort((a, b) => b.ts - a.ts);
    const pass = (o) => f === 'todos' ? true : f === 'activos' ? (!['entregado', 'cancelado'].includes(stOf(o)) || unreadReplies(o) > 0) : f === 'pend' ? ['nuevo', 'confirmado'].includes(stOf(o)) : stOf(o) === f;
    const shown = list.filter(pass);
    const fl = [['activos', 'Activos'], ['pend', 'Pendientes'], ['todos', 'Todos (' + list.length + ')']];
    const fname = { preparando: 'En preparación', listo: 'Listos', encamino: 'En camino', entregado: 'Entregados', cancelado: 'Cancelados' }[f];
    return `<h1>Pedidos</h1>
      <div class="tiles">${tiles}</div>
      <div class="stores-st">${stores().map(([k, st]) => storeChip(k, st)).join('')}</div>
      ${al.length ? `<section class="card alerts" aria-label="Avisos"><ul class="todo">${al.map((t) => `<li>${t}</li>`).join('')}</ul></section>` : ''}
      <div class="chips-f" role="group" aria-label="Filtrar pedidos">${fl.map(([k, l]) => `<button type="button" class="${f === k ? 'on' : ''}" data-act="ofilter" data-v="${k}">${l}</button>`).join('')}${fname ? `<button type="button" class="on" data-act="ofilter" data-v="activos">${fname} ×</button>` : ''}</div>
      ${shown.length ? `<ul class="leads" id="ordList">${shown.map(orderCard).join('')}</ul>` : '<p class="muted">No hay pedidos en esta vista.</p>'}
      <p class="muted sm">Pedidos de demostración hechos desde esta página: no se cobran ni llegan al local. Los datos se leen del servidor; con el móvil sin conexión no se muestran como actuales.</p>`;
  }
  function orderCard(o) {
    const st = stOf(o), id = esc(o.id), dom = o.mode === 'domicilio', fl = A.ST.flow(o.mode), i = fl.indexOf(st), next = i >= 0 ? fl[i + 1] : null, un = unreadReplies(o), ph = phoneFor(o);
    const map = o.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address.street + ', ' + o.address.zip + ' ' + o.address.city)}` : '';
    const chips = A.ST.all.filter((k) => !(k === 'encamino' && !dom) && !(k === 'listo' && dom)).map((k) => k === 'cancelado'
      ? `<button type="button" class="crit${st === k ? ' on' : ''}${cancelArmed === o.id ? ' arm' : ''}" data-act="cancel" data-id="${id}" aria-pressed="${st === k}">${cancelArmed === o.id && st !== k ? 'Pulsa otra vez: cancelar' : 'Cancelado'}</button>`
      : `<button type="button" class="crit${st === k ? ' on' : ''}" data-act="st" data-id="${id}" data-v="${k}" aria-pressed="${st === k}">${esc(stLabel(k, o.mode))}</button>`).join('');
    const th = threadOf(o), shown = th.slice(-5), cm = commsOf(o.id).slice(0, 4);
    const tplKeys = ['confirmar', 'preparacion', dom ? 'encamino' : 'listo', 'entregado'], ch = pref(), cmpd = cmp[o.id] || '';
    const tbtn = (k) => { const txt = fill(tplText(k), o), href = linkFor(o, txt, ch); return href ? `<a class="chq crit" data-act="comm" data-id="${id}" data-v="${k}" data-ch="${ch}" href="${esc(href)}"${ch === 'wa' ? ' target="_blank" rel="noopener"' : ''}>${TPL_SHORT[k]}</a>` : `<span class="chq off">${TPL_SHORT[k]}</span>`; };
    return `<li class="card lead ord${un ? ' hot' : ''}${['entregado', 'cancelado'].includes(st) ? ' seen' : ''}" data-oid="${id}"><div class="lead-h"><b>${id}</b><small>${fmtDate(o.ts)}</small></div>
      <p><span class="bd ord-pill s-${st}">${esc(stLabel(st, o.mode))}</span> <b>${dom ? 'Domicilio' : 'Recogida'}</b> · ${esc(o.storeName)} · ${esc(String(o.date).split('-').reverse().join('/'))} a las ${esc(o.time)}</p>
      <div class="ord-who"><b>${esc(o.customer.name)} ${esc(o.customer.surname)}</b><small>${esc(o.customer.phone)} · ${esc(o.customer.email)}</small>
        ${o.address ? `<small>${esc(o.address.street)}, ${esc(o.address.zip)} ${esc(o.address.city)}</small>` : ''}
        <div class="acts">${ph ? `<a class="btn sm ghost" href="tel:+${ph}">Llamar</a><button class="btn sm ghost" type="button" data-act="copy" data-id="${id}" data-v="tel">Copiar número</button>` : ''}${map ? `<a class="btn sm ghost" href="${map}" target="_blank" rel="noopener">Ver mapa</a>` : ''}</div></div>
      <p class="ord-lines">${o.lines.map((l) => `${l.q} × ${esc(l.name)}`).join('<br>')}</p>
      <p><b>${eur(o.subtotal)}</b> en platos (IVA incl.)${o.shipping ? ' · envío ' + esc(o.shipping) : ''} · pago: ${o.pay === 'demo' ? 'demostración (sin cobro)' : esc(String(o.pay || '—'))}</p>${o.note ? `<p class="lead-m">${esc(o.note)}</p>` : ''}
      <div class="ord-state"><span class="lbl">Estado del pedido</span>
        ${next ? `<button type="button" class="btn adv crit" data-act="adv" data-id="${id}">Siguiente: ${esc(stLabel(next, o.mode))}</button>` : ''}
        <div class="seg-st" role="group" aria-label="Cambiar estado">${chips}</div></div>
      <div class="comm"><div class="comm-h"><b>Avisar al cliente</b><small>${ch === 'sms' ? 'SMS' : 'WhatsApp'} · se abre con el texto listo; lo revisas y lo envías tú</small></div>
        ${ph ? `<div class="chips-q">${tplKeys.map(tbtn).join('')}</div>` : '<p class="muted sm">El teléfono del cliente no es válido para abrir WhatsApp o SMS.</p>'}
        <details class="cmp" data-dk="cmp-${id}"${openG.has('cmp-' + o.id) ? ' open' : ''}><summary>Responder manualmente</summary>
          <div class="chips-q">${(COMMS().quick || []).map((q, n) => `<button type="button" class="chq" data-act="cmpq" data-id="${id}" data-v="${n}">${esc(fill(q, o).slice(0, 28))}${fill(q, o).length > 28 ? '…' : ''}</button>`).join('')}</div>
          <label class="f"><span class="sr">Mensaje para ${esc(o.customer.name)}</span><textarea data-cmp="${id}" rows="3" maxlength="600" placeholder="Escribe el mensaje. Se abre en la conversación con el texto listo.">${esc(cmpd)}</textarea></label>
          <div class="acts">${ph ? `<a class="btn sm crit" data-act="comm" data-id="${id}" data-v="libre" data-ch="wa" data-cl="wa" href="${esc(waLink(o, cmpd))}" target="_blank" rel="noopener">Abrir WhatsApp</a><a class="btn sm ghost crit" data-act="comm" data-id="${id}" data-v="libre" data-ch="sms" data-cl="sms" href="${esc(smsLink(o, cmpd))}">Abrir SMS</a>` : ''}<button class="btn sm ghost" type="button" data-act="copy" data-id="${id}" data-v="msg">Copiar mensaje</button></div></details>
        ${cm.length ? `<ul class="clog-mini">${cm.map((c) => commRow(c, true)).join('')}</ul>` : ''}</div>
      <details class="msgbox" data-dk="app-${id}"${openG.has('app-' + o.id) || un ? ' open' : ''}><summary>Mensajes en la pantalla del cliente${un ? ` <i class="dot">${un}</i>` : ''}</summary>
        ${un ? `<button class="btn sm ghost" type="button" data-act="rd" data-id="${id}">Marcar respuestas como leídas</button>` : ''}
        ${shown.length ? `<ul class="athread">${shown.map((m) => `<li class="abub ${m.t === 'c' ? 'c' : 'l'}${m.k === 'delay' ? ' delay' : ''}"><span>${m.k === 'delay' ? '<b>Retraso' + (m.min ? ' ~' + m.min + ' min' : '') + '</b> ' : ''}${esc(m.txt)}</span><time>${m.t === 'c' ? 'Cliente' : 'Tú'} · ${hhmm(m.ts)}</time></li>`).join('')}</ul>` : '<p class="muted sm">Aún no hay mensajes. El cliente los ve en su pantalla de seguimiento.</p>'}
        <div class="chips-q">${QUICK_APP(o).map((q, n) => `<button type="button" class="chq${q[0] === 'delay' ? ' dl' : ''}" data-act="qr" data-id="${id}" data-v="${n}">${esc(q[2])}</button>`).join('')}</div>
        <form class="msg-form" data-mform="${id}" autocomplete="off"><input data-minput="${id}" type="text" maxlength="240" value="${esc(drafts[o.id] || '')}" placeholder="Escribe al cliente…" enterkeyhint="send" aria-label="Mensaje para ${esc(o.customer.name)}"><button class="btn sm crit" type="submit">Enviar</button></form></details></li>`;
  }
  function commRow(c, mini) {
    const o = orders.find((x) => x.id === c.o);
    const btns = c.st === 'enviado' ? '' : `<span class="acts"><button type="button" class="btn sm ghost crit" data-act="cs" data-id="${esc(c.id)}" data-v="enviado">Marcar enviado</button>${c.st === 'error' ? '' : `<button type="button" class="btn sm ghost crit" data-act="cs" data-id="${esc(c.id)}" data-v="error">Error</button>`}</span>`;
    return `<li class="clog"><div><b>${esc(TPL_LABEL[c.tpl] || c.tpl)}</b> · ${c.ch === 'sms' ? 'SMS' : 'WhatsApp'}${mini ? '' : ` · <button type="button" class="lnk" data-act="goorder" data-id="${esc(c.o)}">${esc(c.o)}</button>${o ? ' · ' + esc(o.customer.name) : ''}`}<small>${hhmm(c.ts)}</small></div><span class="bd ms-${c.st}">${MSG_ST[c.st] || c.st}</span>${btns}</li>`;
  }
  /* ---- avisos: sonido, vibración, título, badge y notificación del navegador ---- */
  function chime() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = ac || new C(); if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      [[880, 0], [1318, 0.16], [880, 0.42], [1318, 0.58]].forEach(([fq, d]) => {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(0.22, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3);
        o.connect(g); g.connect(ac.destination); o.start(t + d); o.stop(t + d + 0.32);
      });
    } catch (e) { /* sin audio */ }
  }
  function ping(title, body) {
    A.toast(title + (body ? ' · ' + body : ''));
    if (!alertsOn) return;
    chime(); try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { /* noop */ }
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body: body || '', tag: 'aec-' + title }); } catch (e) { /* noop */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && alertsOn && wake === null && lsg('aec-adm-wake', false)) setWake(true); });
  async function setWake(on) {
    try {
      if (on) { if (!navigator.wakeLock) { A.toast('Este navegador no permite mantener la pantalla encendida.'); return; } wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); lss('aec-adm-wake', true); }
      else { if (wake) await wake.release(); wake = null; lss('aec-adm-wake', false); }
    } catch (e) { wake = null; A.toast('No se pudo mantener la pantalla encendida.'); }
    if (tab === 'config' && $('#admMain')) drawPanel(true);
  }
  function detect() {
    const ids = new Set(orders.map((o) => o.id));
    if (knownIds === null) { knownIds = ids; orders.forEach((o) => { replySig[o.id] = (o.msgs || []).length; }); return; }
    const fresh = orders.filter((o) => !knownIds.has(o.id)); knownIds = ids;
    fresh.forEach((o) => ping('Nuevo pedido ' + o.id, o.storeName + ' · ' + (o.mode === 'domicilio' ? 'domicilio' : 'recogida') + ' · ' + o.time));
    orders.forEach((o) => { const n = (o.msgs || []).length; if (replySig[o.id] != null && n > replySig[o.id]) ping('Respuesta del cliente · ' + o.id, (o.msgs[n - 1] || {}).txt); replySig[o.id] = n; });
  }
  async function setState(id, val) {
    const o = orders.find((x) => x.id === id); if (!o || stOf(o) === val) return;
    const mp = Object.assign({}, S.statusMap, { [id]: val }), ks = Object.keys(mp); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach((k) => { delete mp[k]; });
    const ok = await guard(() => db().doc('site/order-status').set({ map: mp }), 'Pedido: ' + stLabel(val, o.mode));
    if (!ok) return;
    logAct(id + ' → ' + stLabel(val, o.mode));
    if (STATE_TPL[val]) { await ensurePending(o, STATE_TPL[val]); if (tab === 'pedidos') drawPanel(true); }
  }
  async function sendMsg(id) {
    const o = orders.find((x) => x.id === id), txt = (drafts[id] || '').trim().slice(0, 240); if (!o || !o.uid || !txt) return;
    const m = { k: delayMin[id] ? 'delay' : 'msg', txt, ts: Date.now() }; if (m.k === 'delay') m.min = delayMin[id];
    const cur = (msgsAll[o.uid] || {}).o || {}, next = Object.assign({}, cur, { [id]: (cur[id] || []).concat([m]).slice(-40) });
    const ks = Object.keys(next); if (ks.length > 20) ks.sort((a, b) => lastTs(next[a]) - lastTs(next[b])).slice(0, ks.length - 20).forEach((k) => { delete next[k]; });
    const ok = await guard(() => db().doc('msgs/' + o.uid).set({ o: next }), 'Mensaje enviado al cliente');
    if (ok) { drafts[id] = ''; delete delayMin[id]; if (replyTs(o)) { admSeen[id] = replyTs(o); lss('aec-adm-seen', admSeen); } drawPanel(true); stateLine(); logAct('Mensaje en pantalla del cliente · ' + id); }
  }

  /* ---------- PRODUCTOS ---------- */
  function rowHTML(it) {
    const badges = [it.hidden ? '<em class="bd off">Archivado</em>' : '', it.soldOut ? '<em class="bd warn">Agotado</em>' : '', it.featured ? '<em class="bd new">Destacado</em>' : '', isNew(it) ? '<em class="bd new">Nuevo</em>' : (isEdited(it.id) ? '<em class="bd ed">Editado</em>' : '')].join('');
    const src = it.asset ? '/_blob/' + it.asset : (it.img || it.image);
    return `<li class="row"><button class="row-main" data-act="edit" data-id="${esc(it.id)}"><span class="th">${A.art(KIND[it.cat] || 'pan', it.id, toneOf(it.cat))}${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="row-t"><b>${esc(it.name)}</b><small>${esc(catLabel(it.cat))} · ${it.priceMax && it.priceMax > it.price ? 'desde ' : ''}${eur(it.price)} ${badges}</small></span></button>
      <div class="row-a"><label class="sw"><input type="checkbox" data-tg="hidden" data-id="${esc(it.id)}"${it.hidden ? '' : ' checked'}><span>Visible</span></label></div></li>`;
  }
  function filteredItems() { const q = A.norm(flt.q); return S.items.filter((i) => (flt.cat === 'all' || i.cat === flt.cat) && (!q || A.norm(i.name).includes(q))); }
  function panelProductos() {
    const list = filteredItems();
    return `<div class="head"><h1>Productos</h1><button class="btn sm" data-act="new" type="button">Nuevo plato</button></div>
      <p class="muted">Aquí cambias nombre, precio (también por local), descripción, ingredientes, fotos, categoría y qué platos se ven. También puedes tocar un plato directamente en la web con «Editar página». La disponibilidad por local (agotado o desactivado) se cambia en Inventario.</p>
      <div class="bar-f"><label class="f"><span class="sr">Buscar plato</span><input id="fq" type="search" placeholder="Buscar plato" value="${esc(flt.q)}"></label>
      <label class="f"><span class="sr">Categoría</span><select id="fc"><option value="all">Todas las categorías</option>${S.cats.map((c) => `<option value="${c.id}"${flt.cat === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label></div>
      <p class="muted" id="fcount">${list.length} platos</p><ul class="rows" id="rows">${list.map(rowHTML).join('')}</ul>${catsCard()}`;
  }
  function catsCard() {
    const n = S.cats.length, ch = !!(S.site.catOver || (S.site.catOrder && S.site.catOrder.length));
    return grp('cats', '<b>Categorías de la carta</b><small>nombre y orden</small>', `<p class="muted sm">Cambia el nombre o el orden en que salen las categorías en la web.</p>
      <ul class="catl">${S.cats.map((c, i) => `<li><input data-cat="${esc(c.id)}" value="${esc(c.label)}" aria-label="Nombre de la categoría ${esc(c.label)}"><button type="button" class="ib" data-act="catUp" data-v="${esc(c.id)}" aria-label="Subir ${esc(c.label)}"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ib" data-act="catDn" data-v="${esc(c.id)}" aria-label="Bajar ${esc(c.label)}"${i === n - 1 ? ' disabled' : ''}>↓</button></li>`).join('')}</ul>
      <div class="acts"><button class="btn sm crit" type="button" data-act="catSave">Guardar nombres</button>${ch ? '<button class="btn sm ghost crit" type="button" data-act="catReset">Volver al original</button>' : ''}</div>`);
  }
  function moveCat(id, d) {
    const ids = S.cats.map((c) => c.id), i = ids.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const same = ids.join() === S.catsBase.map((c) => c.id).join(), ov = catNames();
    saveSite((o) => { if (same) delete o.catOrder; else o.catOrder = ids; if (Object.keys(ov).length) o.catOver = ov; else delete o.catOver; }, 'Orden guardado').then((ok) => { if (ok) logAct('Categorías reordenadas'); });
  }

  /* ---------- INVENTARIO (disponible · agotado temporalmente · desactivado, por local) ---------- */
  const AV = [['ok', 'Disponible'], ['out', 'Agotado'], ['off', 'Desactivado']];
  const invItems = (k) => S.items.filter((i) => !i.hidden && A.inStore(i, k));
  function invRow(it, k) {
    const s = A.stockState(it, k);
    return `<li class="inv-row" data-inv="${esc(it.id)}"><div class="inv-t"><b>${esc(it.name)}</b><small>${esc(catLabel(it.cat))}</small></div><div class="seg3" role="group" aria-label="Disponibilidad de ${esc(it.name)}">${AV.map(([v, l]) => `<button type="button" class="crit s-${v}${s === v ? ' on' : ''}" data-act="av" data-id="${esc(it.id)}" data-v="${v}" aria-pressed="${s === v}">${l}</button>`).join('')}</div></li>`;
  }
  function invFiltered(k) { const q = A.norm(inv.q); return invItems(k).filter((i) => (flt.cat === 'all' || i.cat === flt.cat) && (inv.f === 'todos' || A.stockState(i, k) === inv.f) && (!q || A.norm(i.name).includes(q))); }
  function panelInventario() {
    if (!inv.k || !S.site.stores[inv.k]) inv.k = S.site.storeOrder[0];
    const k = inv.k, all = invItems(k), n = (s) => all.filter((i) => A.stockState(i, k) === s).length, list = invFiltered(k), hid = S.items.filter((i) => i.hidden).length;
    return `<h1>Inventario</h1>
      <div class="chips-f" role="group" aria-label="Local">${stores().map(([key, st]) => `<button type="button" class="${key === k ? 'on' : ''}" data-act="istore" data-v="${key}">${esc(st.name)}</button>`).join('')}</div>
      <div class="inv-sum"><span class="bd ok">${n('ok')} disponibles</span><span class="bd warn">${n('out')} agotados</span><span class="bd off">${n('off')} desactivados</span></div>
      <p class="muted sm">Agotado: se ve en la carta pero no se puede pedir. Desactivado: no aparece en este local. Cada cambio se aplica al momento en la tienda y en los carritos abiertos.${hid ? ` ${hid} plato${hid > 1 ? 's' : ''} archivado${hid > 1 ? 's' : ''} en Productos no aparece${hid > 1 ? 'n' : ''} aquí.` : ''}</p>
      <div class="bar-f"><label class="f"><span class="sr">Buscar plato</span><input id="iq" type="search" placeholder="Buscar plato" value="${esc(inv.q)}"></label>
      <label class="f"><span class="sr">Categoría</span><select id="ic"><option value="all">Todas las categorías</option>${S.cats.map((c) => `<option value="${c.id}"${flt.cat === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label></div>
      <div class="chips-f" role="group" aria-label="Filtrar por estado">${[['todos', 'Todos'], ['out', 'Agotados'], ['off', 'Desactivados']].map(([v, l]) => `<button type="button" class="${inv.f === v ? 'on' : ''}" data-act="ifilter" data-v="${v}">${l}</button>`).join('')}${n('out') ? `<button type="button" class="crit reset${armed === 'avreset' ? ' arm' : ''}" data-act="avreset">${armed === 'avreset' ? 'Pulsa otra vez para reponer todo' : 'Reponer los agotados'}</button>` : ''}</div>
      <p class="muted" id="icount">${list.length} platos</p><ul class="rows inv" id="invRows">${list.map((i) => invRow(i, k)).join('')}</ul>`;
  }
  async function setAvail(id, k, v) {
    const it = S.byId[id]; if (!it) return;
    const row = $(`[data-inv="${id}"]`); if (row) $$('button', row).forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const o = S.over[id] || {}, av = Object.assign({}, o.avail || {}, { [k]: v });
    const ok = await guard(() => db().doc('menu/' + id).set(Object.assign({}, o, { avail: av })), (S.site.stores[k].name) + ': ' + it.name + ' → ' + AV.find((x) => x[0] === v)[1].toLowerCase());
    if (ok) logAct(S.site.stores[k].name + ' · ' + it.name + ': ' + AV.find((x) => x[0] === v)[1]); else if (row) drawPanel(true);
  }
  async function resetAvail(k) {
    const outs = invItems(k).filter((i) => A.stockState(i, k) === 'out'); if (!outs.length) return;
    const ok = await guard(async () => { for (const it of outs) { const o = S.over[it.id] || {}; await db().doc('menu/' + it.id).set(Object.assign({}, o, { avail: Object.assign({}, o.avail || {}, { [k]: 'ok' }) })); } }, outs.length + ' platos disponibles otra vez');
    if (ok) logAct(S.site.stores[k].name + ' · repuestos ' + outs.length + ' platos agotados');
  }

  /* ---------- HORARIOS Y CIERRES ---------- */
  const DAYS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];
  const KINDS = { festivo: 'Festivo', vacaciones: 'Vacaciones', extraordinario: 'Cierre extraordinario' };
  const okHours = (s) => s === '' || (/^\d{1,2}:\d{2}-\d{1,2}:\d{2}(,\d{1,2}:\d{2}-\d{1,2}:\d{2})*$/.test(s) && s.split(',').every((p) => { const [a, b] = p.split('-').map((x) => { const [h, m] = x.split(':'); return +h * 60 + +m; }); return a < b && b <= 24 * 60; }));
  const dMY = (d) => String(d || '').split('-').reverse().join('/');
  function panelHorarios() {
    if (!hor.k || !S.site.stores[hor.k]) hor.k = S.site.storeOrder[0];
    const k = hor.k, st = S.site.stores[k], td = ymdOf(Date.now()), bl = A.orderBlock(st), cl = A.closureOn(st, td), tc = st.closure && st.closure.on && bl && bl.kind === 'temp';
    const stat = bl ? `<div class="banner bad"><b>${bl.kind === 'temp' ? 'Cerrado temporalmente' : 'Pedidos pausados'}</b><small>${esc(bl.text)}</small></div>` : cl ? `<div class="banner warn"><b>Cerrado hoy</b><small>${esc(cl.label || KINDS[cl.kind] || '')}</small></div>` : '<div class="banner ok"><b>Pedidos activos</b><small>Los clientes pueden pedir dentro de los horarios de servicio.</small></div>';
    const sw = (key, label, on) => `<label class="sw big"><input type="checkbox" data-hsw="${key}"${on ? ' checked' : ''}><span>${label}</span></label>`;
    const closures = (st.closures || []).map((c, i) => ({ c, i })).sort((a, b) => (a.c.from < b.c.from ? -1 : 1));
    return `<h1>Horarios y cierres</h1>
      <div class="chips-f" role="group" aria-label="Local">${stores().map(([key, s]) => `<button type="button" class="${key === k ? 'on' : ''}" data-act="hstore" data-v="${key}">${esc(s.name)}</button>`).join('')}</div>
      ${stat}
      <section class="card"><h2>Pedidos online</h2><p class="muted sm">Hora de Madrid. Pausar no borra nada: solo evita nuevos pedidos.</p>
        ${sw('ordersOff', 'Aceptar pedidos online', !st.ordersOff)}${sw('pickupOff', 'Recogida en el local', !st.pickupOff)}${sw('deliveryOff', 'Entrega a domicilio', !st.deliveryOff)}</section>
      <section class="card"><h2>Cierre temporal</h2>${tc ? `<p><b>Activo.</b> ${esc(st.closure.msg || 'Sin mensaje')}${st.closure.until ? ' · reapertura estimada ' + esc(A.untilText(st.closure.until)) : ''}</p><div class="acts"><button class="btn crit" type="button" data-act="reopen">Reabrir ahora</button></div>`
        : `<p class="muted sm">Cierra los pedidos al instante (cocina saturada, imprevisto…). Se reabre solo a la hora indicada, o a mano.</p>
        <label class="f"><span>Mensaje para los clientes</span><input id="clMsg" maxlength="120" placeholder="Ej.: Cocina saturada, volvemos enseguida"></label>
        <label class="f"><span>Reapertura estimada (opcional, hora de Madrid)</span><input id="clUntil" type="datetime-local"></label>
        <div class="acts"><button class="btn danger crit" type="button" data-act="closeNow">Cerrar temporalmente</button></div>`}</section>
      <section class="card"><h2>Horario de servicio por día</h2><p class="muted sm">De aquí salen las horas de entrega. Formato 12:00-16:00,19:30-23:00. Vacío = cerrado.</p>
        ${DAYS.map(([d, n]) => `<label class="f dayf"><span>${n}</span><input data-hsvc="${d}" value="${esc(((st.svc || {})[d]) || '')}" placeholder="Cerrado" inputmode="numeric" autocomplete="off"></label>`).join('')}
        <div class="acts"><button class="btn crit" type="button" data-act="saveHours">Guardar horario</button></div></section>
      <section class="card"><h2>Festivos, vacaciones y cierres</h2>
        ${closures.length ? `<ul class="clos">${closures.map(({ c, i }) => `<li class="${(c.to || c.from) < td ? 'past' : ''}"><div><b>${dMY(c.from)}${c.to && c.to !== c.from ? ' → ' + dMY(c.to) : ''}</b><small>${esc(KINDS[c.kind] || 'Cierre')}${c.label ? ' · ' + esc(c.label) : ''}</small></div><button class="btn sm ghost crit" type="button" data-act="delClosure" data-v="${i}">Quitar</button></li>`).join('')}</ul>` : '<p class="muted sm">No hay cierres programados.</p>'}
        <div class="two"><label class="f"><span>Desde</span><input id="cfFrom" type="date"></label><label class="f"><span>Hasta (opcional)</span><input id="cfTo" type="date"></label></div>
        <div class="two"><label class="f"><span>Tipo</span><select id="cfKind">${Object.keys(KINDS).map((x) => `<option value="${x}">${KINDS[x]}</option>`).join('')}</select></label><label class="f"><span>Nota (opcional)</span><input id="cfLabel" maxlength="60" placeholder="Ej.: Festivo local"></label></div>
        <div class="acts"><button class="btn crit" type="button" data-act="addClosure">Añadir cierre</button></div></section>`;
  }
  const stPath = (k, f) => 'stores.' + k + '.' + f;
  function saveHours(k) {
    const svc = {}; let bad = null;
    DAYS.forEach(([d, n]) => { const el = $(`[data-hsvc="${d}"]`); const v = el.value.trim().replace(/\s+/g, ''); el.classList.toggle('bad', !okHours(v)); if (!okHours(v) && !bad) bad = n; svc[d] = v; });
    if (bad) { A.toast('Revisa el horario del ' + bad.toLowerCase() + ': usa 12:00-16:00,19:30-23:00'); return; }
    saveSite((o) => setPath(o, stPath(k, 'svc'), svc), 'Horario guardado').then((ok) => { if (ok) logAct(S.site.stores[k].name + ' · horario de servicio actualizado'); });
  }
  function closeNow(k) {
    const msg = $('#clMsg').value.trim(), u = $('#clUntil').value;
    const until = u ? u.replace('T', ' ') : '';
    saveSite((o) => setPath(o, stPath(k, 'closure'), { on: true, msg, until }), 'Local cerrado temporalmente').then((ok) => { if (ok) logAct(S.site.stores[k].name + ' · cierre temporal' + (msg ? ': ' + msg : '')); });
  }
  function addClosure(k) {
    const from = $('#cfFrom').value, to = $('#cfTo').value; if (!from) { A.toast('Elige la fecha de inicio.'); return; }
    if (to && to < from) { A.toast('La fecha final es anterior a la inicial.'); return; }
    const c = { from, to: to || from, kind: $('#cfKind').value, label: $('#cfLabel').value.trim() };
    const arr = ((S.site.stores[k].closures) || []).concat([c]);
    saveSite((o) => setPath(o, stPath(k, 'closures'), arr), 'Cierre añadido').then((ok) => { if (ok) { logAct(S.site.stores[k].name + ' · cierre ' + dMY(from) + (to && to !== from ? ' → ' + dMY(to) : '')); drawPanel(true); } });
  }

  /* ---------- WHATSAPP / SMS: ajustes y registro ---------- */
  function panelWhatsapp() {
    const c = COMMS(), adm = isAdm(), tp = c.templates || {}, num = S.site.contact.whatsapp, sample = { customer: { name: 'Lucía' }, id: 'AEC-000000-XXXX' };
    const pub = (n, m) => 'https://wa.me/' + String(n || '').replace(/\D/g, '') + (m ? '?text=' + encodeURIComponent(m) : '');
    const log = commLog.filter((x) => cflt === 'todos' || x.st === cflt);
    const settings = adm ? `
      <section class="card"><h2>Canal y número</h2>
        <div class="chips-f" role="group" aria-label="Canal preferido">${[['whatsapp', 'WhatsApp'], ['sms', 'SMS']].map(([v, l]) => `<button type="button" class="${(c.preferred || 'whatsapp') === v ? 'on' : ''}" data-act="pref" data-v="${v}">${l}</button>`).join('')}</div>
        <p class="muted sm">Los botones de cada pedido usan el canal elegido. Los mensajes <b>nunca</b> salen solos: se abre la conversación con el texto listo y lo envías tú.</p>
        <div class="two"><label class="f"><span>Prefijo internacional</span><input id="cmPrefix" value="${esc(c.prefix || '34')}" inputmode="numeric" maxlength="4"></label>
        <label class="f"><span>WhatsApp oficial (con prefijo, sin +)</span><input id="cmNum" value="${esc(num)}" inputmode="numeric"></label></div>
        ${num === DEFAULT_WA && !Object.values(c.perStore || {}).some(Boolean) ? '<p class="note warn">Este número es el que ya figuraba en la web actual. Confírmalo antes de publicar.</p>' : ''}
        ${stores().map(([k, st]) => `<label class="f"><span>${esc(st.name)} · número propio (vacío = el oficial)</span><input data-cmstore="${k}" value="${esc((c.perStore || {})[k] || '')}" inputmode="numeric" placeholder="${esc(num)}"></label>`).join('')}
        <div class="acts"><button class="btn crit" type="button" data-act="saveComm">Guardar canal y números</button></div></section>
      <section class="card"><h2>Plantillas de aviso</h2><p class="muted sm">Escribe <code>{nombre}</code> y <code>{pedido}</code> donde quieras el nombre y el número de pedido.</p>
        ${TPL_KEYS.map((k) => `<label class="f"><span>${TPL_LABEL[k]}</span><textarea data-tpl="${k}" rows="3" maxlength="600">${esc(tp[k] || '')}</textarea><small class="muted">Vista previa: ${esc(fill(tp[k], sample).slice(0, 90))}${fill(tp[k], sample).length > 90 ? '…' : ''}</small></label>`).join('')}
        <h2 style="margin-top:6px">Respuestas rápidas</h2>${(c.quick || []).map((q, n) => `<label class="f"><span class="sr">Respuesta ${n + 1}</span><input data-qk="${n}" value="${esc(q)}" maxlength="240"></label>`).join('')}
        <div class="acts"><button class="btn crit" type="button" data-act="saveTpl">Guardar plantillas</button><button class="btn ghost crit${armed === 'tplreset' ? ' arm' : ''}" type="button" data-act="resetTpl">${armed === 'tplreset' ? 'Pulsa otra vez para restaurar' : 'Restaurar los textos originales'}</button></div></section>
      <section class="card"><h2>Enlace público de contacto</h2><p class="muted sm">Para que cualquier visitante te escriba. Es el enlace oficial de WhatsApp (Click-to-Chat).</p>
        <label class="f"><span>Mensaje inicial del visitante</span><input id="pubMsg" value="${esc(c.publicMsg || 'Hola, quiero hacer una consulta.')}" maxlength="160"></label>
        <p class="linkbox" id="pubLink">${esc(pub(num, c.publicMsg || 'Hola, quiero hacer una consulta.'))}</p>
        <div class="acts"><button class="btn sm ghost" type="button" data-act="copyPub">Copiar enlace</button><a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(pub(num, c.publicMsg || 'Hola, quiero hacer una consulta.'))}">Probar</a><button class="btn sm crit" type="button" data-act="savePub">Guardar mensaje</button></div></section>
      <section class="card"><h2>SMS</h2><p class="muted sm">El botón SMS abre la app Mensajes del móvil con el número y el texto. No hay proveedor de SMS contratado: el envío es manual y gratis con tu tarifa. Para enviar SMS automáticos haría falta contratar uno (decisión tuya).</p></section>` : '';
    return `<h1>WhatsApp y SMS</h1>
      <p class="muted">Los avisos a clientes se preparan aquí y se envían a mano. Estado del <b>pedido</b> y estado del <b>mensaje</b> son cosas distintas: abrir WhatsApp no significa que el mensaje se haya enviado.</p>
      <section class="card"><h2>Registro de mensajes</h2>
        <div class="chips-f" role="group" aria-label="Filtrar registro">${[['todos', 'Todos'], ['pendiente', 'Pendientes'], ['enlace_abierto', 'Enlace abierto'], ['enviado', 'Enviados'], ['error', 'Error']].map(([v, l]) => `<button type="button" class="${cflt === v ? 'on' : ''}" data-act="cfilter" data-v="${v}">${l}</button>`).join('')}</div>
        ${log.length ? `<ul class="clogs">${log.slice(0, 60).map((x) => commRow(x, false)).join('')}</ul>` : '<p class="muted sm">Todavía no hay mensajes. Al cambiar el estado de un pedido aparece aquí el aviso pendiente.</p>'}</section>${settings}`;
  }
  const TPL_DEFAULT = () => (S.defSite.comms || {});
  function saveCommCfg(mutOver, msg) { return saveSite(mutOver, msg); }

  /* ---------- CONFIGURACIÓN ---------- */
  const OPT = [/^banner$/, /^stats\.\d+\.suffix$/, /\.mapsUrl$/, /\.hoursNote$/, /\.closedDays$/, /\.sealAlt$/, /\.image2?Alt$/];
  const LIM = { 'order.leadMin': [0, 1440], 'order.slotStep': [5, 180], 'order.daysAhead': [1, 60] };
  /* Valida y convierte lo escrito. Devuelve { v } o { err }. */
  function coerce(p, type, raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (type === 'num') { const n = parseFloat(s.replace(',', '.')), lim = LIM[p] || [0, 1000000]; if (!(n >= lim[0] && n <= lim[1])) return { err: 'Escribe un número entre ' + lim[0] + ' y ' + lim[1] + '.' }; return { v: n }; }
    if (type === 'url') { if (s && !/^(https?:\/\/|mailto:|tel:)/i.test(s)) return { err: 'El enlace debe empezar por https://' }; return { v: s }; }
    if (type === 'tel') { const d = s.replace(/\D/g, ''); if (d.length < 9) return { err: 'Escribe el número con prefijo, por ejemplo 34600000000.' }; return { v: d }; }
    if (type === 'img' || type === 'logo') {
      if (!s) return type === 'logo' ? { err: 'Escribe el enlace de la imagen o súbela.' } : { v: '' };
      if (!/^(https?:\/\/|\/_blob\/|img\/|\/)/i.test(s)) return { err: 'Escribe un enlace completo (https://…) o sube la foto.' };
      return { v: s };
    }
    if (!s && !OPT.some((r) => r.test(p))) return { err: 'No puede quedar vacío. Para volver al texto de antes usa «Volver al original».' };
    return { v: s };
  }
  function field(path, label, type) {
    const raw = getPath(S.site, path), v = raw == null ? '' : raw;
    if (type === 'area' || type === 'md') return `<label class="f"><span>${esc(label)}</span><textarea data-p="${path}" rows="4">${esc(v)}</textarea></label>`;
    if (type === 'img') return `<div class="f"><label for="im-${path}"><span>${esc(label)}</span></label><div class="imgf"><input id="im-${path}" data-p="${path}" value="${esc(v)}" inputmode="url" autocapitalize="none" autocorrect="off">${S.cap.assets ? `<button class="btn sm ghost" type="button" data-act="up" data-v="${path}">Subir foto</button>` : ''}</div></div>`;
    const im = type === 'num' ? ' inputmode="decimal"' : type === 'url' ? ' inputmode="url" autocapitalize="none" autocorrect="off"' : type === 'tel' ? ' inputmode="tel"' : '';
    return `<label class="f"><span>${esc(label)}</span><input data-p="${path}" value="${esc(v)}"${im}></label>`;
  }
  const SEC = (t, fs) => ({ t, fs });
  const seq = (n) => Array.from({ length: n || 0 }, (_, i) => i);
  const cnt = (a) => (Array.isArray(a) ? a.length : 0);
  /* Todo lo que se ve en la web y se puede cambiar, agrupado como en la página. */
  function buildTexts() {
    const s = S.site, ui = s.ui || {};
    return [
      SEC('Aviso superior y promociones', [['banner', 'Texto del aviso (vacío = sin aviso)', 'area']]),
      SEC('Marca y pie de página', [['brand.name', 'Nombre del negocio'], ['brand.tagline', 'Lema'], ['brand.hashtag', 'Hashtag'], ['brand.sealAlt', 'Descripción del sello (accesibilidad)'], ['ui.footNote', 'Nota legal del pie', 'area']]),
      SEC('Portada (banner principal)', [['hero.title', 'Título principal'], ['hero.sub', 'Frase de apoyo', 'area'], ['hero.cta', 'Texto del botón'], ['ui.heroLink', 'Enlace secundario'], ['hero.image', 'Foto principal', 'img'], ['hero.imageAlt', 'Descripción de la foto principal (accesibilidad)'], ['hero.image2', 'Foto de la caja', 'img'], ['hero.image2Alt', 'Descripción de la foto de la caja (accesibilidad)']]
        .concat(seq(cnt(ui.trust)).map((i) => ['ui.trust.' + i, 'Garantía ' + (i + 1)]), seq(cnt(ui.marquee)).map((i) => ['ui.marquee.' + i, 'Cinta de texto ' + (i + 1)]))),
      SEC('Cifras destacadas', [].concat(...seq(cnt(s.stats)).map((i) => [['stats.' + i + '.value', 'Cifra ' + (i + 1) + ' · número', 'num'], ['stats.' + i + '.suffix', 'Cifra ' + (i + 1) + ' · unidad (min, %…)'], ['stats.' + i + '.label', 'Cifra ' + (i + 1) + ' · texto']]))),
      SEC('¿Por qué Arroz en Caja?', [['why.title', 'Título'], ['why.p1', 'Párrafo 1', 'md'], ['why.p2', 'Párrafo 2', 'md'], ['why.callout', 'Frase destacada', 'md'], ['why.p3', 'Párrafo 3', 'md'], ['why.image', 'Foto', 'img']]),
      SEC('Innovación', [['innovation.title', 'Título'], ['innovation.p1', 'Párrafo 1', 'md'], ['innovation.p2', 'Párrafo 2', 'md'], ['innovation.image', 'Foto', 'img']]),
      SEC('Calidad', [['quality.title', 'Título'], ['quality.p1', 'Párrafo', 'md'], ['quality.image', 'Foto', 'img']]),
      SEC('Medio ambiente', [['eco.title', 'Título'], ['eco.p1', 'Párrafo 1', 'md'], ['eco.p2', 'Párrafo 2', 'md'], ['eco.image', 'Foto', 'img']]),
      SEC('Bloque «Haz tu pedido»', [['ui.cartaTitle', 'Título'], ['ui.cartaSub', 'Texto', 'area']]),
      SEC('Cómo pedir y envíos', [['how.title', 'Título']].concat([].concat(...seq(cnt(s.how && s.how.steps)).map((i) => [['how.steps.' + i + '.verb', 'Paso ' + (i + 1) + ' · verbo'], ['how.steps.' + i + '.text', 'Paso ' + (i + 1) + ' · texto', 'area']])), [['how.delivery', 'Condiciones de envío', 'area'], ['ui.howCta', 'Texto del botón']])),
      SEC('Dónde estamos (título)', [['ui.storesTitle', 'Título del bloque de locales']]),
      SEC('Franquicia', [['franchise.title', 'Título'], ['franchise.lead', 'Texto principal', 'md'], ['franchise.sub', 'Texto secundario', 'area'], ['ui.franchiseCta', 'Texto del botón'], ['franchise.image', 'Foto', 'img'], ['franchise.stepsTitle', 'Título de los pasos']]
        .concat(seq(cnt(s.franchise && s.franchise.steps)).map((i) => ['franchise.steps.' + i, 'Paso ' + (i + 1), 'md']), [['ui.faqTitle', 'Título de las preguntas']], [].concat(...seq(cnt(s.franchise && s.franchise.faq)).map((i) => [['franchise.faq.' + i + '.q', 'Pregunta ' + (i + 1)], ['franchise.faq.' + i + '.a', 'Respuesta ' + (i + 1), 'area']])), [['ui.contactTitle', 'Título del formulario']])),
      SEC('Contacto, redes y enlaces legales', [['contact.whatsapp', 'WhatsApp oficial (con prefijo y sin +)', 'tel'], ['contact.instagram', 'Instagram (enlace)', 'url'], ['contact.facebook', 'Facebook (enlace)', 'url']]
        .concat([].concat(...seq(cnt(s.contact && s.contact.legal)).map((i) => [['contact.legal.' + i + '.label', 'Enlace legal ' + (i + 1) + ' · texto'], ['contact.legal.' + i + '.url', 'Enlace legal ' + (i + 1) + ' · dirección', 'url']])), [['order.termsUrl', 'Enlace de cancelaciones y devoluciones (pedido)', 'url'], ['order.privacyUrl', 'Enlace de privacidad (pedido)', 'url']])),
      SEC('Pedidos y envío', [['order.leadMin', 'Plazo mínimo de entrega a domicilio (minutos)', 'num'], ['order.leadNote', 'Texto del plazo', 'area'], ['order.slotStep', 'Intervalo entre horas de entrega (minutos)', 'num'], ['order.daysAhead', 'Días por adelantado en que se puede pedir', 'num'], ['order.shipping.label', 'Coste de envío (texto que ve el cliente)'], ['order.shipping.note', 'Condiciones del envío', 'area']])
    ];
  }
  let TEXTS = [];
  /* Logotipo y sello: protegidos. Hay que pulsar «Cambiar…» y confirmar; el original siempre se recupera. */
  function logoBlock(path, label) {
    const cur = getPath(S.site, path) || '', def = getPath(S.defSite, path) || '', changed = cur !== def, open = armed === 'logo:' + path;
    return `<div class="sub logo-box" data-logo="${path}"><h3>${esc(label)}</h3><div class="logo-prev"><img src="${esc(cur)}" alt="${esc(label)} actual" decoding="async" referrerpolicy="no-referrer"></div>
      ${open ? `<div class="f"><label for="lp-${path}"><span>Enlace de la nueva imagen</span></label><div class="imgf"><input id="lp-${path}" data-lp="${path}" value="${esc(cur)}" inputmode="url" autocapitalize="none" autocorrect="off">${S.cap.assets ? `<button class="btn sm ghost" type="button" data-act="upLogo" data-v="${path}">Subir imagen</button>` : ''}</div></div>
        <label class="ck"><input type="checkbox" data-lok="${path}"> Entiendo que cambia en toda la web</label>
        <div class="acts"><button class="btn sm crit" type="button" data-act="logoSave" data-v="${path}">Guardar</button><button class="btn sm ghost" type="button" data-act="logoCancel">Cancelar</button></div>`
    : `<p class="muted sm">${changed ? 'Distinto del original.' : 'Es el original.'}</p><div class="acts"><button class="btn sm ghost" type="button" data-act="logoOpen" data-v="${path}">Cambiar…</button>${changed ? `<button class="btn sm ghost crit" type="button" data-act="logoReset" data-v="${path}">Volver al original</button>` : ''}</div>`}</div>`;
  }
  const logosCard = () => `<p class="note">El logotipo es la marca. Está protegido: para cambiarlo hay que pulsar «Cambiar…» y confirmar. El original siempre se puede recuperar.</p>${logoBlock('brand.logo', 'Logotipo')}${logoBlock('brand.seal', 'Sello «Mejores arroces 2021»')}`;
  const grp = (key, title, body, cls) => `<details class="card grp${cls ? ' ' + cls : ''}" data-dk="${key}"${openG.has(key) ? ' open' : ''}><summary>${title}</summary><div class="grp-b">${body}</div></details>`;
  function pwaInfo() {
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return { standalone, ios, canPrompt: !!A.installEv, push: 'PushManager' in window, notif: typeof Notification !== 'undefined' ? Notification.permission : 'no' };
  }
  function pwaCard() {
    const p = pwaInfo();
    const how = p.standalone ? '<p class="note ok"><b>Instalada.</b> Estás usando la app desde el icono.</p>'
      : p.canPrompt ? '<div class="acts"><button class="btn" type="button" data-act="install">Instalar en este dispositivo</button></div>'
        : p.ios ? '<ol class="steps"><li>Abre esta página en <b>Safari</b>.</li><li>Toca <b>Compartir</b> (el cuadrado con la flecha).</li><li>Elige <b>Añadir a pantalla de inicio</b>.</li><li>Abre <b>ARROZ EN CAJA ADMIN</b> desde el icono nuevo.</li></ol>'
          : '<ol class="steps"><li>Abre esta página en <b>Chrome</b>.</li><li>Menú <b>⋮</b> → <b>Instalar aplicación</b> (o «Añadir a pantalla de inicio»).</li><li>Abre <b>ARROZ EN CAJA ADMIN</b> desde el icono.</li></ol>';
    return `<p class="muted sm">El icono abre directamente el panel. Funciona como una app: pantalla completa, sin barra del navegador.</p>${how}
      <ul class="kv"><li><span>Service worker</span><b>${esc(swState)}</b></li><li><span>Sin conexión</span><b>${'serviceWorker' in navigator ? 'Muestra el aviso y bloquea cambios' : 'No compatible'}</b></li></ul>
      ${/arrozencaja\.com$/.test(location.hostname) ? '' : '<p class="note">Estás en la vista previa del prototipo: la instalación definitiva se activa en arrozencaja.com/administracion.</p>'}`;
  }
  function alertsCard() {
    const p = pwaInfo();
    const perm = p.notif === 'granted' ? 'Permitidas' : p.notif === 'denied' ? 'Bloqueadas en el navegador' : p.notif === 'no' ? 'No compatible en este navegador' : 'Sin pedir todavía';
    return `<p class="muted sm">Con el panel abierto suena un aviso y vibra cuando entra un pedido o el cliente responde. El número de pedidos pendientes aparece en la pestaña y en el icono de la app (si el dispositivo lo permite).</p>
      <div class="acts"><button class="btn sm${alertsOn ? ' ghost' : ''}" type="button" data-act="alerts">${alertsOn ? 'Desactivar avisos' : 'Activar avisos'}</button><button class="btn sm ghost" type="button" data-act="chime">Probar sonido</button><button class="btn sm ghost" type="button" data-act="wake" aria-pressed="${!!wake}">${wake ? 'Pantalla encendida: sí' : 'Mantener pantalla encendida'}</button></div>
      <ul class="kv"><li><span>Notificaciones del navegador</span><b>${perm}</b></li><li><span>Push con la app cerrada</span><b>${p.push ? 'Compatible · falta el servidor' : 'No compatible'}</b></li></ul>
      <p class="note">El push con la app cerrada necesita un servidor propio (claves VAPID) y, en iPhone, iOS 16.4 o superior con la app instalada desde Compartir. No se activa en esta vista previa y no se promete donde no hay soporte.</p>`;
  }
  function localesCard() {
    const f = (k, key, label, ph) => `<label class="f"><span>${label}</span><input data-sp="${k}.${key}" value="${esc(S.site.stores[k][key] || '')}"${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
    return stores().map(([k, st]) => `<div class="sub" data-store="${k}"><h3>${esc(st.name)}</h3>${f(k, 'name', 'Nombre')}${f(k, 'address', 'Dirección')}${f(k, 'phone', 'Teléfonos', '917 82 35 38 · 660 96 93 30')}${f(k, 'hours', 'Horario (texto de la web)', '12:00-16:00, 19:30-23:00')}${f(k, 'hoursNote', 'Nota de horario')}${f(k, 'closedDays', 'Días de cierre (texto de la web)')}${f(k, 'mapsUrl', 'Enlace de Google Maps')}${f(k, 'orderUrl', 'Enlace para pedir en la web de pedidos')}<div class="acts"><button class="btn sm crit" type="button" data-act="saveStore" data-id="${k}">Guardar ${esc(st.name)}</button></div></div>`).join('');
  }
  function panelConfig() {
    const adm = isAdm(), td = Date.now(); TEXTS = buildTexts();
    const lead = leadsErr ? '<p class="muted sm">No se pueden leer las solicitudes en esta vista.</p>' : leads.length ? `<ul class="leads">${leads.slice().sort((a, b) => b.ts - a.ts).map((l) => `<li class="card lead${seen.has(l.key) ? ' seen' : ''}"><div class="lead-h"><b>${esc(l.name)} ${esc(l.surname || '')}</b><small>${fmtDate(l.ts)}</small></div><p>${esc(l.email)}${l.phone ? ' · ' + esc(l.phone) : ''}</p>${l.place ? `<p><small>Lugar de interés:</small> ${esc(l.place)}</p>` : ''}${l.msg ? `<p class="lead-m">${esc(l.msg)}</p>` : ''}${seen.has(l.key) ? '<span class="bd ed">Leída</span>' : `<button class="btn sm ghost" type="button" data-act="seen" data-id="${esc(l.key)}">Marcar como leída</button>`}</li>`).join('')}</ul>` : '<p class="muted sm">Todavía no hay solicitudes. Las del formulario de franquicia aparecerán aquí.</p>';
    const asst = `<p class="muted sm">${S.cap.sample ? 'El asistente responde con inteligencia artificial usando tu carta, horarios y envíos.' : 'Ahora responde con reglas básicas sobre carta, horarios y envíos.'}</p>
      <label class="f"><span>Mensaje de bienvenida</span><textarea data-ap="assistant.welcome" rows="2">${esc(S.site.assistant.welcome)}</textarea></label>
      <label class="f"><span>Información adicional (promociones, platos del día, normas del local…)</span><textarea data-ap="assistant.notes" rows="5">${esc(S.site.assistant.notes)}</textarea></label>
      <div class="acts"><button class="btn sm crit" type="button" data-act="saveAsst">Guardar</button></div>
      <form id="testForm" class="imgf"><input id="testQ" placeholder="Probar con una pregunta de cliente" aria-label="Pregunta de prueba"><button class="btn sm" type="submit">Preguntar</button></form><p class="answer" id="testA" role="status"></p>`;
    const act = actLog.length ? `<ul class="actlog">${actLog.slice(0, 40).map((a) => `<li><time>${fmtDate(a.ts)}</time><span>${esc(a.t)}</span></li>`).join('')}</ul>` : '<p class="muted sm">Aquí aparecerán los cambios de estado, inventario, horarios y mensajes.</p>';
    const acc = `<p><span class="bd ${adm ? 'new' : 'ed'}">${adm ? 'Administrador principal' : 'Encargado'}</span></p>
      <p class="muted sm">${adm ? 'Puedes cambiar productos, precios, textos, horarios, mensajes y ver el registro.' : 'Puedes llevar pedidos, inventario, horarios y mensajes. Productos, precios, textos y ajustes los cambia el administrador principal.'}</p>
      <p class="note">En esta vista previa solo entra la cuenta propietaria de la página. En el WordPress de producción cada persona tendrá su usuario y contraseña, recuperación por email, cierre de sesión, y los permisos se comprobarán en el servidor.</p>`;
    return `<h1>Configuración</h1>
      <section class="card"><h2>Mi tienda</h2><p class="muted sm">Mira la web como la ve un cliente sin perder lo que estás haciendo aquí.</p><div class="acts"><a class="btn" href="#inicio" data-act="shop">VER MI TIENDA</a>${adm ? '<button class="btn ghost" type="button" data-act="editPage">EDITAR LA PÁGINA TOCANDO</button>' : ''}</div>${adm ? '<p class="muted sm">«Editar la página tocando»: ves la web real y tocas un texto, una foto o un plato para cambiarlo.</p>' : ''}</section>${accCard()}
      ${grp('pwa', '<b>Instalar la app en el móvil</b>', pwaCard())}${grp('avisos', '<b>Avisos de pedido nuevo</b>', alertsCard())}
      ${adm ? grp('logos', '<b>Logotipo y sello</b><small>protegidos contra cambios sin querer</small>', logosCard()) : ''}
      ${adm ? grp('web', '<b>Contenido de la web</b><small>textos, fotos, cifras, enlaces y pedidos</small>', `<p class="note">Todo lo que se ve en la web se cambia aquí o tocando la propia página con «Editar página». Con «Vista previa» ves el cambio antes de publicarlo.</p><p class="muted sm">Escribe **así** para poner una palabra en negrita.</p>` + TEXTS.map((g, i) => `<details class="sub grp" data-dk="t${i}"${openG.has('t' + i) ? ' open' : ''}><summary>${esc(g.t)}</summary><div class="grp-b">${g.fs.map((f) => field(f[0], f[1], f[2])).join('')}<div class="acts"><button class="btn sm ghost" type="button" data-act="previewText" data-v="${i}">Vista previa</button><button class="btn sm crit" type="button" data-act="saveText" data-v="${i}">Publicar</button><button class="btn sm ghost crit" type="button" data-act="resetText" data-v="${i}">Volver al original</button></div></div></details>`).join('')) : ''}
      ${adm ? grp('locales', '<b>Datos de cada local</b><small>dirección, teléfonos, mapa</small>', localesCard()) : ''}
      ${adm ? grp('asst', '<b>Asistente de la web</b>', asst) : ''}
      ${adm ? grp('leads', `<b>Solicitudes de franquicia</b>${leads.filter((l) => !seen.has(l.key)).length ? ' <i class="dot">' + leads.filter((l) => !seen.has(l.key)).length + '</i>' : ''}`, lead) : ''}
      ${adm ? grp('act', '<b>Actividad reciente</b>', act) : ''}
      ${grp('acc', '<b>Acceso y seguridad</b>', acc)}
      <p class="muted sm" style="text-align:center">Versión del panel 6 · ${esc(fmtDate(td))}</p>`;
  }

  /* ---------- editor de plato (cajón) ---------- */
  /* El cajón vive en el cuerpo de la página para poder abrirse tanto desde el panel como tocando un plato en «Editar página». */
  function ensureDrawer() {
    if ($('#admDrawer')) return;
    const sc = document.createElement('div'); sc.className = 'adm-scrim'; sc.id = 'admScrim'; sc.setAttribute('data-keep', '');
    const dr = document.createElement('aside'); dr.className = 'adm-drawer'; dr.id = 'admDrawer'; dr.setAttribute('data-keep', ''); dr.setAttribute('aria-hidden', 'true'); dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-label', 'Editar plato');
    document.body.appendChild(sc); document.body.appendChild(dr);
    sc.addEventListener('click', () => closeEditor());
    dr.addEventListener('click', onClick); dr.addEventListener('change', onChange); dr.addEventListener('submit', onSubmit);
  }
  function spSection(id, it) {
    if (!id) return '';
    const sps = stores().filter(([k]) => A.inStore(it, k));
    if (sps.length < 2) return '';
    const spo = (S.over[id] || {}).sp || {}, rows = sps.map(([k, st]) => { const v = A.storeLayer(it, k), pr = v ? v.price : it.price; return { k, st, pr }; });
    const diff = rows.some((r) => r.pr !== it.price);
    return `<fieldset class="f spf"><legend>Precio por local</legend><p class="muted sm">${diff ? 'Este plato tiene precios distintos según el local. ' : ''}Cambia solo el local que deba tener otro precio: los demás se quedan como están.</p>${rows.map((r) => `<div class="sp-row"><label for="sp-${r.k}">${esc(r.st.name)}</label><input id="sp-${r.k}" data-spp="${r.k}" data-v0="${r.pr}" type="number" inputmode="decimal" step="0.05" min="0" value="${r.pr}"></div>`).join('')}${Object.keys(spo).length ? '<div class="acts"><button class="btn sm ghost" type="button" data-act="spClear">Quitar los precios especiales por local</button></div>' : ''}</fieldset>`;
  }
  function openEditor(id) {
    ensureDrawer();
    const it = id ? S.byId[id] : { id: null, cat: 'arroces', name: '', price: 0, priceMax: null, allergens: null, image: '', desc: '', hidden: false, soldOut: false };
    if (!it) return;
    edit = { id, it: clone(it) };
    const known = Array.isArray(it.allergens);
    const dr = $('#admDrawer');
    dr.innerHTML = `<div class="dr-h"><h2>${id ? 'Editar plato' : 'Nuevo plato'}</h2><button class="x" data-act="closeEd" aria-label="Cerrar" type="button">×</button></div>
      <form class="dr-b" id="edForm" novalidate>
        <label class="f"><span>Nombre</span><input id="eName" value="${esc(it.name)}" required></label>
        <div class="two"><label class="f"><span>Categoría</span><select id="eCat">${S.cats.map((c) => `<option value="${c.id}"${c.id === it.cat ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
        <label class="f"><span>Precio (€)</span><input id="ePrice" type="number" inputmode="decimal" step="0.05" min="0" value="${it.price}"></label></div>
        ${spSection(id, it)}
        <label class="f"><span>Precio máximo si hay varias opciones (€, opcional)</span><input id="ePmax" type="number" inputmode="decimal" step="0.05" min="0" value="${it.priceMax || ''}"></label>
        <label class="f"><span>Descripción corta (opcional)</span><textarea id="eDesc" rows="2">${esc(it.desc || '')}</textarea></label>
        <label class="f"><span>Ingredientes (opcional, separados por comas)</span><textarea id="eIng" rows="2">${esc(it.ing || '')}</textarea></label>
        <fieldset class="f"><legend>Alérgenos</legend><label class="ck"><input type="checkbox" id="eNoData"${known ? '' : ' checked'}> No tengo la ficha de alérgenos de este plato</label>
          <div class="alg" id="eAlg">${Object.keys(ALG).map((a) => `<label class="ck"><input type="checkbox" data-a="${a}"${known && it.allergens.includes(a) ? ' checked' : ''}${known ? '' : ' disabled'}> ${ALG[a]}</label>`).join('')}</div></fieldset>
        <div class="f"><label for="eImg"><span>Foto</span></label><div class="imgf"><input id="eImg" value="${esc(it.asset ? '/_blob/' + it.asset : it.image || '')}" inputmode="url" autocapitalize="none" autocorrect="off" placeholder="Enlace de la foto">${S.cap.assets ? '<button class="btn sm ghost" type="button" data-act="upImg">Subir foto</button>' : ''}</div></div>
        <label class="f"><span>Enlace del plato en la web de pedidos (para platos con opciones)</span><input id="eUrl" value="${esc(it.url || '')}" inputmode="url" autocapitalize="none" autocorrect="off"></label>
        <label class="ck"><input type="checkbox" id="eVis"${it.hidden ? '' : ' checked'}> Visible en la carta (desmarca para archivar)</label>
        <label class="ck"><input type="checkbox" id="eFeat"${it.featured ? ' checked' : ''}> Destacado</label>
        <p class="err" id="eErr" role="alert"></p>
        <div class="acts"><button class="btn sm crit" type="submit">Guardar</button><button class="btn sm ghost" type="button" data-act="closeEd">Cancelar</button>${id && !isNew(it) && isEdited(id) ? '<button class="btn sm ghost" type="button" data-act="restore">Volver al original</button>' : ''}${id && isNew(it) ? '<button class="btn sm ghost danger" type="button" data-act="del">Eliminar plato</button>' : ''}</div>
        ${id && !isNew(it) ? '<p class="muted sm">Los platos de la carta original se archivan, no se borran: así no se pierde nada.</p>' : ''}
      </form>`;
    dr.classList.add('on'); dr.setAttribute('aria-hidden', 'false'); $('#admScrim').classList.add('on');
    setTimeout(() => { const n = $('#eName'); if (n) n.focus({ preventScroll: true }); }, 80);
  }
  function closeEditor() { edit = null; armed = null; const dr = $('#admDrawer'); if (dr) { dr.classList.remove('on'); dr.setAttribute('aria-hidden', 'true'); } const s = $('#admScrim'); if (s) s.classList.remove('on'); }
  async function saveEditor() {
    const name = $('#eName').value.trim(), price = parseFloat($('#ePrice').value);
    const err = $('#eErr'); err.textContent = '';
    if (!name) { err.textContent = 'Escribe el nombre del plato.'; return; }
    if (!(price >= 0)) { err.textContent = 'Escribe un precio válido.'; return; }
    const pmax = parseFloat($('#ePmax').value), noData = $('#eNoData').checked, o0 = edit.it, fresh = !edit.id;
    const id = edit.id || 'c-' + Date.now().toString(36), prev = S.over[id] || {};
    const price2 = Math.round(price * 100) / 100, pmax2 = pmax > price ? Math.round(pmax * 100) / 100 : null;
    const data = { cat: $('#eCat').value, desc: $('#eDesc').value.trim(), ing: $('#eIng').value.trim(), allergens: noData ? null : $$('#eAlg input:checked').map((x) => x.dataset.a), hidden: !$('#eVis').checked, featured: $('#eFeat').checked, url: $('#eUrl').value.trim() };
    /* Nombre y precios solo se guardan si los has cambiado. Si no, se respetan los nombres y precios propios de cada local. */
    if (fresh || name !== o0.name || 'name' in prev) data.name = name;
    if (fresh || price2 !== o0.price || 'price' in prev) data.price = price2;
    if (fresh || (pmax2 || null) !== (o0.priceMax || null) || 'priceMax' in prev) data.priceMax = pmax2;
    /* Precio distinto en un local concreto */
    const sp = Object.assign({}, prev.sp || {}); let spCh = false;
    for (const inp of $$('[data-spp]')) {
      const raw = inp.value.trim(), k = inp.dataset.spp; if (raw === inp.dataset.v0) continue;
      const n = parseFloat(raw);
      if (!(n >= 0)) { err.textContent = 'Revisa el precio de ' + ((S.site.stores[k] || {}).name || k) + '.'; return; }
      sp[k] = Object.assign({}, sp[k] || {}, { p: Math.round(n * 100) / 100 }); spCh = true;
    }
    if (spCh) data.sp = sp;
    const img = $('#eImg').value.trim();
    if (img.startsWith('/_blob/')) { data.asset = img.slice(7); data.image = (edit.it.image || ''); } else { data.image = img; data.asset = null; }
    if (fresh) data.custom = true; else if (!defIds().has(id)) data.custom = true;
    const ok = await guard(() => db().doc('menu/' + id).set(Object.assign({}, prev, data)), 'Plato guardado');
    if (ok) { logAct((fresh ? 'Plato nuevo: ' : 'Plato editado: ') + name + (spCh ? ' (precio por local)' : '')); closeEditor(); }
  }
  async function toggleHidden(id, visible) {
    const ok = await guard(() => db().doc('menu/' + id).set(Object.assign({}, S.over[id] || {}, { hidden: !visible })), visible ? 'Plato visible' : 'Plato archivado');
    if (ok) logAct((visible ? 'Visible: ' : 'Archivado: ') + ((S.byId[id] || {}).name || id));
  }
  function pickImage(onDone) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try { A.toast('Subiendo foto…'); const r = await S.cap.assets.upload(f); onDone(r); A.toast('Foto subida'); } catch (e) { A.toast('No se pudo subir la foto.'); }
    };
    inp.click();
  }

  /* ---------- modo «Editar página»: tocar lo que se quiere cambiar ---------- */
  let editOn = false, ie = null, tagObs = null, tagRaf = 0;
  const SECN = { hero: 'Portada', why: '¿Por qué Arroz en Caja?', innovation: 'Innovación', quality: 'Calidad', eco: 'Medio ambiente', how: 'Cómo pedir', franchise: 'Franquicia', brand: 'Marca', contact: 'Contacto', order: 'Pedidos' };
  const FN = { title: 'título', p1: 'párrafo 1', p2: 'párrafo 2', p3: 'párrafo 3', callout: 'frase destacada', sub: 'texto', lead: 'texto principal', cta: 'botón', image: 'foto', delivery: 'condiciones de envío', stepsTitle: 'título de los pasos', name: 'nombre', tagline: 'lema', hashtag: 'hashtag', logo: 'logotipo', seal: 'sello', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' };
  const UIL = { heroLink: 'Portada · enlace secundario', cartaTitle: 'Pedido · título', cartaSub: 'Pedido · texto', howCta: 'Cómo pedir · botón', storesTitle: 'Locales · título', franchiseCta: 'Franquicia · botón', faqTitle: 'Franquicia · título de preguntas', contactTitle: 'Franquicia · título del formulario', footNote: 'Pie · nota legal' };
  const STF = { name: 'nombre', address: 'dirección', phone: 'teléfonos', hours: 'horario (texto de la web)', hoursNote: 'más información', mapsUrl: 'enlace de Google Maps', orderUrl: 'enlace de pedido', closedDays: 'días de cierre' };
  const HINTS = { banner: 'Déjalo vacío para quitar el aviso de la parte de arriba.', 'hero.title': 'Lo que va después de la primera coma sale resaltado.', 'brand.logo': '', 'stores.avila.hours': 'Es el texto que ve el cliente. Las horas reales de pedido se cambian en Horarios.' };
  function labelOf(p) {
    let m;
    if (p === 'banner') return 'Aviso superior';
    if ((m = p.match(/^ui\.(\w+)$/)) && UIL[m[1]]) return UIL[m[1]];
    if ((m = p.match(/^ui\.trust\.(\d+)$/))) return 'Portada · garantía ' + (+m[1] + 1);
    if ((m = p.match(/^ui\.marquee\.(\d+)$/))) return 'Portada · cinta de texto ' + (+m[1] + 1);
    if ((m = p.match(/^stats\.(\d+)\.(\w+)$/))) return 'Cifra ' + (+m[1] + 1) + ' · ' + ({ value: 'número', suffix: 'unidad', label: 'texto' }[m[2]] || m[2]);
    if ((m = p.match(/^how\.steps\.(\d+)\.(\w+)$/))) return 'Cómo pedir · paso ' + (+m[1] + 1) + ' · ' + ({ verb: 'verbo', text: 'texto' }[m[2]] || m[2]);
    if ((m = p.match(/^franchise\.steps\.(\d+)$/))) return 'Franquicia · paso ' + (+m[1] + 1);
    if ((m = p.match(/^franchise\.faq\.(\d+)\.(q|a)$/))) return 'Franquicia · ' + (m[2] === 'q' ? 'pregunta ' : 'respuesta ') + (+m[1] + 1);
    if ((m = p.match(/^contact\.legal\.(\d+)\.(\w+)$/))) return 'Enlace legal ' + (+m[1] + 1) + ' · ' + (m[2] === 'url' ? 'dirección' : 'texto');
    if ((m = p.match(/^stores\.(\w+)\.(\w+)$/))) return ((S.site.stores[m[1]] || {}).name || m[1]) + ' · ' + (STF[m[2]] || m[2]);
    if ((m = p.match(/^(\w+)\.(\w+)$/)) && SECN[m[1]]) return SECN[m[1]] + ' · ' + (FN[m[2]] || m[2]);
    return p;
  }
  const EDITABLE = '[data-ep],[data-ecat],.dish[data-id]';
  function tagEditable() {
    $$(EDITABLE).forEach((el) => { if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); el.setAttribute('data-ei', '1'); } });
    $$('.faq details').forEach((d) => { if (!d.open) { d.open = true; d.setAttribute('data-eo', '1'); } });
  }
  function observe(on) {
    if (tagObs) { tagObs.disconnect(); tagObs = null; }
    if (!on || !window.MutationObserver) return;
    tagObs = new MutationObserver(() => { if (tagRaf) return; tagRaf = requestAnimationFrame(() => { tagRaf = 0; if (editOn) tagEditable(); }); });
    ['#app', '#logo', '#notice'].forEach((s) => { const el = $(s); if (el) tagObs.observe(el, { childList: true, subtree: true }); });
  }
  function ensureSheet() {
    if ($('#inlineEd')) return;
    const sc = document.createElement('div'); sc.id = 'ieScrim'; sc.className = 'ie-scrim';
    const sh = document.createElement('section'); sh.id = 'inlineEd'; sh.className = 'inline-ed'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-hidden', 'true'); sh.setAttribute('aria-label', 'Editar contenido');
    document.body.appendChild(sc); document.body.appendChild(sh);
    sc.addEventListener('click', closeInline);
    sh.addEventListener('click', onInlineClick); sh.addEventListener('input', onInlineInput);
    sh.addEventListener('submit', (e) => { e.preventDefault(); inlineSave(); });
  }
  /* El teclado del móvil no debe tapar el cuadro: se sube con el teclado. */
  function fitSheet() {
    const sh = $('#inlineEd'), vv = window.visualViewport; if (!sh || !vv) return;
    const f = () => { sh.style.setProperty('--kb', Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px'); };
    if (!sh._fit) { sh._fit = f; vv.addEventListener('resize', f); vv.addEventListener('scroll', f); }
    f();
  }
  function inlineHTML() {
    const t = ie.type, p = ie.p, lab = esc(ie.label);
    let cur = ie.cat ? ((S.cats.find((c) => c.id === ie.cat) || {}).label || '') : getPath(S.site, p);
    if (cur == null) cur = '';
    const changed = ie.cat ? !!((S.site.catOver || {})[ie.cat]) : JSON.stringify(getPath(S.site, p)) !== JSON.stringify(getPath(S.defSite, p));
    const head = `<div class="dr-h"><h2>${lab}</h2><button class="x" type="button" data-ie="close" aria-label="Cerrar">×</button></div>`;
    const reset = changed ? '<button class="btn sm ghost" type="button" data-ie="reset">Volver al original</button>' : '';
    const hint = HINTS[p] ? `<p class="muted sm">${esc(HINTS[p])}</p>` : '';
    if (t === 'logo' && ie.step !== 2) return head + `<div class="dr-b"><div class="logo-prev"><img src="${esc(cur)}" alt="${lab} actual"></div><p class="note">Es la marca de Arroz en Caja. Está protegida para que no se cambie sin querer.</p><div class="acts"><button class="btn sm" type="button" data-ie="logoGo">Cambiar…</button><button class="btn sm ghost" type="button" data-ie="close">Cancelar</button>${reset}</div></div>`;
    let body;
    if (t === 'img' || t === 'logo') body = `<div class="logo-prev"><img id="iePrev" src="${esc(cur)}" alt=""></div><div class="f"><label for="ieV"><span>Enlace de la imagen</span></label><div class="imgf"><input id="ieV" value="${esc(cur)}" inputmode="url" autocapitalize="none" autocorrect="off" placeholder="https://…">${S.cap.assets ? '<button class="btn sm ghost" type="button" data-ie="up">Subir foto</button>' : ''}</div></div>${t === 'logo' ? '<label class="ck"><input type="checkbox" id="ieOk"> Entiendo que cambia en toda la web</label>' : ''}`;
    else if (t === 'area' || t === 'md') body = `<label class="f"><span>Texto</span><textarea id="ieV" rows="6">${esc(cur)}</textarea></label>${t === 'md' ? '<p class="muted sm">Escribe **así** para poner una palabra en negrita.</p>' : ''}`;
    else body = `<label class="f"><span>${({ num: 'Número', url: 'Enlace', tel: 'Teléfono' })[t] || 'Texto'}</span><input id="ieV" value="${esc(cur)}"${t === 'num' ? ' inputmode="decimal"' : t === 'url' ? ' inputmode="url" autocapitalize="none" autocorrect="off"' : t === 'tel' ? ' inputmode="tel"' : ''}></label>`;
    return head + `<form class="dr-b" id="ieForm" novalidate>${body}${hint}<p class="err" id="ieErr" role="alert"></p><div class="acts"><button class="btn sm crit" type="submit">Guardar</button><button class="btn sm ghost" type="button" data-ie="close">Cancelar</button>${reset}</div></form>`;
  }
  function openInline(x) {
    if (!S.canEdit) return;
    ensureSheet(); ie = Object.assign({ step: 1 }, x);
    const sh = $('#inlineEd'); sh.innerHTML = inlineHTML(); sh.classList.add('on'); sh.setAttribute('aria-hidden', 'false'); $('#ieScrim').classList.add('on'); fitSheet();
    setTimeout(() => { const n = $('#ieV'); if (n) n.focus({ preventScroll: true }); }, 120);
  }
  function closeInline() { ie = null; const sh = $('#inlineEd'); if (sh) { sh.classList.remove('on'); sh.setAttribute('aria-hidden', 'true'); } const sc = $('#ieScrim'); if (sc) sc.classList.remove('on'); }
  function prevImg() { const im = $('#iePrev'), v = $('#ieV'); if (im && v && v.value.trim()) im.src = v.value.trim(); }
  function onInlineInput(e) { if (ie && e.target.id === 'ieV' && (ie.type === 'img' || ie.type === 'logo')) prevImg(); }
  function onInlineClick(e) {
    const b = e.target.closest('[data-ie]'); if (!b || !ie) return;
    const a = b.dataset.ie;
    if (a === 'close') closeInline();
    else if (a === 'logoGo') { ie.step = 2; $('#inlineEd').innerHTML = inlineHTML(); setTimeout(() => { const n = $('#ieV'); if (n) n.focus({ preventScroll: true }); }, 60); }
    else if (a === 'up') pickImage((r) => { const el = $('#ieV'); if (el) { el.value = '/_blob/' + r.id; prevImg(); } });
    else if (a === 'reset') inlineReset();
  }
  const catNames = () => { const ov = {}; $$('[data-cat]').forEach((el) => { const id = el.dataset.cat, v = el.value.trim(), base = (S.catsBase.find((c) => c.id === id) || {}).label; if (v && v !== base) ov[id] = { label: v }; }); return ov; };
  async function inlineSave() {
    if (!ie) return;
    const el = $('#ieV'), err = $('#ieErr'); if (!el || !err) return; err.textContent = '';
    if (ie.type === 'logo' && !($('#ieOk') && $('#ieOk').checked)) { err.textContent = 'Marca la casilla para confirmar el cambio.'; return; }
    if (ie.cat) {
      const v = el.value.trim(), id = ie.cat, base = (S.catsBase.find((c) => c.id === id) || {}).label;
      if (!v) { err.textContent = 'Escribe el nombre de la categoría.'; return; }
      const ok = await saveSite((o) => { if (v === base) resetLeaf(o, 'catOver.' + id); else setLeaf(o, 'catOver.' + id + '.label', v); }, 'Categoría guardada');
      if (ok) { logAct('Categoría renombrada en la página: ' + v); closeInline(); }
      return;
    }
    const r = coerce(ie.p, ie.type, el.value); if (r.err) { err.textContent = r.err; return; }
    const lab = ie.label, p = ie.p;
    const ok = await saveSite((o) => setLeaf(o, p, r.v), 'Guardado');
    if (ok) { logAct('Editado en la página: ' + lab); closeInline(); }
  }
  async function inlineReset() {
    if (!ie) return;
    const x = ie, ok = await saveSite((o) => { if (x.cat) resetLeaf(o, 'catOver.' + x.cat); else resetLeaf(o, x.p); }, 'Original restaurado');
    if (ok) { logAct('Restaurado en la página: ' + x.label); closeInline(); }
  }
  function handleEditTarget(t) {
    if (t.dataset.ep) { const p = t.dataset.ep; openInline({ p, type: t.dataset.et || 'text', label: labelOf(p) }); }
    else if (t.dataset.ecat) openInline({ cat: t.dataset.ecat, p: 'cat:' + t.dataset.ecat, type: 'text', label: 'Nombre de la categoría' });
    else if (t.matches('.dish[data-id]')) openEditor(t.dataset.id);
  }
  /* En modo edición, un toque abre el editor en vez de navegar, comprar o abrir enlaces. */
  document.addEventListener('click', (e) => {
    if (!editOn || !(e.target instanceof Element)) return;
    if (e.target.closest('#inlineEd, #ieScrim, #admDrawer, #admScrim, #prevBar, #editHint, #viewBar')) return;
    const t = e.target.closest('[data-ep]') || e.target.closest('[data-ecat]') || e.target.closest('.dish[data-id]');
    if (!t) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    handleEditTarget(t);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (ie) { closeInline(); return; } if (edit) { closeEditor(); return; } }
    if (!editOn || (e.key !== 'Enter' && e.key !== ' ') || !(e.target instanceof Element)) return;
    if (e.target.closest('#inlineEd, #admDrawer, #editHint')) return;
    if (e.target.matches(EDITABLE)) { e.preventDefault(); handleEditTarget(e.target); }
  });
  function editHint(on) {
    let h = $('#editHint');
    if (!on) { if (h) h.remove(); return; }
    if (!h) {
      h = document.createElement('div'); h.id = 'editHint'; h.className = 'edit-hint'; h.setAttribute('role', 'status');
      h.innerHTML = '<span>Modo edición · toca lo que quieras cambiar</span><button type="button" data-eh="banner">Aviso superior</button><button type="button" data-eh="panel" class="eh-done">Listo · volver al panel</button>';
      h.addEventListener('click', (e) => {
        const b = e.target.closest('[data-eh]'); if (!b) return;
        if (b.dataset.eh === 'banner') openInline({ p: 'banner', type: 'area', label: 'Aviso superior' });
        else { stopEdit(); location.hash = '#panel'; }
      });
      document.body.appendChild(h);
    }
  }
  /* Marcas de edición: la web pública no las lleva. Solo existen mientras el dueño está en modo edición. */
  const STATIC_TAGS = [['#notice', 'banner', 'area'], ['#logo', 'brand.logo', 'logo']];
  function tagStatic(on) {
    STATIC_TAGS.forEach((t) => { const el = $(t[0]); if (!el) return; if (on) { el.setAttribute('data-ep', t[1]); el.setAttribute('data-et', t[2]); } else { el.removeAttribute('data-ep'); el.removeAttribute('data-et'); } });
  }
  function startEdit() {
    if (editOn) return;
    if (!S.canEdit) { A.toast('Esta cuenta no tiene permiso de edición.'); return; }
    editOn = true; ensureSheet(); ensureDrawer();
    S.tag = true; tagStatic(true); A.refreshAll();
    document.body.classList.add('edit-on'); editHint(true); tagEditable(); observe(true);
    if (location.hash === '#panel') location.hash = '#inicio';
  }
  function stopEdit() {
    if (!editOn) return;
    editOn = false; closeInline(); closeEditor(); observe(false);
    document.body.classList.remove('edit-on'); editHint(false);
    S.tag = false; tagStatic(false); A.refreshAll();
    $$('[data-ei]').forEach((el) => { el.removeAttribute('tabindex'); el.removeAttribute('data-ei'); });
    $$('[data-eo]').forEach((d) => { d.open = false; d.removeAttribute('data-eo'); });
  }
  const toggleEdit = () => (editOn ? stopEdit() : startEdit());
  window.addEventListener('hashchange', () => { if (location.hash === '#panel' && editOn) stopEdit(); });

  /* Mientras el dueño mira la tienda desde el panel, esta barra (solo existe en su sesión) le deja volver. */
  function viewBar(on) {
    let h = $('#viewBar');
    if (!on) { if (h) h.remove(); return; }
    if (h) return;
    h = document.createElement('div'); h.id = 'viewBar'; h.className = 'edit-hint'; h.setAttribute('role', 'status');
    h.innerHTML = '<span>Estás viendo la tienda como la ve un cliente</span><button type="button" data-vb="back" class="eh-done">Volver al panel</button>';
    h.addEventListener('click', (e) => { if (e.target.closest('[data-vb]')) location.hash = '#panel'; });
    document.body.appendChild(h);
  }

  /* ---------- vista previa de textos antes de publicar ---------- */
  function previewBar() {
    let b = $('#prevBar');
    if (!preview) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'prevBar'; b.className = 'prev-bar'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.innerHTML = '<span>Vista previa sin publicar</span><button type="button" data-pv="pub">Publicar</button><button type="button" data-pv="back">Seguir editando</button><button type="button" data-pv="drop">Descartar</button>';
  }
  /* Lee los campos de un grupo, los valida y devuelve solo los que han cambiado (así lo que no tocas sigue el texto original). */
  function collectGroup(g) {
    const vals = {};
    for (const f of g.fs) {
      const el = $(`[data-p="${f[0]}"]`); if (!el) continue;
      const r = coerce(f[0], f[2], el.value); if (r.err) { A.toast(f[1] + ': ' + r.err); el.focus(); return null; }
      const cur = getPath(S.site, f[0]);
      if (JSON.stringify(r.v) !== JSON.stringify(cur == null ? '' : cur)) vals[f[0]] = r.v;
    }
    return vals;
  }
  function startPreview(i) {
    const g = TEXTS[i], vals = collectGroup(g); if (!vals) return;
    if (!Object.keys(vals).length) { A.toast('No hay cambios que previsualizar.'); return; }
    if (preview) { S.siteOver = preview.backup; }
    preview = { i, vals, backup: clone(S.siteOver || {}) };
    const over = clone(S.siteOver || {}); Object.keys(vals).forEach((p) => setLeaf(over, p, vals[p])); S.siteOver = over; A.refreshAll(); previewBar(); location.hash = '#inicio';
  }
  function endPreview(restore) { if (!preview) return; if (restore) { S.siteOver = preview.backup; A.refreshAll(); } preview = null; previewBar(); }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pv]'); if (!b || !preview) return;
    if (b.dataset.pv === 'pub') { const p = preview, over = clone(p.backup); Object.keys(p.vals).forEach((k) => setLeaf(over, k, p.vals[k])); const ok = await guard(() => db().doc('site/config').set(over), 'Publicado'); if (ok) { logAct('Texto publicado: ' + TEXTS[p.i].t); preview = null; previewBar(); location.hash = '#panel'; } }
    else if (b.dataset.pv === 'back') { location.hash = '#panel'; }
    else { endPreview(true); location.hash = '#panel'; }
  });

  /* ---------- PWA: service worker, actualización, instalación, conexión ---------- */
  function regSW() {
    try {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) { swState = 'no disponible aquí'; return; }
    navigator.serviceWorker.register('sw.js').then((reg) => {
      swReg = reg; swState = reg.active ? 'activo' : 'instalando…';
      const upd = () => { const u = $('#admUpd'); if (u) u.hidden = false; };
      if (reg.waiting && navigator.serviceWorker.controller) upd();
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) upd(); if (w.state === 'activated') { swState = 'activo'; if (tab === 'config' && $('#admMain')) drawPanel(true); } }); });
      navigator.serviceWorker.ready.then(() => { swState = 'activo'; if (tab === 'config' && $('#admMain')) drawPanel(true); });
    }).catch(() => { swState = 'no se pudo registrar'; });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updReq) location.reload(); });
    } catch (e) { swState = 'no disponible en esta vista'; }
  }
  window.addEventListener('online', () => { setOffline(); A.toast('Conexión recuperada'); if (tab === 'pedidos') drawPanel(true); });
  window.addEventListener('offline', () => { setOffline(); });

  /* ---------- pintado y eventos ---------- */
  const PANELS = { pedidos: panelPedidos, productos: panelProductos, inventario: panelInventario, horarios: panelHorarios, whatsapp: panelWhatsapp, config: panelConfig };
  function drawPanel(keep) {
    const main = $('#admMain'); if (!main) return;
    if (!tabsFor().some((t) => t[0] === tab)) tab = 'pedidos';
    const y = window.scrollY;
    $$('#admNav button').forEach((b) => { const on = b.dataset.v === tab; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    main.innerHTML = PANELS[tab](); stateLine();
    if (keep) { window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y)); }
    bindPanel();
  }
  function bindPanel() {
    const bind = (sel, fn) => { const q = $(sel); if (q) q.addEventListener('input', () => fn(q)); };
    bind('#fq', (q) => { flt.q = q.value; $('#rows').innerHTML = filteredItems().map(rowHTML).join(''); $('#fcount').textContent = filteredItems().length + ' platos'; });
    bind('#iq', (q) => { inv.q = q.value; const l = invFiltered(inv.k); $('#invRows').innerHTML = l.map((i) => invRow(i, inv.k)).join(''); $('#icount').textContent = l.length + ' platos'; });
    bind('#pubMsg', (q) => { const el = $('#pubLink'); if (el) el.textContent = 'https://wa.me/' + String(S.site.contact.whatsapp).replace(/\D/g, '') + '?text=' + encodeURIComponent(q.value); });
  }
  function gate() {
    const wrap = (h) => { root.innerHTML = '<div class="adm-gate"><img src="img/logo.png" alt="Arroz en Caja" width="84" height="84">' + h + '</div>'; return false; };
    if (!S.capsReady) return wrap('<h1>Comprobando permisos…</h1>');
    if (!S.canEdit) return wrap('<h1>Zona privada</h1><p>Esta zona es solo para el dueño del restaurante.</p><a class="btn" href="#inicio">Volver a la tienda</a>');
    return true;
  }
  function draw() { if (!gate()) return; if (!$('#admMain')) frame(); drawPanel(); }
  const editing = () => { const a = document.activeElement; return !!(a && root && $('#admMain') && $('#admMain').contains(a) && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]):not([type=date]):not([type=datetime-local]),textarea,select')); };
  const redraw = () => { if (editing()) { pendingDraw = true; return; } drawPanel(true); };
  function sub(path, kind, fn) { const r = kind === 'col' ? db().collection(path) : db().doc(path); r.onSnapshot(fn, () => { /* sin lectura */ }); }
  function subscribe() {
    if (!db() || !S.canEdit) return;
    if (!leadsSub) { leadsSub = true; db().collection('leads').onSnapshot((snap) => { leads = []; snap.docs.forEach((d) => (d.data().items || []).forEach((x) => leads.push(Object.assign({ key: d.id + ':' + x.ts }, x)))); leadsErr = false; if (root && !root.hidden && $('#admMain') && tab === 'config' && !edit) redraw(); else stateLine(); }, () => { leadsErr = true; }); }
    if (!ordersSub) { ordersSub = true; db().collection('orders').onSnapshot((snap) => { orders = []; snap.docs.forEach((d) => (d.data().items || []).forEach((x) => orders.push(Object.assign({}, x, { uid: d.id })))); ordersErr = false; lastSync = Date.now(); detect(); if (root && !root.hidden && $('#admMain') && ['pedidos'].includes(tab) && !edit) redraw(); else stateLine(); }, () => { ordersErr = true; }); }
    if (!msgsSub) { msgsSub = true; db().collection('msgs').onSnapshot((snap) => { msgsAll = {}; snap.docs.forEach((d) => { msgsAll[d.id] = d.data(); }); if (root && !root.hidden && $('#admMain') && tab === 'pedidos' && !edit) redraw(); }, () => { /* sin lectura */ }); }
    if (!seenSub) { seenSub = true; db().doc('site/leads-seen').onSnapshot((s) => { seen = new Set((s.exists && s.data().ids) || []); if (root && $('#admMain') && tab === 'config') redraw(); }, () => { }); }
    if (!logSub) { logSub = true; db().doc('log/comms').onSnapshot((s) => { commLog = (s.exists && s.data().items) || []; if (root && !root.hidden && $('#admMain') && ['pedidos', 'whatsapp'].includes(tab) && !edit) redraw(); else stateLine(); }, () => { }); db().doc('log/activity').onSnapshot((s) => { actLog = (s.exists && s.data().items) || []; if (root && $('#admMain') && tab === 'config' && !edit) redraw(); }, () => { }); }
  }

  const ACT = {
    tab(t) { if (t.dataset.id) { hor.k = t.dataset.id; inv.k = t.dataset.id; } tab = t.dataset.v; lss('aec-adm-tab', tab); armed = null; cancelArmed = null; drawPanel(); window.scrollTo(0, 0); },
    shop() { viewBar(true); /* el enlace #inicio lleva a la tienda; el panel queda montado y conserva su estado */ },
    ofilter(t) { flt.ost = t.dataset.v; drawPanel(true); },
    goorder(t) { flt.ost = 'todos'; tab = 'pedidos'; drawPanel(); const li = $(`[data-oid="${t.dataset.id}"]`); if (li) li.scrollIntoView({ block: 'start' }); },
    adv(t) { const o = orders.find((x) => x.id === t.dataset.id); if (!o) return; const fl = A.ST.flow(o.mode), i = fl.indexOf(stOf(o)); if (i >= 0 && fl[i + 1]) setState(o.id, fl[i + 1]); },
    st(t) { cancelArmed = null; setState(t.dataset.id, t.dataset.v); },
    cancel(t) { const id = t.dataset.id; if (cancelArmed !== id) { cancelArmed = id; drawPanel(true); return; } cancelArmed = null; setState(id, 'cancelado'); },
    qr(t) {
      const id = t.dataset.id, o = orders.find((x) => x.id === id); if (!o) return; const q = QUICK_APP(o)[+t.dataset.v]; if (!q) return;
      if (q[0] === 'delay') { delayMin[id] = q[1]; drafts[id] = 'Tu pedido se retrasa unos ' + q[1] + ' minutos. Sentimos las molestias.'; } else { delete delayMin[id]; drafts[id] = q[1]; }
      const inp = root.querySelector('[data-minput="' + id + '"]'); if (inp) { inp.value = drafts[id]; inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (er) { /* noop */ } }
    },
    rd(t) { const o = orders.find((x) => x.id === t.dataset.id); if (o) { admSeen[o.id] = replyTs(o); lss('aec-adm-seen', admSeen); drawPanel(true); stateLine(); } },
    comm(t) {
      /* abrir el enlace NO es enviar: se anota «enlace abierto» y el envío lo confirma la persona */
      const o = orders.find((x) => x.id === t.dataset.id); if (!o) return; const k = t.dataset.v, ch = t.dataset.ch;
      const txt = k === 'libre' ? (cmp[o.id] || '').trim() : fill(tplText(k), o);
      if (k === 'libre' && !txt) { A.toast('Escribe el mensaje primero.'); return; }
      if (!online()) { A.toast('Sin conexión: no se registra el aviso.'); return; }
      commTouch(o, k, ch, txt, 'enlace_abierto').then(() => { if (tab === 'pedidos') setTimeout(() => { if (!editing()) drawPanel(true); }, 400); });
      logAct((ch === 'sms' ? 'SMS' : 'WhatsApp') + ' abierto · ' + o.id + ' · ' + (TPL_LABEL[k] || k));
    },
    cmpq(t) { const o = orders.find((x) => x.id === t.dataset.id); if (!o) return; const q = (COMMS().quick || [])[+t.dataset.v]; if (q == null) return; cmp[o.id] = fill(q, o); const ta = root.querySelector('[data-cmp="' + o.id + '"]'); if (ta) { ta.value = cmp[o.id]; syncCmp(o.id); ta.focus(); } },
    copy(t) { const o = orders.find((x) => x.id === t.dataset.id); if (!o) return; copyText(t.dataset.v === 'tel' ? '+' + phoneFor(o) : (cmp[o.id] || '')); },
    cs(t) { const id = t.dataset.id, v = t.dataset.v; saveComms((a) => a.map((c) => (c.id === id ? Object.assign({}, c, { st: v, ts: Date.now() }) : c))).then(() => { logAct('Mensaje marcado: ' + MSG_ST[v]); drawPanel(true); }); },
    cfilter(t) { cflt = t.dataset.v; drawPanel(true); },
    edit(t) { openEditor(t.dataset.id); }, new() { openEditor(null); }, closeEd() { closeEditor(); },
    istore(t) { inv.k = t.dataset.v; drawPanel(); }, hstore(t) { hor.k = t.dataset.v; drawPanel(); },
    ifilter(t) { inv.f = t.dataset.v; drawPanel(true); },
    av(t) { setAvail(t.dataset.id, inv.k, t.dataset.v); },
    avreset() { if (armed !== 'avreset') { armed = 'avreset'; drawPanel(true); return; } armed = null; resetAvail(inv.k).then(() => drawPanel(true)); },
    reopen() { saveSite((o) => setPath(o, stPath(hor.k, 'closure'), { on: false }), 'Local reabierto').then((ok) => { if (ok) { logAct(S.site.stores[hor.k].name + ' · reabierto'); drawPanel(true); } }); },
    closeNow() { closeNow(hor.k); }, saveHours() { saveHours(hor.k); }, addClosure() { addClosure(hor.k); },
    delClosure(t) { const k = hor.k, arr = (S.site.stores[k].closures || []).filter((c, i) => i !== +t.dataset.v); saveSite((o) => setPath(o, stPath(k, 'closures'), arr), 'Cierre quitado').then((ok) => { if (ok) { logAct(S.site.stores[k].name + ' · cierre quitado'); drawPanel(true); } }); },
    pref(t) { const v = t.dataset.v; saveCommCfg((o) => setPath(o, 'comms.preferred', v), 'Canal: ' + (v === 'sms' ? 'SMS' : 'WhatsApp')); },
    saveComm() {
      const prefix = $('#cmPrefix').value.replace(/\D/g, '') || '34', num = $('#cmNum').value.replace(/\D/g, ''), per = {};
      $$('[data-cmstore]').forEach((el) => { const v = el.value.replace(/\D/g, ''); if (v) per[el.dataset.cmstore] = v; });
      if (!num || num.length < 9) { A.toast('Escribe el WhatsApp oficial con prefijo, por ejemplo 34600000000.'); return; }
      saveCommCfg((o) => { setPath(o, 'comms.prefix', prefix); setPath(o, 'comms.perStore', per); setPath(o, 'contact.whatsapp', num); }, 'Canal y números guardados').then((ok) => { if (ok) logAct('Números de WhatsApp actualizados'); });
    },
    saveTpl() {
      const tpl = {}; $$('[data-tpl]').forEach((el) => { tpl[el.dataset.tpl] = el.value.trim(); }); const quick = $$('[data-qk]').map((el) => el.value.trim()).filter(Boolean);
      if (TPL_KEYS.some((k) => !tpl[k])) { A.toast('Ninguna plantilla puede quedar vacía.'); return; }
      saveCommCfg((o) => { setPath(o, 'comms.templates', tpl); setPath(o, 'comms.quick', quick); }, 'Plantillas guardadas').then((ok) => { if (ok) logAct('Plantillas de mensajes actualizadas'); });
    },
    resetTpl() { if (armed !== 'tplreset') { armed = 'tplreset'; drawPanel(true); return; } armed = null; saveCommCfg((o) => { delPath(o, 'comms.templates'); delPath(o, 'comms.quick'); }, 'Textos originales restaurados').then(() => drawPanel(true)); },
    savePub() { const m = $('#pubMsg').value.trim(); saveCommCfg((o) => setPath(o, 'comms.publicMsg', m), 'Mensaje guardado'); },
    copyPub() { const el = $('#pubLink'); if (el) copyText(el.textContent); },
    saveText(t) {
      const g = TEXTS[+t.dataset.v], vals = collectGroup(g); if (!vals) return;
      if (!Object.keys(vals).length) { A.toast('No hay cambios que publicar.'); return; }
      saveSite((o) => { Object.keys(vals).forEach((p) => setLeaf(o, p, vals[p])); }, 'Publicado').then((ok) => { if (ok) logAct('Texto publicado: ' + g.t); });
    },
    resetText(t) { const g = TEXTS[+t.dataset.v]; saveSite((o) => { g.fs.forEach((f) => resetLeaf(o, f[0])); }, 'Textos originales restaurados').then(() => drawPanel(true)); },
    editPage() { location.hash = '#inicio'; setTimeout(startEdit, 150); },
    signout() { A.access.signOut(); },
    async pinSave() {
      const x = ($('#pn1') || {}).value || '', y = ($('#pn2') || {}).value || '';
      if (!/^\d{4,6}$/.test(x)) { A.toast('La clave son de 4 a 6 números.'); return; }
      if (x !== y) { A.toast('Las dos claves no coinciden.'); return; }
      if (!online()) { A.toast('Sin conexión: no se guardó.'); return; }
      try { await A.access.setPin(x); accHas = true; logAct('Clave del panel cambiada'); A.toast('Clave guardada'); drawPanel(true); } catch (e) { A.toast('No se pudo guardar la clave.'); }
    },
    async pinClear(t) {
      if (armed !== 'pinclear') { armed = 'pinclear'; t.textContent = 'PULSA OTRA VEZ PARA QUITARLA'; return; }
      armed = null;
      try { await A.access.clearPin(); accHas = false; logAct('Clave del panel quitada'); A.toast('Clave quitada'); drawPanel(true); } catch (e) { A.toast('No se pudo quitar la clave.'); }
    },
    logoOpen(t) { armed = 'logo:' + t.dataset.v; drawPanel(true); },
    logoCancel() { armed = null; drawPanel(true); },
    logoSave(t) {
      const p = t.dataset.v, el = $(`[data-lp="${p}"]`), ok = $(`[data-lok="${p}"]`);
      if (!ok || !ok.checked) { A.toast('Marca la casilla para confirmar el cambio.'); return; }
      const r = coerce(p, 'logo', el ? el.value : ''); if (r.err) { A.toast(r.err); return; }
      saveSite((o) => setLeaf(o, p, r.v), 'Guardado').then((k) => { if (k) { logAct((p === 'brand.seal' ? 'Sello' : 'Logotipo') + ' cambiado'); armed = null; drawPanel(true); } });
    },
    logoReset(t) { const p = t.dataset.v; saveSite((o) => resetLeaf(o, p), 'Original restaurado').then((k) => { if (k) { logAct((p === 'brand.seal' ? 'Sello' : 'Logotipo') + ' restaurado al original'); armed = null; drawPanel(true); } }); },
    upLogo(t) { const p = t.dataset.v; pickImage((r) => { const el = $(`[data-lp="${p}"]`); if (el) el.value = '/_blob/' + r.id; }); },
    catUp(t) { moveCat(t.dataset.v, -1); }, catDn(t) { moveCat(t.dataset.v, 1); },
    catSave() { const ov = catNames(); saveSite((o) => { if (Object.keys(ov).length) o.catOver = ov; else delete o.catOver; }, 'Categorías guardadas').then((ok) => { if (ok) logAct('Nombres de categorías actualizados'); }); },
    catReset() { saveSite((o) => { delete o.catOver; delete o.catOrder; }, 'Categorías originales restauradas').then(() => drawPanel(true)); },
    spClear() { const id = edit && edit.id; if (!id) return; guard(() => db().doc('menu/' + id).set(Object.assign({}, S.over[id] || {}, { sp: null })), 'Precios por local restaurados').then((ok) => { if (ok) { logAct('Precios por local restaurados: ' + ((S.byId[id] || {}).name || id)); closeEditor(); } }); },
    previewText(t) { startPreview(+t.dataset.v); },
    saveStore(t) {
      const k = t.dataset.id, vals = {}; $$(`[data-sp^="${k}."]`).forEach((el) => { vals[el.dataset.sp.split('.')[1]] = el.value.trim(); });
      saveSite((o) => { Object.keys(vals).forEach((f) => setPath(o, stPath(k, f), vals[f])); }, 'Local guardado').then((ok) => { if (ok) logAct('Datos del local: ' + (vals.name || k)); });
    },
    seen(t) { const ids = Array.from(seen); ids.push(t.dataset.id); guard(() => db().doc('site/leads-seen').set({ ids }), 'Marcada como leída'); },
    up(t) { const p = t.dataset.v; pickImage((r) => { const el = $(`[data-p="${p}"]`); if (el) el.value = '/_blob/' + r.id; }); },
    chime() { chime(); },
    wake() { setWake(!wake); },
    alerts() {
      alertsOn = !alertsOn; lss('aec-adm-alerts', alertsOn);
      if (alertsOn) { chime(); try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().then(() => { if (tab === 'config' && $('#admMain')) drawPanel(true); }); } catch (er) { /* noop */ } }
      drawPanel(true);
    },
    install() { const ev = A.installEv; if (!ev) return; ev.prompt(); ev.userChoice.then(() => { A.installEv = null; drawPanel(true); }).catch(() => { }); },
    upd() { updReq = true; if (swReg && swReg.waiting) swReg.waiting.postMessage('SKIP_WAITING'); else location.reload(); },
    upImg() { pickImage((r) => { $('#eImg').value = '/_blob/' + r.id; }); },
    restore() { guard(() => db().doc('menu/' + edit.id).delete(), 'Plato restaurado').then((ok) => { if (ok) closeEditor(); }); },
    del(t) { if (armed !== 'del') { armed = 'del'; t.textContent = 'Pulsa otra vez para eliminar'; return; } guard(() => db().doc('menu/' + edit.id).set({ deleted: true, custom: true }), 'Plato eliminado').then((ok) => { if (ok) closeEditor(); }); },
    saveAsst() { const w = $('[data-ap="assistant.welcome"]').value.trim(), n = $('[data-ap="assistant.notes"]').value.trim(); saveSite((o) => { setPath(o, 'assistant.welcome', w); setPath(o, 'assistant.notes', n); }, 'Asistente guardado'); }
  };
  function syncCmp(id) {
    const o = orders.find((x) => x.id === id); if (!o) return; const txt = cmp[id] || '';
    $$(`[data-cl][data-id="${id}"]`).forEach((a) => { a.href = linkFor(o, txt, a.dataset.cl); });
  }
  function onClick(e) {
    const t = e.target.closest('[data-act]'); if (!t || !((root && root.contains(t)) || t.closest('#admDrawer'))) return;
    const fn = ACT[t.dataset.act]; if (!fn) return;
    if (t.tagName === 'A' && t.dataset.act !== 'comm' && t.dataset.act !== 'shop') e.preventDefault();
    if (t.matches('.crit') && !online() && t.dataset.act !== 'comm') { A.toast('Sin conexión: espera a que vuelva la señal.'); e.preventDefault(); return; }
    if (t.matches('.crit') && !online() && t.dataset.act === 'comm') { e.preventDefault(); A.toast('Sin conexión: no se abre el aviso hasta reconectar.'); return; }
    fn(t, e);
  }
  function onChange(e) {
    const t = e.target, d = t.dataset || {};
    if (d.tg) toggleHidden(d.id, t.checked);
    else if (d.hsw) { const key = d.hsw, off = !t.checked; saveSite((o) => setPath(o, stPath(hor.k, key), off), 'Guardado').then((ok) => { if (ok) logAct(S.site.stores[hor.k].name + ' · ' + ({ ordersOff: 'pedidos online', pickupOff: 'recogida', deliveryOff: 'domicilio' }[key]) + (off ? ' pausado' : ' activo')); else drawPanel(true); }); }
    else if (t.id === 'fc') { flt.cat = t.value; drawPanel(true); }
    else if (t.id === 'ic') { flt.cat = t.value; drawPanel(true); }
    else if (t.id === 'eNoData') { $$('#eAlg input').forEach((c) => { c.disabled = t.checked; if (t.checked) c.checked = false; }); }
  }
  function onSubmit(e) {
    const f = e.target;
    if (f.dataset && f.dataset.mform) { e.preventDefault(); sendMsg(f.dataset.mform); return; }
    if (f.id === 'edForm') { e.preventDefault(); saveEditor(); }
    if (f.id === 'testForm') { e.preventDefault(); const q = $('#testQ').value.trim(); if (!q) return; const out = $('#testA'); out.textContent = 'Pensando…'; A.ask(q).then((a) => { out.textContent = a; }); }
  }

  function mount(el) {
    root = el;
    if (!mounted) {
      mounted = true;
      root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('submit', onSubmit);
      root.addEventListener('input', (e) => {
        const t = e.target, d = t.dataset || {};
        if (d.minput) { drafts[d.minput] = t.value; if (!t.value) delete delayMin[d.minput]; }
        else if (d.cmp) { cmp[d.cmp] = t.value; syncCmp(d.cmp); }
      });
      root.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.dk) { if (d.open) openG.add(d.dataset.dk); else openG.delete(d.dataset.dk); lss('aec-adm-open', Array.from(openG).filter((k) => !/^(cmp|app)-/.test(k))); } }, true);
      root.addEventListener('focusout', () => { if (pendingDraw) setTimeout(() => { if (!editing()) { pendingDraw = false; drawPanel(true); } }, 700); });
      window.addEventListener('hashchange', () => { if (location.hash === '#panel') viewBar(false); if (location.hash === '#panel' && root && !root.hidden) { if (!$('#admMain')) draw(); else drawPanel(true); } });
      A.onChange(() => { if (root.hidden) return; if (!$('#admMain') || !S.capsReady) { draw(); } else if (['pedidos', 'productos', 'inventario', 'horarios', 'whatsapp', 'config'].includes(tab) && !edit) { redraw(); } else stateLine(); subscribe(); });
      regSW();
    }
    ensureDrawer(); draw(); subscribe(); if (preview) previewBar();
  }
  window.ArrozPanel = { mount, toggleEdit, startEdit, stopEdit };
})();
